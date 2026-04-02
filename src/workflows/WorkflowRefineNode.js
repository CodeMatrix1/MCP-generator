import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import { buildEndpointSelectionMap, mergeStepPatches } from "./WorkflowRefineHelper.js";
import {
  ENDPOINT_INDEX,
  expandDependsOnWithConditions,
  normalizeWorkflow,
  orderStepsByDependencies
} from "./WorkflowNodeHelpers.js";

const validateIoRefinement = compileSchema({
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          promptTemplate: { type: "string" },
          inputs: { type: "array", items: { type: "object", additionalProperties: true } },
          outputs: { type: "object", additionalProperties: { type: "string" } },
          inputBindings: { type: "object", additionalProperties: { type: "string" } },
        },
        required: ["key"],
        additionalProperties: true,
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["steps"],
  additionalProperties: false,
});

const validateConditionRefinement = compileSchema({
  type: "object",
  properties: {
    conditions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          description: { type: "string" },
          dependsOn: { type: "array", items: { type: "string" } },
          promptTemplate: { type: "string" },
        },
        required: ["key", "promptTemplate"],
        additionalProperties: true,
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          dependsOn: { type: "array", items: { type: "string" } },
          condition: { type: "array", items: { type: "string" } },
        },
        required: ["key"],
        additionalProperties: true,
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
});

function buildEndpointCatalog(finalEndpointIds) {
  return (finalEndpointIds || [])
    .map((id) => {
      const endpoint = ENDPOINT_INDEX[id];
      if (!endpoint) return null;
      const inputs = Array.isArray(endpoint?.inputs)
        ? endpoint.inputs.map((input) => ({
            name: input?.name || "",
            in: input?.in || "",
            required: Boolean(input?.required),
          }))
        : [];
      return {
        key: id,
        summary: endpoint?.summary || "",
        inputs,
        produces: Array.isArray(endpoint?.produces) ? endpoint.produces : [],
      };
    })
    .filter(Boolean);
}

function buildWorkflowContext(workflow) {
  return {
    key: workflow?.key,
    label: workflow?.label,
    description: workflow?.description,
    scope: workflow?.scope,
    inputSchema: workflow?.inputSchema,
    conditions: workflow?.conditions || [],
    steps: workflow?.steps || [],
  };
}

function buildIoPrompt(query, workflow, endpointCatalog) {
  return `Refine workflow execution inputs, outputs, and bindings.

Think through data flow, required endpoint inputs, and downstream dependencies, then output only JSON.

Return:
{
"steps": [
{
"key": "step_key",
"promptTemplate": "string",
"inputs": [{ "name": "string", "in": "string", "required": true }],
"outputs": { "alias": "result.path" },
"inputBindings": { "input": "source.path" }
}
],
"notes": []
}

---

Rules:

* Return one entry for EVERY workflow step
* Always include step key
* Treat kind, endpointKey, dependsOn, conditions as fixed

---

runtime_tool:

* Use existing endpointKey
* inputs must be present and must include all required non-header inputs
* outputs must be present and non-empty; outputs = alias → valid endpoint result path
* inputBindings must be present and must bind every required input

llm_step / compute_step:

* Include promptTemplate
* inputs must be present and use "virtual" where appropriate
* outputs must be present and non-empty
* inputBindings must be present and must bind all inputs

---

Data Flow:

* Every required input must resolve from:

  * inputs.<name> OR
  * steps.<step>.result.<path>
* Ensure values needed later (ids, text, etc.) are produced earlier

---

Constraints:

* Do not invent endpoints or conditions
* Do not leave unresolved inputs
* Do not leave any step with empty inputs, empty outputs, or missing bindings for required inputs
* Prefer minimal but complete bindings

---

Workflow:
${JSON.stringify(buildWorkflowContext(workflow), null, 2)}

Query:
${query}

Endpoints:
${JSON.stringify(endpointCatalog, null, 2)}
`;
}

