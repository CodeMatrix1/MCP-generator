import path from "node:path";
import { fileURLToPath } from "node:url";
import { END, START, StateGraph } from "@langchain/langgraph";
import { WorkflowGraphState } from "../core/workflowGraphState.js";
import {
  createMapEndpoints,
  createWorkflowNodes,
} from "../workflows/WorkflowNodes.js";
import { confirmIntent } from "./ConfirmIntent.js";
import {
  buildTokenUsage,
  normalizeWorkflow,
  normalizeWorkflowForSelection,
} from "../workflows/WorkflowNodeHelpers.js";
import { logger } from "../config/loggerConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const {
  classifyTags,
  confirmIntentNode,
  retrieveCandidates,
  draftWorkflow,
  refineWorkflow,
  finalizeDraft,
  validateSelection,
  finalizePlan,
} = createWorkflowNodes();

export function createDraftWorkflowGraph() {
  return new StateGraph(WorkflowGraphState)
    .addNode("confirm_intent", confirmIntentNode)
    .addNode("classify_tags", classifyTags)
    .addNode("retrieve_candidates", retrieveCandidates)
    .addNode("draft_workflow", draftWorkflow)
    .addNode("finalize_draft", finalizeDraft)
    .addEdge(START, "confirm_intent")
    .addEdge("confirm_intent", "classify_tags")
    .addEdge("classify_tags", "retrieve_candidates")
    .addEdge("retrieve_candidates", "draft_workflow")
    .addEdge("draft_workflow", "finalize_draft")
    .addEdge("finalize_draft", END)
    .compile();
}

export function createWorkflowGraph(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;

  return new StateGraph(WorkflowGraphState)
    .addNode("confirm_intent", confirmIntentNode)
    .addNode("classify_tags", classifyTags)
    .addNode("retrieve_candidates", retrieveCandidates)
    .addNode("draft_workflow", draftWorkflow)
    .addNode("map_endpoints", createMapEndpoints(projectRoot))
    .addNode("refine_workflow", refineWorkflow)
    .addNode("validate_selection", validateSelection)
    .addNode("finalize_plan", finalizePlan)
    .addEdge(START, "confirm_intent")
    .addEdge("confirm_intent", "classify_tags")
    .addEdge("classify_tags", "retrieve_candidates")
    .addEdge("retrieve_candidates", "draft_workflow")
    .addEdge("draft_workflow", "map_endpoints")
    .addEdge("map_endpoints", "refine_workflow")
    .addEdge("refine_workflow", "validate_selection")
    .addEdge("validate_selection", "finalize_plan")
    .addEdge("finalize_plan", END)
    .compile();
}

export function createFinalizeWorkflowGraph(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;

  return new StateGraph(WorkflowGraphState)
    .addNode("map_endpoints", createMapEndpoints(projectRoot))
    .addNode("refine_workflow", refineWorkflow)
    .addNode("validate_selection", validateSelection)
    .addNode("finalize_plan", finalizePlan)
    .addEdge(START, "map_endpoints")
    .addEdge("map_endpoints", "refine_workflow")
    .addEdge("refine_workflow", "validate_selection")
    .addEdge("validate_selection", "finalize_plan")
    .addEdge("finalize_plan", END)
    .compile();
}

export async function runDraftWithIntentGate(query, options = {}) {
  if (options.intentConfirmed !== true) {
    const intentResult = await confirmIntent(query);
    let intentConfirmation = {};
    try {
      intentConfirmation = JSON.parse(intentResult?.gemini || "{}");
    } catch {
      intentConfirmation = {};
    }
    return {
      currentNode: "confirm_intent",
      query,
      intentConfirmation,
    };
  }

  return createDraftWorkflowGraph().invoke({
    query,
    intentConfirmed: true,
    intentConfirmation: options.intentConfirmation || {},
  });
}

export async function runWorkflowWithIntentGate(query, options = {}) {
  if (options.intentConfirmed !== true) {
    const intentResult = await confirmIntent(query);
    let intentConfirmation = {};
    try {
      intentConfirmation = JSON.parse(intentResult?.gemini || "{}");
    } catch {
      intentConfirmation = {};
    }
    return {
      currentNode: "confirm_intent",
      query,
      intentConfirmation,
    };
  }

  return createWorkflowGraph(options).invoke({
    query,
    intentConfirmed: true,
    intentConfirmation: options.intentConfirmation || {},
  });
}

function normalizeDraftSelection(selection) {
  const query = String(selection?.query || "").trim();
  const workflow = normalizeWorkflow(
    selection?.workflows?.[0] || selection?.workflow,
    query,
  );

  return {
    query,
    intentConfirmation: selection?.intentConfirmation || {},
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
    validatedWorkflow: selection?.validatedWorkflow
      ? normalizeWorkflowForSelection(selection.validatedWorkflow)
      : null,
    endpointSelections: Array.isArray(selection?.endpointSelections)
      ? selection.endpointSelections
      : [],
    mappedSteps: Array.isArray(selection?.mappedSteps)
      ? selection.mappedSteps
      : [],
    workflows: workflow ? [normalizeWorkflowForSelection(workflow)] : [],
    refinement: selection?.refinement || {},
    tokenUsage: selection?.tokenUsage || { input: 0, output: 0 },
  };
}

