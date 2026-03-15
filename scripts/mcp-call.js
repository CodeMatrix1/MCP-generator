#!/usr/bin/env node
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { getControlHost, getControlPort } from "../src/config/ports.js";

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const CONTROL_LOG_PATH = path.join(projectRoot, "mcp-control.log");

function printUsage() {
  console.error("Usage: node scripts/mcp-call.js <tool-key> [args-json] [context-json]");
}

function parseJson(label, value, fallback) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid ${label} JSON: ${err.message}`);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureControlServer(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (response.ok) return;
  } catch {
    // Control server not up yet.
  }

  const logFd = fs.openSync(CONTROL_LOG_PATH, "a");
  const child = spawn(process.execPath, [path.join(projectRoot, "src", "MCP_Server.js")], {
    cwd: projectRoot,
    detached: true,
    shell: false,
    stdio: ["ignore", logFd, logFd],
    env: process.env,
  });
  child.unref();
  fs.closeSync(logFd);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(200);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // keep trying
    }
  }

  throw new Error(`Control MCP server not reachable at ${baseUrl}`);
}

async function main() {
  const [, , toolKey, argsRaw, contextRaw] = process.argv;

  if (!toolKey) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const port = getControlPort();
  const host = getControlHost();
  const baseUrl = `http://${host}:${port}`;
  const args = parseJson("args", argsRaw, {});
  const context = parseJson("context", contextRaw, {});

  await ensureControlServer(baseUrl);

  const response = await fetch(`${baseUrl}/call/${toolKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args, context }),
  });

  const payload = await response.text();
  process.stdout.write(payload);

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
