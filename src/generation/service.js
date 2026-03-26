import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateMcpTools } from "../Tool_gen/RegisterTools.js";
import { writeWorkflowModules } from "../workflows/store.js";
import {
  collectCandidateEndpointKeys,
  resolveWorkflowCandidatesWithLlm,
} from "../workflows/WorkflowResolve.js";
import {
  createWorkflowFromEndpoints,
  fallbackWorkflowDecomposition,
  fallbackWorkflowDecompositionFromEndpoints,
} from "../workflows/WorkflowSelect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_ROOT = path.resolve(__dirname, "..");
const TOOL_CACHE_DIR = path.resolve(SRC_ROOT, "tool_cache");
const LAST_SELECTION_PATH = path.resolve(TOOL_CACHE_DIR, "last_selection.json");
const CONFIRMED_WORKFLOW_PATH = path.resolve(TOOL_CACHE_DIR, "confirmed_workflow.json");

function collectEndpointsFromWorkflows(workflows) {
  const endpointSet = new Set();
  for (const workflow of workflows || []) {
    for (const step of workflow.steps || []) {
      const toolKey = String(step?.tool || "").trim();
      if (toolKey) endpointSet.add(toolKey);
      const actionKey = String(step?.action || "").trim();
      if (!toolKey && step?.kind === "runtime_tool" && actionKey) {
        endpointSet.add(actionKey);
      }
      for (const candidate of step?.candidateEndpoints || []) {
        if (candidate?.key) endpointSet.add(candidate.key);
      }
    }
  }
  return Array.from(endpointSet);
}

export function getSelectionPaths() {
  return {
    toolCacheDir: TOOL_CACHE_DIR,
    lastSelectionPath: LAST_SELECTION_PATH,
    confirmedWorkflowPath: CONFIRMED_WORKFLOW_PATH,
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

export function saveConfirmedWorkflow(payload) {
  fs.mkdirSync(path.dirname(CONFIRMED_WORKFLOW_PATH), { recursive: true });
  fs.writeFileSync(
    CONFIRMED_WORKFLOW_PATH,
    JSON.stringify(payload, null, 2),
    "utf8",
  );
}

export function clearToolCache() {
  if (fs.existsSync(TOOL_CACHE_DIR)) {
    for (const entry of fs.readdirSync(TOOL_CACHE_DIR)) {
      if (entry === path.basename(CONFIRMED_WORKFLOW_PATH)) {
        continue;
      }
      fs.rmSync(path.join(TOOL_CACHE_DIR, entry), { recursive: true, force: true });
    }
  }

  fs.mkdirSync(TOOL_CACHE_DIR, { recursive: true });
}

export function loadLastSelection() {
  if (!fs.existsSync(LAST_SELECTION_PATH)) {
    throw new Error(`No saved endpoint selection found at ${LAST_SELECTION_PATH}`);
  }

  return JSON.parse(fs.readFileSync(LAST_SELECTION_PATH, "utf8"));
}

export function loadConfirmedWorkflow() {
  if (!fs.existsSync(CONFIRMED_WORKFLOW_PATH)) {
    throw new Error(`No confirmed workflow found at ${CONFIRMED_WORKFLOW_PATH}`);
  }

  return JSON.parse(fs.readFileSync(CONFIRMED_WORKFLOW_PATH, "utf8"));
}

function buildSelectionPayload(selection, generation = null) {
  const query = String(selection?.query || "").trim();
  const workflowDefinitions = Array.isArray(selection?.workflows)
    ? selection.workflows
    : (query
        ? fallbackWorkflowDecomposition(query)
        : fallbackWorkflowDecompositionFromEndpoints(selection?.selectedEndpoints || []));
  const explicitSelectedEndpoints = Array.isArray(selection?.selectedEndpoints)
    ? selection.selectedEndpoints.filter(Boolean)
    : [];
  const normalizedWorkflowDefinitions =
    workflowDefinitions.length > 0
      ? workflowDefinitions
      : createWorkflowFromEndpoints(explicitSelectedEndpoints, query);
  const selectedEndpoints = explicitSelectedEndpoints.length > 0
    ? explicitSelectedEndpoints
    : collectEndpointsFromWorkflows(normalizedWorkflowDefinitions);

  const payload = {
    query,
    selectedEndpoints,
    tokenUsage: selection?.tokenUsage || { input: 0, output: 0 },
    draftWorkflow: selection?.draftWorkflow || null,
    refinedWorkflow: selection?.refinedWorkflow || null,
    finalWorkflow: selection?.finalWorkflow || null,
    workflows: normalizedWorkflowDefinitions,
  };

  if (generation) {
    payload.generation = {
      generatedCount: generation.generatedCount,
      skippedCount: generation.skippedCount,
      manifestPath: generation.manifestPath,
    };
  }

  return payload;
}

export async function generateFromSelection(selection, options = {}) {
  const payloadBase = buildSelectionPayload(selection);
  const projectRoot = path.resolve(SRC_ROOT, "..");
  const candidateWorkflows = await resolveWorkflowCandidatesWithLlm(
    payloadBase.workflows,
    projectRoot,
    {
      allowedEndpointKeys:
        payloadBase.selectedEndpoints.length > 0 ? payloadBase.selectedEndpoints : null,
    },
  );
  const selectedEndpoints = payloadBase.selectedEndpoints.length > 0
    ? payloadBase.selectedEndpoints
    : collectCandidateEndpointKeys(candidateWorkflows);
  const query = payloadBase.query;

  if (selectedEndpoints.length === 0) {
    throw new Error("No selected endpoints available for generation.");
  }

  clearToolCache();

  const generation = await generateMcpTools(selectedEndpoints, options);
  await writeWorkflowModules(
    candidateWorkflows,
    projectRoot,
    selectedEndpoints,
  );
  const payload = buildSelectionPayload(
    {
      query,
      selectedEndpoints,
      tokenUsage: payloadBase.tokenUsage,
      draftWorkflow: selection?.draftWorkflow || payloadBase.draftWorkflow || null,
      refinedWorkflow: selection?.refinedWorkflow || payloadBase.refinedWorkflow || null,
      finalWorkflow: selection?.finalWorkflow || payloadBase.finalWorkflow || null,
      workflows: candidateWorkflows,
    },
    generation,
  );

  saveLastSelection(payload);

  return {
    ...payload,
    generationFull: generation,
  };
}
