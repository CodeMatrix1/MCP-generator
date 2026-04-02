import { classifyTags } from "./WorkflowClassifyTagsNode.js";
import { confirmIntentNode } from "./WorkflowConfirmIntentNode.js";
import { retrieveCandidates } from "./WorkflowRetrieveCandidatesNode.js";
import { draftWorkflow } from "./WorkflowDraftNode.js";
import { refineWorkflow } from "./WorkflowRefineNode.js";
import { finalizeDraft } from "./WorkflowFinalizeDraftNode.js";
import { createMapEndpoints } from "./WorkflowMapEndpointsNode.js";
import { validateSelection } from "./WorkflowValidateNode.js";
import { finalizePlan } from "./WorkflowFinalizePlanNode.js";

export { createMapEndpoints } from "./WorkflowMapEndpointsNode.js";

export function createWorkflowNodes() {
  return {
    confirmIntentNode,
    classifyTags,
    retrieveCandidates,
    draftWorkflow,
    refineWorkflow,
    finalizeDraft,
    validateSelection,
    finalizePlan,
  };
}
