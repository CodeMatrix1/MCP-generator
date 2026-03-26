import { Annotation } from "@langchain/langgraph";

export const WorkflowGraphState = Annotation.Root({
  query: Annotation,
  parsedDomain: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  candidateEndpoints: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  draftWorkflow: Annotation({ reducer: (_left, right) => right, default: () => null }),
  refinedWorkflow: Annotation({ reducer: (_left, right) => right, default: () => null }),
  finalWorkflow: Annotation({ reducer: (_left, right) => right, default: () => null }),
  workflow: Annotation,
  refinement: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  mappedSteps: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  finalSelection: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  validation: Annotation,
  currentNode: Annotation,
});
