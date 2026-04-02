import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import numTokensFromString from "./lib/tiktoken-script.js";
import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import { logger } from "../config/loggerConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const rcContext = fs.readFileSync(
  path.join(projectRoot, "data", "RC_context.txt"),
  "utf8",
);

const validateIntent = compileSchema({
  type: "object",
  properties: {
    intent: { type: "string" },
    inputs: { type: "array", items: { type: "string" } },
  },
  required: ["intent", "inputs"],
  additionalProperties: true,
});

function sanitizeList(list) {
  return Array.isArray(list)
    ? list.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

function normalizeInputName(input) {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) return "";
  if (normalized.endsWith("_name")) return normalized;
  if (normalized.endsWith("_path")) return normalized;
  if (normalized === "filepath") return "file_path";
  if (normalized === "channelname") return "channel_name";
  if (normalized === "roomname") return "room_name";

  return normalized;
}

function normalizeIntentPayload(parsed) {
  const inputs = Array.from(
    new Set(
      sanitizeList(parsed?.inputs)
        .map(normalizeInputName)
        .filter(Boolean),
    ),
  );

  return {
    intent: String(parsed?.intent || "").trim(),
    inputs,
  };
}

// Builds the intent-confirmation prompt for a raw user query.
function buildConfirmPrompt(userQuery) {
  return `
You are a workflow intent compiler for a rocket.chat request.

Your task is to convert a natural language request into a precise execution intent that reflects how the task will actually be carried out.

---

### Output Return ONLY valid JSON (no text before or after):

{
"intent": "one concise paragraph describing the logical execution flow",
"inputs": ["list of required runtime inputs"]
}

---

### CORE OBJECTIVE

Translate the request into a **deterministic execution flow**, not a paraphrase.

The intent must clearly describe, refer rc context,

- how entities are resolved (looked up)
- when entities are created (if missing)
- how entities are updated, linked, or acted upon
- any data transformation or computation (if present)
- any generated content (if present)
- the final action(s)

---

### EXECUTION PRINCIPLES

- all steps shd be separated by semi-colon and shd be full with each action and entity
- Resolve entities before use; if needed: "find X; if missing, create X"
- Maintain correct execution order
- Generate content before using it
- Express iteration naturally (e.g., "for each", "all")
- Do not assume entities exist

- Write one concise paragraph using strong action verbs (find, create, add, generate, send)
- Avoid vague phrases ("ensure", "if needed", "system should")
- Do not mention APIs or implementation details
- Do not paraphrase the query

- Inputs = only user-provided values (e.g., username, channel_name)
---

### KEYWORD SIGNALS (guidance only)

get, create, update, add, remove, send, upload, generate, analyze, calculate, convert, transform, if

---

### USER QUERY

${userQuery}


### Rocket.Chat functional context:
${rcContext}
`;
}

/**
 * Confirms a raw user query as a structured execution intent plus runtime inputs.
 *
 * This is the first semantic narrowing step in the pipeline. It asks Gemini to
 * restate the request as a deterministic execution flow and to identify the
 * user-provided runtime inputs that the later workflow stages should expect.
 *
 * Returns a small payload containing the normalized intent JSON, the resolved
 * intent text, and token metrics. Throws when the query is missing, Gemini
 * returns empty output, or the returned JSON does not satisfy the schema.
 */
export async function confirmIntent(userQuery) {
  const query = String(userQuery || "").trim();
  const prompt = query ? buildConfirmPrompt(query) : "";
  const tokenMetrics = numTokensFromString(`${query}\n${prompt}`.trim());
  if (!query) {
    throw new Error("Missing query for intent confirmation.");
  }

  try {
    const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
    if (!raw || !raw.trim()) {
      throw new Error("Gemini returned empty output for intent confirmation.");
    }
    const parsed = parseGeminiJsonWithSchema(raw, validateIntent, "intent JSON");
    const payload = normalizeIntentPayload(parsed);
    const inputs = Array.from(new Set(payload.inputs));

    return {
      success: true,
      gemini: JSON.stringify({
        ...payload,
        inputs,
      }),
      intent: payload.intent,
      tokenMetrics,
    };
  } catch (error) {
    logger.info(`Error confirming intent: ${error.message}`);
    throw error;
  }
}
