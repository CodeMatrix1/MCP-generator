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
      2
    ),
    "utf8"
  );
}

async function fetchRuntimeJson(pathname, init = {}) {
  const response = await fetch(`http://${RUNTIME_HOST}:${RUNTIME_PORT}${pathname}`, init);
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `Runtime server at http://${RUNTIME_HOST}:${RUNTIME_PORT} returned non-JSON response: ${raw.slice(0, 120)}`
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
      if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y";
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
    `${meta.key} ${meta.method} ${meta.path} ${meta.summary || ""}`
  );

  let score = 0;
  for (const token of reqTokens) {
    if (haystack.includes(token)) score += 3;
    if (haystack.some((item) => item.includes(token) || token.includes(item))) score += 1;
  }

  const actionHints = [
    { request: ["list", "show"], positive: ["list"], negative: ["message", "messages", "delete", "create"], bonus: 10, penalty: 4 },
    { request: ["create", "make", "open"], positive: ["create"], negative: ["delete", "list"], bonus: 10, penalty: 4 },
    { request: ["delete", "remove"], positive: ["delete"], negative: ["create", "list"], bonus: 10, penalty: 4 },
    { request: ["update", "rename", "edit"], positive: ["update", "rename"], negative: ["delete", "create"], bonus: 10, penalty: 4 },
    { request: ["send", "post", "say"], positive: ["postmessage", "message", "chat"], negative: ["list", "delete"], bonus: 8, penalty: 4 },
  ];

  for (const hint of actionHints) {
    const requestMatched = hint.request.some((token) => reqTokens.includes(token));
    if (!requestMatched) continue;
    const positiveMatched = hint.positive.some((token) => haystack.includes(token));
    if (positiveMatched) score += hint.bonus;
    const negativeMatched = hint.negative.some((token) => haystack.includes(token));
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

  for (const variant of schema.oneOf || []) collectSchemaProperties(variant, bucket);
  for (const variant of schema.anyOf || []) collectSchemaProperties(variant, bucket);
  return bucket;
}

function getRequiredFields(meta) {
  const requestSchema = meta?.input?.requestSchema;
  if (!requestSchema || typeof requestSchema !== "object") return new Set();

  const required = new Set(Array.isArray(requestSchema.required) ? requestSchema.required : []);
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
    name: () => quoted || extractTrailingValue(text, "called") || extractTrailingValue(text, "named"),
    roomName: () => quoted || extractTrailingValue(text, "called") || extractTrailingValue(text, "named") || extractTrailingValue(text, "channel"),
    username: () => quoted || extractTrailingValue(text, "with") || extractTrailingValue(text, "user") || extractTrailingValue(text, "username"),
    usernames: () => quoted || extractTrailingValue(text, "with") || extractTrailingValue(text, "users"),
    roomId: () => quoted || extractTrailingValue(text, "room") || extractTrailingValue(text, "id"),
    msgId: () => quoted || extractTrailingValue(text, "message") || extractTrailingValue(text, "id"),
    channel: () => normalizeChannelLike(extractTrailingValue(text, "channel") || extractTrailingValue(text, "to") || quoted),
    roomIdOrChannel: () => normalizeChannelLike(extractTrailingValue(text, "channel") || extractTrailingValue(text, "to") || extractTrailingValue(text, "room") || quoted),
    text: () => {
      if (quoted) return quoted;
      const match = text.match(/\b(?:say|send|post|message)\b\s+(.+)/i) || text.match(/\btext\b\s+(.+)/i);
      return match ? match[1].trim() : "";
    },
    count: () => {
      const match = lower.match(/\b(\d+)\b/);
      return match ? Number(match[1]) : undefined;
    },
  };

  const resolver = fieldAliases[fieldName] || fieldAliases[fieldName.replace(/[^a-zA-Z0-9]/g, "")] || null;
  if (resolver) {
    const value = resolver();
    return value === "" ? undefined : value;
  }

  return quoted || undefined;
}

function inferToolPayload(meta, request) {
  const args = {};
  const context = {};
  const parameterList = Array.isArray(meta?.input?.parameters) ? meta.input.parameters : [];
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
    if (!(field in args) || args[field] === undefined || args[field] === "") missingRequired.push(field);
  }

  for (const param of parameterList) {
    if (!param?.required || param.in === "header") continue;
    const hasValue =
      (param.in === "query" && context.query && context.query[param.name] !== undefined) ||
      (param.in === "path" && context.pathParams && context.pathParams[param.name] !== undefined);
    if (!hasValue) missingRequired.push(param.name);
  }

  if (missingRequired.length > 0) {
    throw new Error(`Could not infer required field(s): ${missingRequired.join(", ")}`);
  }

  return { args, context };
}

function buildDefaultContext(overrides = {}) {
  const authState = readJsonFile(AUTH_STATE_PATH, {});
  const baseUrl = authState.baseUrl || process.env.ROCKETCHAT_BASE_URL || process.env.BASE_URL;
  const authToken = authState.authToken || process.env.ROCKETCHAT_AUTH_TOKEN || process.env.AUTH_TOKEN;
  const userId = authState.userId || process.env.ROCKETCHAT_USER_ID || process.env.USER_ID;
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
      configured: Boolean(auth?.authToken || process.env.ROCKETCHAT_AUTH_TOKEN || process.env.AUTH_TOKEN) &&
        Boolean(auth?.userId || process.env.ROCKETCHAT_USER_ID || process.env.USER_ID),
      source: auth?.authToken || auth?.userId || auth?.baseUrl ? "runtime-file" : "env",
    },
  };
}

