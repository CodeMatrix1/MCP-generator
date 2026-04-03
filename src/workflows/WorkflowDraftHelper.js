import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {compileSchema, parseGeminiJsonWithSchema,} from "../core/validation/structured.js";
import numTokensFromString from "../selection/lib/tiktoken-script.js";
import { logger } from "../config/loggerConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const rcContext = fs.readFileSync(
  path.join(projectRoot, "data", "RC_context.txt"),
  "utf8",
);
const workflowPlanningContext = fs.readFileSync(
  path.join(projectRoot, "data", "workflow_planning_context.txt"),
  "utf8",
);

const validateWorkflowDraft = compileSchema({
  type: "object",
  properties: {
    workflows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          function_name: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          scope: { type: "string" },
          inputSchema: { type: "object" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                description: { type: "string" },
                kind: { type: "string" },
                dependsOn: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["key", "description"],
              additionalProperties: true,
            },
          },
        },
        required: ["description", "steps"],
        additionalProperties: true,
      },
    },
  },
  required: ["workflows"],
  additionalProperties: true,
});

function sanitizeToken(input, fallback = "workflow") {
  const value = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return value || fallback;
}

function toTitleCase(input) {
  return String(input || "")
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitizeList(list) {
  return Array.isArray(list)
    ? list.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

function buildPlanningContext(intentConfirmation = {}, endpointHints = []) {
  const intent = String(intentConfirmation?.intent || "").trim();
  const inputs = sanitizeList(intentConfirmation?.inputs);
  const intentSection = intent
    ? `\nIntent summary:\n- ${intent}\n`
    : "";
  const inputSection = inputs.length > 0
    ? `\nLikely runtime inputs:\n${inputs.map((input) => `- ${input}`).join("\n")}\n`
    : "";
  const hintSection = endpointHints.length > 0
    ? `\nEndpoint hints (for vocabulary and ordering only):\n${endpointHints.map((id) => `- ${id}`).join("\n")}\n`
    : "";

  return `${intentSection}${inputSection}\nRC context:\n${rcContext}`;
}

function buildWorkflowPrompt(userQuery, planningContext = "") {
  const contextSection = planningContext
    ? `\nRocket.Chat workflow planning context:\n${planningContext}\n`
    : "";

  return `
Decompose this Rocket.Chat requirement into a serve-only workflow definition.
${contextSection}
Requirement:
${userQuery}

Return strict JSON only with this shape(no extra text):
{
  "workflows": [
    {
      "key": "snake_case_function_name",
      "label": "Readable Name",
      "description": "One sentence description",
      "inputSchema": {
        "type": "object",
        "required": ["fieldA"],
        "properties": {
          "fieldA": {
            "type": "string",
            "description": "What it is",
            "example": "Example value"
          }
        }
      },
      "steps": [
        {
          "key": "snake_case_step",
          "kind": "runtime_tool",
          "description": "what this step does",
          "dependsOn": ["earlier_step_key"]
        }
      ]
    }
  ]
}

---

### RULES

* Each step must represent one real executable action
* Avoid generic names like: prepare, process, handle
* Use clear verbs: find, create, add, update, generate, send, archive, pin
* Do NOT include API names, paths, or tool references
* Every step MUST include a kind
* Allowed kinds at draft time:
  * runtime_tool = a Rocket.Chat/API-backed action
  * llm_step = text/content generation or synthesis done by the LLM
  * compute_step = deterministic transformation, derivation, fallback selection, or data shaping with no Rocket.Chat call
* If a step generates, drafts, composes, or writes message content, it MUST be llm_step
* If a step derives, combines, formats, selects, or transforms values without calling Rocket.Chat, it MUST be compute_step
* Do NOT label a content-generation step as runtime_tool just because it is later used by a runtime step
* Do NOT label a deterministic data-shaping step as runtime_tool just because a later runtime step consumes it
* Example: "generate_welcome_message" must be "llm_step", "resolve_channel_id" can be "compute_step", and "send_welcome_message" is "runtime_tool"

---

### RC_context aware PLANNING (CRITICAL)

* Use context to shape the workflow
* You MAY:
  * merge steps if one endpoint covers multiple actions
  * split steps if multiple endpoints are required
  * add steps if required data is missing
* Prefer fewer steps if capability exists
* Prefer explicit steps if required for correctness

---

### EXECUTION LOGIC

* Resolve entities before use (find → if not found, create)
* Add/invite only after both entities exist
* Generate content before sending if required
* Maintain correct execution order
* Do not assume entities exist
* Use dependsOn for clear semantic ordering when a step relies on an earlier step
* Examples: create_user_if_missing dependsOn lookup_user, send_message dependsOn generate_message

---

`;
}

function normalizeDependsOn(dependsOn) {
  return Array.isArray(dependsOn)
    ? dependsOn.map((value) => sanitizeToken(value, "")).filter(Boolean)
    : [];
}

function normalizeWorkflowDrafts(candidate, query = "") {
  const workflows = Array.isArray(candidate?.workflows)
    ? candidate.workflows
    : [];

  return workflows
    .map((workflow, workflowIndex) => {
      const rawKey = String(
        workflow?.key || workflow?.function_name || `workflow_${workflowIndex + 1}`,
      ).trim();
      const key = sanitizeToken(rawKey, sanitizeToken(query, `workflow_${workflowIndex + 1}`));
      const label = String(workflow?.label || "").trim() || toTitleCase(key);
      const description = String(workflow?.description || "").trim();
      const steps = Array.isArray(workflow?.steps)
        ? workflow.steps
            .map((step, stepIndex) => ({
              key: sanitizeToken(step?.key, `step_${stepIndex + 1}`),
              kind: String(step?.kind || "").trim(),
              description: String(step?.description || "").trim(),
              ...(normalizeDependsOn(step?.dependsOn).length > 0
                ? { dependsOn: normalizeDependsOn(step.dependsOn) }
                : {}),
            }))
            .filter((step) => step.key && step.description)
        : [];

      return {
        key,
        label,
        description: description || query || "Generated workflow.",
        scope: "serve-only",
        inputSchema:
          workflow?.inputSchema && typeof workflow.inputSchema === "object"
            ? workflow.inputSchema
            : { type: "object", properties: {} },
        steps,
      };
    })
    .filter((workflow) => workflow.key && workflow.label && workflow.steps.length > 0);
}

export async function decomposeWorkflowRequirement(userQuery, options = {}) {
  const query = String(userQuery || "").trim();
  const tokenMetrics = numTokensFromString(query);

  try {
    const prompt = buildWorkflowPrompt(
      query,
      buildPlanningContext(options.intentConfirmation || {}, options.endpointHints || []),
    );
    const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
    if (!raw || !raw.trim()) {
      throw new Error("Gemini returned empty output for workflow decomposition.");
    }
    const parsed = parseGeminiJsonWithSchema(
      raw,
      validateWorkflowDraft,
      "workflow draft JSON",
    );
    const normalized = normalizeWorkflowDrafts(parsed, query);
    if (normalized.length > 0) {
      return {
        success: true,
        workflows: normalized,
        tokenMetrics,
      };
    }
  } catch (err) {
    throw new Error(`Draft Workflow decomposition failed: ${err.message}`);
  }
}

export function createWorkflowFromEndpoints(selectedEndpoints = [], query = "") {
  const endpoints = Array.isArray(selectedEndpoints)
    ? selectedEndpoints.filter(Boolean)
    : [];

  const workflowKeyBase = sanitizeToken(query, "generated_workflow");

  return [
    {
      key: workflowKeyBase,
      label: toTitleCase(workflowKeyBase),
      description: query || "Generated workflow from selected Rocket.Chat endpoints.",
      scope: "serve-only",
      inputSchema: {
        type: "object",
        properties: {},
      },
      steps:
        endpoints.length > 0
          ? endpoints.map((endpointKey, index) => ({
              key: `step_${index + 1}`,
              description: `Perform step ${index + 1} of the workflow.`,
            }))
          : [
              {
                key: "step_1",
                description: query || "Fulfill the requested outcome.",
              },
            ],
    },
  ];
}
