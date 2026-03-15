import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RUNTIME_PORT = 3012;
const CONTROL_PORT = 3013;
const RUNTIME_BASE_URL = `http://127.0.0.1:${RUNTIME_PORT}`;
const CONTROL_BASE_URL = `http://127.0.0.1:${CONTROL_PORT}`;
const API_PORT = 3210;
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const AUTH_STATE_PATH = path.join(process.cwd(), ".mcp-auth.json");

function startApiStub() {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/v1/channels.list") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ channels: [{ _id: "general", name: "general" }] }));
      return;
    }

    if (req.url === "/api/v1/dm.list") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ims: [{ _id: "dm1", usernames: ["rocket.cat"] }] }));
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

    const status = await callTool("rc.server.status");
    assert.equal(status.response.status, 200);
    assert.equal(status.payload.result.runtimeServer.port, String(RUNTIME_PORT));
    assert.equal(status.payload.result.controlServer.port, String(CONTROL_PORT));

    const validation = await callTool("rc.server.validate");
    assert.equal(validation.response.status, 200);
    assert.equal(typeof validation.payload.result.ok, "boolean");

    const authStatus = await callTool("rc.auth.status");
    assert.equal(authStatus.response.status, 200);
    assert.equal(authStatus.payload.result.configured, false);
    assert.deepEqual(authStatus.payload.result.missingFields, ["authToken", "userId"]);

    const execute = await callTool("rc.execute_action", { request: "list channels" });
    assert.equal(execute.response.status, 200, JSON.stringify(execute.payload));
    assert.equal(execute.payload.result.status, "needs_auth");
    assert.deepEqual(execute.payload.result.missingFields, ["authToken", "userId"]);

    const configured = await callTool("rc.auth.configure", {
      baseUrl: API_BASE_URL,
      authToken: "token-123",
      userId: "user-123",
    });
    assert.equal(configured.response.status, 200);
    assert.equal(configured.payload.result.configured, true);

    const executeAfterAuth = await callTool("rc.execute_action", { request: "list channels" });
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
    ["scripts/mcp-generate.js", "plan", "manage channels and direct messages"],
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
  assert.ok(payload.selectedEndpoints.length > 0);
});
