import { normalizeInputBindings, normalizeOutputs } from "./WorkflowNodeHelpers.js";

function normalizeRefinedStep(step, fallbackStep, index) {
  const allowedKinds = new Set([
    "runtime_tool",
    "llm_step",
    "compute_step",
    "condition_step",
    "loop_step",
  ]);
  const rawKind = String(step?.kind || fallbackStep?.kind || "runtime_tool").trim();
  const kind = allowedKinds.has(rawKind) ? rawKind : "runtime_tool";
  const dependsOn = Array.isArray(step?.dependsOn)
    ? step.dependsOn.map((value) => String(value).trim()).filter(Boolean)
    : (step?.dependsOn ? [String(step.dependsOn).trim()].filter(Boolean) : []);
  const condition = Array.isArray(step?.condition)
    ? step.condition.map((value) => String(value).trim()).filter(Boolean)
    : (step?.condition ? [String(step.condition).trim()].filter(Boolean) : []);
  const inputBindings = normalizeInputBindings(step?.inputBindings);
  const outputVariables = step?.outputVariables && typeof step.outputVariables === "object"
    ? step.outputVariables
    : null;
  return {
    id: index + 1,
    key: String(step?.key || fallbackStep?.key || `step_${index + 1}`).trim(),
    description: String(step?.description || fallbackStep?.description || "").trim(),
    kind,
    purpose: String(step?.purpose || fallbackStep?.purpose || step?.description || fallbackStep?.description || "").trim(),
    ...(step?.promptTemplate ? { promptTemplate: String(step.promptTemplate).trim() } : {}),
    ...(dependsOn.length > 0 ? { dependsOn } : {}),
    ...(condition.length > 0 ? { condition } : {}),
    ...(step?.condition ? { condition: String(step.condition).trim() } : {}),
    ...(step?.iterator ? { iterator: String(step.iterator).trim() } : {}),
    ...(step?.endpointKey ? { endpointKey: String(step.endpointKey).trim() } : {}),
    ...(Array.isArray(step?.candidateEndpoints) ? { candidateEndpoints: step.candidateEndpoints } : {}),
    ...(Array.isArray(step?.inputs) ? { inputs: step.inputs } : {}),
    ...(normalizeOutputs(step?.outputs) ? { outputs: normalizeOutputs(step.outputs) } : {}),
    ...(inputBindings ? { inputBindings } : {}),
    ...(outputVariables ? { outputVariables } : {}),
  };
}

export function buildEndpointSelectionMap(steps = []) {
  return new Map(
    (steps || [])
      .map((step) => {
        const key = String(step?.key || "").trim();
        return key
          ? [
              key,
              {
                endpointKey: String(step?.endpointKey || "").trim(),
                candidateEndpoints: Array.isArray(step?.candidateEndpoints)
                  ? step.candidateEndpoints
                  : [],
              },
            ]
          : null;
      })
      .filter(Boolean),
  );
}

export function mergeStepPatches(workflow, patches = [], includeFields = []) {
  const patchMap = new Map(
    (patches || [])
      .map((patch) => [String(patch?.key || "").trim(), patch])
      .filter(([key]) => key),
  );

  return {
    ...workflow,
    steps: (workflow?.steps || []).map((step, index) => {
      const patch = patchMap.get(String(step?.key || "").trim());
      if (!patch) {
        return normalizeRefinedStep(step, step, index);
      }

      const nextStep = { ...step };
      for (const field of includeFields) {
        if (Object.hasOwn(patch, field)) {
          nextStep[field] = patch[field];
        }
      }

      return normalizeRefinedStep(nextStep, step, index);
    }),
  };
}