export async function draftSelection(userQuery, options = {}) {
  const query = String(userQuery || "").trim();
  if (!query) {
    throw new Error("Missing query.");
  }

  const graph = await runDraftWithIntentGate(query, options);
  if (graph.currentNode === "confirm_intent") {
    const payload = {
      query,
      intentConfirmation: graph.intentConfirmation || {},
      candidateEndpoints: [],
      selectedEndpoints: [],
      draftWorkflow: null,
      refinedWorkflow: null,
      finalWorkflow: null,
      validatedWorkflow: null,
      endpointSelections: [],
      mappedSteps: [],
      workflows: [],
      refinement: {},
      approvalRequired: true,
      resumeArgs: ["--intent-confirmed"],
      intentOnly: true,
    };
    return {
      ...payload,
      tokenUsage: buildTokenUsage(query, payload),
      debug: "Intent confirmation required",
    };
  }
  const workflow = normalizeWorkflowForSelection(graph.workflow);
  const payload = {
    query,
    intentConfirmation: graph.intentConfirmation || {},
    parsedDomain: graph.parsedDomain || {},
    candidateEndpoints: graph.candidateEndpoints || [],
    selectedEndpoints: [],
    draftWorkflow: normalizeWorkflowForSelection(graph.draftWorkflow || graph.workflow),
    refinedWorkflow: null,
    finalWorkflow: null,
    validatedWorkflow: null,
    endpointSelections: [],
    mappedSteps: Array.isArray(graph.mappedSteps) ? graph.mappedSteps : [],
    workflows: workflow ? [workflow] : [],
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

  const workflow = normalizeWorkflow(
    base.validatedWorkflow
    || base.finalWorkflow
    || base.refinedWorkflow
    || base.draftWorkflow
    || base.workflows[0],
    base.query,
  );
  const graph = await createFinalizeWorkflowGraph(options).invoke({
    query: base.query,
    parsedDomain: base.parsedDomain,
    candidateEndpoints: base.candidateEndpoints,
    draftWorkflow: base.draftWorkflow || workflow,
    refinedWorkflow: base.refinedWorkflow || null,
    finalWorkflow: base.finalWorkflow || null,
    validatedWorkflow: base.validatedWorkflow || null,
    endpointSelections: base.endpointSelections,
    workflow,
    intentConfirmed: true,
  });
  const selectedEndpoints = Array.isArray(graph.finalSelection)
    ? graph.finalSelection.filter(Boolean)
    : [];
  const partialResult = {
    query: base.query,
    intentConfirmation: graph.intentConfirmation || base.intentConfirmation || {},
    parsedDomain: base.parsedDomain,
    candidateEndpoints: base.candidateEndpoints,
    selectedEndpoints,
    draftWorkflow: normalizeWorkflowForSelection(graph.draftWorkflow || base.draftWorkflow || workflow),
    refinedWorkflow: normalizeWorkflowForSelection(graph.refinedWorkflow || base.refinedWorkflow || null),
    validatedWorkflow: normalizeWorkflowForSelection(graph.validatedWorkflow || base.validatedWorkflow || null),
    finalWorkflow: normalizeWorkflowForSelection(
      graph.validatedWorkflow
      || graph.finalWorkflow
      || graph.refinedWorkflow
      || graph.workflow
      || base.validatedWorkflow
      || base.finalWorkflow
      || workflow,
    ),
    endpointSelections: Array.isArray(graph.endpointSelections)
      ? graph.endpointSelections
      : Array.isArray(base.endpointSelections)
        ? base.endpointSelections
        : [],
    mappedSteps: Array.isArray(graph.mappedSteps)
      ? graph.mappedSteps
      : Array.isArray(base.mappedSteps)
        ? base.mappedSteps
        : [],
    mappedWorkflow: graph.mappedWorkflow
      ? {
          key: graph.mappedWorkflow?.key || "",
          description: graph.mappedWorkflow?.description || "",
          steps: Array.isArray(graph.mappedWorkflow?.steps)
            ? graph.mappedWorkflow.steps.map((step) => {
                const inferredKind = String(step?.kind || "runtime_tool").trim();
                const isRuntimeTool = inferredKind === "runtime_tool";
                const operationId = isRuntimeTool
                  ? String(step?.endpointKey || "").trim()
                  : "";
                const candidateEndpoints = isRuntimeTool && Array.isArray(step?.candidateEndpoints)
                  ? step.candidateEndpoints
                      .map((candidate) => String(candidate?.key || candidate || "").trim())
                      .filter(Boolean)
                  : [];
                return {
                  key: step.key,
                  description: step.description || "",
                  ...(operationId ? { operationId } : {}),
                  ...(candidateEndpoints.length > 0 ? { candidateEndpoints } : {}),
                };
              })
            : [],
        }
      : null,
    workflows: [
      normalizeWorkflowForSelection(
        graph.validatedWorkflow
        || graph.finalWorkflow
        || graph.refinedWorkflow
        || graph.workflow
        || base.validatedWorkflow
        || base.finalWorkflow
        || workflow,
      ),
    ].filter(Boolean),
    refinement: graph.refinement || base.refinement || {},
    validation: graph.validation || {},
    validationErrors: Array.isArray(graph.validationErrors) ? graph.validationErrors : [],
    validationErrorsRaw: Array.isArray(graph.validationErrorsRaw) ? graph.validationErrorsRaw : [],
  };

  if (graph.validation?.isValid === false) {
    logger.warn(
      `Endpoint selection failed validation: ${
        Array.isArray(graph.validation?.errors) && graph.validation.errors.length > 0
          ? graph.validation.errors.join("; ")
          : "Workflow validation failed."
      }`,
    );
  }

  if (selectedEndpoints.length === 0) {
    const reason =
      graph.validation?.errors?.join("; ") || "No endpoints were selected.";
    throw new Error(`Endpoint selection failed: ${reason}`);
  }

  const result = partialResult;

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