function registerBuiltinTools() {
  registerBuiltinTool(
    { key: "rc.server.status", method: "LOCAL", path: "internal://server/status", summary: "Get control and runtime status", origin: "builtin" },
    async function rc_server_status() {
      let runtimeReachable = false;
      try {
        await getRuntimeHealth();
        runtimeReachable = true;
      } catch {
        runtimeReachable = false;
      }
      return { ...buildServerStatus(), runtimeReachable };
    }
  );

  registerBuiltinTool(
    { key: "rc.auth.status", method: "LOCAL", path: "internal://auth/status", summary: "Get current Rocket.Chat auth configuration status", origin: "builtin" },
    async function rc_auth_status() {
      const authState = readJsonFile(AUTH_STATE_PATH, {});
      const baseUrl = authState.baseUrl || process.env.ROCKETCHAT_BASE_URL || process.env.BASE_URL || "";
      const authToken = authState.authToken || process.env.ROCKETCHAT_AUTH_TOKEN || process.env.AUTH_TOKEN || "";
      const userId = authState.userId || process.env.ROCKETCHAT_USER_ID || process.env.USER_ID || "";
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
  );

  registerBuiltinTool(
    { key: "rc.auth.configure", method: "LOCAL", path: "internal://auth/configure", summary: "Configure Rocket.Chat auth credentials for live MCP actions", origin: "builtin" },
    async function rc_auth_configure(args = {}) {
      const baseUrl = String(args.baseUrl || "").trim();
      const authToken = String(args.authToken || "").trim();
      const userId = String(args.userId || "").trim();
      if (!authToken || !userId) throw new Error("authToken and userId are required.");
      saveAuthState({ baseUrl, authToken, userId });
      return { configured: true, hasBaseUrl: Boolean(baseUrl), hasAuthToken: true, hasUserId: true };
    }
  );

  registerBuiltinTool(
    { key: "rc.server.validate", method: "LOCAL", path: "internal://server/validate", summary: "Validate runtime server availability and loaded generated tools", origin: "builtin" },
    async function rc_server_validate() {
      return getRuntimeHealth();
    }
  );

  registerBuiltinTool(
  {
    key: "rc.list_tools",
    method: "LOCAL",
    path: "internal://tools/list",
    summary: "List all available runtime tools from the generated MCP runtime",
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
        input: t.input || null,
      })),
    };
  }
);

  registerBuiltinTool(
    {
      key: "rc.execute_action",
      method: "LOCAL",
      path: "internal://actions/execute",
      summary: "Execute a Rocket.Chat action by selecting the appropriate runtime tool",
      origin: "builtin",
    },
    async function rc_execute_action(args = {}) {
      const request = String(args.request || "").trim();
      if (!request) throw new Error("Missing request.");
  
      const authStatus = await builtinTools.get("rc.auth.status")({});
      if (!authStatus.configured) {
        return { status: "needs_auth", missingFields: authStatus.missingFields };
      }
  
      const tools = await getRuntimeTools();
  
      if (!tools.length) {
        return { status: "missing_capability", request };
      }
  
      const requestTokens = normalizeTokens(request);
  
      // 1️⃣ Filter tools that have token overlap
      const candidates = tools.filter((tool) => {
        const toolTokens = normalizeTokens(
          `${tool.key} ${tool.method} ${tool.path} ${tool.summary || ""}`
        );
  
        return requestTokens.some((t) => toolTokens.includes(t));
      });
  
      const matches = candidates.length ? candidates : tools;
  
      const inferenceErrors = [];
  
      for (const candidate of matches) {
        try {
          const inferred = inferToolPayload(candidate, request);
  
          const context = buildDefaultContext({
            ...(args.context || {}),
            ...(inferred.context || {}),
          });
  
          const { response, payload } = await fetchRuntimeJson(`/call/${candidate.key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              args: inferred.args || {},
              context,
            }),
          });
  
          if (!response.ok) {
            throw new Error(payload.error || "Runtime tool execution failed.");
          }
  
          return {
            status: "ok",
            request,
            tool: {
              key: candidate.key,
              method: candidate.method,
              path: candidate.path,
              summary: candidate.summary,
            },
            inferred,
            result: payload.result,
          };
        } catch (err) {
          inferenceErrors.push(`${candidate.key}: ${err.message}`);
        }
      }
  
      throw new Error(
        `Could not execute request with available tools. ${inferenceErrors.join(" | ")}`
      );
    }
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
  console.log(`Control MCP Server running at http://${CONTROL_HOST}:${CONTROL_PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Control MCP Server failed to start: http://${CONTROL_HOST}:${CONTROL_PORT} is already in use`);
    process.exit(1);
    return;
  }
  console.error("Control MCP Server failed to start:", err.message);
  process.exit(1);
});
