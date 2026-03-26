import { getEndpointContext } from "./WorkflowResolve.js";

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
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
