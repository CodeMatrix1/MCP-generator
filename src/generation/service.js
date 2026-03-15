import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDomain } from "../selection/DomainSelect.js";
import { finalEndpoints } from "../selection/FinalEndpoints.js";
import numTokensFromString from "../LLM_calls/lib/tiktoken-script.js";
import { generateMcpTools } from "../Tool_gen/RegisterTools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_ROOT = path.resolve(__dirname, "..");
const TOOL_CACHE_DIR = path.resolve(SRC_ROOT, "tool_cache");
const LAST_SELECTION_PATH = path.resolve(TOOL_CACHE_DIR, "last_selection.json");

export function getSelectionPaths() {
  return {
    toolCacheDir: TOOL_CACHE_DIR,
    lastSelectionPath: LAST_SELECTION_PATH,
  };
}

export function parseEndpointCsv(value) {
  return String(value || "")
    .split(",")
    .map((endpoint) => endpoint.trim())
    .filter(Boolean);
}

export function saveLastSelection(payload) {
  fs.mkdirSync(path.dirname(LAST_SELECTION_PATH), { recursive: true });
  fs.writeFileSync(LAST_SELECTION_PATH, JSON.stringify(payload, null, 2), "utf8");
}

export function loadLastSelection() {
  if (!fs.existsSync(LAST_SELECTION_PATH)) {
    throw new Error(`No saved endpoint selection found at ${LAST_SELECTION_PATH}`);
  }

  return JSON.parse(fs.readFileSync(LAST_SELECTION_PATH, "utf8"));
}

export async function synthesizeSelection(userQuery) {
  const query = String(userQuery || "").trim();
  if (!query) {
    throw new Error("Missing query.");
  }

  const domainAndTags = await classifyDomain(query);
  let parsedDomain;

  try {
    parsedDomain = JSON.parse(domainAndTags.gemini);
  } catch (err) {
    throw new Error(`Domain classifier did not return valid JSON: ${err.message}`);
  }

  const endpointSelection = await finalEndpoints(query, parsedDomain);
  const endpointCsv = endpointSelection.success
    ? endpointSelection.gemini
    : (endpointSelection.candidateEndpoints || "");

  if (!endpointCsv.trim()) {
    throw new Error(`Endpoint selection failed: ${endpointSelection.debug}`);
  }

  const selectedEndpoints = parseEndpointCsv(endpointCsv);
  const tokenUsage = {
    input: (endpointSelection.tokenMetrics || 0) + (domainAndTags.tokenMetrics || 0),
    output: numTokensFromString(endpointCsv) + numTokensFromString(domainAndTags.gemini),
  };

  return {
    query,
    parsedDomain,
    selectedEndpoints,
    tokenUsage,
    debug: endpointSelection.debug,
  };
}

export async function generateFromSelection(selection, options = {}) {
  const query = String(selection?.query || "").trim();
  const selectedEndpoints = Array.isArray(selection?.selectedEndpoints)
    ? selection.selectedEndpoints.filter(Boolean)
    : [];

  if (selectedEndpoints.length === 0) {
    throw new Error("No selected endpoints available for generation.");
  }

  const generation = await generateMcpTools(selectedEndpoints, options);
  const payload = {
    query,
    selectedEndpoints,
    tokenUsage: selection.tokenUsage || { input: 0, output: 0 },
    generation: {
      generatedCount: generation.generatedCount,
      skippedCount: generation.skippedCount,
      manifestPath: generation.manifestPath,
    },
  };

  saveLastSelection(payload);

  return {
    ...payload,
    generationFull: generation,
  };
}

export async function generateFromQuery(userQuery, options = {}) {
  const selection = await synthesizeSelection(userQuery);
  const generated = await generateFromSelection(selection, options);
  return {
    ...selection,
    ...generated,
  };
}
