export async function finalizePlan(state) {
  return {
    currentNode: "finalize_plan",
    finalSelection: Array.from(
      new Set((state.finalSelection || []).filter(Boolean)),
    ),
    draftWorkflow: state.draftWorkflow || state.workflow,
    refinedWorkflow: state.refinedWorkflow || null,
    finalWorkflow: state.finalWorkflow || null,
    workflow: state.workflow,
  };
}
