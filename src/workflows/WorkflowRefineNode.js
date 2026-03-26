import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  ENDPOINT_INDEX,
  buildRefinementPrompt,
  isRuntimeWorkflowStep,
  normalizeRefinedStep,
  normalizeWorkflow,
  parseRefinedWorkflow,
  refineWorkflowWithHeuristics,
} from "./WorkflowNodeHelpers.js";

export async function refineWorkflow(state) {
  const baseWorkflow = state.workflow || normalizeWorkflow(null, state.query);
  const heuristicWorkflow = refineWorkflowWithHeuristics(baseWorkflow, state.query);
  const finalEndpointIds = Array.isArray(state.finalSelection) && state.finalSelection.length > 0
    ? state.finalSelection
    : state.candidateEndpoints || [];

  try {
    const prompt = buildRefinementPrompt(state.query, heuristicWorkflow, finalEndpointIds);
    const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
    const { parsed, workflow: candidate } = parseRefinedWorkflow(raw, state.query);
    const refinedWorkflow = {
      ...heuristicWorkflow,
      ...candidate,
      steps: (candidate?.steps || heuristicWorkflow.steps || []).map((step, index) =>
        normalizeRefinedStep(step, heuristicWorkflow.steps?.[index] || step, index),
      ),
    };

    const selectedEndpointKeys = new Set(finalEndpointIds.filter(Boolean));
    refinedWorkflow.steps = (refinedWorkflow.steps || []).map((step, index) => {
      if (!isRuntimeWorkflowStep(step)) {
        return normalizeRefinedStep(step, heuristicWorkflow.steps?.[index] || step, index);
      }

      const fallbackCandidates = Array.isArray(baseWorkflow?.steps?.[index]?.candidateEndpoints)
        ? baseWorkflow.steps[index].candidateEndpoints.filter((endpoint) => selectedEndpointKeys.size === 0 || selectedEndpointKeys.has(endpoint?.key))
        : [];
      const stepEndpointKey = String(step?.endpointKey || "").trim();
      const indexedEndpoint = stepEndpointKey && ENDPOINT_INDEX[stepEndpointKey]
        ? { key: stepEndpointKey, ...ENDPOINT_INDEX[stepEndpointKey] }
        : null;
      const matchedEndpoint = stepEndpointKey
        ? (fallbackCandidates.find((endpoint) => endpoint?.key === stepEndpointKey) || indexedEndpoint)
        : fallbackCandidates[0] || null;

      return normalizeRefinedStep({
        ...step,
        endpointKey: matchedEndpoint?.key || stepEndpointKey || "",
        candidateEndpoints: matchedEndpoint
          ? [matchedEndpoint]
          : fallbackCandidates,
      }, heuristicWorkflow.steps?.[index] || step, index);
    });

    return {
      currentNode: "refine_workflow",
      refinedWorkflow,
      finalWorkflow: refinedWorkflow,
      workflow: refinedWorkflow,
      refinement: {
        strategy: "llm",
        notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
      },
    };
  } catch {
    return {
      currentNode: "refine_workflow",
      refinedWorkflow: heuristicWorkflow,
      finalWorkflow: heuristicWorkflow,
      workflow: heuristicWorkflow,
      refinement: {
        strategy: "heuristic",
        notes: [],
      },
    };
  }
}
