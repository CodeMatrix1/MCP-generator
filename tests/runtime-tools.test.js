import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { finalEndpoints } from "../src/selection/FinalEndpoints.js";

const RUNTIME_PORT = 3012;
const CONTROL_PORT = 3013;
const RUNTIME_BASE_URL = `http://127.0.0.1:${RUNTIME_PORT}`;
const CONTROL_BASE_URL = `http://127.0.0.1:${CONTROL_PORT}`;
const API_PORT = 3210;
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const AUTH_STATE_PATH = path.join(process.cwd(), ".mcp-auth.json");
const TOOL_CACHE_DIR = path.join(process.cwd(), "src", "tool_cache");
const LAST_SELECTION_PATH = path.join(TOOL_CACHE_DIR, "last_selection.json");
const WORKFLOW_CACHE_DIR = path.join(TOOL_CACHE_DIR, "workflows");

function startApiStub() {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/api/v1/users.list")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          users: [{ _id: "user-42", username: "new_user" }],
          count: 1,
          offset: 0,
          total: 1,
        }),
      );
      return;
    }

    if (req.url === "/api/v1/channels.list") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ channels: [{ _id: "general", name: "general" }] }));
      return;
    }

    if (req.url?.startsWith("/api/v1/channels.info")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          channel: { _id: "room-99", name: "team-updates" },
          success: true,
        }),
      );
      return;
    }

    if (req.url === "/api/v1/dm.list") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ims: [{ _id: "dm1", usernames: ["rocket.cat"] }] }));
      return;
    }

    if (req.url === "/api/v1/channels.create" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          channel: { _id: "room-99", name: "team-updates" },
          success: true,
        }),
      );
      return;
    }

    if (req.url === "/api/v1/channels.invite" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.url === "/api/v1/chat.postMessage" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: { _id: "msg-1" } }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolve) => {
    server.listen(API_PORT, "127.0.0.1", () => resolve(server));
  });
}

function startServer() {
  const runtimeChild = spawn(process.execPath, ["src/MCP_Runtime_Server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BASE_URL: API_BASE_URL,
      ROCKETCHAT_AUTH_TOKEN: "",
      ROCKETCHAT_USER_ID: "",
      AUTH_TOKEN: "",
      USER_ID: "",
      MCP_RUNTIME_PORT: String(RUNTIME_PORT),
      MCP_RUNTIME_HOST: "127.0.0.1",
      MCP_CONTROL_PORT: String(CONTROL_PORT),
      MCP_CONTROL_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const controlChild = spawn(process.execPath, ["src/MCP_Server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BASE_URL: API_BASE_URL,
      ROCKETCHAT_AUTH_TOKEN: "",
      ROCKETCHAT_USER_ID: "",
      AUTH_TOKEN: "",
      USER_ID: "",
      MCP_RUNTIME_PORT: String(RUNTIME_PORT),
      MCP_RUNTIME_HOST: "127.0.0.1",
      MCP_CONTROL_PORT: String(CONTROL_PORT),
      MCP_CONTROL_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ready = new Promise((resolve, reject) => {
    let runtimeStderr = "";
    let controlStderr = "";
    let sawRuntime = false;
    let sawControl = false;
    runtimeChild.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes(`http://127.0.0.1:${RUNTIME_PORT}`)) {
        sawRuntime = true;
      }
      if (sawRuntime && sawControl) {
        resolve();
      }
    });
    controlChild.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes(`http://127.0.0.1:${CONTROL_PORT}`)) {
        sawControl = true;
      }
      if (sawRuntime && sawControl) {
        resolve();
      }
    });
    runtimeChild.stderr.on("data", (chunk) => {
      runtimeStderr += chunk.toString();
    });
    controlChild.stderr.on("data", (chunk) => {
      controlStderr += chunk.toString();
    });
    runtimeChild.on("exit", (code) => {
      reject(new Error(`Runtime server exited early with code ${code}: ${runtimeStderr}`));
    });
    controlChild.on("exit", (code) => {
      reject(new Error(`Control server exited early with code ${code}: ${controlStderr}`));
    });
  });

  return { runtimeChild, controlChild, ready };
}

