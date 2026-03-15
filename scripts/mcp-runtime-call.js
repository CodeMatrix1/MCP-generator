#!/usr/bin/env node
import process from "node:process";
import dotenv from "dotenv";
import { getRuntimeHost, getRuntimePort } from "../src/config/ports.js";

dotenv.config({ quiet: true });

function printUsage() {
  console.error("Usage: node scripts/mcp-runtime-call.js <tool-key> [args-json] [context-json]");
}

function parseJson(label, value, fallback) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid ${label} JSON: ${err.message}`);
  }
}

async function main() {
  const [, , toolKey, argsRaw, contextRaw] = process.argv;

  if (!toolKey) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const port = getRuntimePort();
  const host = getRuntimeHost();
  const baseUrl = `http://${host}:${port}`;
  const args = parseJson("args", argsRaw, {});
  const context = parseJson("context", contextRaw, {});

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
