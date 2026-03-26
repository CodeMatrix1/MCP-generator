import path from "node:path";
import { fileURLToPath } from "node:url";
import { END, START, StateGraph } from "@langchain/langgraph";
import { WorkflowGraphState } from "../core/workflowGraphState.js";
import {
  createMapEndpoints,
  createWorkflowNodes,
} from "../workflows/WorkflowNodes.js";
import {
  buildTokenUsage,
  normalizeWorkflow,
  normalizeWorkflowForSelection,
} from "../workflows/WorkflowNodeHelpers.js";
import { createWorkflowFromEndpoints } from "../workflows/WorkflowSelect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const {
  classifyTags,
  retrieveCandidates,
  draftWorkflow,
  refineWorkflow,
  finalizeDraft,
  selectFinalEndpoints,
  validateSelection,
  finalizePlan,
} = createWorkflowNodes();

export function createDraftWorkflowGraph() {
  return new StateGraph(WorkflowGraphState)
    .addNode("classify_tags", classifyTags)
    .addNode("retrieve_candidates", retrieveCandidates)
    .addNode("draft_workflow", draftWorkflow)
    .addNode("finalize_draft", finalizeDraft)
    .addEdge(START, "classify_tags")
    .addEdge("classify_tags", "retrieve_candidates")
    .addEdge("retrieve_candidates", "draft_workflow")
    .addEdge("draft_workflow", "finalize_draft")
    .addEdge("finalize_draft", END)
    .compile();
}

export function createWorkflowGraph(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;

  return new StateGraph(WorkflowGraphState)
    .addNode("classify_tags", classifyTags)
    .addNode("retrieve_candidates", retrieveCandidates)
    .addNode("draft_workflow", draftWorkflow)
    .addNode("select_final_endpoints", selectFinalEndpoints)
    .addNode("map_endpoints", createMapEndpoints(projectRoot))
    .addNode("refine_workflow", refineWorkflow)
    .addNode("validate_selection", validateSelection)
    .addNode("finalize_plan", finalizePlan)
    .addEdge(START, "classify_tags")
    .addEdge("classify_tags", "retrieve_candidates")
    .addEdge("retrieve_candidates", "draft_workflow")
    .addEdge("draft_workflow", "select_final_endpoints")
    .addEdge("select_final_endpoints", "map_endpoints")
    .addEdge("map_endpoints", "refine_workflow")
    .addEdge("refine_workflow", "validate_selection")
    .addEdge("validate_selection", "finalize_plan")
    .addEdge("finalize_plan", END)
    .compile();
}

export async function runDraftWorkflowGraph(query) {
  return createDraftWorkflowGraph().invoke({ query });
}

export async function runWorkflowGraph(query, options = {}) {
  return createWorkflowGraph(options).invoke({ query });
}

function normalizeDraftSelection(selection) {
  const query = String(selection?.query || "").trim();
  const workflow = normalizeWorkflow(
    selection?.workflows?.[0] || selection?.workflow,
    query,
  );

  return {
    query,
    parsedDomain: selection?.parsedDomain || {},
    candidateEndpoints: Array.isArray(selection?.candidateEndpoints)
      ? selection.candidateEndpoints.filter(Boolean)
      : [],
    draftWorkflow: selection?.draftWorkflow
      ? normalizeWorkflowForSelection(selection.draftWorkflow)
      : null,
    refinedWorkflow: selection?.refinedWorkflow
      ? normalizeWorkflowForSelection(selection.refinedWorkflow)
      : null,
    finalWorkflow: selection?.finalWorkflow
      ? normalizeWorkflowForSelection(selection.finalWorkflow)
      : null,
    workflows: workflow ? [normalizeWorkflowForSelection(workflow)] : [],
    refinement: selection?.refinement || {},
    tokenUsage: selection?.tokenUsage || { input: 0, output: 0 },
  };
}

export async function draftSelection(userQuery) {
  const query = String(userQuery || "").trim();
  if (!query) {
    throw new Error("Missing query.");
  }

  const graph = await runDraftWorkflowGraph(query);
  const workflow = normalizeWorkflowForSelection(graph.workflow);
  const payload = {
    query,
    parsedDomain: graph.parsedDomain || {},
    candidateEndpoints: graph.candidateEndpoints || [],
    selectedEndpoints: [],
    draftWorkflow: normalizeWorkflowForSelection(graph.draftWorkflow || graph.workflow),
    refinedWorkflow: null,
    finalWorkflow: null,
    workflows: workflow ? [workflow] : createWorkflowFromEndpoints([], query),
    refinement: graph.refinement || {},
  };

  return {
    ...payload,
    tokenUsage: buildTokenUsage(query, payload),
    debug: graph.currentNode || "Selection mode: workflow draft",
  };
}

export async function finalizeSelection(selection, options = {}) {
  const base = normalizeDraftSelection(selection);
  if (!base.query) {
    throw new Error("Missing query.");
  }

  if (base.candidateEndpoints.length === 0) {
    throw new Error("No candidate endpoints available for final selection.");
  }

  const workflow = normalizeWorkflow(base.workflows[0], base.query);
  const graph = await createWorkflowGraph(options).invoke({
    query: base.query,
    parsedDomain: base.parsedDomain,
    candidateEndpoints: base.candidateEndpoints,
    workflow,
  });
  const selectedEndpoints = Array.isArray(graph.finalSelection)
    ? graph.finalSelection.filter(Boolean)
    : [];

  if (selectedEndpoints.length === 0) {
    const reason =
      graph.validation?.errors?.join("; ") || "No endpoints were selected.";
    throw new Error(`Endpoint selection failed: ${reason}`);
  }

  const result = {
    query: base.query,
    parsedDomain: base.parsedDomain,
    candidateEndpoints: base.candidateEndpoints,
    selectedEndpoints,
    draftWorkflow: normalizeWorkflowForSelection(graph.draftWorkflow || base.draftWorkflow || workflow),
    refinedWorkflow: normalizeWorkflowForSelection(graph.refinedWorkflow || base.refinedWorkflow || null),
    finalWorkflow: normalizeWorkflowForSelection(graph.finalWorkflow || base.finalWorkflow || null),
    workflows: [
      normalizeWorkflowForSelection(
        graph.finalWorkflow
        || graph.refinedWorkflow
        || graph.workflow
        || workflow,
      ),
    ].filter(Boolean),
    refinement: graph.refinement || base.refinement || {},
  };

  return {
    ...result,
    tokenUsage: buildTokenUsage(base.query, result),
    debug:
      graph.validation?.errors?.join("\n") ||
      graph.currentNode ||
      "Selection mode: finalized workflow selection",
  };
}

export async function synthesizeSelection(userQuery, options = {}) {
  const draft = await draftSelection(userQuery);
  return finalizeSelection(draft, options);
}
