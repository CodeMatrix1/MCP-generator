import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import numTokensFromString from "../selection/lib/tiktoken-script.js";

const validateWorkflowDraft = compileSchema({
  type: "object",
  properties: {
    workflows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          function_name: { type: "string" },
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
              },
              required: ["key", "description", "action"],
              additionalProperties: true,
            },
          },
        },
        required: ["description", "steps"],
        additionalProperties: true,
      },
    },
  },
  required: ["workflows"],
  additionalProperties: true,
});

function sanitizeToken(input, fallback = "workflow") {
  const value = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return value || fallback;
}

function toTitleCase(input) {
  return String(input || "")
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveAction(endpointKey) {
  const value = String(endpointKey || "").trim();
  const match = value.match(/^[a-z]+-api-v\d+-(.+)$/i);
  return match ? match[1] : value;
}


function normalizeWords(input) {
  return String(input || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasAll(text, phrases) {
  return phrases.every((phrase) => text.includes(phrase));
}

function hasAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function inferWorkflowFromQuery(query) {
  const normalizedQuery = normalizeWords(query).join(" ");

  if (
    hasAny(normalizedQuery, ["summary", "summarize"]) &&
    hasAny(normalizedQuery, ["messages", "message", "chat"])
  ) {
    return {
      key: "summarize_messages",
      label: "Summarize Messages",
      description: "Collect messages and generate a summary.",
      scope: "serve-only",
      inputSchema: {
        type: "object",
        properties: {
          room_name: {
            type: "string",
            description: "Optional room or conversation to summarize.",
          },
        },
      },
      steps: [
        {
          key: "list_messages",
          description: "Collect the messages that should be summarized.",
          action: "messages.list",
        },
        {
          key: "generate_summary",
          description: "Generate a concise summary from the collected messages.",
          action: "summarization.generate",
        },
      ],
    };
  }

  if (
    (hasAny(normalizedQuery, ["onboard", "welcome"]) && hasAny(normalizedQuery, ["user", "member"])) ||
    hasAll(normalizedQuery, ["new user", "welcome message"])
  ) {
    return {
      key: "onboard_member",
      label: "Onboard Member",
      description: "Onboard a member, ensure the destination channel exists, and send a welcome message.",
      scope: "serve-only",
      inputSchema: {
        type: "object",
        required: ["username", "channel_name", "welcome_message"],
        properties: {
          username: {
            type: "string",
            description: "The username of the member to onboard.",
          },
          channel_name: {
            type: "string",
            description: "The channel to join or create.",
          },
          welcome_message: {
            type: "string",
            description: "The welcome message to post after onboarding.",
          },
        },
      },
      steps: [
        {
          key: "lookup_user",
          description: "Look up the user by username.",
          action: "user.lookup",
        },
        {
          key: "ensure_channel",
          description: "Ensure the target channel exists.",
          action: "channel.ensure",
        },
        {
          key: "invite_member",
          description: "Add the user to the target channel.",
          action: "channel.invite_member",
        },
        {
          key: "send_welcome_message",
          description: "Send the welcome message in the target channel.",
          action: "message.send",
        },
      ],
    };
  }

  return null;
}

function inferWorkflowFromEndpoints(selectedEndpoints = []) {
  const endpoints = Array.isArray(selectedEndpoints) ? selectedEndpoints.filter(Boolean) : [];
  const joined = endpoints.join(" ").toLowerCase();

  if (
    hasAny(joined, ["users.list", "users.info", "users.create"]) &&
    hasAny(joined, ["channels.create", "channels.info"]) &&
    hasAny(joined, ["channels.invite", "channels.addall"]) &&
    hasAny(joined, ["chat.postmessage", "chat.sendmessage"])
  ) {
    return inferWorkflowFromQuery("onboard every new user with welcome message");
  }

  return null;
}

export function createWorkflowFromEndpoints(selectedEndpoints = [], query = "") {
  const endpoints = Array.isArray(selectedEndpoints)
    ? selectedEndpoints.filter(Boolean)
    : [];
  const inferredWorkflow = query
    ? inferWorkflowFromQuery(query)
    : inferWorkflowFromEndpoints(endpoints);

  if (inferredWorkflow) {
    return [inferredWorkflow];
  }

  const workflowKeyBase = sanitizeToken(query, "generated_workflow");

  return [
    {
      key: workflowKeyBase,
      label: toTitleCase(workflowKeyBase),
      description: query || "Generated workflow from selected Rocket.Chat endpoints.",
      scope: "serve-only",
      inputSchema: {
        type: "object",
        properties: {},
      },
      steps:
        endpoints.length > 0
          ? endpoints.map((endpointKey, index) => ({
              key: `step_${index + 1}`,
              description: `Execute ${deriveAction(endpointKey)}.`,
              action: deriveAction(endpointKey),
            }))
          : [
              {
                key: "step_1",
                description: query || "Fulfill the requested outcome.",
                action: sanitizeToken(query, "fulfill_request"),
              },
            ],
    },
  ];
}

export function fallbackWorkflowDecomposition(query) {
  return createWorkflowFromEndpoints([], query);
}

export function fallbackWorkflowDecompositionFromEndpoints(selectedEndpoints = []) {
  return createWorkflowFromEndpoints(selectedEndpoints);
}

function buildWorkflowPrompt(userQuery, capabilityContext = "") {
  const contextSection = capabilityContext
    ? `\nRelevant Rocket.Chat capability hints:\n${capabilityContext}\n`
    : "";

  return `
Decompose this Rocket.Chat requirement into a serve-only workflow definition.
Return strict JSON only with this shape:
{
  "workflows": [
    {
      "key": "snake_case_function_name",
      "label": "Readable Name",
      "description": "One sentence description",
      "scope": "serve-only",
      "inputSchema": {
        "type": "object",
        "required": ["fieldA"],
        "properties": {
          "fieldA": {
            "type": "string",
            "description": "What it is"
          }
        }
      },
      "steps": [
        {
          "key": "snake_case_step",
          "description": "what this step does",
          "action": "semantic_action"
        }
      ]
    }
  ]
}

Rules:
- Build serve-only workflows, not runtime tools.
- Prefer a single workflow unless the requirement clearly needs multiple workflows.
- Use snake_case keys.
- Every step must only include key, description, and action.
- Keep the workflow abstract. Do not include operationIds, API paths, request args, or display tool names.
- Use the capability hints only to improve step quality and ordering.
- Do not include markdown or explanations outside JSON.
${contextSection}
Requirement:
${userQuery}
`;
}

function normalizeWorkflowDrafts(candidate, query = "") {
  const workflows = Array.isArray(candidate?.workflows)
    ? candidate.workflows
    : [];

  return workflows
    .map((workflow, workflowIndex) => {
      const rawKey = String(
        workflow?.key || workflow?.function_name || `workflow_${workflowIndex + 1}`,
      ).trim();
      const key = sanitizeToken(rawKey, sanitizeToken(query, `workflow_${workflowIndex + 1}`));
      const label = String(workflow?.label || "").trim() || toTitleCase(key);
      const description = String(workflow?.description || "").trim();
      const steps = Array.isArray(workflow?.steps)
        ? workflow.steps
            .map((step, stepIndex) => ({
              key: sanitizeToken(step?.key, `step_${stepIndex + 1}`),
              description: String(step?.description || "").trim(),
              action: String(step?.action || "").trim() || sanitizeToken(step?.description, `step_${stepIndex + 1}`),
            }))
            .filter((step) => step.key && step.description && step.action)
        : [];

      return {
        key,
        label,
        description: description || query || "Generated workflow.",
        scope: "serve-only",
        inputSchema:
          workflow?.inputSchema && typeof workflow.inputSchema === "object"
            ? workflow.inputSchema
            : { type: "object", properties: {} },
        steps,
      };
    })
    .filter((workflow) => workflow.key && workflow.label && workflow.steps.length > 0);
}

export async function decomposeWorkflowRequirement(userQuery, options = {}) {
  const query = String(userQuery || "").trim();
  const tokenMetrics = numTokensFromString(query);
  const heuristicWorkflow = inferWorkflowFromQuery(query);

  if (heuristicWorkflow) {
    return {
      success: true,
      workflows: [heuristicWorkflow],
      tokenMetrics,
    };
  }

  try {
    const prompt = buildWorkflowPrompt(query, options.capabilityContext || "");
    const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
    const parsed = parseGeminiJsonWithSchema(
      raw,
      validateWorkflowDraft,
      "workflow draft JSON",
    );
    const normalized = normalizeWorkflowDrafts(parsed, query);
    if (normalized.length > 0) {
      return {
        success: true,
        workflows: normalized,
        tokenMetrics,
      };
    }
  } catch {
    // fall back below
  }

  return {
    success: true,
    workflows: fallbackWorkflowDecomposition(query),
    tokenMetrics,
  };
}
