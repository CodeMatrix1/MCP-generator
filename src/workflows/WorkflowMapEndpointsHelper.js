import fs from "node:fs";
import path from "node:path";
import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";

const validateCandidateEndpointSelection = compileSchema({
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          endpointKey: { type: "string" },
          candidateEndpoints: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["key", "candidateEndpoints"],
        additionalProperties: true,
      },
    },
  },
  required: ["steps"],
  additionalProperties: true,
});

function sanitizeCodeBlock(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function buildStepText(step) {
  return `${step?.key || ""} ${step?.description || ""} ${step?.purpose || ""} ${step?.promptTemplate || ""}`.trim();
}

function getEndpointIndex(projectRoot = process.cwd()) {
  const endpointIndexPath = path.join(projectRoot, "data", "endpoint_index.json");
  return JSON.parse(fs.readFileSync(endpointIndexPath, "utf8"));
}

export function getEndpointContext(projectRoot = process.cwd()) {
  const endpointIndex = getEndpointIndex(projectRoot);
  return Object.entries(endpointIndex).map(([key, endpoint]) => ({
    key,
    summary: endpoint?.summary || "",
    produces: Array.isArray(endpoint?.produces) ? endpoint.produces : [],
  }));
}

function buildCandidateEndpointPrompt(workflow, endpointContext, limit) {
  const endpointCatalog = endpointContext.map((endpoint) => ({
    id: endpoint.key,
    summary: endpoint.summary,
    outputs: endpoint.produces,
  }));

  return `Map workflow steps to Rocket.Chat endpoints.

Return JSON only(no extra text)

{
"steps": [
{
"key": "step_key",
"endpointKey": "best.id",
"candidateEndpoints": ["id1", "id2"]
}
]
}

MATCHING
* Use step description + workflow context
* Use endpoint summary and outputs for semantic fit
* Do NOT rely only on token overlap

Rules:

* One entry per step
* endpointKey = best 1 (or "")
* candidateEndpoints = up to ${limit}, best-first
* Use step meaning + endpoint summary (not just tokens)
* Prefer direct, specific matches
* Use only provided endpoints
* If no clear match or non-runtime step → []
* No extra text

Workflow:
${JSON.stringify({
key: workflow?.key,
description: workflow?.description,
steps: workflow?.steps || [],
}, null, 2)}

Endpoints:
${JSON.stringify(endpointCatalog, null, 2)}
`;
}

function mergeResolvedCandidateEndpoints(workflow, parsed, endpointLookup, limit) {
  const stepMap = new Map((parsed?.steps || []).map((step) => [String(step?.key || "").trim(), step]));

  return {
    ...workflow,
    steps: (workflow.steps || []).map((step, index) => {
      const resolvedStep = stepMap.get(String(step?.key || "").trim());
      const endpointKey = String(resolvedStep?.endpointKey || "").trim();
      const candidateEndpoints = Array.isArray(resolvedStep?.candidateEndpoints)
        ? resolvedStep.candidateEndpoints
            .map((key) => endpointLookup.get(String(key || "").trim()))
            .filter(Boolean)
            .slice(0, limit)
        : [];
      const normalizedEndpointKey = endpointKey && endpointLookup.has(endpointKey)
        ? endpointKey
        : String(step?.endpointKey || "").trim();

      return {
        ...step,
        ...(normalizedEndpointKey ? { endpointKey: normalizedEndpointKey } : {}),
        candidateEndpoints: candidateEndpoints.length > 0
          ? candidateEndpoints
          : [],
      };
    }),
  };
}

export async function resolveWorkflowCandidatesWithLlm(workflows, projectRoot, options = {}) {
  const normalizedWorkflows = (workflows || []).map((workflow) => ({
    ...workflow,
    steps: (workflow.steps || []).map((step) => ({ ...step })),
  }));

  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 8);

  const endpointContext = options.endpointCatalog || getEndpointContext(projectRoot);
  
  if (endpointContext.length === 0) {
    return normalizedWorkflows;
  }

  try {
    const endpointLookup = new Map(endpointContext.map((endpoint) => [endpoint.key, endpoint]));

    return await Promise.all(normalizedWorkflows.map(async (workflow, index) => {
      const runtimeSteps = (workflow.steps || []).filter((step) => String(step?.kind || "runtime_tool").trim() === "runtime_tool");
      if (runtimeSteps.length === 0) return workflow;

      const prompt = buildCandidateEndpointPrompt(workflow, endpointContext, limit);
      const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
      if (!raw || !raw.trim()) {
        throw new Error(`[Error] Gemini returned empty output for workflow candidate endpoint mapping (workflow index ${index}).`);
      }
      const parsed = parseGeminiJsonWithSchema(
        sanitizeCodeBlock(raw),
        validateCandidateEndpointSelection,
        "workflow candidate endpoint JSON",
      );

      return mergeResolvedCandidateEndpoints(
        workflow,
        parsed,
        endpointLookup,
        limit,
      );
    }));
  } catch(error) {
    throw new Error("[Error] resolving workflow candidate endpoints with LLM, details: " + error.message);
  }
}

