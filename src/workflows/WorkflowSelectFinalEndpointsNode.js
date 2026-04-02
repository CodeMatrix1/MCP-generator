import {
  expandCandidateEndpointsFromWorkflow,
  isRuntimeWorkflowStep,
  normalizeRefinedStep,
  normalizeWorkflow,
  rankCandidateEndpointsForStep,
} from "./WorkflowNodeHelpers.js";

export async function selectFinalEndpoints(state) {
  const candidateIds = Array.isArray(state.candidateEndpoints)
    ? state.candidateEndpoints
    : [];
  if (candidateIds.length === 0) {
    return {
      currentNode: "select_final_endpoints",
      finalSelection: [],
    };
  }

  const baseWorkflow = state.workflow || normalizeWorkflow(null, state.query);
  const selectionWorkflow = baseWorkflow;
  const expandedCandidateIds = expandCandidateEndpointsFromWorkflow(
    selectionWorkflow,
    candidateIds,
    state.query,
  );
  const workflow = {
    key: selectionWorkflow?.key || "generated_workflow",
    label: selectionWorkflow?.label || "Generated Workflow",
    description: selectionWorkflow?.description || "Generated workflow.",
    scope: selectionWorkflow?.scope || "serve-only",
    inputSchema: selectionWorkflow?.inputSchema || {
      type: "object",
      properties: {},
    },
    steps: (selectionWorkflow?.steps || []).map((step, index) => {
      const rankedCandidates = isRuntimeWorkflowStep(step)
        ? rankCandidateEndpointsForStep(step, expandedCandidateIds)
        : [];
      return normalizeRefinedStep({
        ...step,
        endpointKey: rankedCandidates[0]?.key || step?.endpointKey || "",
        candidateEndpoints: rankedCandidates.length > 0
          ? rankedCandidates
          : selectionWorkflow?.steps?.[index]?.candidateEndpoints || [],
      }, step, index);
    }),
  };

  return {
    currentNode: "select_final_endpoints",
    workflow,
    draftWorkflow: state.draftWorkflow || state.workflow,
    finalSelection: Array.from(
      new Set(
        (workflow?.steps || [])
          .filter((step) => isRuntimeWorkflowStep(step))
          .map((step) => step.candidateEndpoints?.[0]?.key || "")
          .filter(Boolean),
      ),
    ),
  };
}
