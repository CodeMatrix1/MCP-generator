import { decomposeWorkflowRequirement } from "./WorkflowDraftHelper.js";
import {
  buildWorkflowFallbackFromCandidates,
  chooseEndpointsFallback,
  isDegenerateWorkflow,
  normalizeWorkflow,
} from "./WorkflowNodeHelpers.js";

export async function draftWorkflow(state) {
  const preservedWorkflow = normalizeWorkflow(
    state.draftWorkflow || state.workflow,
    state.query,
  );

  if (preservedWorkflow && !isDegenerateWorkflow(preservedWorkflow, state.query)) {
    return {
      currentNode: "draft_workflow",
      draftWorkflow: preservedWorkflow,
      workflow: preservedWorkflow,
      intentConfirmation: state.intentConfirmation || {},
    };
  }

  const shortlist = Array.isArray(state.candidateEndpoints) && state.candidateEndpoints.length > 0
    ? chooseEndpointsFallback(state.candidateEndpoints, state.query, 10, 15)
    : [];
  const draft = await decomposeWorkflowRequirement(state.query, {
    intentConfirmation: state.intentConfirmation || {},
    endpointHints: shortlist,
  });
  let workflow = normalizeWorkflow(draft.workflows?.[0], state.query);

  if (isDegenerateWorkflow(workflow, state.query) && state.candidateEndpoints?.length) {
    workflow = buildWorkflowFallbackFromCandidates(
      state.query,
      state.candidateEndpoints,
    );
  }

  return {
    currentNode: "draft_workflow",
    draftWorkflow: workflow,
    workflow,
    intentConfirmation: state.intentConfirmation || {},
  };
}