async function callTool(key, args = {}, context = {}) {
  const response = await fetch(`${CONTROL_BASE_URL}/call/${key}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args, context }),
  });

  const payload = await response.json();
  return { response, payload };
}

test("runtime built-in tools respond with structured data", async () => {
  if (fs.existsSync(AUTH_STATE_PATH)) {
    fs.rmSync(AUTH_STATE_PATH, { force: true });
  }

  execFileSync(
    process.execPath,
    ["src/index.js", "--endpoints", "get-api-v1-channels.list", "--no-server"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: API_BASE_URL,
      },
      stdio: "ignore",
    },
  );

  const apiServer = await startApiStub();
  const { runtimeChild, controlChild, ready } = startServer();
  try {
    await ready;

    const overview = await callTool("rc.server.overview");
    assert.equal(overview.response.status, 200);
    assert.equal(
      overview.payload.result.serverStatus.runtimeServer.port,
      String(RUNTIME_PORT),
    );
    assert.equal(
      overview.payload.result.serverStatus.controlServer.port,
      String(CONTROL_PORT),
    );
    assert.equal(
      overview.payload.result.authStatus.configured,
      false,
    );
    assert.deepEqual(
      overview.payload.result.authStatus.missingFields,
      ["authToken", "userId"],
    );
    assert.equal(typeof overview.payload.result.runtimeValidation.ok, "boolean");

    const execute = await callTool("rc.execute_action", {
      tool: "get-api-v1-channels.list",
    });
    assert.equal(execute.response.status, 200, JSON.stringify(execute.payload));
    assert.equal(execute.payload.result.status, "needs_auth");
    assert.deepEqual(execute.payload.result.missingFields, ["authToken", "userId"]);

    const configured = await callTool("rc.server.overview", {
      baseUrl: API_BASE_URL,
      authToken: "token-123",
      userId: "user-123",
    });
    assert.equal(configured.response.status, 200);
    assert.equal(configured.payload.result.authConfigured.configured, true);
    assert.equal(configured.payload.result.authStatus.configured, true);

    const executeAfterAuth = await callTool("rc.execute_action", {
      tool: "get-api-v1-channels.list",
    });
    assert.equal(executeAfterAuth.response.status, 200, JSON.stringify(executeAfterAuth.payload));
    assert.equal(executeAfterAuth.payload.result.status, "ok");
    assert.equal(executeAfterAuth.payload.result.tool.key, "get-api-v1-channels.list");
  } finally {
    if (fs.existsSync(AUTH_STATE_PATH)) {
      fs.rmSync(AUTH_STATE_PATH, { force: true });
    }
    runtimeChild.kill("SIGTERM");
    controlChild.kill("SIGTERM");
    await once(runtimeChild, "exit");
    await once(controlChild, "exit");
    await new Promise((resolve) => apiServer.close(resolve));
  }
});

test("local generation bridge can plan from scratch", async () => {
  const output = execFileSync(
    process.execPath,
    ["src/cli/mcp-generate.js", "plan", "manage channels and direct messages"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      encoding: "utf8",
    }
  );

  const payload = JSON.parse(output);
  assert.equal(typeof payload.query, "string");
  assert.ok(Array.isArray(payload.selectedEndpoints));
  assert.ok(Array.isArray(payload.workflows));
  assert.ok(payload.workflows.length > 0);
  assert.equal(
    payload.workflows.every((workflow) => workflow.scope === "serve-only"),
    true,
  );
});

test("summary-oriented planning preserves llm workflow steps", async () => {
  const output = execFileSync(
    process.execPath,
    ["src/cli/mcp-generate.js", "plan", "scan all messages and give me a summary of all messages"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      encoding: "utf8",
    },
  );

  const payload = JSON.parse(output);
  assert.ok(Array.isArray(payload.workflows));
  const summaryWorkflow = payload.workflows.find(
    (workflow) => workflow.key === "summarize_messages",
  );
  assert.ok(summaryWorkflow);
  assert.equal(summaryWorkflow.steps[0].action, "messages.list");
  assert.equal(summaryWorkflow.steps[1].action, "summarization.generate");
});

test("workflow-first planning defers endpoint selection until generate time", async () => {
  const output = execFileSync(
    process.execPath,
    ["src/cli/mcp-generate.js", "plan", "onboard every new user with welcome message"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      encoding: "utf8",
    },
  );

  const payload = JSON.parse(output);
  assert.deepEqual(payload.selectedEndpoints, []);
  assert.ok(Array.isArray(payload.workflows));
  const onboardWorkflow = payload.workflows.find(
    (workflow) => workflow.key === "onboard_member",
  );
  assert.ok(onboardWorkflow);
  assert.equal(onboardWorkflow.steps[0].key, "lookup_user");
  assert.equal(
    onboardWorkflow.steps[0].description,
    "Look up the user by username.",
  );
  assert.equal(onboardWorkflow.steps[0].action, "user.lookup");
  assert.equal("tool" in onboardWorkflow.steps[0], false);
  assert.equal("args" in onboardWorkflow.steps[0], false);

  const applyOutput = execFileSync(
    process.execPath,
    ["src/cli/mcp-generate.js", "apply", "--from-confirmed-workflow"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: API_BASE_URL,
      },
      encoding: "utf8",
    },
  );

  const applied = JSON.parse(applyOutput);
  assert.ok(applied.selectedEndpoints.includes("get-api-v1-users.list"));
  assert.ok(applied.selectedEndpoints.includes("post-api-v1-channels.create"));
  assert.ok(applied.selectedEndpoints.includes("post-api-v1-chat.postMessage"));
  assert.ok(Array.isArray(applied.workflows[0].steps[0].candidateEndpoints));
  assert.ok(applied.workflows[0].steps[0].candidateEndpoints.length >= 2);
  const generatedWorkflowPath = path.join(WORKFLOW_CACHE_DIR, "onboard_member.js");
  assert.equal(fs.existsSync(generatedWorkflowPath), true);
  const generatedWorkflowSource = fs.readFileSync(generatedWorkflowPath, "utf8");
  assert.match(generatedWorkflowSource, /"tool": "get-api-v1-users\.list"/);
  assert.doesNotMatch(generatedWorkflowSource, /candidateEndpoints/);
});

test("different queries rewrite workflow drafts and generated workflow modules", async () => {
  execFileSync(
    process.execPath,
    ["src/cli/mcp-generate.js", "plan", "onboard every new user with welcome message"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      stdio: "ignore",
    },
  );

  execFileSync(
    process.execPath,
    ["src/cli/mcp-generate.js", "apply", "--from-confirmed-workflow"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: API_BASE_URL,
      },
      stdio: "ignore",
    },
  );

  const firstWorkflowSource = fs.readFileSync(
    path.join(WORKFLOW_CACHE_DIR, "onboard_member.js"),
    "utf8",
  );
  assert.match(firstWorkflowSource, /"tool": "get-api-v1-users\.list"/);

  execFileSync(
    process.execPath,
    ["src/cli/mcp-generate.js", "plan", "manage channels and direct messages"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      stdio: "ignore",
    },
  );

  const confirmedWorkflow = JSON.parse(
    fs.readFileSync(path.join(TOOL_CACHE_DIR, "confirmed_workflow.json"), "utf8"),
  );
  assert.equal(confirmedWorkflow.query, "manage channels and direct messages");
  assert.ok(Array.isArray(confirmedWorkflow.workflows));
  assert.ok(confirmedWorkflow.workflows.length > 0);

  execFileSync(
    process.execPath,
    ["src/cli/mcp-generate.js", "apply", "--from-confirmed-workflow"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: API_BASE_URL,
      },
      stdio: "ignore",
    },
  );

  const generatedWorkflowFiles = fs.readdirSync(WORKFLOW_CACHE_DIR).filter((file) => file.endsWith(".js"));
  assert.equal(generatedWorkflowFiles.includes("onboard_member.js"), false);
  assert.ok(generatedWorkflowFiles.length >= 1);
});

test("generate rewrites last_selection and clears stale tool_cache directories", async () => {
  fs.rmSync(TOOL_CACHE_DIR, { recursive: true, force: true });

  execFileSync(
    process.execPath,
    ["src/index.js", "--endpoints", "get-api-v1-channels.list", "--no-server"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: API_BASE_URL,
      },
      stdio: "ignore",
    }
  );

  fs.mkdirSync(path.join(TOOL_CACHE_DIR, "stale-dir"), { recursive: true });
  fs.writeFileSync(path.join(TOOL_CACHE_DIR, "stale-dir", "stale.txt"), "stale", "utf8");

  execFileSync(
    process.execPath,
    ["src/index.js", "--endpoints", "get-api-v1-im.list", "--no-server"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: API_BASE_URL,
      },
      stdio: "ignore",
    }
  );

  assert.equal(fs.existsSync(path.join(TOOL_CACHE_DIR, "stale-dir")), false);
  assert.equal(fs.existsSync(LAST_SELECTION_PATH), true);

  const selection = JSON.parse(fs.readFileSync(LAST_SELECTION_PATH, "utf8"));
  assert.deepEqual(selection.selectedEndpoints, ["get-api-v1-im.list"]);
  assert.ok(Array.isArray(selection.workflows));
  assert.ok(selection.workflows.length > 0);
});

test("saved serve-only workflows can be listed and executed later", async () => {
  execFileSync(
    process.execPath,
    [
      "src/index.js",
      "--endpoints",
      "get-api-v1-users.list,post-api-v1-channels.create,get-api-v1-channels.info,post-api-v1-channels.invite,post-api-v1-chat.postMessage",
      "--no-server",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: API_BASE_URL,
      },
      stdio: "ignore",
    },
  );

  const apiServer = await startApiStub();
  const { runtimeChild, controlChild, ready } = startServer();
  try {
    await ready;

    assert.equal(fs.existsSync(path.join(WORKFLOW_CACHE_DIR, "onboard_member.js")), true);

    await callTool("rc.server.overview", {
      baseUrl: API_BASE_URL,
      authToken: "token-123",
      userId: "user-123",
    });

    const workflowsResponse = await callTool("rc.list_workflows");
    assert.equal(workflowsResponse.response.status, 200);
    assert.ok(Array.isArray(workflowsResponse.payload.result.workflows));
    assert.ok(
      workflowsResponse.payload.result.workflows.some(
        (workflow) => workflow.key === "onboard_member",
      ),
    );

    const executeWorkflow = await callTool("rc.execute_workflow", {
      workflow: "onboard_member",
      input: {
        username: "new_user",
        channelName: "team-updates",
      },
    });
    assert.equal(executeWorkflow.response.status, 200, JSON.stringify(executeWorkflow.payload));
    assert.equal(executeWorkflow.payload.result.status, "ok");
    assert.equal(executeWorkflow.payload.result.workflow.key, "onboard_member");
    assert.equal(executeWorkflow.payload.result.steps.length, 5);
  } finally {
    if (fs.existsSync(AUTH_STATE_PATH)) {
      fs.rmSync(AUTH_STATE_PATH, { force: true });
    }
    runtimeChild.kill("SIGTERM");
    controlChild.kill("SIGTERM");
    await once(runtimeChild, "exit");
    await once(controlChild, "exit");
    await new Promise((resolve) => apiServer.close(resolve));
  }
});

test("final endpoint fallback returns concrete operation ids", async () => {
  const result = await finalEndpoints("create a channel and send a dm", {
    rooms: ["Channels"],
    messaging: ["Chat", "DM"],
  });

  assert.equal(result.success, true);
  assert.ok(result.gemini.length > 0);

  const selectedEndpoints = result.gemini.split(",").filter(Boolean);
  assert.ok(selectedEndpoints.length > 0);
  assert.equal(selectedEndpoints.some((endpoint) => endpoint.includes("undefined")), false);
  assert.equal(selectedEndpoints.every((endpoint) => endpoint.includes("-api-v1-")), true);
  assert.ok(selectedEndpoints.includes("post-api-v1-channels.create"));
});

test("server overview combines status, auth, configure, and validation", async () => {
  if (fs.existsSync(AUTH_STATE_PATH)) {
    fs.rmSync(AUTH_STATE_PATH, { force: true });
  }

  execFileSync(process.execPath, ["src/index.js", "--from-last-selection", "--no-server"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BASE_URL: API_BASE_URL,
    },
    stdio: "ignore",
  });

  const apiServer = await startApiStub();
  const { runtimeChild, controlChild, ready } = startServer();
  try {
    await ready;

    const initialOverview = await callTool("rc.server.overview");
    assert.equal(initialOverview.response.status, 200);
    assert.equal(typeof initialOverview.payload.result.serverStatus.runtimeReachable, "boolean");
    assert.equal(initialOverview.payload.result.authStatus.configured, false);
    assert.equal(typeof initialOverview.payload.result.runtimeValidation.ok, "boolean");

    const configuredOverview = await callTool("rc.server.overview", {
      baseUrl: API_BASE_URL,
      authToken: "token-123",
      userId: "user-123",
    });
    assert.equal(configuredOverview.response.status, 200);
    assert.equal(configuredOverview.payload.result.authConfigured.configured, true);
    assert.equal(configuredOverview.payload.result.authStatus.configured, true);
    assert.equal(
      configuredOverview.payload.result.serverStatus.auth.configured,
      true,
    );
  } finally {
    if (fs.existsSync(AUTH_STATE_PATH)) {
      fs.rmSync(AUTH_STATE_PATH, { force: true });
    }
    runtimeChild.kill("SIGTERM");
    controlChild.kill("SIGTERM");
    await once(runtimeChild, "exit");
    await once(controlChild, "exit");
    await new Promise((resolve) => apiServer.close(resolve));
  }
});

test("rc.list_tools exposes input schema context for LLM tool selection", async () => {
  execFileSync(process.execPath, ["src/index.js", "--endpoints", "post-api-v1-chat.sendMessage", "--no-server"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BASE_URL: API_BASE_URL,
    },
    stdio: "ignore",
  });

  const apiServer = await startApiStub();
  const { runtimeChild, controlChild, ready } = startServer();
  try {
    await ready;

    const toolsResponse = await callTool("rc.list_tools");
    assert.equal(toolsResponse.response.status, 200);

    const sendMessageTool = toolsResponse.payload.result.tools.find(
      (tool) => tool.key === "post-api-v1-chat.sendMessage",
    );

    assert.ok(sendMessageTool);
    assert.ok(sendMessageTool.input);
    assert.ok(sendMessageTool.input.requestSchema);
    assert.ok(Array.isArray(sendMessageTool.input.requiredBodyFields));
    assert.ok(sendMessageTool.input.requiredBodyFields.includes("message"));
  } finally {
    runtimeChild.kill("SIGTERM");
    controlChild.kill("SIGTERM");
    await once(runtimeChild, "exit");
    await once(controlChild, "exit");
    await new Promise((resolve) => apiServer.close(resolve));
  }
});
