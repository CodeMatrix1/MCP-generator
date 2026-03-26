import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import numTokensFromString from "../selection/lib/tiktoken-script.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import { tokenize } from "../core/query/textMatching.js";
import { createWorkflowFromEndpoints } from "./WorkflowSelect.js";
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
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              description: { type: "string" },
              action: { type: "string" },
              kind: { type: "string" },
              purpose: { type: "string" },
              promptTemplate: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } },
              condition: { type: "string" },
              iterator: { type: "string" },
            },
            required: ["key", "description", "action"],
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
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              description: { type: "string" },
              action: { type: "string" },
              kind: { type: "string" },
              purpose: { type: "string" },
              promptTemplate: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } },
              condition: { type: "string" },
              iterator: { type: "string" },
              endpointKey: { type: "string" },
            },
            required: ["key", "description", "action"],
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

export function normalizeWorkflow(workflow, query) {
  if (!workflow) {
    return createWorkflowFromEndpoints([], query)[0] || undefined;
  }

  return {
    key: workflow.key,
    label: workflow.label,
    description: workflow.description,
    scope: workflow.scope || "serve-only",
    inputSchema: workflow.inputSchema || { type: "object", properties: {} },
    steps: (workflow.steps || []).map((step, index) => ({
      id: index + 1,
      key: step.key,
      description: step.description,
      action: step.action,
      ...(step.kind ? { kind: step.kind } : {}),
      ...(step.purpose ? { purpose: step.purpose } : {}),
      ...(step.promptTemplate ? { promptTemplate: step.promptTemplate } : {}),
      ...(normalizeDependsOn(step.dependsOn).length > 0 ? { dependsOn: normalizeDependsOn(step.dependsOn) } : {}),
      ...(step.condition ? { condition: step.condition } : {}),
      ...(step.iterator ? { iterator: step.iterator } : {}),
      ...(step.endpointKey ? { endpointKey: step.endpointKey } : {}),
      ...(Array.isArray(step.candidateEndpoints) ? { candidateEndpoints: step.candidateEndpoints } : {}),
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
    steps: (workflow.steps || []).map((step) => ({
      key: step.key,
      description: step.description,
      action: step.action,
      ...(step.kind ? { kind: step.kind } : {}),
      ...(step.purpose ? { purpose: step.purpose } : {}),
      ...(step.promptTemplate ? { promptTemplate: step.promptTemplate } : {}),
      ...(normalizeDependsOn(step.dependsOn).length > 0 ? { dependsOn: normalizeDependsOn(step.dependsOn) } : {}),
      ...(step.condition ? { condition: step.condition } : {}),
      ...(step.iterator ? { iterator: step.iterator } : {}),
      ...(step.endpointKey ? { endpointKey: step.endpointKey } : {}),
      ...(Array.isArray(step.candidateEndpoints) ? { candidateEndpoints: step.candidateEndpoints } : {}),
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
    compactText(step.action) === normalizedQuery ||
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

function scoreEndpointForWorkflowStep(step, endpoint) {
  const stepTokens = buildTokenSet(`${step?.key || ""} ${step?.action || ""} ${step?.description || ""}`);
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
  const stepTokens = buildTokenSet(`${step?.key || ""} ${step?.action || ""} ${step?.description || ""}`);
  const isUserStep = hasToken(stepTokens, ["user", "username", "member"]);
  const isLookupStep = hasToken(stepTokens, ["lookup", "find", "identify", "list", "search"]);
  const isChannelStep = hasToken(stepTokens, ["channel", "room"]);
  const isEnsureStep = hasToken(stepTokens, ["ensure", "create", "open"]);
  const isInviteStep = hasToken(stepTokens, ["invite", "add", "join", "membership"]);
  const isMessageStep = hasToken(stepTokens, ["message", "messages", "welcome", "send", "post"]);

  if (isInviteStep && isChannelStep) {
    return ["post-api-v1-channels.invite"];
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

function chooseEndpointsFallback(candidateIds, userQuery, minKeep = 6, maxKeep = 20) {
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

export function normalizeRefinedStep(step, fallbackStep, index) {
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

  return {
    id: index + 1,
    key: String(step?.key || fallbackStep?.key || `step_${index + 1}`).trim(),
    description: String(step?.description || fallbackStep?.description || "").trim(),
    action: String(step?.action || fallbackStep?.action || "").trim(),
    kind,
    purpose: String(step?.purpose || fallbackStep?.purpose || step?.description || fallbackStep?.description || "").trim(),
    ...(step?.promptTemplate ? { promptTemplate: String(step.promptTemplate).trim() } : {}),
    ...(dependsOn.length > 0 ? { dependsOn } : {}),
    ...(step?.condition ? { condition: String(step.condition).trim() } : {}),
    ...(step?.iterator ? { iterator: String(step.iterator).trim() } : {}),
    ...(step?.endpointKey ? { endpointKey: String(step.endpointKey).trim() } : {}),
    ...(Array.isArray(step?.candidateEndpoints) ? { candidateEndpoints: step.candidateEndpoints } : {}),
  };
}

function heuristicRefineWorkflow(workflow, query) {
  const normalized = compactText(query);
  const steps = (workflow?.steps || []).map((step, index, allSteps) => {
    const nextStep = allSteps[index + 1];
    let kind = String(step?.kind || "").trim();
    const action = String(step?.action || "").trim().toLowerCase();
    const description = String(step?.description || "").trim();
    const purpose = String(step?.purpose || description).trim();

    if (!kind) {
      if (action.startsWith("summarization.") || action.startsWith("llm.")) {
        kind = "llm_step";
      } else if (action.includes("condition") || /\bif\b|\bexists\b|\bmissing\b/.test(description.toLowerCase())) {
        kind = "condition_step";
      } else if (action.includes("loop") || /\beach\b|\bfor every\b/.test(description.toLowerCase())) {
        kind = "loop_step";
      } else if (action.includes("transform") || action.includes("compute") || action.includes("derive")) {
        kind = "compute_step";
      } else {
        kind = "runtime_tool";
      }
    }

    const refined = {
      ...step,
      kind,
      purpose,
    };

    if (kind !== "runtime_tool" && !refined.promptTemplate) {
      const fallbackSourceStep = String((Array.isArray(step?.dependsOn) ? step.dependsOn[0] : step?.dependsOn) || nextStep?.key || allSteps[index - 1]?.key || "").trim();
      const inputReference = fallbackSourceStep
        ? `{{steps.${fallbackSourceStep}.result}}`
        : "{{inputs}}";
      refined.dependsOn = refined.dependsOn || fallbackSourceStep;
      refined.promptTemplate = `Workflow step: ${description}
Action: ${step.action}
Query: ${query}
Available input:
${inputReference}`;
    }

    return normalizeRefinedStep(refined, step, index);
  });

  if (steps.length >= 2 && /summary|summarize/.test(normalized)) {
    const lastIndex = steps.length - 1;
    steps[lastIndex] = normalizeRefinedStep({
      ...steps[lastIndex],
      kind: "llm_step",
      dependsOn: steps[lastIndex - 1]?.key || steps[lastIndex].dependsOn || "",
      promptTemplate: steps[lastIndex].promptTemplate || `Summarize the results for the user.
{{steps.${steps[lastIndex - 1]?.key || ""}.result}}`,
      purpose: steps[lastIndex].purpose || "Produce a concise user-facing summary.",
    }, steps[lastIndex], lastIndex);
  }

  return {
    ...workflow,
    steps,
  };
}

export function buildRefinementPrompt(query, workflow, finalEndpointIds) {
  const compactList = (finalEndpointIds || []).slice(0, 40).map((id) => {
    const endpoint = ENDPOINT_INDEX[id] || {};
    return {
      key: id,
      method: endpoint.method || "GET",
      path: endpoint.path || "/",
      summary: endpoint.summary || endpoint.purpose || "",
      inputs: (endpoint.inputs || []).slice(0, 6).map((input) => ({
        name: input.name,
        in: input.in,
        required: Boolean(input.required),
      })),
      produces: (endpoint.produces || []).slice(0, 6),
    };
  });
  const stepEndpointGuide = (workflow?.steps || []).map((step) => ({
    key: step?.key || "",
    action: step?.action || "",
    kind: step?.kind || "runtime_tool",
    endpointKey: step?.endpointKey || "",
    candidateEndpoints: Array.isArray(step?.candidateEndpoints)
      ? step.candidateEndpoints.slice(0, 5).map((endpoint) => ({
          key: endpoint?.key || "",
          method: endpoint?.method || "GET",
          path: endpoint?.path || "/",
          summary: endpoint?.summary || endpoint?.purpose || "",
          inputs: (endpoint?.inputs || []).slice(0, 6).map((input) => ({
            name: input.name,
            in: input.in,
            required: Boolean(input.required),
          })),
          produces: (endpoint?.produces || []).slice(0, 8),
        }))
      : [],
  }));

  return `Refine this Rocket.Chat workflow after endpoints have been mapped to the workflow steps.
Return strict JSON only:
{
  "Refined_Workflow": {
    "key": "workflow_key",
    "label": "Workflow Label",
    "description": "Workflow description",
    "scope": "serve-only",
    "inputSchema": { "type": "object", "properties": {} },
    "steps": [
      {
        "key": "step_key",
        "description": "what this step does",
        "action": "semantic_action",
        "kind": "runtime_tool",
        "purpose": "why this step exists",
        "dependsOn": ["optional_previous_step"],
        "promptTemplate": "required when kind is llm_step / compute_step / condition_step / loop_step",
        "condition": "optional branch condition",
        "iterator": "optional loop collection path",
        "endpointKey": "required for runtime_tool steps when a matching final endpoint exists"
      }
    ]
  },
  "notes": ["short refinement notes"]
}

Allowed step kinds:
- runtime_tool: a concrete Rocket.Chat API call. It must represent one external action and should use \`endpointKey\` from the provided final endpoints whenever that step talks to Rocket.Chat.
- llm_step: a Gemini reasoning or synthesis step. It must include \`promptTemplate\` describing the exact analysis or generation to perform and the upstream step outputs it uses.
- compute_step: a deterministic local transform, extraction, merge, or formatting step. It must include \`promptTemplate\` describing the input shape and produced structure.
- condition_step: a branching decision step. It must include \`promptTemplate\` and \`condition\` describing what is checked and how the branch is decided.
- loop_step: a repeated-per-item step. It must include \`promptTemplate\`, \`iterator\`, and dependencies describing what collection is iterated.

Before writing the final workflow, audit the draft for missing steps across all five step kinds:
1. runtime_tool: is there any missing external Rocket.Chat action that must happen?
2. llm_step: is there any missing reasoning, summarization, drafting, classification, or extraction step?
3. compute_step: is there any missing deterministic transform, merge, normalization, or field-shaping step?
4. condition_step: is there any missing decision/branch step such as exists/missing/eligible/empty checks?
5. loop_step: is there any missing repeated-per-item step when the workflow processes collections, users, rooms, or messages one-by-one?

If a missing step is needed, add it in the correct place with accurate dependencies. If a step kind is not needed, do not force it into the workflow.

Step templates:
- runtime_tool template:
  {
    "key": "lookup_room_messages",
    "description": "Fetch the room messages needed by later steps.",
    "action": "messages.list",
    "kind": "runtime_tool",
    "purpose": "Retrieve Rocket.Chat data from the selected endpoint.",
    "dependsOn": ["optional_previous_step"],
    "endpointKey": "one_of_the_provided_final_endpoints"
  }
- llm_step template:
  {
    "key": "summarize_messages",
    "description": "Summarize the collected messages for the user.",
    "action": "summarization.generate",
    "kind": "llm_step",
    "purpose": "Turn collected source data into a user-facing summary.",
    "dependsOn": ["lookup_room_messages"],
    "promptTemplate": "Summarize the following message payload for the user.\\n{{steps.lookup_room_messages.result}}"
  }
- compute_step template:
  {
    "key": "extract_room_ids",
    "description": "Extract the room ids and normalize them into a simple list.",
    "action": "data.transform",
    "kind": "compute_step",
    "purpose": "Create a deterministic derived structure for later steps.",
    "dependsOn": ["lookup_rooms"],
    "promptTemplate": "From {{steps.lookup_rooms.result}}, produce a normalized array of room ids as JSON."
  }
- condition_step template:
  {
    "key": "check_messages_exist",
    "description": "Check whether there are any messages available to summarize.",
    "action": "condition.evaluate",
    "kind": "condition_step",
    "purpose": "Decide whether the workflow should continue, branch, or return an empty-state response.",
    "dependsOn": ["lookup_room_messages"],
    "condition": "messages_exist",
    "promptTemplate": "Inspect {{steps.lookup_room_messages.result}} and decide whether at least one message exists."
  }
- loop_step template:
  {
    "key": "summarize_each_room",
    "description": "Summarize each room in the collection one by one.",
    "action": "collection.iterate",
    "kind": "loop_step",
    "purpose": "Repeat the same operation over a collection of items.",
    "dependsOn": ["extract_room_ids"],
    "iterator": "{{steps.extract_room_ids.result}}",
    "promptTemplate": "For each room id in {{steps.extract_room_ids.result}}, perform the required per-item processing."
  }

Rules:
- Preserve the overall user intent.
- Explicitly check whether any step of the five allowed kinds is missing before finalizing the workflow.
- Add any missing steps needed to make the workflow logically complete.
- For every runtime step, use the mapped endpoint inputs and produced outputs to judge whether the step is sufficient or whether extra condition, compute, llm, or loop steps are needed before or after it.
- Use only the provided mapped/final endpoints for runtime steps.
- Put the correct \`endpointKey\` on each runtime step in the right place in the sequence.
- Runtime steps should be the only steps expected to map to Rocket.Chat endpoints.
- Non-runtime steps should include promptTemplate explaining their reasoning/transformation job.
- Keep dependencies accurate when you insert new steps.
- If an endpoint's inputs imply a missing prerequisite step, add that prerequisite step.
- If an endpoint's outputs are insufficient for the next step, add the missing transform, condition, loop, or llm step needed to bridge the gap.
- Keep the workflow concise and executable.
- Do not include markdown.

User request:
${query}

Draft workflow:
${JSON.stringify(workflow, null, 2)}

Final endpoints:
${JSON.stringify(compactList, null, 2)}

Mapped endpoint details by step:
${JSON.stringify(stepEndpointGuide, null, 2)}
`;
}

export function refineWorkflowWithHeuristics(workflow, query) {
  return heuristicRefineWorkflow(workflow, query);
}

export function parseRefinedWorkflow(raw, query) {
  const parsed = parseGeminiJsonWithSchema(raw, validateWorkflowRefinement, "workflow refinement JSON");
  const rawRefinedWorkflow = parsed?.Refined_Workflow || parsed?.workflow;
  return {
    parsed,
    workflow: rawRefinedWorkflow ? normalizeWorkflow(rawRefinedWorkflow, query) : null,
  };
}

function buildFallbackStepHints(query) {
  const normalized = compactText(query);
  const hints = [];

  if (/(create|register|add).*(user|member)|(user|member).*(create|register|add)/.test(normalized)) {
    hints.push({
      key: "prepare_user",
      description: "Create or find the target user.",
      action: "user.prepare",
      query: "create or find user member account",
    });
  }

  if (/(create|open|find).*(channel|room|group|team)|(channel|room|group|team).*(create|open|find)/.test(normalized)) {
    hints.push({
      key: "prepare_room",
      description: "Create or find the target channel or room.",
      action: "room.prepare",
      query: "create or find channel room team",
    });
  }

  if (/(invite|add|join|onboard).*(channel|room|group|team)|to a channel|to the channel|to channel/.test(normalized)) {
    hints.push({
      key: "add_member_to_room",
      description: "Add the target user to the target channel or room.",
      action: "room.membership",
      query: "invite add user member to channel room",
    });
  }

  if (/(message|welcome|notify|announcement|announce)/.test(normalized)) {
    hints.push({
      key: "send_message",
      description: "Send the requested message in the target room.",
      action: "message.send",
      query: "send welcome message post chat",
    });
  }

  if (hints.length === 0) {
    hints.push({
      key: "fulfill_request",
      description: query,
      action: compactText(query).replace(/\s+/g, "_") || "fulfill_request",
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

    const hintQuery = `${query || ""} ${step?.description || ""} ${step?.action || ""}`.trim();
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
        action: hint.action,
      };
    })
    .filter(Boolean);

  return {
    ...workflow,
    steps: steps.length > 0 ? steps : workflow.steps,
  };
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
