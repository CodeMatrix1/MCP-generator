import { getEndpointContext } from "./WorkflowMapEndpointsHelper.js";

function isTemplateValue(value) {
  return typeof value === "string" && value.includes("{{") && value.includes("}}");
}

function validateArgsObject(args, allowedKeys, location, errors) {
  if (!args || typeof args !== "object") return;
  for (const [key, value] of Object.entries(args)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${location} uses unsupported field "${key}"`);
    }
    if (!(typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || Array.isArray(value) || typeof value === "object")) {
      errors.push(`${location}.${key} has unsupported value type`);
    }
  }
}

function collectProvidedFieldNames(step) {
  const provided = new Set(Object.keys(step?.args || {}));
  for (const key of Object.keys(step?.context?.query || {})) {
    provided.add(key);
  }
  for (const key of Object.keys(step?.context?.pathParams || {})) {
    provided.add(key);
  }
  return provided;
}

export function validateExecutableWorkflow(workflow, projectRoot, options = {}) {
  const endpointContext = getEndpointContext(projectRoot);
  const endpointMap = new Map(endpointContext.map((endpoint) => [endpoint.key, endpoint]));
  const allowedTools = new Set(options.allowedTools || []);
  const errors = [];

  if (!workflow?.key) {
    errors.push("Workflow key is missing.");
  }

  for (const step of workflow?.steps || []) {
    const location = `step "${step.key || step.title || "unknown"}"`;
    if (step?.kind === "llm_step") {
      if (!String(step.promptTemplate || "").trim()) {
        errors.push(`${location} is an llm_step but is missing promptTemplate.`);
      }
      continue;
    }

    const tool = String(step?.tool || "").trim();
    if (!tool) {
      errors.push(`${location} is missing tool.`);
      continue;
    }
    if (allowedTools.size > 0 && !allowedTools.has(tool)) {
      errors.push(`${location} uses tool "${tool}" outside the resolved candidate set.`);
      continue;
    }

    const endpoint = endpointMap.get(tool);
    if (!endpoint) {
      errors.push(`${location} references unknown tool "${tool}".`);
      continue;
    }

    const bodyFields = new Set(
      (endpoint.inputs || [])
        .filter((input) => input.in !== "header" && input.in !== "query" && input.in !== "path")
        .map((input) => input.name),
    );
    const queryFields = new Set(
      (endpoint.inputs || [])
        .filter((input) => input.in === "query")
        .map((input) => input.name),
    );
    const pathFields = new Set(
      (endpoint.inputs || [])
        .filter((input) => input.in === "path")
        .map((input) => input.name),
    );
    const allowedArgKeys = new Set([...bodyFields, ...queryFields, ...pathFields]);
    const requiredInputNames = (endpoint.inputs || [])
      .filter((input) => input.required && input.in !== "header")
      .map((input) => String(input.name || "").trim())
      .filter(Boolean);

    if (step.args && Object.keys(step.args).length > 0) {
      validateArgsObject(step.args, allowedArgKeys, `${location}.args`, errors);
    }

    if (step.context?.query && typeof step.context.query === "object") {
      validateArgsObject(step.context.query, queryFields, `${location}.context.query`, errors);
    }

    if (step.context?.pathParams && typeof step.context.pathParams === "object") {
      validateArgsObject(step.context.pathParams, pathFields, `${location}.context.pathParams`, errors);
    }

    for (const [key, value] of Object.entries(step.args || {})) {
      if (typeof value === "string" && !isTemplateValue(value) && value.trim() === "") {
        errors.push(`${location}.args.${key} is empty.`);
      }
    }

    const providedFields = collectProvidedFieldNames(step);
    for (const inputName of requiredInputNames) {
      if (!providedFields.has(inputName)) {
        errors.push(`${location} is missing required input "${inputName}" for tool "${tool}".`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function collectAvailableValueNames(workflow) {
  const inputProps = Object.keys(workflow?.inputSchema?.properties || {});
  const available = new Set(inputProps.map((value) => normalizeName(value)));

  for (const step of workflow?.steps || []) {
    if (step?.outputs && typeof step.outputs === "object" && !Array.isArray(step.outputs)) {
      for (const key of Object.keys(step.outputs)) {
        available.add(normalizeName(key));
      }
    }
  }

  return available;
}

export function canSatisfyInput(inputName, available) {
  const normalized = normalizeName(inputName);
  if (!normalized) return true;
  return available.has(normalized);
}

function getAvailableNamesAtStep(inputSchema = {}, priorSteps = []) {
  const inputProps = Object.keys(inputSchema?.properties || {});
  const available = new Set(inputProps.map((value) => normalizeName(value)));

  for (const step of priorSteps) {
    if (step?.outputs && typeof step.outputs === "object" && !Array.isArray(step.outputs)) {
      for (const key of Object.keys(step.outputs)) {
        available.add(normalizeName(key));
      }
    }
  }

  return available;
}

function canResolveBindingSource(source, workflowInputs, priorSteps) {
  const value = String(source || "").trim();
  if (!value) return false;

  if (value.startsWith("inputs.")) {
    const inputName = value.slice("inputs.".length).trim();
    return Boolean(inputName) && Object.prototype.hasOwnProperty.call(workflowInputs || {}, inputName);
  }

  const stepMatch = value.match(/^steps\.([^.]+)\.result(?:\..+)?$/);
  if (!stepMatch) return false;

  const stepKey = String(stepMatch[1] || "").trim();
  return priorSteps.some((step) => String(step?.key || "").trim() === stepKey);
}

export function validateStepDataFlow(workflow) {
  const errors = [];
  const workflowInputs = workflow?.inputSchema?.properties && typeof workflow.inputSchema.properties === "object"
    ? workflow.inputSchema.properties
    : {};
  const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const priorSteps = steps.slice(0, index);
    const availableNames = getAvailableNamesAtStep(workflow?.inputSchema || {}, priorSteps);
    const requiredInputs = (step?.inputs || [])
      .filter((input) => input?.required && String(input?.in || "").toLowerCase() !== "header");
    const inputBindings = step?.inputBindings && typeof step.inputBindings === "object"
      ? step.inputBindings
      : {};

    for (const input of requiredInputs) {
      const inputName = String(input?.name || "").trim();
      if (!inputName) continue;
      const binding = inputBindings[inputName];
      if (binding) {
        if (!canResolveBindingSource(binding, workflowInputs, priorSteps)) {
          errors.push(`Step ${step.key} binds input "${inputName}" to unresolved source "${binding}".`);
        }
        continue;
      }
      if (!canSatisfyInput(inputName, availableNames)) {
        errors.push(`Step ${step.key} requires input "${inputName}" that cannot be satisfied from workflow inputs or previous step outputs.`);
      }
    }

    const outputs = step?.outputs;
    if (!outputs || typeof outputs !== "object" || Array.isArray(outputs) || Object.keys(outputs).length === 0) {
      errors.push(`Step ${step.key} must declare at least one output.`);
    }
  }

  return errors;
}

export function validateRequiredInputs(step, availableNames) {
  return (step?.inputs || [])
    .filter((input) => input?.required && String(input?.in || "").toLowerCase() !== "header")
    .filter((input) => !canSatisfyInput(input?.name, availableNames))
    .map((input) => `Step ${step.key} requires input "${input.name}" that cannot be satisfied from workflow inputs or previous step outputs.`);
}