function buildConditionsPrompt(query, workflow) {
  return `Refine workflow conditions and conditional dependencies.

Think through branching logic and execution order, then output only JSON.

Return:
{
"conditions": [
{
"key": "string",
"description": "string",
"dependsOn": ["step_key"],
"promptTemplate": "Return TRUE or FALSE only."
}
],
"steps": [
{
"key": "step_key",
"dependsOn": ["step_key"],
"condition": ["condition_key", "!condition_key"]
}
],
"notes": []
}

---

Rules:

* Return conditions plus one entry for EVERY workflow step
* Always include step key
* Use top-level conditions only
* condition = AND array; use ! for negation

---

Logic:

* Add conditions for:

  * lookup → create flows
  * any conditional execution
* Ensure condition dependsOn includes required lookup step
* Apply condition to correct steps (e.g., create only if missing)

---

Dependencies:

* dependsOn must reflect:

  * data dependencies
  * condition evaluation order
* Do not add unnecessary dependencies

---

Constraints:

* Do not modify endpointKey, inputs, outputs, bindings, or promptTemplate
* Keep logic minimal but correct
* If the workflow includes create-if-missing or create-if-not-exists behavior, emit the required top-level conditions for that branching logic
* Do not leave referenced condition keys undefined in the top-level conditions array

---

Workflow:
${JSON.stringify(buildWorkflowContext(workflow), null, 2)}

Query:
${query}
`;
}

function conditionsInWorkflow(workflow) {
  if (Array.isArray(workflow?.conditions) && workflow.conditions.length > 0) {
    return true;
  }

  return Array.isArray(workflow?.steps) && workflow.steps.some((step) => {
    const dependsOn = Array.isArray(step?.dependsOn) ? step.dependsOn : [];
    const condition = Array.isArray(step?.condition) ? step.condition : [];
    const key = String(step?.key || "").toLowerCase();
    return (
      dependsOn.length > 0
      || condition.length > 0
      || key.includes("if_missing")
      || key.includes("if_not_exists")
    );
  });
}

