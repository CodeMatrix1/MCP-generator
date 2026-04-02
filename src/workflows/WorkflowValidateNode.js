import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import { getEndpointContext } from "./WorkflowMapEndpointsHelper.js";
import {
  collectAvailableValueNames,
  validateRequiredInputs,
  validateStepDataFlow
} from "./WorkflowValidateHelper.js";

function mergeConditions(currentConditions = [], repairedConditions = []) {
  const currentByKey = new Map(
    (currentConditions || []).map((condition) => [String(condition?.key || "").trim(), condition]),
  );
  const merged = [];
  const seen = new Set();

  for (const condition of repairedConditions || []) {
    const key = String(condition?.key || "").trim();
    if (!key) continue;
    const current = currentByKey.get(key) || {};
    merged.push({
      ...current,
      ...condition,
    });
    seen.add(key);
  }

  for (const condition of currentConditions || []) {
    const key = String(condition?.key || "").trim();
    if (!key || seen.has(key)) continue;
    merged.push(condition);
  }

  return merged;
}

function mergeWorkflow(currentWorkflow, repairedWorkflow) {
  if (!repairedWorkflow || typeof repairedWorkflow !== "object") {
    return currentWorkflow;
  }

  const currentSteps = Array.isArray(currentWorkflow?.steps) ? currentWorkflow.steps : [];
  const repairedSteps = Array.isArray(repairedWorkflow?.steps) ? repairedWorkflow.steps : [];
  const currentStepsByKey = new Map(
    currentSteps.map((step) => [String(step?.key || "").trim(), step]),
  );
  const mergedSteps = [];
  const seen = new Set();

  for (const step of repairedSteps) {
    const key = String(step?.key || "").trim();
    if (!key) continue;
    const currentStep = currentStepsByKey.get(key) || {};
    mergedSteps.push({
      ...currentStep,
      ...step,
    });
    seen.add(key);
  }

  for (const step of currentSteps) {
    const key = String(step?.key || "").trim();
    if (!key || seen.has(key)) continue;
    mergedSteps.push(step);
  }

  return {
    ...currentWorkflow,
    ...repairedWorkflow,
    conditions: mergeConditions(
      currentWorkflow?.conditions || [],
      repairedWorkflow?.conditions || [],
    ),
    steps: mergedSteps,
  };
}

const validateWorkflowRepair = compileSchema({
  type: "object",
  properties: {
    workflow: {
      type: "object",
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        description: { type: "string" },
        scope: { type: "string" },
        inputSchema: { type: "object" },
        conditions: { type: "array" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              description: { type: "string" },
            },
            required: ["key", "description"],
            additionalProperties: true,
          },
        },
      },
      required: ["steps"],
      additionalProperties: true,
    },
  },
  required: ["workflow"],
  additionalProperties: true,
});

function buildValidationErrors(state, workflow, endpointMap, endpointContext) {
  const derivedFinalSelection = Array.isArray(state.finalSelection) && state.finalSelection.length > 0
    ? state.finalSelection
    : (state.mappedSteps || [])
        .map((step) => step?.endpoint || "")
        .filter(Boolean);
  const availableNames = collectAvailableValueNames(workflow);

  return [
    ...(!String(state.query || "").trim() ? ["Query is missing."] : []),
    ...(!Array.isArray(state.candidateEndpoints) || state.candidateEndpoints.length === 0
      ? ["No candidate endpoints found."]
      : []),
    ...(derivedFinalSelection.length === 0
      ? ["No final endpoints selected."]
      : []),
    ...(!state.workflow?.steps?.length ? ["Workflow draft is empty."] : []),
    ...(state.mappedSteps || [])
      .filter((step) => step.kind === "runtime_tool" && !step.endpoint)
      .map((step) => `Step ${step.id} is missing an endpoint.`),
    ...(workflow?.steps || [])
      .filter((step) => step.kind === "runtime_tool" && !("inputs" in step))
      .map((step) => `Step ${step.key} is missing inputs metadata.`),
    ...(workflow?.steps || [])
      .filter((step) => step.kind === "runtime_tool" && !("outputs" in step))
      .map((step) => `Step ${step.key} is missing outputs metadata.`),
    ...(workflow?.steps || [])
      .filter((step) => !("inputs" in step))
      .map((step) => `Step ${step.key} is missing inputs field.`),
    ...(workflow?.steps || [])
      .filter((step) => !("outputs" in step))
      .map((step) => `Step ${step.key} is missing outputs field.`),
    ...validateStepDataFlow(workflow),
    ...(workflow?.steps || [])
      .filter((step) => step.kind === "runtime_tool")
      .flatMap((step) => {
        const endpoint = endpointMap.get(String(step?.endpointKey || step?.tool || "").trim());
        if (!endpoint) {
          return [`Step ${step.key} references unknown endpoint "${step?.endpointKey || step?.tool || ""}".`];
        }
        return [
          ...validateRequiredInputs(step, availableNames),
        ];
      }),
  ];
}

