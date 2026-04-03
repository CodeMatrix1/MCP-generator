import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import numTokensFromString from "../selection/lib/tiktoken-script.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import { tokenize } from "../core/query/textMatching.js";
import { createWorkflowFromEndpoints } from "./WorkflowDraftHelper.js";
import { logger } from "../config/loggerConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
export const ENDPOINT_INDEX = JSON.parse(
  fs.readFileSync(
    path.join(PROJECT_ROOT, "data", "endpoint_index.json"),
    "utf8",
  ),
);

const validateWorkflowRefinement = compileSchema({
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
              description: { type: "string" },
              kind: { type: "string" },
              purpose: { type: "string" },
              promptTemplate: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } },
              condition: { type: "string" },
              iterator: { type: "string" },
              inputBindings: { type: "object" },
            },
            required: ["key", "description"],
            additionalProperties: true,
          },
        },
      },
      required: ["steps"],
      additionalProperties: true,
    },
    Refined_Workflow: {
      type: "object",
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        description: { type: "string" },
        scope: { type: "string" },
        inputSchema: { type: "object" },
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
              description: { type: "string" },
              kind: { type: "string" },
              purpose: { type: "string" },
              promptTemplate: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } },
              condition: { type: "string" },
              iterator: { type: "string" },
              endpointKey: { type: "string" },
              inputBindings: { type: "object" },
            },
            required: ["key", "description"],
            additionalProperties: true,
          },
        },
      },
      required: ["steps"],
      additionalProperties: true,
    },
    notes: { type: "array", items: { type: "string" } },
  },
  anyOf: [
    { required: ["workflow"] },
    { required: ["Refined_Workflow"] },
  ],
  additionalProperties: true,
});

function normalizeDependsOn(dependsOn) {
  return Array.isArray(dependsOn)
    ? dependsOn.filter(Boolean)
    : (dependsOn ? [dependsOn].filter(Boolean) : []);
}

