import { resolveWorkflowCandidatesWithLlm } from "./WorkflowResolve.js";
import {
  isRuntimeWorkflowStep,
  normalizeWorkflow,
} from "./WorkflowNodeHelpers.js";

export function createMapEndpoints(projectRoot) {
  return async function mapEndpoints(state) {
    const baseWorkflow = state.workflow || normalizeWorkflow(null, state.query);
    const runtimeSteps = (baseWorkflow?.steps || []).filter((step) => isRuntimeWorkflowStep(step));
    const hasResolvedRuntimeEndpoints = runtimeSteps.every(
      (step) => Array.isArray(step?.candidateEndpoints) && step.candidateEndpoints.length > 0,
    );
    const workflow = hasResolvedRuntimeEndpoints
      ? baseWorkflow
      : (await resolveWorkflowCandidatesWithLlm(
        [
          {
            key: baseWorkflow?.key || "generated_workflow",
            label: baseWorkflow?.label || "Generated Workflow",
            description: baseWorkflow?.description || "Generated workflow.",
            scope: baseWorkflow?.scope || "serve-only",
            inputSchema: baseWorkflow?.inputSchema || {
              type: "object",
              properties: {},
            },
            steps: (baseWorkflow?.steps || []).map(
              ({ key, description, action, kind, purpose, promptTemplate, dependsOn, condition, iterator, endpointKey, candidateEndpoints }) => ({
                key,
                description,
                action,
                ...(kind ? { kind } : {}),
                ...(purpose ? { purpose } : {}),
                ...(promptTemplate ? { promptTemplate } : {}),
                ...(dependsOn ? { dependsOn } : {}),
                ...(condition ? { condition } : {}),
                ...(iterator ? { iterator } : {}),
                ...(endpointKey ? { endpointKey } : {}),
                ...(candidateEndpoints ? { candidateEndpoints } : {}),
              }),
            ),
          },
        ],
        projectRoot,
        {
          allowedEndpointKeys:
            Array.isArray(state.finalSelection) && state.finalSelection.length > 0
              ? state.finalSelection
              : null,
        },
      ))[0];

    return {
      currentNode: "map_endpoints",
      draftWorkflow: state.draftWorkflow || state.workflow,
      refinedWorkflow: state.refinedWorkflow || null,
      finalWorkflow: state.finalWorkflow || null,
      workflow,
      mappedSteps: (workflow?.steps || []).map((step, index) => ({
        id: index + 1,
        key: step.key,
        description: step.description,
        action: step.action,
        kind: step.kind || "runtime_tool",
        endpoint: isRuntimeWorkflowStep(step) ? step.candidateEndpoints?.[0]?.key || "" : "",
        params: {},
      })),
    };
  };
}
