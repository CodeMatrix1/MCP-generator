import { runGeminiPrompt } from "../../core/llm/geminiCli.js";

export const workflow = {
  "key": "onboard_member",
  "label": "Onboard Member",
  "description": "Onboard a member, ensure the destination channel exists, and send a welcome message.",
  "scope": "serve-only",
  "inputSchema": {
    "type": "object",
    "required": [
      "username",
      "channel_name",
      "welcome_message"
    ],
    "properties": {
      "username": {
        "type": "string",
        "description": "The username of the member to onboard."
      },
      "channel_name": {
        "type": "string",
        "description": "The channel to join or create."
      },
      "welcome_message": {
        "type": "string",
        "description": "The welcome message to post after onboarding."
      }
    }
  },
  "steps": [
    {
      "key": "lookup_user",
      "description": "Look up the user by username.",
      "action": "user.lookup",
      "kind": "runtime_tool",
      "purpose": "Look up the user by username.",
      "endpointKey": "get-api-v1-users.list",
      "tool": "get-api-v1-users.list"
    },
    {
      "key": "ensure_channel",
      "description": "Ensure the target channel exists.",
      "action": "channel.ensure",
      "kind": "llm_step",
      "stepType": "condition_step",
      "purpose": "Ensure the target channel exists.",
      "promptTemplate": "Workflow step: Ensure the target channel exists.\nAction: channel.ensure\nQuery: onboard a new user(create if doesnt exist) to a channel(create if not exists) with a welcome message\nAvailable input:\n{{steps.invite_member.result}}",
      "dependsOn": [
        "invite_member"
      ]
    },
    {
      "key": "invite_member",
      "description": "Add the user to the target channel.",
      "action": "channel.invite_member",
      "kind": "runtime_tool",
      "purpose": "Add the user to the target channel.",
      "endpointKey": "post-api-v1-channels.invite",
      "tool": "post-api-v1-channels.invite"
    },
    {
      "key": "send_welcome_message",
      "description": "Send the welcome message in the target channel.",
      "action": "message.send",
      "kind": "runtime_tool",
      "purpose": "Send the welcome message in the target channel.",
      "endpointKey": "post-api-v1-chat.postMessage",
      "tool": "post-api-v1-chat.postMessage"
    }
  ]
};

export const meta = {
  key: workflow.key,
  label: workflow.label,
  description: workflow.description,
  scope: workflow.scope || "serve-only",
  inputSchema: workflow.inputSchema || null,
};

const workflowInputSchema = {
  "type": "object",
  "required": [
    "username",
    "channel_name",
    "welcome_message"
  ],
  "properties": {
    "username": {
      "type": "string",
      "description": "The username of the member to onboard."
    },
    "channel_name": {
      "type": "string",
      "description": "The channel to join or create."
    },
    "welcome_message": {
      "type": "string",
      "description": "The welcome message to post after onboarding."
    }
  }
};

function getValueByPath(source, pathExpression) {
  const normalizedPath = String(pathExpression || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\.+|\.+$/g, "");

  if (!normalizedPath) return source;

  return normalizedPath.split(".").reduce((value, segment) => {
    if (value === null || value === undefined) return undefined;
    return value[segment];
  }, source);
}

function resolveTemplateValue(template, state) {
  if (Array.isArray(template)) {
    return template.map((entry) => resolveTemplateValue(entry, state));
  }

  if (template && typeof template === "object") {
    return Object.fromEntries(
      Object.entries(template).map(([key, value]) => [
        key,
        resolveTemplateValue(value, state),
      ]),
    );
  }

  if (typeof template !== "string") {
    return template;
  }

  const exactMatch = template.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (exactMatch) {
    return getValueByPath(state, exactMatch[1]);
  }

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
    const value = getValueByPath(state, expression);
    return value === undefined || value === null ? "" : String(value);
  });
}

function applyInputDefaults(schema, input = {}) {
  const result = { ...(input || {}) };
  const properties = schema?.properties && typeof schema.properties === "object"
    ? schema.properties
    : {};

  for (const [name, fieldSchema] of Object.entries(properties)) {
    if (result[name] === undefined && fieldSchema && typeof fieldSchema === "object" && "default" in fieldSchema) {
      result[name] = fieldSchema.default;
    }
  }

  return result;
}

