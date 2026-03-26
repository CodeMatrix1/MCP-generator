import { classifyTags } from "./WorkflowClassifyTagsNode.js";
import { retrieveCandidates } from "./WorkflowRetrieveCandidatesNode.js";
import { draftWorkflow } from "./WorkflowDraftNode.js";
import { refineWorkflow } from "./WorkflowRefineNode.js";
import { finalizeDraft } from "./WorkflowFinalizeDraftNode.js";
import { selectFinalEndpoints } from "./WorkflowSelectFinalEndpointsNode.js";
import { createMapEndpoints } from "./WorkflowMapEndpointsNode.js";
import { validateSelection } from "./WorkflowValidateSelectionNode.js";
import { finalizePlan } from "./WorkflowFinalizePlanNode.js";

export { createMapEndpoints } from "./WorkflowMapEndpointsNode.js";

export function createWorkflowNodes() {
  return {
    classifyTags,
    retrieveCandidates,
    draftWorkflow,
    refineWorkflow,
    finalizeDraft,
    selectFinalEndpoints,
    validateSelection,
    finalizePlan,
  };
}
