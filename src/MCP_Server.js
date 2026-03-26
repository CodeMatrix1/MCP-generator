import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  getControlHost,
  getControlPort,
  getRuntimeHost,
  getRuntimePort,
} from "./config/ports.js";
import { loadWorkflowModules } from "./workflows/store.js";
import { runGeminiPrompt } from "./core/llm/geminiCli.js";
import { logger } from "./config/loggerConfig.js";

dotenv.config({ quiet: true });

const app = express();
app.use(express.json());

const PROJECT_ROOT = process.cwd();
const AUTH_STATE_PATH = path.join(PROJECT_ROOT, ".mcp-auth.json");
const CONTROL_PORT = getControlPort();
const CONTROL_HOST = getControlHost();
const RUNTIME_PORT = getRuntimePort();
const RUNTIME_HOST = getRuntimeHost();

const builtinTools = new Map();
const builtinMetaList = [];

function registerBuiltinTool(meta, toolFn) {
  builtinTools.set(meta.key, toolFn);
  builtinMetaList.push(meta);
}

function readJsonFile(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveAuthState(payload) {
  fs.writeFileSync(
    AUTH_STATE_PATH,
    JSON.stringify(
      {
        baseUrl: payload.baseUrl || "",
        authToken: payload.authToken || "",
        userId: payload.userId || "",
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function fetchRuntimeJson(pathname, init = {}) {
  const runtimeurl = `http://${RUNTIME_HOST}:${RUNTIME_PORT}`;

  const response = await fetch(`${runtimeurl}${pathname}`, {
    method: init.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: init.body,
  });

  const raw = await response.text();

  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `Runtime server returned non-JSON response: ${raw.slice(0, 120)}`,
    );
  }

  return { response, payload };
}

async function getRuntimeTools() {
  const { response, payload } = await fetchRuntimeJson("/tools");
  if (!response.ok) {
    throw new Error(payload.error || "Runtime /tools request failed.");
  }
  return Array.isArray(payload.tools) ? payload.tools : [];
}

async function getRuntimeHealth() {
  const { response, payload } = await fetchRuntimeJson("/health");
  if (!response.ok) {
    throw new Error(payload.error || "Runtime /health request failed.");
  }
  return payload;
}

function normalizeTokens(input) {
  return String(input || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => {
      if (token.endsWith("ies") && token.length > 4)
        return token.slice(0, -3) + "y";
      if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
      if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
      return token;
    });
}

function extractQuotedValue(request) {
  const match = String(request || "").match(/["']([^"']+)["']/);
  return match ? match[1].trim() : "";
}

function extractTrailingValue(request, marker) {
  const pattern = new RegExp(`${marker}\\s+([#@a-zA-Z0-9._-]+)`, "i");
  const match = String(request || "").match(pattern);
  return match ? match[1].trim() : "";
}

function scoreToolMatch(request, meta) {
  const reqTokens = normalizeTokens(request);
  const haystack = normalizeTokens(
    `${meta.key} ${meta.method} ${meta.path} ${meta.summary || ""}`,
  );

  let score = 0;
  for (const token of reqTokens) {
    if (haystack.includes(token)) score += 3;
    if (haystack.some((item) => item.includes(token) || token.includes(item)))
      score += 1;
  }

  const actionHints = [
    {
      request: ["list", "show"],
      positive: ["list"],
      negative: ["message", "messages", "delete", "create"],
      bonus: 10,
      penalty: 4,
    },
    {
      request: ["create", "make", "open"],
      positive: ["create"],
      negative: ["delete", "list"],
      bonus: 10,
      penalty: 4,
    },
    {
      request: ["delete", "remove"],
      positive: ["delete"],
      negative: ["create", "list"],
      bonus: 10,
      penalty: 4,
    },
    {
      request: ["update", "rename", "edit"],
      positive: ["update", "rename"],
      negative: ["delete", "create"],
      bonus: 10,
      penalty: 4,
    },
    {
      request: ["send", "post", "say"],
      positive: ["postmessage", "message", "chat"],
      negative: ["list", "delete"],
      bonus: 8,
      penalty: 4,
    },
  ];

  for (const hint of actionHints) {
    const requestMatched = hint.request.some((token) =>
      reqTokens.includes(token),
    );
    if (!requestMatched) continue;
    const positiveMatched = hint.positive.some((token) =>
      haystack.includes(token),
    );
    if (positiveMatched) score += hint.bonus;
    const negativeMatched = hint.negative.some((token) =>
      haystack.includes(token),
    );
    if (negativeMatched && !positiveMatched) score -= hint.penalty;
  }

  return score;
}

function collectSchemaProperties(schema, bucket = new Map()) {
  if (!schema || typeof schema !== "object") return bucket;

  if (schema.properties && typeof schema.properties === "object") {
    for (const [name, value] of Object.entries(schema.properties)) {
      if (!bucket.has(name)) bucket.set(name, value || {});
    }
  }

  for (const variant of schema.oneOf || [])
    collectSchemaProperties(variant, bucket);
  for (const variant of schema.anyOf || [])
    collectSchemaProperties(variant, bucket);
  return bucket;
}

function getRequiredFields(meta) {
  const requestSchema = meta?.input?.requestSchema;
  if (!requestSchema || typeof requestSchema !== "object") return new Set();

  const required = new Set(
    Array.isArray(requestSchema.required) ? requestSchema.required : [],
  );
  for (const variant of requestSchema.oneOf || []) {
    for (const field of variant.required || []) required.add(field);
  }
  return required;
}

function normalizeChannelLike(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("#") || text.startsWith("@")) return text;
  return text;
}

function inferFieldValue(fieldName, request) {
  const text = String(request || "").trim();
  const lower = text.toLowerCase();
  const quoted = extractQuotedValue(text);

  const fieldAliases = {
    name: () =>
      quoted ||
      extractTrailingValue(text, "called") ||
      extractTrailingValue(text, "named"),
    roomName: () =>
      quoted ||
      extractTrailingValue(text, "called") ||
      extractTrailingValue(text, "named") ||
      extractTrailingValue(text, "channel"),
    username: () =>
      quoted ||
      extractTrailingValue(text, "with") ||
      extractTrailingValue(text, "user") ||
      extractTrailingValue(text, "username"),
    usernames: () =>
      quoted ||
      extractTrailingValue(text, "with") ||
      extractTrailingValue(text, "users"),
    roomId: () =>
      quoted ||
      extractTrailingValue(text, "room") ||
      extractTrailingValue(text, "id"),
    msgId: () =>
      quoted ||
      extractTrailingValue(text, "message") ||
      extractTrailingValue(text, "id"),
    channel: () =>
      normalizeChannelLike(
        extractTrailingValue(text, "channel") ||
          extractTrailingValue(text, "to") ||
          quoted,
      ),
    roomIdOrChannel: () =>
      normalizeChannelLike(
        extractTrailingValue(text, "channel") ||
          extractTrailingValue(text, "to") ||
          extractTrailingValue(text, "room") ||
          quoted,
      ),
    text: () => {
      if (quoted) return quoted;
      const match =
        text.match(/\b(?:say|send|post|message)\b\s+(.+)/i) ||
        text.match(/\btext\b\s+(.+)/i);
      return match ? match[1].trim() : "";
    },
    count: () => {
      const match = lower.match(/\b(\d+)\b/);
      return match ? Number(match[1]) : undefined;
    },
  };

  const resolver =
    fieldAliases[fieldName] ||
    fieldAliases[fieldName.replace(/[^a-zA-Z0-9]/g, "")] ||
    null;
  if (resolver) {
    const value = resolver();
    return value === "" ? undefined : value;
  }

  return quoted || undefined;
}

function inferToolPayload(meta, request) {
  const args = {};
  const context = {};
  const parameterList = Array.isArray(meta?.input?.parameters)
    ? meta.input.parameters
    : [];
  const requestSchema = meta?.input?.requestSchema || null;
  const requiredFields = getRequiredFields(meta);
  const bodyProperties = collectSchemaProperties(requestSchema);

  for (const [fieldName] of bodyProperties.entries()) {
    const value = inferFieldValue(fieldName, request);
    if (value !== undefined) args[fieldName] = value;
  }

  for (const param of parameterList) {
    if (!param?.name || !param.in || param.in === "header") continue;
    const value = inferFieldValue(param.name, request);
    if (value === undefined) continue;
    if (param.in === "query") {
      context.query = context.query || {};
      context.query[param.name] = value;
    } else if (param.in === "path") {
      context.pathParams = context.pathParams || {};
      context.pathParams[param.name] = value;
    }
  }

  const missingRequired = [];
  for (const field of requiredFields) {
    if (!(field in args) || args[field] === undefined || args[field] === "")
      missingRequired.push(field);
  }

  for (const param of parameterList) {
    if (!param?.required || param.in === "header") continue;
    const hasValue =
      (param.in === "query" &&
        context.query &&
        context.query[param.name] !== undefined) ||
      (param.in === "path" &&
        context.pathParams &&
        context.pathParams[param.name] !== undefined);
    if (!hasValue) missingRequired.push(param.name);
  }

  if (missingRequired.length > 0) {
    throw new Error(
      `Could not infer required field(s): ${missingRequired.join(", ")}`,
    );
  }

  return { args, context };
}

function buildDefaultContext(overrides = {}) {
  const authState = readJsonFile(AUTH_STATE_PATH, {});
  const baseUrl =
    authState.baseUrl ||
    process.env.ROCKETCHAT_BASE_URL ||
    process.env.BASE_URL;
  const authToken =
    authState.authToken ||
    process.env.ROCKETCHAT_AUTH_TOKEN ||
    process.env.AUTH_TOKEN;
  const userId =
    authState.userId || process.env.ROCKETCHAT_USER_ID || process.env.USER_ID;
  const headers = {};
  if (authToken) headers["X-Auth-Token"] = authToken;
  if (userId) headers["X-User-Id"] = userId;
  if (overrides.authToken) headers["X-Auth-Token"] = overrides.authToken;
  if (overrides.userId) headers["X-User-Id"] = overrides.userId;

  const { authToken: _authToken, userId: _userId, ...rest } = overrides;
  return { baseUrl, headers, ...rest };
}

function buildServerStatus() {
  const auth = readJsonFile(AUTH_STATE_PATH, {});
  return {
    controlServer: {
      host: CONTROL_HOST,
      port: CONTROL_PORT,
      url: `http://${CONTROL_HOST}:${CONTROL_PORT}`,
    },
    runtimeServer: {
      host: RUNTIME_HOST,
      port: RUNTIME_PORT,
      url: `http://${RUNTIME_HOST}:${RUNTIME_PORT}`,
    },
    auth: {
      configured:
        Boolean(
          auth?.authToken ||
          process.env.ROCKETCHAT_AUTH_TOKEN ||
          process.env.AUTH_TOKEN,
        ) &&
        Boolean(
          auth?.userId || process.env.ROCKETCHAT_USER_ID || process.env.USER_ID,
        ),
      source:
        auth?.authToken || auth?.userId || auth?.baseUrl
          ? "runtime-file"
          : "env",
      },
  };
}

function getAuthStatusSnapshot() {
  const authState = readJsonFile(AUTH_STATE_PATH, {});
  const baseUrl =
    authState.baseUrl ||
    process.env.ROCKETCHAT_BASE_URL ||
    process.env.BASE_URL ||
    "";
  const authToken =
    authState.authToken ||
    process.env.ROCKETCHAT_AUTH_TOKEN ||
    process.env.AUTH_TOKEN ||
    "";
  const userId =
    authState.userId ||
    process.env.ROCKETCHAT_USER_ID ||
    process.env.USER_ID ||
    "";
  const missingFields = [];
  if (!baseUrl) missingFields.push("baseUrl");
  if (!authToken) missingFields.push("authToken");
  if (!userId) missingFields.push("userId");

  return {
    configured: missingFields.length === 0,
    hasBaseUrl: Boolean(baseUrl),
    hasAuthToken: Boolean(authToken),
    hasUserId: Boolean(userId),
    missingFields,
  };
}

function getSchemaRequiredFields(schema) {
  if (!schema || typeof schema !== "object") return [];

  const required = new Set(
    Array.isArray(schema.required) ? schema.required : [],
  );

  for (const variant of schema.oneOf || []) {
    for (const field of variant.required || []) required.add(field);
  }

  for (const variant of schema.anyOf || []) {
    for (const field of variant.required || []) required.add(field);
  }

  return Array.from(required);
}

function buildToolInputSummary(tool) {
  const input = tool?.input && typeof tool.input === "object" ? tool.input : {};
  const parameters = Array.isArray(input.parameters) ? input.parameters : [];
  const requestSchema =
    input.requestSchema && typeof input.requestSchema === "object"
      ? input.requestSchema
      : null;

  return {
    parameters,
    requestSchema,
    requestExample: input.requestExample,
    requiredBodyFields: getSchemaRequiredFields(requestSchema),
    requiredParameters: parameters
      .filter((param) => Boolean(param?.required))
      .map((param) => ({
        name: param.name,
        in: param.in,
      })),
  };
}

function buildToolOutputSummary(tool) {
  const output = tool?.output && typeof tool.output === "object" ? tool.output : {};
  const responseSchema =
    output.responseSchema && typeof output.responseSchema === "object"
      ? output.responseSchema
      : null;
  const outputFields = Array.isArray(output.outputFields) ? output.outputFields : [];

  return {
    successStatus: output.successStatus || null,
    description: output.description || "",
    responseSchema,
    outputFields,
  };
}

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

function applyWorkflowInputDefaults(workflow, input = {}) {
  const result = { ...(input || {}) };
  const properties =
    workflow?.inputSchema?.properties &&
    typeof workflow.inputSchema.properties === "object"
      ? workflow.inputSchema.properties
      : {};

  for (const [name, schema] of Object.entries(properties)) {
    if (result[name] === undefined && schema && "default" in schema) {
      result[name] = schema.default;
    }
  }

  return result;
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

function validateWorkflowInput(workflow, input) {
  const required = Array.isArray(workflow?.inputSchema?.required)
    ? workflow.inputSchema.required
    : [];

  const missing = required.filter((field) => {
    const value = input[field];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing workflow input field(s): ${missing.join(", ")}`,
    );
  }
}

function validateRequiredResultPaths(step, result) {
  const requiredPaths = Array.isArray(step?.requiredResultPaths)
    ? step.requiredResultPaths
    : [];

  for (const requiredPath of requiredPaths) {
    if (getValueByPath(result, requiredPath) === undefined) {
      throw new Error(
        `Workflow step ${step.key} did not produce required result path: ${requiredPath}`,
      );
    }
  }
}

async function invokeRuntimeTool(toolKey, args, context) {
  const { response, payload } = await fetchRuntimeJson(`/call/${toolKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ args, context }),
  });

  if (!response.ok) {
    throw new Error(payload.error || `Runtime tool ${toolKey} failed.`);
  }

  return payload.result;
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

async function invokeLlmWorkflowStep(step, state) {
  const dependsOnKey = String((Array.isArray(step.dependsOn) ? step.dependsOn[0] : step.dependsOn) || "").trim();
  const fallbackSource = dependsOnKey
    ? state.steps[dependsOnKey]?.result
    : [...Object.values(state.steps)].at(-1)?.result;
  const prompt = String(
    resolveTemplateValue(
      step.promptTemplate ||
        `Complete this workflow step: ${step.action}\nDescription: ${step.description}\nInput:\n{{steps.${dependsOnKey}.result}}`,
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
    const text = await runGeminiPrompt(prompt, 30000, 2 * 1024 * 1024);
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

async function executeWorkflowDefinition(workflow, input = {}, contextOverrides = {}) {
  const resolvedInput = applyWorkflowInputDefaults(workflow, input);
  validateWorkflowInput(workflow, resolvedInput);

  const runtimeTools = await getRuntimeTools();
  const runtimeToolKeys = new Set(runtimeTools.map((tool) => tool.key));
  const state = {
    inputs: resolvedInput,
    steps: {},
  };
  const steps = [];

  for (const step of workflow.steps || []) {
    if (step?.kind === "llm_step") {
      const result = await invokeLlmWorkflowStep(step, state);
      const stepRecord = {
        key: step.key,
        action: step.action,
        kind: "llm_step",
        status: "ok",
        result,
      };
      state.steps[step.key] = stepRecord;
      steps.push(stepRecord);
      continue;
    }

    const stepToolKey = String(step.tool || step.toolHint || "").trim();
    if (!stepToolKey) {
      return {
        status: "unresolved_step",
        workflow: {
          key: workflow.key,
          label: workflow.label,
        },
        failedStep: step.key,
        step,
        steps,
      };
    }
    if (!runtimeToolKeys.has(stepToolKey)) {
      return {
        status: "missing_capability",
        workflow: {
          key: workflow.key,
          label: workflow.label,
        },
        missingTool: stepToolKey,
        failedStep: step.key,
        steps,
      };
    }

    const args = resolveTemplateValue(step.args || {}, state);
    const stepContext = buildDefaultContext({
      ...(contextOverrides || {}),
      ...resolveTemplateValue(step.context || {}, state),
    });

    try {
      const result = await invokeRuntimeTool(stepToolKey, args, stepContext);
      validateRequiredResultPaths(step, result);

      const stepRecord = {
        key: step.key,
        tool: stepToolKey,
        args,
        context: stepContext,
        status: "ok",
        result,
      };
      state.steps[step.key] = stepRecord;
      steps.push(stepRecord);
    } catch (err) {
      const stepRecord = {
        key: step.key,
        tool: stepToolKey,
        args,
        context: stepContext,
        status: step.continueOnError ? "ignored_error" : "error",
        error: err.message,
      };
      state.steps[step.key] = stepRecord;
      steps.push(stepRecord);

      if (!step.continueOnError) {
        return {
          status: "error",
          workflow: {
            key: workflow.key,
            label: workflow.label,
          },
          failedStep: step.key,
          error: err.message,
          steps,
        };
      }
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

async function getGeneratedWorkflowModules() {
  return loadWorkflowModules(PROJECT_ROOT);
}

function registerBuiltinTools() {
  registerBuiltinTool(
    {
      key: "rc.server.overview",
      method: "LOCAL",
      path: "internal://server/overview",
      summary:
        "Combined alternative to server status, auth status/configure, and runtime validation",
      origin: "builtin",
    },
    async function rc_server_overview(args = {}) {
      const baseUrl = String(args.baseUrl || "").trim();
      const authToken = String(args.authToken || "").trim();
      const userId = String(args.userId || "").trim();
      const shouldConfigure =
        Boolean(baseUrl) || Boolean(authToken) || Boolean(userId);

      let authConfigured = null;
      if (shouldConfigure) {
        if (!authToken || !userId) {
          throw new Error(
            "authToken and userId are required when configuring via rc.server.overview.",
          );
        }
        saveAuthState({ baseUrl, authToken, userId });
        authConfigured = {
          configured: true,
          hasBaseUrl: Boolean(baseUrl),
          hasAuthToken: true,
          hasUserId: true,
        };
      }

      let runtimeValidation;
      let runtimeReachable = false;
      try {
        runtimeValidation = await getRuntimeHealth();
        runtimeReachable = true;
      } catch (err) {
        runtimeValidation = {
          ok: false,
          error: err.message,
        };
      }

      return {
        serverStatus: {
          ...buildServerStatus(),
          runtimeReachable,
        },
        authStatus: getAuthStatusSnapshot(),
        authConfigured,
        runtimeValidation,
      };
    },
  );

  registerBuiltinTool(
    {
      key: "rc.list_tools",
      method: "LOCAL",
      path: "internal://tools/list",
      summary:
        "List all available runtime tools from the generated MCP runtime",
      origin: "builtin",
    },
    async function rc_list_tools() {
      const tools = await getRuntimeTools();

      return {
        count: tools.length,
        tools: tools.map((t) => ({
          key: t.key,
          method: t.method,
          path: t.path,
          summary: t.summary,
          input: buildToolInputSummary(t),
          output: buildToolOutputSummary(t),
        })),
      };
    },
  );

  registerBuiltinTool(
    {
      key: "rc.list_workflows",
      method: "LOCAL",
      path: "internal://workflows/list",
      summary: "List saved serve-only workflow functions generated for the current MCP",
      origin: "builtin",
    },
    async function rc_list_workflows() {
      const workflows = await getGeneratedWorkflowModules();
      return {
        count: workflows.length,
        workflows: workflows.map(({ workflow, meta }) => ({
          key: meta.key,
          label: meta.label,
          description: meta.description,
          scope: meta.scope || "serve-only",
          inputSchema: meta.inputSchema || null,
          steps: Array.isArray(workflow.steps)
            ? workflow.steps.map((step) => ({
                key: step.key,
                tool: step.tool,
                continueOnError: Boolean(step.continueOnError),
              }))
            : [],
        })),
      };
    },
  );

  registerBuiltinTool(
    {
      key: "rc.execute_workflow",
      method: "LOCAL",
      path: "internal://workflows/execute",
      summary: "Execute a saved serve-only workflow function against the runtime MCP tools",
      origin: "builtin",
    },
    async function rc_execute_workflow(args = {}) {
      const workflowKey = String(args.workflow || "").trim();
      if (!workflowKey) {
        throw new Error("Missing workflow.");
      }

      const authStatus = getAuthStatusSnapshot();
      if (!authStatus.configured) {
        return {
          status: "needs_auth",
          missingFields: authStatus.missingFields,
        };
      }

      const workflowModules = await getGeneratedWorkflowModules();
      const workflowModule = workflowModules.find(
        (entry) => entry.meta.key === workflowKey,
      );
      if (!workflowModule) {
        return {
          status: "missing_workflow",
          workflow: workflowKey,
        };
      }

      return workflowModule.execute(args.input || {}, {
        context: args.context || {},
        executeWorkflowDefinition,
        invokeRuntimeTool,
        invokeLlmWorkflowStep,
        buildStepContext: (overrides = {}) =>
          buildDefaultContext({
            ...(args.context || {}),
            ...(overrides || {}),
          }),
      });
    },
  );

  registerBuiltinTool(
    {
      key: "rc.execute_action",
      method: "LOCAL",
      path: "internal://actions/execute",
      summary: "Execute a specific Rocket.Chat runtime tool",
      origin: "builtin",
    },
    async function rc_execute_action(args = {}) {
      const toolKey = String(args.tool || "").trim();
      if (!toolKey) {
        throw new Error("Missing tool.");
      }

      const toolArgs = args.args || {};
      const authStatus = getAuthStatusSnapshot();
      if (!authStatus.configured) {
        return {
          status: "needs_auth",
          missingFields: authStatus.missingFields,
        };
      }

      const tools = await getRuntimeTools();

      const candidate = tools.find((t) => t.key === toolKey);

      if (!candidate) {
        return {
          status: "missing_capability",
          tool: toolKey,
        };
      }

      const context = buildDefaultContext(args.context || {});

      const { response, payload } = await fetchRuntimeJson(
        `/call/${candidate.key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            args: toolArgs,
            context,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(payload.error || "Runtime tool execution failed.");
      }

      return {
        status: "ok",
        tool: {
          key: candidate.key,
          method: candidate.method,
          path: candidate.path,
          summary: candidate.summary,
        },
        args: toolArgs,
        result: payload.result,
      };
    },
  );
}

registerBuiltinTools();

app.get("/tools", (req, res) => {
  res.json({ tools: builtinMetaList });
});

app.get("/health", async (req, res) => {
  let runtimeHealth = null;
  try {
    runtimeHealth = await getRuntimeHealth();
  } catch {
    runtimeHealth = { ok: false };
  }
  res.json({
    ok: true,
    status: buildServerStatus(),
    runtimeHealth,
  });
});

app.post("/call/:key", async (req, res) => {
  const tool = builtinTools.get(req.params.key);
  if (!tool) return res.status(404).json({ error: "Tool not found" });

  try {
    const result = await tool(req.body.args || {}, req.body.context || {});
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(CONTROL_PORT, CONTROL_HOST, () => {
  logger.info(
    `Control MCP Server running at http://${CONTROL_HOST}:${CONTROL_PORT}`,
  );
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger.error(
      `Control MCP Server failed to start: http://${CONTROL_HOST}:${CONTROL_PORT} is already in use`,
    );
    process.exit(1);
    return;
  }
  logger.error("Control MCP Server failed to start:", err.message);
  process.exit(1);
});



