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
          candidateOperationIds: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["key", "candidateOperationIds"],
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

function normalizeTokens(input) {
  return String(input || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => {
      if (token.endsWith("ies") && token.length > 4) {
        return token.slice(0, -3) + "y";
      }
      if (token.endsWith("es") && token.length > 4) {
        return token.slice(0, -2);
      }
      if (token.endsWith("s") && token.length > 3) {
        return token.slice(0, -1);
      }
      return token;
    });
}

function buildTokenSet(...parts) {
  return new Set(parts.flatMap((part) => normalizeTokens(part)));
}

function hasAnyToken(tokenSet, candidates) {
  return candidates.some((candidate) => tokenSet.has(candidate));
}

function scoreEntityAlignment(stepTokens, endpointTokens) {
  let score = 0;

  const talksAboutUser = hasAnyToken(stepTokens, ["user", "username", "member"]);
  const talksAboutChannel = hasAnyToken(stepTokens, ["channel", "room"]);
  const talksAboutMessage = hasAnyToken(stepTokens, ["message", "welcome", "chat"]);
  const talksAboutSend = hasAnyToken(stepTokens, ["send", "sending", "message"]);
  const talksAboutCreate = hasAnyToken(stepTokens, ["create", "ensure", "exist", "presence"]);
  const talksAboutAdd = hasAnyToken(stepTokens, ["add", "invite", "join", "membership"]);

  if (talksAboutUser) {
    if (hasAnyToken(endpointTokens, ["user", "users"])) score += 12;
    if (hasAnyToken(endpointTokens, ["channel", "channels", "chat", "message", "file", "files"])) score -= 6;
  }

  if (talksAboutChannel) {
    if (hasAnyToken(endpointTokens, ["channel", "channels", "room", "rooms"])) score += 12;
    if (hasAnyToken(endpointTokens, ["user", "users"])) score -= 5;
  }

  if (talksAboutMessage) {
    if (hasAnyToken(endpointTokens, ["chat", "message", "messages", "send", "post"])) score += 14;
    if (hasAnyToken(endpointTokens, ["file", "files"])) score -= 8;
  }

  if (talksAboutSend) {
    if (hasAnyToken(endpointTokens, ["send", "message", "post"])) score += 16;
    if (hasAnyToken(endpointTokens, ["create", "register", "file", "files", "invite", "join", "add"])) score -= 10;
  }

  if (talksAboutCreate) {
    if (hasAnyToken(endpointTokens, ["create", "register"])) score += 10;
    if (hasAnyToken(endpointTokens, ["info", "list"])) score += 2;
    if (hasAnyToken(endpointTokens, ["file", "files"])) score -= 8;
  }

  if (talksAboutAdd) {
    if (hasAnyToken(endpointTokens, ["add", "invite", "join"])) score += 12;
    if (hasAnyToken(endpointTokens, ["file", "files"])) score -= 8;
  }

  return score;
}

function getEndpointIndex(projectRoot) {
  const endpointIndexPath = path.join(projectRoot, "data", "endpoint_index.json");
  return JSON.parse(fs.readFileSync(endpointIndexPath, "utf8"));
}

export function getEndpointContext(projectRoot) {
  const endpointIndex = getEndpointIndex(projectRoot);
  return Object.entries(endpointIndex).map(([key, endpoint]) => ({
    key,
    method: endpoint?.method || "",
    path: endpoint?.path || "",
    summary: endpoint?.summary || "",
    description: endpoint?.description || "",
    purpose: endpoint?.purpose || endpoint?.summary || endpoint?.description || "",
    tags: Array.isArray(endpoint?.tags) ? endpoint.tags : [],
    inputs: Array.isArray(endpoint?.inputs) ? endpoint.inputs : [],
    produces: Array.isArray(endpoint?.produces) ? endpoint.produces : [],
  }));
}

function getStepKind(step) {
  const explicitKind = String(step?.kind || "").trim();
  if (["runtime_tool", "llm_step", "compute_step", "condition_step", "loop_step"].includes(explicitKind)) {
    return explicitKind;
  }
  const action = String(step?.action || "").trim().toLowerCase();
  if (action.startsWith("summarization.") || action.startsWith("llm.")) {
    return "llm_step";
  }
  return "runtime_tool";
}

function scoreEndpointForStep(step, endpoint) {
  const stepTokens = buildTokenSet(`${step?.key || ""} ${step?.action || ""} ${step?.description || ""}`);
  const endpointTokenList = normalizeTokens(
    `${endpoint.key} ${endpoint.method} ${endpoint.path} ${endpoint.summary} ${endpoint.purpose || ""} ${(endpoint.tags || []).join(" ")} ${(endpoint.inputs || []).map((input) => input.name).join(" ")} ${(endpoint.produces || []).join(" ")}`,
  );
  const endpointTokens = new Set(endpointTokenList);

  let score = 0;
  for (const token of stepTokens) {
    if (endpointTokens.has(token)) score += 4;
    if (endpointTokenList.some((candidate) => candidate.includes(token) || token.includes(candidate))) {
      score += 1;
    }
  }

  if ([...stepTokens].some((token) => endpoint.key.toLowerCase().includes(token))) score += 6;
  if ((endpoint.method || "").toUpperCase() !== "GET") score += 1;
  score += scoreEntityAlignment(stepTokens, endpointTokens);

  return score;
}

function pickCandidateEndpoints(step, endpointContext, limit) {
  return endpointContext
    .map((endpoint) => ({
      ...endpoint,
      score: scoreEndpointForStep(step, endpoint),
    }))
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
    .slice(0, limit)
    .map(({ score, ...endpoint }) => endpoint);
}

