export async function finalizeDraft(state) {
  return {
    currentNode: "finalize_draft",
    workflow: state.workflow,
    draftWorkflow: state.draftWorkflow || state.workflow,
    refinedWorkflow: state.refinedWorkflow || null,
    finalWorkflow: state.finalWorkflow || null,
    candidateEndpoints: state.candidateEndpoints || [],
    refinement: state.refinement || {},
  };
}
