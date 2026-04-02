export async function finalizePlan(state) {
  const validatedWorkflow = state.validatedWorkflow || null;
  const finalWorkflow = validatedWorkflow || state.finalWorkflow || state.refinedWorkflow || state.workflow || null;
  const derivedFinalSelection = Array.isArray(state.finalSelection) && state.finalSelection.length > 0
    ? state.finalSelection
    : Array.from(
        new Set(
          (state.endpointSelections || [])
            .map((entry) => entry?.endpointKey || "")
            .filter(Boolean),
        ),
      );
  return {
    currentNode: "finalize_plan",
    finalSelection: Array.from(new Set(derivedFinalSelection.filter(Boolean))),
    draftWorkflow: state.draftWorkflow || state.workflow,
    refinedWorkflow: state.refinedWorkflow || null,
    finalWorkflow,
    validatedWorkflow,
    endpointSelections: state.endpointSelections || [],
    workflow: state.workflow || finalWorkflow,
  };
}
