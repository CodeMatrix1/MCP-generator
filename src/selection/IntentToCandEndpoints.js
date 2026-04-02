import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const tagIndex = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "data", "tag_index.json"), "utf8")
);
const endpointIndex = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "data", "endpoint_index.json"), "utf8")
);

export function buildEndpointList(operationIds) {
  return operationIds.map((id, index) => `${index + 1}. ${id}`).join("\n");
}

/**
 * Normalize keyword tokens and remove any tokens that should be omitted.
 * @param {unknown} keywords
 * @param {string[]} omitTokens
 * @returns {string[]}
 */
function normalizeKeywords(keywords, omitTokens = []) {
  if (!Array.isArray(keywords)) return [];
  const omit = new Set(
    omitTokens.map((value) => String(value || "").toLowerCase().trim()),
  );
  const stop = new Set([
    "get",
    "set",
    "data",
    "do",
    "make",
    "thing",
    "process",
    "flow",
    "task",
    "chat",
    "info",
    "list",
    "detail",
  ]);
  const splitTokens = keywords
    .flatMap((value) =>
      String(value || "")
        .toLowerCase()
        .split(/[\s_]+/)
        .map((token) => token.trim()),
    )
    .filter(Boolean)
    .filter((value) => value.length >= 3)
    .filter((value) => !omit.has(value))
    .filter((value) => !stop.has(value));

  return Array.from(new Set(splitTokens)).slice(0, 12);
}

function matchesKeywords(endpointKey, keywords) {
  return true;
}

/**
 * Score an endpoint against keyword tokens with weighted fields.
 * @param {string} endpointKey
 * @param {string[]} keywords
 * @returns {number}
 */
function scoreEndpoint(endpointKey, keywords) {
  const endpoint = endpointIndex[endpointKey] || {};
  const keyText = String(endpointKey || "").toLowerCase();
  const summaryText = String(endpoint.summary || "").toLowerCase();
  const descriptionText = String(endpoint.description || "").toLowerCase();
  const purposeText = String(endpoint.purpose || "").toLowerCase();
  const tagText = Array.isArray(endpoint.tags) ? endpoint.tags.join(" ").toLowerCase() : "";
  const inputText = Array.isArray(endpoint.inputs)
    ? endpoint.inputs.map((i) => i.name).join(" ").toLowerCase()
    : "";
  const producesText = Array.isArray(endpoint.produces)
    ? endpoint.produces.join(" ").toLowerCase()
    : "";

  let score = 0;
  for (const kw of keywords) {
    if (keyText.includes(kw)) score += 6;
    if (summaryText.includes(kw)) score += 3;
    if (descriptionText.includes(kw)) score += 2;
    if (purposeText.includes(kw)) score += 2;
    if (tagText.includes(kw)) score += 2;
    if (inputText.includes(kw)) score += 1;
    if (producesText.includes(kw)) score += 1;
  }
  const method = String(endpoint?.method || "").toUpperCase();
  if (method && method !== "GET") score += 1;
  return score;
}

/**
 * Prune a candidate list to the top matches for the current keyword set.
 * @param {string[]} endpoints
 * @param {string[]} keywords
 * @param {number} perTagLimit
 * @param {number} minScore
 * @returns {string[]}
 */
function applyPruning(endpoints, keywords, perTagLimit = 20, minScore = 1) {
  if (!keywords || keywords.length === 0) {
    return endpoints.slice(0, Math.min(perTagLimit, endpoints.length));
  }
  const scored = endpoints
    .map((id) => ({ id, score: scoreEndpoint(id, keywords) }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (scored.length === 0) return endpoints.slice(0, Math.min(perTagLimit, endpoints.length));
  return scored.slice(0, perTagLimit).map((entry) => entry.id);
}

/**
 * Resolve relevant endpoint ids for a category/tag selection, with optional keyword pruning.
 * @param {object} categoryTagMap
 * @returns {{relevant_endpoints: Set<string>, output: string}}
 */
export function IntentToEndpoints(categoryTagMap = {}, min_score = 1, per_tag_limit = 20) {
  const relevantEndpoints = new Set();
  const lines = [];
  const tagSource = categoryTagMap && typeof categoryTagMap === "object" && categoryTagMap.tags
    ? categoryTagMap.tags
    : categoryTagMap;
  const omitTokens = [];
  for (const category of Object.keys(tagSource || {})) {
    const common = tagIndex?.[category]?._meta?.commonTokens;
    if (Array.isArray(common)) omitTokens.push(...common);
  }
  const keywords = [];

  const perTagLimit = typeof categoryTagMap?.perTagLimit === "number"
    ? Math.max(1, Math.min(50, Math.floor(categoryTagMap.perTagLimit)))
    : Math.max(1, Math.min(50, Math.floor(per_tag_limit)));
  const minScore = typeof categoryTagMap?.minScore === "number"
    ? Math.max(0, Math.floor(categoryTagMap.minScore))
    : Math.max(0, Math.floor(min_score));

  for (const [category, tags] of Object.entries(tagSource || {})) {
    const categoryEntry = tagIndex[category];
    if (!categoryEntry) continue;

    const validTags = Array.isArray(tags) ? tags : [];
    for (const tag of validTags) {
      const endpoints = categoryEntry[tag];
      if (!Array.isArray(endpoints) || endpoints.length === 0) continue;

      const pruned = applyPruning(endpoints, keywords, perTagLimit, minScore);
      lines.push(`${category} :: ${tag} -> ${endpoints.length} endpoints (kept ${pruned.length})`);
      for (const operationId of pruned) {
        relevantEndpoints.add(operationId);
      }
    }
  }

  // keyword filtering disabled

  return {
    relevant_endpoints: relevantEndpoints,
    output: lines.join("\n"),
  };
}
