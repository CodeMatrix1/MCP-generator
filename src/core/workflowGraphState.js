import { Annotation } from "@langchain/langgraph";

/**
 * Shared state object carried across the LangGraph-based workflow selection pipeline.
 *
 * Each node reads from and writes to this state as the request moves from
 * intent confirmation to candidate retrieval, workflow drafting, endpoint
 * mapping, refinement, validation, and finalization.
 *
 * {
 * - query: Raw user request.
 * - parsedDomain: Classified Rocket.Chat domains, tags, and keywords.
 * - intentConfirmation: Structured result from the intent confirmation step.
 * - intentConfirmed: Whether the user has approved continuing past intent confirmation.
 * - candidateEndpoints: Narrowed pool of Rocket.Chat endpoints relevant to the request.
 * - draftWorkflow: Initial abstract workflow draft.
 * - refinedWorkflow: Workflow after refinement into a richer execution-aware form.
 * - finalWorkflow: Best workflow selected before or during finalization.
 * - validatedWorkflow: Workflow after validation-time repair/normalization.
 * - endpointSelections: Step-level endpoint candidate assignments.
 * - workflow: The currently active workflow object being transformed by the graph.
 * - refinement: Metadata produced during workflow refinement.
 * - mappedSteps: Runtime-oriented step representations used during endpoint mapping.
 * - mappedWorkflow: Workflow snapshot after endpoint mapping.
 * - finalSelection: Final deduplicated set of selected endpoint keys.
 * - validation: Validation result object, including validity and errors.
 * - validationErrors: Flattened list of validation error messages.
 * - validationErrorsRaw: Validation errors before repair.
 * - currentNode: Name of the graph node that last updated the state.
 * }
 */
export const WorkflowGraphState = Annotation.Root({
  query: Annotation,
  parsedDomain: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  intentConfirmation: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  intentConfirmed: Annotation({ reducer: (_left, right) => right, default: () => false }),
  candidateEndpoints: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  draftWorkflow: Annotation({ reducer: (_left, right) => right, default: () => null }),
  refinedWorkflow: Annotation({ reducer: (_left, right) => right, default: () => null }),
  finalWorkflow: Annotation({ reducer: (_left, right) => right, default: () => null }),
  validatedWorkflow: Annotation({ reducer: (_left, right) => right, default: () => null }),
  endpointSelections: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  workflow: Annotation,
  refinement: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  mappedSteps: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  mappedWorkflow: Annotation({ reducer: (_left, right) => right, default: () => null }),
  finalSelection: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  validation: Annotation,
  validationErrors: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  validationErrorsRaw: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  currentNode: Annotation,
});
