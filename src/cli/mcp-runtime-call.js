#!/usr/bin/env node
import process from "node:process";
import dotenv from "dotenv";
import { Command } from "commander";
import { getRuntimeHost, getRuntimePort } from "../config/ports.js";
import { logger } from "../config/loggerConfig.js";
import {
  compileSchema,
  parseJsonWithSchema,
} from "../core/validation/structured.js";

dotenv.config({ quiet: true });

const validateJsonObject = compileSchema({
  type: "object",
  additionalProperties: true,
});

function parseObjectJson(label, value, fallback = {}) {
  if (value === undefined) return fallback;
  return parseJsonWithSchema(value, validateJsonObject, `${label} JSON`);
}

async function main() {
  const program = new Command();

  program
    .name("mcp-runtime-call")
    .usage("<tool-key> [args-json] [context-json]")
    .argument("<tool-key>")
    .argument("[args-json]")
    .argument("[context-json]")
    .helpOption("-h, --help", "Show this help");

  program.parse(process.argv);

  const [toolKey, argsRaw, contextRaw] = program.processedArgs;
  const port = getRuntimePort();
  const host = getRuntimeHost();
  const baseUrl = `http://${host}:${port}`;
  const args = parseObjectJson("args", argsRaw, {});
  const context = parseObjectJson("context", contextRaw, {});

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
  logger.error(err.message);
  process.exitCode = 1;
});
