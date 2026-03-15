import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEndpointList, TagsToEndpoints } from "./lib/TagsToEndpoints.js";
import numTokensFromString from "../LLM_calls/lib/tiktoken-script.js";
import { runGeminiPrompt, sanitizeGeminiJson } from "../core/llm/geminiCli.js";
import { tokenize } from "../core/query/textMatching.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const endpointIndex = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "data", "endpoint_index.json"), "utf8")
);

function scoreEndpoint(operationId, queryTokens) {
  const ep = endpointIndex[operationId];
  if (!ep) return -1;

  const searchable = `${ep.summary || ""} ${ep.path || ""} ${(ep.tags || []).join(" ")} ${operationId}`.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (searchable.includes(token)) score += 2;
  }

  if ((ep.method || "").toUpperCase() !== "GET") score += 1;
  return score;
}

function chooseEndpointsFallback(candidateIds, userQuery, minKeep = 6, maxKeep = 20) {
  const queryTokens = tokenize(userQuery);
  const scored = candidateIds
    // .map((id) => ({ id, score: scoreEndpoint(id, queryTokens) }))
    // .filter((entry) => entry.score >= 0)
    // .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const positive = scored.filter((entry) => entry.score > 0);
  if (positive.length > 0) {
    // const keepCount = Math.max(minKeep, Math.min(maxKeep, positive.length));
    // return positive.slice(0, keepCount).map((entry) => entry.id);
    return positive;
  }

  return scored.slice(0, Math.min(minKeep, scored.length)).map((entry) => entry.id);
}

function buildEndpointPrompt(userQuery, candidateIds) {
  const compactList = candidateIds
    .map((id) => {
      const ep = endpointIndex[id];
      const method = ep?.method || "GET";
      const route = ep?.path || "/";
      const summary = ep?.summary || "No summary";
      return `${id} | ${method} ${route} | ${summary}`;
    })
    .join("\n");

  return `
Choose the minimal set of operationIds needed for this user request.
Return strict JSON only:
{
  "operationIds": ["id1", "id2"]
}

Rules:
- Pick only from the provided candidate operationIds.
- Choose essential no of operationIds.
- Prioritize direct management actions for the user request.
- No markdown, no explanations.

User request:
${userQuery}

Candidate operationIds:
${compactList}
`;
}

function normalizeOperationIds(parsed, candidateSet) {
  if (!parsed || typeof parsed !== "object") return [];
  if (!Array.isArray(parsed.operationIds)) return [];

  const picked = [];
  const seen = new Set();
  for (const id of parsed.operationIds) {
    const value = String(id || "").trim();
    if (!value || seen.has(value)) continue;
    if (!candidateSet.has(value)) continue;
    seen.add(value);
    picked.push(value);
  }
  return picked;
}

export async function finalEndpoints(userQuery, tags) {
  const finalOutput = [];
  const { relevant_endpoints, output } = TagsToEndpoints(tags);
  const candidateIds = Array.from(relevant_endpoints);
  const candidateSet = new Set(candidateIds);

  finalOutput.push(output);
  finalOutput.push(`Candidate endpoint count: ${candidateIds.length}`);

  if (candidateIds.length === 0) {
    return {
      success: false,
      candidateEndpoints: "",
      debug: finalOutput.join("\n"),
    };
  }

  let selected = [];

  try {
    const prompt = buildEndpointPrompt(userQuery, candidateIds);
    const raw = await runGeminiPrompt(prompt);
    const parsed = JSON.parse(sanitizeGeminiJson(raw));
    selected = normalizeOperationIds(parsed, candidateSet);
  } catch {
    // Fallback when gemini fails or returns invalid payload.
  }

  if (selected.length === 0) {
    selected = chooseEndpointsFallback(candidateIds, userQuery);
    finalOutput.push("Selection mode: fallback");
  } else {
    finalOutput.push("Selection mode: gemini");
  }

  const endpointCsv = selected.join(",");

  finalOutput.push(`Selected endpoint count: ${selected.length}`);
  finalOutput.push("Selected endpoint preview:");
  finalOutput.push(buildEndpointList(selected.slice(0, 10)));

  return {
    success: true,
    gemini: endpointCsv,
    candidateEndpoints: candidateIds.join(","),
    tokenMetrics: numTokensFromString(userQuery),
    EndpointCount: candidateIds.length,
    debug: finalOutput.join("\n"),
  };
}
