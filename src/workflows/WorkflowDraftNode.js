import { decomposeWorkflowRequirement } from "./WorkflowSelect.js";
import {
  buildDraftCapabilityContext,
  buildWorkflowFallbackFromCandidates,
  isDegenerateWorkflow,
  normalizeWorkflow,
} from "./WorkflowNodeHelpers.js";

export async function draftWorkflow(state) {
  const draft = await decomposeWorkflowRequirement(state.query, {
    capabilityContext: buildDraftCapabilityContext(
      state.query,
      state.candidateEndpoints,
    ),
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
  };
}