function validateWorkflowInput(schema, input) {
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const missing = required.filter((field) => {
    const value = input[field];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    throw new Error(`Missing workflow input field(s): ${missing.join(", ")}`);
  }
}

function assertRequiredResultPaths(requiredPaths, result, stepKey) {
  for (const requiredPath of requiredPaths || []) {
    if (getValueByPath(result, requiredPath) === undefined) {
      throw new Error(`Workflow step ${stepKey} did not produce required result path: ${requiredPath}`);
    }
  }
}

function buildStepContext(helpers, overrides = {}) {
  if (typeof helpers.buildStepContext === "function") {
    return helpers.buildStepContext(overrides);
  }

  return {
    ...(helpers.context || {}),
    ...(overrides || {}),
  };
}

function buildFailure(stepKey, error) {
  const message = error instanceof Error ? error.message : String(error || "Workflow step failed.");
  return {
    status: "error",
    failedStep: stepKey,
    error: message,
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

function buildLocalSummary(value) {
  if (Array.isArray(value)) {
    return `Processed ${value.length} items.`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return `Processed an object result with keys: ${keys.slice(0, 8).join(", ")}.`;
  }
  return String(value || "").slice(0, 500);
}

async function invokeGeneratedLlmStep(step, state, helpers = {}) {
  if (typeof helpers.invokeLlmWorkflowStep === "function") {
    return helpers.invokeLlmWorkflowStep(step, state);
  }

  const dependsOnKey = String((Array.isArray(step?.dependsOn) ? step.dependsOn[0] : step?.dependsOn) || "").trim();
  const fallbackSource = dependsOnKey
    ? state.steps[dependsOnKey]?.result
    : [...Object.values(state.steps)].at(-1)?.result;
  const fallbackInputReference = dependsOnKey
    ? ("{" + "{steps." + dependsOnKey + ".result}" + "}")
    : ("{" + "{inputs}" + "}");
  const prompt = String(
    resolveTemplateValue(
      step?.promptTemplate ||
        `Complete this workflow step: ${step?.action || "llm_step"}\nDescription: ${step?.description || ""}\nInput:\n${fallbackInputReference}`,
      state,
    ) || "",
  ).trim();

  if (!prompt) {
    return {
      text: buildLocalSummary(fallbackSource),
      mode: "fallback",
    };
  }

  try {
    const text = typeof helpers.runGeminiPrompt === "function"
      ? await helpers.runGeminiPrompt(prompt)
      : await runGeminiPrompt(prompt, 30000, 2 * 1024 * 1024);
    return {
      text: String(text || "").trim(),
      mode: "gemini",
    };
  } catch {
    return {
      text: buildLocalSummary(fallbackSource),
      mode: "fallback",
    };
  }
}

export default async function executeGeneratedWorkflow(input = {}, helpers = {}) {
  const resolvedInput = applyInputDefaults(workflowInputSchema, input);
  validateWorkflowInput(workflowInputSchema, resolvedInput);

  const state = {
    inputs: resolvedInput,
    steps: {},
  };
  const steps = [];

  // Step 1: Look up the user by username.
  // Purpose: Look up the user by username.
  const _step1Args = resolveTemplateValue({}, state);
  const _step1ContextInput = resolveTemplateValue({}, state);
  const _step1Context = buildStepContext(helpers, _step1ContextInput);
  try {
    const _step1Result = await helpers.invokeRuntimeTool("get-api-v1-users.list", _step1Args, _step1Context);
    assertRequiredResultPaths([], _step1Result, "lookup_user");
    state.steps["lookup_user"] = {
      key: "lookup_user",
      tool: "get-api-v1-users.list",
      args: _step1Args,
      context: _step1Context,
      status: "ok",
      result: _step1Result,
    };
    steps.push(state.steps["lookup_user"]);
  } catch (error) {
    state.steps["lookup_user"] = {
      key: "lookup_user",
      tool: "get-api-v1-users.list",
      args: _step1Args,
      context: _step1Context,
      status: false ? "ignored_error" : "error",
      error: error instanceof Error ? error.message : String(error || "Workflow step failed."),
    };
    steps.push(state.steps["lookup_user"]);
    if (!false) {
      return buildFailure("lookup_user", error);
    }
  }

  // Step 2: Ensure the target channel exists.
  // Purpose: Ensure the target channel exists.
  try {
    const _step2Result = await invokeGeneratedLlmStep({
  "key": "ensure_channel",
  "description": "Ensure the target channel exists.",
  "action": "channel.ensure",
  "kind": "llm_step",
  "stepType": "condition_step",
  "purpose": "Ensure the target channel exists.",
  "promptTemplate": "Workflow step: Ensure the target channel exists.\nAction: channel.ensure\nQuery: onboard a new user(create if doesnt exist) to a channel(create if not exists) with a welcome message\nAvailable input:\n{{steps.invite_member.result}}",
  "dependsOn": [
    "invite_member"
  ]
}, state, helpers);
    state.steps["ensure_channel"] = {
      key: "ensure_channel",
      action: "channel.ensure",
      kind: "llm_step",
      status: "ok",
      result: _step2Result,
    };
    steps.push(state.steps["ensure_channel"]);
  } catch (error) {
    return buildFailure("ensure_channel", error);
  }

  // Step 3: Add the user to the target channel.
  // Purpose: Add the user to the target channel.
  const _step3Args = resolveTemplateValue({}, state);
  const _step3ContextInput = resolveTemplateValue({}, state);
  const _step3Context = buildStepContext(helpers, _step3ContextInput);
  try {
    const _step3Result = await helpers.invokeRuntimeTool("post-api-v1-channels.invite", _step3Args, _step3Context);
    assertRequiredResultPaths([], _step3Result, "invite_member");
    state.steps["invite_member"] = {
      key: "invite_member",
      tool: "post-api-v1-channels.invite",
      args: _step3Args,
      context: _step3Context,
      status: "ok",
      result: _step3Result,
    };
    steps.push(state.steps["invite_member"]);
  } catch (error) {
    state.steps["invite_member"] = {
      key: "invite_member",
      tool: "post-api-v1-channels.invite",
      args: _step3Args,
      context: _step3Context,
      status: false ? "ignored_error" : "error",
      error: error instanceof Error ? error.message : String(error || "Workflow step failed."),
    };
    steps.push(state.steps["invite_member"]);
    if (!false) {
      return buildFailure("invite_member", error);
    }
  }

  // Step 4: Send the welcome message in the target channel.
  // Purpose: Send the welcome message in the target channel.
  const _step4Args = resolveTemplateValue({}, state);
  const _step4ContextInput = resolveTemplateValue({}, state);
  const _step4Context = buildStepContext(helpers, _step4ContextInput);
  try {
    const _step4Result = await helpers.invokeRuntimeTool("post-api-v1-chat.postMessage", _step4Args, _step4Context);
    assertRequiredResultPaths([], _step4Result, "send_welcome_message");
    state.steps["send_welcome_message"] = {
      key: "send_welcome_message",
      tool: "post-api-v1-chat.postMessage",
      args: _step4Args,
      context: _step4Context,
      status: "ok",
      result: _step4Result,
    };
    steps.push(state.steps["send_welcome_message"]);
  } catch (error) {
    state.steps["send_welcome_message"] = {
      key: "send_welcome_message",
      tool: "post-api-v1-chat.postMessage",
      args: _step4Args,
      context: _step4Context,
      status: false ? "ignored_error" : "error",
      error: error instanceof Error ? error.message : String(error || "Workflow step failed."),
    };
    steps.push(state.steps["send_welcome_message"]);
    if (!false) {
      return buildFailure("send_welcome_message", error);
    }
  }

  const lastSuccessfulStep = [...steps].reverse().find((step) => step.status === "ok");
  return {
    status: "ok",
    workflow: {
      key: workflow.key,
      label: workflow.label,
      description: workflow.description,
    },
    input: resolvedInput,
    steps,
    result: lastSuccessfulStep?.result ?? null,
  };
}