function buildCandidateEndpointPrompt(workflow, endpointContext, limit) {
  const endpointCatalog = endpointContext.map((endpoint) => ({
    key: endpoint.key,
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary,
    purpose: endpoint.purpose,
    tags: endpoint.tags,
    inputs: (endpoint.inputs || []).map((input) => ({
      name: input.name,
      in: input.in,
      required: Boolean(input.required),
    })),
    produces: endpoint.produces,
  }));

  return `Choose the best Rocket.Chat endpoints for each workflow step.
Return strict JSON only:
{
  "steps": [
    {
      "key": "step_key",
      "candidateOperationIds": ["operation.id.one", "operation.id.two"]
    }
  ]
}

Rules:
- Choose only from the provided endpoint catalog.
- Return up to ${limit} operationIds per step, ordered best-first.
- Prefer direct management/action endpoints over unrelated read-only endpoints.
- Use the step description and action, not just surface token overlap.
- Do not invent operationIds.
- Do not include markdown or explanations.

Workflow:
${JSON.stringify({
  key: workflow?.key,
  label: workflow?.label,
  description: workflow?.description,
  steps: workflow?.steps || [],
}, null, 2)}

Endpoint catalog:
${JSON.stringify(endpointCatalog, null, 2)}
`;
}

function mergeResolvedCandidateEndpoints(workflow, parsed, endpointLookup, limit, fallbackWorkflow) {
  const stepMap = new Map((parsed?.steps || []).map((step) => [String(step?.key || "").trim(), step]));

  return {
    ...workflow,
    steps: (workflow.steps || []).map((step, index) => {
      const resolvedStep = stepMap.get(String(step?.key || "").trim());
      const candidateEndpoints = Array.isArray(resolvedStep?.candidateOperationIds)
        ? resolvedStep.candidateOperationIds
            .map((key) => endpointLookup.get(String(key || "").trim()))
            .filter(Boolean)
            .slice(0, limit)
        : [];

      return {
        ...step,
        kind: getStepKind(step),
        candidateEndpoints: candidateEndpoints.length > 0
          ? candidateEndpoints
          : fallbackWorkflow?.steps?.[index]?.candidateEndpoints || [],
      };
    }),
  };
}

export function resolveWorkflowCandidates(workflows, projectRoot, options = {}) {
  const allowedEndpointKeys = Array.isArray(options.allowedEndpointKeys)
    ? new Set(options.allowedEndpointKeys.filter(Boolean))
    : null;
  const endpointContext = getEndpointContext(projectRoot).filter((endpoint) =>
    allowedEndpointKeys ? allowedEndpointKeys.has(endpoint.key) : true,
  );
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 8);

  return (workflows || []).map((workflow) => ({
    ...workflow,
    steps: (workflow.steps || []).map((step) => {
      const kind = getStepKind(step);
      return {
        ...step,
        kind,
        candidateEndpoints:
          kind !== "runtime_tool"
            ? []
            : pickCandidateEndpoints(step, endpointContext, limit),
      };
    }),
  }));
}

export async function resolveWorkflowCandidatesWithLlm(workflows, projectRoot, options = {}) {
  const fallbackWorkflows = resolveWorkflowCandidates(workflows, projectRoot, options);
  const allowedEndpointKeys = Array.isArray(options.allowedEndpointKeys)
    ? new Set(options.allowedEndpointKeys.filter(Boolean))
    : null;
  const endpointContext = getEndpointContext(projectRoot).filter((endpoint) =>
    allowedEndpointKeys ? allowedEndpointKeys.has(endpoint.key) : true,
  );
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 8);

  if (endpointContext.length === 0) {
    return fallbackWorkflows;
  }

  try {
    const endpointLookup = new Map(endpointContext.map((endpoint) => [endpoint.key, endpoint]));

    return await Promise.all(fallbackWorkflows.map(async (workflow) => {
      const runtimeSteps = (workflow.steps || []).filter((step) => getStepKind(step) === "runtime_tool");
      if (runtimeSteps.length === 0) return workflow;

      const prompt = buildCandidateEndpointPrompt(workflow, endpointContext, limit);
      const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
      const parsed = parseGeminiJsonWithSchema(
        sanitizeCodeBlock(raw),
        validateCandidateEndpointSelection,
        "workflow candidate endpoint JSON",
      );

      return mergeResolvedCandidateEndpoints(workflow, parsed, endpointLookup, limit, workflow);
    }));
  } catch {
    return fallbackWorkflows;
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

function pickPreferredCandidate(step) {
  const candidates = Array.isArray(step?.candidateEndpoints) ? step.candidateEndpoints : [];
  if (candidates.length === 0) return null;

  return [...candidates].sort((left, right) => {
    const leftIsReadOnly = String(left?.method || "").toUpperCase() === "GET";
    const rightIsReadOnly = String(right?.method || "").toUpperCase() === "GET";

    if (leftIsReadOnly !== rightIsReadOnly) {
      return leftIsReadOnly ? 1 : -1;
    }

    return String(left?.key || "").localeCompare(String(right?.key || ""));
  })[0];
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
  if (getStepKind(step) !== "runtime_tool") {
    return {
      key: step.key,
      description: step.description,
      action: step.action,
      kind: "llm_step",
      stepType: getStepKind(step),
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
  const endpoint = explicitEndpoint || pickPreferredCandidate(step);
  const bindings = buildGenericBindings(endpoint, workflowInputTemplates);

  return {
    key: step.key,
    description: step.description,
    action: step.action,
    kind: "runtime_tool",
    purpose: step.description,
    ...(explicitEndpointKey ? { endpointKey: explicitEndpointKey } : {}),
    tool: endpoint?.key || "",
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

