export async function validateSelection(state) {
  const errors = [
    ...(!String(state.query || "").trim() ? ["Query is missing."] : []),
    ...(!Array.isArray(state.candidateEndpoints) || state.candidateEndpoints.length === 0
      ? ["No candidate endpoints found."]
      : []),
    ...(!Array.isArray(state.finalSelection) || state.finalSelection.length === 0
      ? ["No final endpoints selected."]
      : []),
    ...(!state.workflow?.steps?.length ? ["Workflow draft is empty."] : []),
    ...(state.mappedSteps || [])
      .filter((step) => step.kind === "runtime_tool" && !step.endpoint)
      .map((step) => `Step ${step.id} is missing an endpoint.`),
  ];

  return {
    currentNode: "validate_selection",
    validation: {
      isValid: errors.length === 0,
      errors,
    },
  };
}