export function collectCandidateEndpointKeys(workflows) {
  const keys = new Set();
  for (const workflow of workflows || []) {
    for (const step of workflow.steps || []) {
      for (const endpoint of step.candidateEndpoints || []) {
        if (endpoint?.key) keys.add(endpoint.key);
      }
    }
  }
  return Array.from(keys);
}

function getWorkflowInputTemplates(workflow) {
  const properties = workflow?.inputSchema?.properties && typeof workflow.inputSchema.properties === "object"
    ? workflow.inputSchema.properties
    : {};

  return new Map(
    Object.keys(properties).map((name) => [name.toLowerCase(), `{{inputs.${name}}}`]),
  );
}

function buildGenericBindings(endpoint, workflowInputTemplates) {
  const args = {};
  const context = {};

  for (const input of endpoint?.inputs || []) {
    if (!input?.required || input.in === "header") continue;
    const name = String(input.name || "").trim();
    const template = workflowInputTemplates.get(name.toLowerCase());
    if (!template) continue;

    if (input.in === "query") {
      context.query = context.query || {};
      context.query[name] = template;
    } else if (input.in === "path") {
      context.pathParams = context.pathParams || {};
      context.pathParams[name] = template;
    } else {
      args[name] = template;
    }
  }

  return { args, context };
}

function buildExecutableStep(step, workflowInputTemplates) {
  const stepKind = String(step?.kind || "runtime_tool").trim();
  if (stepKind !== "runtime_tool") {
    return {
      key: step.key,
      description: step.description,
      kind: "llm_step",
      stepType: stepKind,
      purpose: step.purpose || step.description,
      promptTemplate:
        step.promptTemplate ||
        `Complete this workflow step: ${step.description}`,
      dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.filter(Boolean) : (step.dependsOn ? [step.dependsOn] : []),
      ...(step.condition ? { condition: step.condition } : {}),
      ...(step.iterator ? { iterator: step.iterator } : {}),
    };
  }

  const explicitEndpointKey = String(step?.endpointKey || "").trim();
  const explicitEndpoint = explicitEndpointKey
    ? (Array.isArray(step?.candidateEndpoints)
        ? step.candidateEndpoints.find((candidate) => candidate?.key === explicitEndpointKey) || null
        : null)
    : null;
  const firstCandidate = Array.isArray(step?.candidateEndpoints) ? step.candidateEndpoints[0] || null : null;
  const endpoint = explicitEndpoint || firstCandidate;
  const bindings = buildGenericBindings(endpoint, workflowInputTemplates);

  return {
    key: step.key,
    description: step.description,
    kind: "runtime_tool",
    purpose: step.purpose || step.description,
    ...(explicitEndpointKey ? { endpointKey: explicitEndpointKey } : {}),
    tool: endpoint?.key || "",
    ...(Array.isArray(step.inputs) ? { inputs: step.inputs } : {}),
    ...(step.outputs && typeof step.outputs === "object" && !Array.isArray(step.outputs)
      ? { outputs: step.outputs }
      : {}),
    ...(step.outputVariables && typeof step.outputVariables === "object"
      ? { outputVariables: step.outputVariables }
      : {}),
    ...(Array.isArray(step.dependsOn) ? { dependsOn: step.dependsOn.filter(Boolean) } : {}),
    ...(step.dependsOn && !Array.isArray(step.dependsOn) ? { dependsOn: [step.dependsOn].filter(Boolean) } : {}),
    ...(step.condition ? { condition: step.condition } : {}),
    ...(step.iterator ? { iterator: step.iterator } : {}),
    ...(Object.keys(bindings.args).length > 0 ? { args: bindings.args } : {}),
    ...(Object.keys(bindings.context).length > 0 ? { context: bindings.context } : {}),
  };
}

export function buildExecutableWorkflowFallback(workflow) {
  const workflowInputTemplates = getWorkflowInputTemplates(workflow);
  return {
    ...workflow,
    steps: (workflow.steps || []).map((step) =>
      buildExecutableStep(step, workflowInputTemplates),
    ),
  };
}

export function inferStepKindFromText(step) {
  const stepText = buildStepText(step).toLowerCase();
  if (/\bgenerate\b|\bcompose\b|\bdraft\b|\bwrite\b|\bcraft\b|\bsummarize\b|\bsummary\b|\bllm\b/.test(stepText)) {
    return "llm_step";
  }
  if (/\bcondition\b|\bif\b|\bexists\b|\bmissing\b/.test(stepText)) {
    return "condition_step";
  }
  if (/\btransform\b|\bcompute\b|\bderive\b/.test(stepText)) {
    return "compute_step";
  }
  return "runtime_tool";
}