function buildValidationRepairPrompt(query, workflow, errors, endpointCatalog) {
  return `Repair the workflow so all validation errors are resolved.

Think through each error, identify its root cause, and fix the workflow completely. Then output only JSON.

Return:
{
"workflow": {
"key": "string",
"label": "string",
"description": "string",
"scope": "serve-only",
"inputSchema": { "type": "object", "properties": {} },
"conditions": [],
"steps": []
}
}

---

### METHOD

For each error:

* Identify what is missing or inconsistent
* Determine the correct structure or data flow
* Apply a complete fix (not partial)
* Ensure downstream steps still work

---

### RULES

* Keep overall intent unchanged
* You may modify: kind, endpointKey, inputs, outputs, inputBindings, dependsOn, conditions
* Use only endpoints from catalog

---

### STEP REQUIREMENTS

* Every step MUST have:

  * inputs (non-empty)
  * outputs (non-empty)

* runtime_tool:

  * valid endpointKey
  * minimal required inputs
  * outputs = alias → endpoint result path
  * inputBindings resolve all inputs

* llm_step:

  * promptTemplate
  * virtual inputs
  * outputs + bindings

---

### DATA FLOW

* All required inputs must be bound from:

  * inputs.<name> OR
  * steps.<step>.result.<path>

* If a value is needed later (userId, roomId, message, etc.), it must be explicitly produced earlier

---

### SEMANTIC FIXES

* Fix wrong endpoint usage (match step intent)
* Replace incompatible endpoints
* Split steps if one endpoint cannot satisfy intent
* Convert incorrect step kinds

---

### CONDITIONS

* Use top-level conditions only
* Add conditions for lookup → create flows
* Ensure dependsOn covers condition + data dependencies

---

### IMPORTANT

* Do NOT leave unresolved inputs
* Do NOT leave missing metadata
* Do NOT partially fix an error
* Prefer minimal but complete corrections

---

### OUTPUT

* Valid JSON only
* No explanations

---

Query:
${query}

Errors:
${JSON.stringify(errors, null, 2)}

Workflow:
${JSON.stringify(workflow, null, 2)}

Endpoints:
${JSON.stringify(endpointCatalog, null, 2)}

`;
}

async function attemptValidationRepair(state, workflow, endpointContext) {
  const endpointMap = new Map(endpointContext.map((endpoint) => [endpoint.key, endpoint]));
  const preRepairErrors = buildValidationErrors(state, workflow, endpointMap, endpointContext);
  if (preRepairErrors.length === 0) {
    return { workflow, errors: [], preRepairErrors };
  }

  try {
    const prompt = buildValidationRepairPrompt(
      state.query || "",
      workflow,
      preRepairErrors,
      endpointContext,
    );
    const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
    const parsed = parseGeminiJsonWithSchema(raw, validateWorkflowRepair, "workflow validation repair JSON");
    const repairedWorkflow = mergeWorkflow(
      workflow,
      parsed?.workflow || null,
    );
    const repairedErrors = buildValidationErrors(state, repairedWorkflow, endpointMap, endpointContext);
    return {
      workflow: repairedWorkflow,
      errors: repairedErrors,
      preRepairErrors,
      attemptedRepair: true,
    };
  } catch {
    return {
      workflow,
      errors: preRepairErrors,
      preRepairErrors,
      attemptedRepair: true,
    };
  }
}

/**
 * Validates the current workflow and optionally requests an LLM-based repair.
 *
 * This node performs literal validation over workflow completeness, endpoint
 * references, required inputs, outputs, and data-flow bindings. When errors are
 * found, it asks Gemini to repair the current workflow directly and merges the
 * repaired result back onto the current workflow shape by key.
 *
 * The returned payload includes the validated workflow, final endpoint
 * selection, and structured validation metadata describing whether repair was
 * attempted and which errors remain.
 */
export async function validateSelection(state) {
  const finalWorkflow = state.finalWorkflow || state.refinedWorkflow || state.workflow || null;
  const endpointContext = getEndpointContext();
  const repairResult = await attemptValidationRepair(state, finalWorkflow, endpointContext);
  const validatedWorkflow = repairResult.workflow;
  const errors = repairResult.errors;
  const preRepairErrors = Array.isArray(repairResult?.preRepairErrors) ? repairResult.preRepairErrors : [];
  const derivedFinalSelection = Array.isArray(state.finalSelection) && state.finalSelection.length > 0
    ? state.finalSelection
    : (validatedWorkflow?.steps || [])
        .map((step) => String(step?.endpointKey || step?.tool || "").trim())
        .filter(Boolean);

  return {
    currentNode: "validate_selection",
    workflow: state.workflow || validatedWorkflow,
    draftWorkflow: state.draftWorkflow || null,
    refinedWorkflow: state.refinedWorkflow || null,
    finalWorkflow: validatedWorkflow,
    validatedWorkflow,
    endpointSelections: state.endpointSelections || [],
    finalSelection: Array.from(new Set(derivedFinalSelection)),
    validation: {
      isValid: errors.length === 0,
      errors,
      preRepairErrors,
      attemptedRepair: Boolean(repairResult?.attemptedRepair),
    },
    validationErrors: errors,
    validationErrorsRaw: preRepairErrors,
  };
}
