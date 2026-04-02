import {
  getEndpointContext,
  resolveWorkflowCandidatesWithLlm,
} from "./WorkflowMapEndpointsHelper.js";
import {
  isRuntimeWorkflowStep,
  normalizeWorkflow,
} from "./WorkflowNodeHelpers.js";

function normalizeWorkflowForEndpointMapping(workflow) {
  return {
    key: workflow?.key || "generated_workflow",
    label: workflow?.label || "Generated Workflow",
    description: workflow?.description || "Generated workflow.",
    scope: workflow?.scope || "serve-only",
    inputSchema: workflow?.inputSchema || {
      type: "object",
      properties: {},
    },
    steps: (workflow?.steps || []).map(
      ({
        key,
        description,
        kind,
        purpose,
        promptTemplate,
        dependsOn,
        condition,
        endpointKey,
        candidateEndpoints,
      }) => ({
        key,
        description,
        ...(kind ? { kind } : {}),
        ...(purpose ? { purpose } : {}),
        ...(promptTemplate ? { promptTemplate } : {}),
        ...(dependsOn ? { dependsOn } : {}),
        ...(condition ? { condition } : {}),
        ...(endpointKey ? { endpointKey } : {}),
        ...(candidateEndpoints ? { candidateEndpoints } : {}),
      }),
    ),
  };
}

/**
 * Creates the workflow node that maps draft workflow steps to endpoint choices.
 *
 * The node passes the current workflow plus a compact global endpoint catalog
 * into the LLM mapping helper, then normalizes the returned steps so runtime
 * steps carry an endpointKey and non-runtime steps do not retain endpoint data.
 *
 * It returns the mapped workflow together with per-step endpoint selections and
 * a deduplicated final endpoint set for downstream refinement and validation.
 */
export function createMapEndpoints(projectRoot) {
  return async function mapEndpoints(state) {
    const baseWorkflow = state.workflow || normalizeWorkflow(null, state.query);

    const globalCandidateIds = Array.isArray(state.candidateEndpoints)
      ? state.candidateEndpoints.filter(Boolean)
      : [];
    
    let globalEndpointCatalog;

    if (globalCandidateIds.length> 0) {
      globalEndpointCatalog = getEndpointContext(projectRoot)
      .filter((endpoint) => globalCandidateIds.includes(endpoint.key))
      .map((endpoint) => ({
        key: endpoint.key,
        summary: endpoint.summary,
        produces: Array.isArray(endpoint.produces) ? endpoint.produces : [],
      }));
    } else if (globalCandidateIds.length === 0 && getEndpointContext(projectRoot).length > 0) {
    globalEndpointCatalog = getEndpointContext(projectRoot).map(
        (endpoint) => ({
          key: endpoint.key,
          summary: endpoint.summary,
          produces: Array.isArray(endpoint.produces) ? endpoint.produces : [],
        }),
      );
      logger.warn("[WARN] No candidate endpoints available for mapping. Using all project endpoints as fallback.");
    } else {
      throw new Error(
        "No candidate endpoints available for mapping. Ensure that the project has endpoints defined and that candidateEndpoints are provided in the state.",
      );
    }

    const resolvedWorkflow =
      globalEndpointCatalog.length === 0
        ? baseWorkflow
        : (
            await resolveWorkflowCandidatesWithLlm(
              [normalizeWorkflowForEndpointMapping(baseWorkflow)],
              projectRoot,
              {
                endpointCatalog: globalEndpointCatalog,
              },
            )
          )[0];

    const finalSteps = (resolvedWorkflow?.steps || []).map((step) => {
      const kind = String(step?.kind || "runtime_tool").trim() || "runtime_tool";

      if (kind !== "runtime_tool") {
        return {
          ...step,
          kind,
          endpointKey: undefined,
          candidateEndpoints: [],
        };
      }

      const topCandidateKey = String(
        step?.candidateEndpoints?.[0]?.key || "",
      ).trim();
      const endpointKey = String(step?.endpointKey || topCandidateKey).trim();

      return endpointKey ? { ...step, kind, endpointKey } : { ...step, kind };
    });

    const workflow = { ...resolvedWorkflow, steps: finalSteps };

    const endpointSelections = finalSteps.map((step) => ({
      key: step.key,
      kind: step.kind || "runtime_tool",
      endpointKey: String(step?.endpointKey || "").trim(),
      candidateEndpoints: Array.isArray(step?.candidateEndpoints)
        ? step.candidateEndpoints
        : [],
    }));

    const finalSelection = Array.from(
      new Set(
        endpointSelections
          .map((entry) => entry?.endpointKey || "")
          .filter(Boolean),
      ),
    );

    return {
      currentNode: "map_endpoints",
      draftWorkflow: state.draftWorkflow || state.workflow,
      refinedWorkflow: state.refinedWorkflow || null,
      finalWorkflow: state.finalWorkflow || workflow,
      finalSelection, 
      endpointSelections,
      workflow,
      mappedWorkflow: workflow,
      mappedSteps: finalSteps.map((step, index) => ({
        id: index + 1,
        key: step.key,
        description: step.description,
        kind: step.kind || "runtime_tool",
        endpoint: isRuntimeWorkflowStep(step)
          ? step.endpointKey || step.candidateEndpoints?.[0]?.key || ""
          : "",
        params: {},
      })),
    };
  };
}