function assertRefinedWorkflowComplete(workflow) {
  const conditionKeys = new Set(
    (workflow?.conditions || [])
      .map((condition) => String(condition?.key || "").trim())
      .filter(Boolean),
  );

  const errors = [];

  for (const step of workflow?.steps || []) {
    const key = String(step?.key || "").trim() || "unknown_step";
    const kind = String(step?.kind || "runtime_tool").trim() || "runtime_tool";
    const inputs = Array.isArray(step?.inputs) ? step.inputs : [];
    const outputs = step?.outputs && typeof step.outputs === "object" && !Array.isArray(step.outputs)
      ? step.outputs
      : {};
    const bindings = step?.inputBindings && typeof step.inputBindings === "object" && !Array.isArray(step.inputBindings)
      ? step.inputBindings
      : {};
    const conditions = Array.isArray(step?.condition)
      ? step.condition
      : (step?.condition ? [step.condition] : []);

    if (inputs.length === 0) {
      errors.push(`Step ${key} is missing inputs.`);
    }

    if (Object.keys(outputs).length === 0) {
      errors.push(`Step ${key} is missing outputs.`);
    }

    for (const input of inputs) {
      const inputName = String(input?.name || "").trim();
      const required = Boolean(input?.required);
      const inputIn = String(input?.in || "").trim().toLowerCase();
      if (required && inputIn !== "header" && !bindings[inputName]) {
        errors.push(`Step ${key} is missing inputBinding for required input "${inputName}".`);
      }
    }

    if (kind === "runtime_tool" && !String(step?.endpointKey || "").trim()) {
      errors.push(`Step ${key} is missing endpointKey.`);
    }

    if ((kind === "llm_step" || kind === "compute_step") && !String(step?.promptTemplate || "").trim()) {
      errors.push(`Step ${key} is missing promptTemplate.`);
    }

    for (const conditionKey of conditions) {
      const normalized = String(conditionKey || "").trim().replace(/^!/, "");
      if (normalized && !conditionKeys.has(normalized)) {
        errors.push(`Step ${key} references undefined condition "${normalized}".`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
}

async function runIoPass(query, workflow, endpointCatalog) {
  const raw = await runGeminiPrompt(
    buildIoPrompt(query, workflow, endpointCatalog),
    25000,
    2 * 1024 * 1024,
  );
  if (!raw || !raw.trim()) {
    throw new Error("Gemini returned empty output for workflow I/O refinement.");
  }
  return parseGeminiJsonWithSchema(
    raw,
    validateIoRefinement,
    "workflow IO refinement JSON",
  );
}

async function runConditionsPass(query, workflow) {
  if (!conditionsInWorkflow(workflow)) {
    return { conditions: workflow?.conditions || [], steps: [] };
  }

  const raw = await runGeminiPrompt(
    buildConditionsPrompt(query, workflow),
    25000,
    2 * 1024 * 1024,
  );
  if (!raw || !raw.trim()) {
    throw new Error("Gemini returned empty output for workflow condition refinement.");
  }
  return parseGeminiJsonWithSchema(
    raw,
    validateConditionRefinement,
    "workflow condition refinement JSON",
  );
}

/**
 * Refines a mapped workflow into an execution-ready workflow using focused LLM passes.
 *
 * This node assumes step structure and endpoint choice are already present from
 * earlier stages. It runs an I/O refinement pass to fill prompt templates,
 * inputs, outputs, and input bindings, then optionally runs a conditions pass
 * to refine top-level conditions and condition-driven dependencies.
 *
 * The resulting workflow is dependency-ordered, normalized for downstream
 * execution, and returned together with endpoint selections and refinement
 * metadata. If refinement fails, the node falls back to the current workflow
 * shape instead of inventing local repairs.
 */
export async function refineWorkflow(state) {
  const baseWorkflow = state.workflow || normalizeWorkflow(null, state.query);
  const finalEndpointIds = Array.isArray(state.finalSelection) && state.finalSelection.length > 0
    ? state.finalSelection
    : state.candidateEndpoints || [];
  const endpointCatalog = buildEndpointCatalog(finalEndpointIds);

  try {
    let refinedWorkflow = baseWorkflow;

    const ioResult = await runIoPass(state.query, refinedWorkflow, endpointCatalog);
    refinedWorkflow = mergeStepPatches(
      refinedWorkflow,
      ioResult?.steps || [],
      ["promptTemplate", "inputs", "outputs", "inputBindings"],
    );

    const conditionsResult = await runConditionsPass(state.query, refinedWorkflow);
    refinedWorkflow = {
      ...refinedWorkflow,
      ...(Array.isArray(conditionsResult?.conditions)
        ? { conditions: conditionsResult.conditions }
        : {}),
    };
    refinedWorkflow = mergeStepPatches(
      refinedWorkflow,
      conditionsResult?.steps || [],
      ["dependsOn", "condition"],
    );
    assertRefinedWorkflowComplete(refinedWorkflow);

    const orderedWorkflow = {
      ...refinedWorkflow,
      steps: orderStepsByDependencies(
        expandDependsOnWithConditions(
          refinedWorkflow.steps || [],
          refinedWorkflow.conditions || [],
        ),
      ),
    };
    orderedWorkflow.steps = (orderedWorkflow.steps || []).map((step) => ({
      ...step,
      inputs: Array.isArray(step.inputs) ? step.inputs : [],
      outputs: step.outputs && typeof step.outputs === "object" && !Array.isArray(step.outputs) ? step.outputs : {},
      inputBindings: step.inputBindings && typeof step.inputBindings === "object"
        ? step.inputBindings
        : {},
    }));

    const endpointSelections = (orderedWorkflow.steps || []).map((step) => ({
      key: step.key,
      kind: step.kind || "runtime_tool",
      endpointKey: String(step?.endpointKey || "").trim(),
      candidateEndpoints: Array.isArray(step?.candidateEndpoints) ? step.candidateEndpoints : [],
    }));
    const endpointSelectionMap = buildEndpointSelectionMap(orderedWorkflow.steps || []);
    const refinedWorkflowWithoutEndpoints = {
      ...orderedWorkflow,
      steps: (orderedWorkflow.steps || []).map(({ endpointKey, candidateEndpoints, ...rest }) => {
        if (rest?.kind !== "runtime_tool") {
          return rest;
        }
        const resolvedEndpointKey = endpointSelectionMap.get(rest.key)?.endpointKey || String(endpointKey || "").trim();
        return {
          ...rest,
          ...(resolvedEndpointKey ? { endpointKey: resolvedEndpointKey } : {}),
          inputs: Array.isArray(rest.inputs) ? rest.inputs : [],
          outputs: rest.outputs && typeof rest.outputs === "object" && !Array.isArray(rest.outputs) ? rest.outputs : {},
          inputBindings: rest.inputBindings && typeof rest.inputBindings === "object" ? rest.inputBindings : {},
        };
      }),
    };

    return {
      currentNode: "refine_workflow",
      refinedWorkflow: refinedWorkflowWithoutEndpoints,
      finalWorkflow: refinedWorkflowWithoutEndpoints,
      workflow: refinedWorkflowWithoutEndpoints,
      endpointSelections,
      refinement: {
        strategy: "llm",
        notes: [
          ...(Array.isArray(ioResult?.notes) ? ioResult.notes : []),
          ...(Array.isArray(conditionsResult?.notes) ? conditionsResult.notes : []),
        ],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown refine workflow error.");
    throw new Error(`Workflow refinement failed: ${message}`);
  }
}