export function normalizeOutputs(outputs) {
  if (outputs && typeof outputs === "object" && !Array.isArray(outputs)) {
    const normalized = Object.fromEntries(
      Object.entries(outputs)
        .map(([key, value]) => [String(key || "").trim(), String(value || "").trim()])
        .filter(([key, value]) => key && value),
    );
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  return Array.isArray(outputs)
    ? outputs.map((value) => String(value || "").trim()).filter(Boolean)
    : undefined;
}

export function normalizeInputBindings(inputBindings) {
  if (!inputBindings || typeof inputBindings !== "object" || Array.isArray(inputBindings)) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(inputBindings)
      .map(([key, value]) => [String(key || "").trim(), String(value || "").trim()])
      .filter(([key, value]) => key && value),
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeConditions(conditions) {
  return Array.isArray(conditions)
    ? conditions
        .map((condition) => ({
          key: String(condition?.key || "").trim(),
          description: String(condition?.description || "").trim(),
          promptTemplate: String(condition?.promptTemplate || "").trim(),
          ...(normalizeDependsOn(condition?.dependsOn).length > 0
            ? { dependsOn: normalizeDependsOn(condition?.dependsOn) }
            : {}),
        }))
        .filter((condition) => condition.key && condition.promptTemplate)
    : [];
}

export function normalizeWorkflow(workflow, query) {
  if (!workflow) {
    return createWorkflowFromEndpoints([], query)[0] || undefined;
  }

  return {
    key: workflow.key,
    description: workflow.description,
    scope: workflow.scope || "serve-only",
    inputSchema: workflow.inputSchema || { type: "object", properties: {} },
    ...(Array.isArray(workflow.conditions)
      ? { conditions: normalizeConditions(workflow.conditions) }
      : {}),
    steps: (workflow.steps || []).map((step, index) => ({
      id: index + 1,
      key: step.key,
      description: step.description,
      ...(step.kind ? { kind: step.kind } : {}),
      ...(step.purpose ? { purpose: step.purpose } : {}),
      ...(step.promptTemplate ? { promptTemplate: step.promptTemplate } : {}),
      ...(normalizeDependsOn(step.dependsOn).length > 0 ? { dependsOn: normalizeDependsOn(step.dependsOn) } : {}),
      ...(step.condition ? { condition: step.condition } : {}),
      ...(step.iterator ? { iterator: step.iterator } : {}),
      ...(step.endpointKey ? { endpointKey: step.endpointKey } : {}),
      // omit candidateEndpoints from selection outputs
      ...(Array.isArray(step.inputs) ? { inputs: step.inputs } : {}),
      ...(normalizeOutputs(step.outputs) ? { outputs: normalizeOutputs(step.outputs) } : {}),
      ...(normalizeInputBindings(step.inputBindings) ? { inputBindings: normalizeInputBindings(step.inputBindings) } : {}),
      ...(step.outputVariables && typeof step.outputVariables === "object" ? { outputVariables: step.outputVariables } : {}),
    })),
  };
}


export function normalizeWorkflowForSelection(workflow) {
  if (!workflow) return null;

  return {
    key: workflow.key,
    label: workflow.label,
    description: workflow.description,
    scope: workflow.scope || "serve-only",
    inputSchema: workflow.inputSchema || { type: "object", properties: {} },
    ...(Array.isArray(workflow.conditions)
      ? { conditions: normalizeConditions(workflow.conditions) }
      : {}),
    steps: (workflow.steps || []).map((step) => ({
      key: step.key,
      description: step.description,
      ...(step.kind ? { kind: step.kind } : {}),
      ...(step.purpose ? { purpose: step.purpose } : {}),
      ...(step.promptTemplate ? { promptTemplate: step.promptTemplate } : {}),
      ...(normalizeDependsOn(step.dependsOn).length > 0 ? { dependsOn: normalizeDependsOn(step.dependsOn) } : {}),
      ...(step.condition ? { condition: step.condition } : {}),
      ...(step.iterator ? { iterator: step.iterator } : {}),
      ...(step.endpointKey ? { endpointKey: step.endpointKey } : {}),
      // omit candidateEndpoints from selection outputs
      ...(Array.isArray(step.inputs) ? { inputs: step.inputs } : {}),
      ...(normalizeOutputs(step.outputs) ? { outputs: normalizeOutputs(step.outputs) } : {}),
      ...(normalizeInputBindings(step.inputBindings) ? { inputBindings: normalizeInputBindings(step.inputBindings) } : {}),
      ...(step.outputVariables && typeof step.outputVariables === "object" ? { outputVariables: step.outputVariables } : {}),
    })),
  };
}

export function isDegenerateWorkflow(workflow, query) {
  const steps = workflow?.steps || [];
  if (steps.length === 0) return true;
  if (steps.length > 1) return false;

  const step = steps[0] || {};
  const normalizedQuery = compactText(query);
  return (
    compactText(step.description) === normalizedQuery ||
    compactText(workflow.description) === normalizedQuery
  );
}


function compactText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreEndpoint(operationId, queryTokens) {
  const endpoint = ENDPOINT_INDEX[operationId];
  if (!endpoint) return -1;

  const searchable =
    `${endpoint.summary || ""} ${endpoint.path || ""} ${(endpoint.tags || []).join(" ")} ${operationId} ${(endpoint.inputs || []).map((input) => input.name).join(" ")} ${(endpoint.produces || []).join(" ")}`.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (searchable.includes(token)) score += 2;
  }

  if ((endpoint.method || "").toUpperCase() !== "GET") score += 1;
  return score;
}

function buildTokenSet(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function hasToken(tokenSet, values) {
  return values.some((value) => tokenSet.has(value));
}

function buildStepText(step) {
  return `${step?.key || ""} ${step?.description || ""} ${step?.purpose || ""} ${step?.promptTemplate || ""}`.trim();
}

function scoreEndpointForWorkflowStep(step, endpoint) {
  const stepTokens = buildTokenSet(buildStepText(step));
  const endpointText = `${endpoint?.key || ""} ${endpoint?.method || ""} ${endpoint?.path || ""} ${endpoint?.summary || ""} ${endpoint?.description || ""} ${(endpoint?.tags || []).join(" ")} ${(endpoint?.produces || []).join(" ")}`;
  const endpointTokens = buildTokenSet(endpointText);
  let score = 0;

  for (const token of stepTokens) {
    if (endpointTokens.has(token)) score += 4;
  }

  const isUserStep = hasToken(stepTokens, ["user", "username", "member"]);
  const isLookupStep = hasToken(stepTokens, ["lookup", "find", "identify", "list", "search"]);
  const isChannelStep = hasToken(stepTokens, ["channel", "room"]);
  const isEnsureStep = hasToken(stepTokens, ["ensure", "create", "open"]);
  const isInviteStep = hasToken(stepTokens, ["invite", "add", "join", "membership"]);
  const isMessageStep = hasToken(stepTokens, ["message", "messages", "welcome", "send", "post"]);
  const isReadLikeStep = hasToken(stepTokens, ["collect", "fetch", "get", "history", "list", "read", "scan", "search"]);
  const endpointMethod = String(endpoint?.method || "").toUpperCase();
  const isEndpointReadLike = hasToken(endpointTokens, ["history", "list", "message", "messages", "search", "get", "sync"]);
  const isEndpointMutation = hasToken(endpointTokens, [
    "delete",
    "post",
    "send",
    "create",
    "update",
    "remove",
    "invite",
    "pin",
    "star",
  ]);

  if (isUserStep) {
    if (hasToken(endpointTokens, ["user", "users"])) score += 25;
    if (isLookupStep && hasToken(endpointTokens, ["list", "info", "search"])) score += 18;
    if (hasToken(endpointTokens, ["channel", "channels", "livechat"])) score -= 14;
  }

  if (isChannelStep) {
    if (hasToken(endpointTokens, ["channel", "channels", "room", "rooms"])) score += 25;
    if (isEnsureStep && hasToken(endpointTokens, ["create", "info", "list"])) score += 18;
    if (hasToken(endpointTokens, ["dashboard", "popular"])) score -= 18;
    if (hasToken(endpointTokens, ["user", "users"]) && !hasToken(endpointTokens, ["channel", "channels"])) score -= 8;
  }

  if (isInviteStep) {
    if (hasToken(endpointTokens, ["invite", "join", "add"])) score += 32;
    if (hasToken(endpointTokens, ["message", "send", "post"])) score -= 16;
  }

  if (isMessageStep) {
    if (hasToken(endpointTokens, ["chat", "message", "messages", "post", "send"])) score += 28;
    if (hasToken(endpointTokens, ["livechat"])) score -= 12;
    if (hasToken(endpointTokens, ["invite", "join", "create"]) && !hasToken(endpointTokens, ["message", "send", "post"])) score -= 14;
  }

  if (isMessageStep && isReadLikeStep) {
    if (endpointMethod === "GET") score += 40;
    if (isEndpointReadLike) score += 28;
    if (hasToken(endpointTokens, ["history", "list", "search", "sync"])) score += 16;
    if (isEndpointMutation) score -= 42;
    if (hasToken(endpointTokens, ["delete"])) score -= 64;
  }

  if (endpointMethod !== "GET") score += 2;

  return score;
}

function preferredEndpointKeysForStep(step) {
  const stepTokens = buildTokenSet(buildStepText(step));
  const isUserStep = hasToken(stepTokens, ["user", "username", "member"]);
  const isLookupStep = hasToken(stepTokens, ["lookup", "find", "identify", "list", "search"]);
  const isChannelStep = hasToken(stepTokens, ["channel", "room"]);
  const isEnsureStep = hasToken(stepTokens, ["ensure", "create", "open"]);
  const isInviteStep = hasToken(stepTokens, ["invite", "add", "join", "membership"]);
  const isMessageStep = hasToken(stepTokens, ["message", "messages", "welcome", "send", "post"]);
  const isCreateUserStep = isUserStep && hasToken(stepTokens, ["create", "register", "missing"]);
  const isLookupChannelStep = isChannelStep && hasToken(stepTokens, ["lookup", "find", "identify", "list", "search", "exists", "info"]);

  if (isInviteStep && isChannelStep) {
    return ["post-api-v1-channels.invite"];
  }

  if (isCreateUserStep) {
    return [
      "post-api-v1-users.create",
      "post-api-v1-users.register",
    ];
  }

  if (isLookupChannelStep) {
    return [
      "get-api-v1-channels.info",
      "get-api-v1-channels.list",
      "get-api-v1-rooms.nameExists",
    ];
  }

  if (isChannelStep && isEnsureStep) {
    return [
      "post-api-v1-channels.create",
      "get-api-v1-channels.info",
      "get-api-v1-channels.list",
    ];
  }

  if (isMessageStep) {
    if (isLookupStep) {
      return [
        "get-api-v1-channels.messages",
        "get-api-v1-groups.messages",
        "get-api-v1-im.messages",
        "get-api-v1-channels.history",
        "get-api-v1-groups.history",
        "get-api-v1-im.history",
        "get-api-v1-chat.search",
      ];
    }

    return [
      "post-api-v1-chat.postMessage",
      "post-api-v1-chat.sendMessage",
    ];
  }

  if (isUserStep && isLookupStep) {
    return [
      "get-api-v1-users.list",
      "get-api-v1-users.info",
      "post-api-v1-users.create",
    ];
  }

  if (isChannelStep) {
    return ["get-api-v1-channels.list", "get-api-v1-channels.info"];
  }

  return [];
}

export function chooseEndpointsFallback(candidateIds, userQuery, minKeep = 6, maxKeep = 20) {
  const queryTokens = tokenize(userQuery);
  const scored = (candidateIds || [])
    .map((id) => ({ id, score: scoreEndpoint(id, queryTokens) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const positive = scored.filter((entry) => entry.score > 0);
  if (positive.length > 0) {
    const keepCount = Math.max(minKeep, Math.min(maxKeep, positive.length));
    return positive.slice(0, keepCount).map((entry) => entry.id);
  }

  return scored
    .slice(0, Math.min(minKeep, scored.length))
    .map((entry) => entry.id);
}

export function isRuntimeWorkflowStep(step) {
  return String(step?.kind || "runtime_tool").trim() === "runtime_tool";
}

export function parseRefinedWorkflow(raw, query) {
  const parsed = parseGeminiJsonWithSchema(raw, validateWorkflowRefinement, "workflow refinement JSON");
  const rawRefinedWorkflow = parsed?.Refined_Workflow || parsed?.workflow;
  return {
    parsed,
    workflow: rawRefinedWorkflow ? normalizeWorkflow(rawRefinedWorkflow, query) : null,
  };
}

export function expandCandidateEndpointsFromWorkflow(workflow, candidateIds, query) {
  const expanded = new Set(Array.isArray(candidateIds) ? candidateIds.filter(Boolean) : []);
  const allEndpointIds = Object.keys(ENDPOINT_INDEX);
  const runtimeSteps = (workflow?.steps || []).filter((step) => isRuntimeWorkflowStep(step));

  for (const step of runtimeSteps) {
    for (const preferredKey of preferredEndpointKeysForStep(step)) {
      if (ENDPOINT_INDEX[preferredKey]) {
        expanded.add(preferredKey);
      }
    }

    const hintQuery = `${query || ""} ${buildStepText(step)}`.trim();
    const scored = allEndpointIds
      .map((id) => ({
        id,
        score: scoreEndpoint(id, tokenize(hintQuery)),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, 5);

    for (const entry of scored) {
      expanded.add(entry.id);
    }
  }

  return Array.from(expanded);
}

export function rankCandidateEndpointsForStep(step, candidateIds) {
  const preferredKeys = preferredEndpointKeysForStep(step);
  return (candidateIds || [])
    .map((id) => {
      const endpoint = ENDPOINT_INDEX[id];
      return endpoint
        ? {
            key: id,
            ...endpoint,
            score: scoreEndpointForWorkflowStep(step, { key: id, ...endpoint })
              + (preferredKeys.includes(id) ? 1000 - (preferredKeys.indexOf(id) * 50) : 0),
          }
        : null;
    })
    .filter((entry) => entry && entry.score > 0)
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
    .slice(0, 5)
    .map(({ score, ...endpoint }) => endpoint);
}

export function buildDraftCapabilityContext(query, candidateIds) {
  return chooseEndpointsFallback(candidateIds || [], query, 8, 12)
    .map((id) => {
      const endpoint = ENDPOINT_INDEX[id] || {};
      const inputs = (endpoint.inputs || [])
        .slice(0, 6)
        .map((input) => `${input.name}${input.required ? "*" : ""}`)
        .join(", ");
      const outputs = (endpoint.produces || []).slice(0, 6).join(", ");
      return `- ${id}: ${endpoint.summary || endpoint.purpose || "No summary"} | inputs: ${inputs || "none"} | produces: ${outputs || "none"}`;
    })
    .join("\n");
}


export function buildTokenUsage(query, payload) {
  return {
    input: numTokensFromString(query),
    output: numTokensFromString(JSON.stringify(payload)),
  };
}

// Fallback helpers (explicit section)
function buildFallbackStepHints(query) {
  const normalized = compactText(query);
  const hints = [];

  if (/(create|register|add).*(user|member)|(user|member).*(create|register|add)/.test(normalized)) {
    hints.push({
      key: "prepare_user",
      description: "Create or find the target user.",
      query: "create or find user member account",
    });
  }

  if (/(create|open|find).*(channel|room|group|team)|(channel|room|group|team).*(create|open|find)/.test(normalized)) {
    hints.push({
      key: "prepare_room",
      description: "Create or find the target channel or room.",
      query: "create or find channel room team",
    });
  }

  if (/(invite|add|join|onboard).*(channel|room|group|team)|to a channel|to the channel|to channel/.test(normalized)) {
    hints.push({
      key: "add_member_to_room",
      description: "Add the target user to the target channel or room.",
      query: "invite add user member to channel room",
    });
  }

  if (/(message|welcome|notify|announcement|announce)/.test(normalized)) {
    hints.push({
      key: "send_message",
      description: "Send the requested message in the target room.",
      query: "send welcome message post chat",
    });
  }

  if (hints.length === 0) {
    hints.push({
      key: "fulfill_request",
      description: query,
      query,
    });
  }

  return hints;
}

function pickBestEndpointForHint(hint, candidateIds) {
  const scored = (candidateIds || [])
    .map((id) => ({
      id,
      score: scoreEndpoint(id, tokenize(hint.query || hint.description || "")),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return scored[0]?.id || "";
}

export function buildWorkflowFallbackFromCandidates(query, candidateIds) {
  logger.debug("[Fallback] building workflow from candidate endpoints");
  const workflow = normalizeWorkflow(
    createWorkflowFromEndpoints([], query)[0],
    query,
  );
  const usedEndpoints = new Set();
  const steps = buildFallbackStepHints(query)
    .map((hint, index) => {
      const endpointId = pickBestEndpointForHint(
        hint,
        candidateIds.filter((id) => !usedEndpoints.has(id)),
      );
      if (endpointId) usedEndpoints.add(endpointId);
      return {
        id: index + 1,
        key: hint.key,
        description: hint.description,
      };
    })
    .filter(Boolean);

  return {
    ...workflow,
    steps: steps.length > 0 ? steps : workflow.steps,
  };
}
// End fallback helpers

export function expandDependsOnWithConditions(steps = [], conditions = []) {
  const conditionMap = new Map(
    (conditions || []).map((condition) => [condition.key, condition]),
  );
  return (steps || []).map((step) => {
    const stepDependsOn = Array.isArray(step?.dependsOn) ? step.dependsOn : [];
    const stepConditions = Array.isArray(step?.condition) ? step.condition : [];
    const conditionDependsOn = stepConditions.flatMap((conditionKey) => {
      const normalized = String(conditionKey || "").trim().replace(/^!/, "");
      const condition = conditionMap.get(normalized);
      return Array.isArray(condition?.dependsOn) ? condition.dependsOn : [];
    });
    const merged = [...stepDependsOn, ...conditionDependsOn]
      .map((key) => String(key || "").trim())
      .filter(Boolean);
    const deduped = Array.from(new Set(merged));
    return deduped.length > 0
      ? { ...step, dependsOn: deduped }
      : { ...step };
  });
}

export function orderStepsByDependencies(steps = []) {
  const stepMap = new Map((steps || []).map((step) => [step.key, step]));
  const inbound = new Map();
  const dependents = new Map();

  for (const step of steps || []) {
    const deps = Array.isArray(step?.dependsOn) ? step.dependsOn : [];
    inbound.set(step.key, new Set(deps.filter((dep) => stepMap.has(dep))));
    for (const dep of deps) {
      if (!stepMap.has(dep)) continue;
      if (!dependents.has(dep)) dependents.set(dep, new Set());
      dependents.get(dep).add(step.key);
    }
  }

  const ready = [];
  for (const [key, deps] of inbound.entries()) {
    if (deps.size === 0) ready.push(key);
  }

  const ordered = [];
  while (ready.length > 0) {
    const key = ready.shift();
    ordered.push(stepMap.get(key));
    const next = dependents.get(key);
    if (!next) continue;
    for (const depKey of next) {
      const deps = inbound.get(depKey);
      if (!deps) continue;
      deps.delete(key);
      if (deps.size === 0) ready.push(depKey);
    }
  }

  if (ordered.length !== stepMap.size) {
    // Fall back to original order if dependencies are cyclic or incomplete.
    return steps;
  }

  return ordered;
}
