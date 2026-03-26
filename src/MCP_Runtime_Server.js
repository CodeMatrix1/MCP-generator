import express from "express";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import dotenv from "dotenv";
import { getRuntimeHost, getRuntimePort } from "./config/ports.js";
import { logger } from "./config/loggerConfig.js";

dotenv.config({ quiet: true });

const app = express();
app.use(express.json());

const PROJECT_ROOT = process.cwd();
const TOOL_DIR = path.join(PROJECT_ROOT, "src", "tool_cache");
const LAST_SELECTION_PATH = path.join(TOOL_DIR, "last_selection.json");
const MANIFEST_PATH = path.join(TOOL_DIR, "manifest.json");
const RUNTIME_PORT = getRuntimePort();
const RUNTIME_HOST = getRuntimeHost();

const tools = new Map();
const metaList = [];

function registerTool(meta, toolFn) {
  tools.set(meta.key, toolFn);
  metaList.push(meta);
}

function readJsonFile(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function validateRuntimeState() {
  const selection = readJsonFile(LAST_SELECTION_PATH, {});
  const manifest = readJsonFile(MANIFEST_PATH, {});
  const selectedEndpoints = Array.isArray(selection.selectedEndpoints)
    ? selection.selectedEndpoints
    : [];
  const loadedKeys = new Set(metaList.map((meta) => meta.key));

  const missingFromRuntime = selectedEndpoints.filter((key) => !loadedKeys.has(key));
  const extraInRuntime = metaList
    .map((meta) => meta.key)
    .filter((key) => !selectedEndpoints.includes(key));

  return {
    ok: missingFromRuntime.length === 0,
    selectedEndpointCount: selectedEndpoints.length,
    loadedGeneratedToolCount: metaList.length,
    missingFromRuntime,
    extraInRuntime,
    manifestGeneratedCount: Number(manifest.generatedCount || 0),
    runtimeServer: {
      host: RUNTIME_HOST,
      port: RUNTIME_PORT,
      url: `http://${RUNTIME_HOST}:${RUNTIME_PORT}`,
    },
  };
}

export async function loadTools(dir, allowedTools = null) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "workflows") continue;
      await loadTools(fullPath, allowedTools);
      continue;
    }

    if (!entry.name.endsWith(".js")) continue;

    const mod = await import(pathToFileURL(fullPath));
    const toolFn = mod.default;
    const meta = mod.meta;

    if (!meta?.key || typeof toolFn !== "function") continue;
    if (allowedTools && !allowedTools.includes(meta.key)) continue;

    registerTool({ ...meta, origin: "generated" }, toolFn);
    logger.info(`Loaded tool: ${meta.key}`);
  }
}

app.get("/tools", (req, res) => {
  res.json({ tools: metaList });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    validation: validateRuntimeState(),
  });
});

app.post("/call/:key", async (req, res) => {
  const tool = tools.get(req.params.key);
  if (!tool) {
    return res.status(404).json({ error: "Tool not found" });
  }

  try {
    const result = await tool(req.body.args || {}, req.body.context || {});
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const selectedArg = process.argv[2];
const selectedEndpoints = selectedArg
  ? selectedArg.split(",").map((endpoint) => endpoint.trim()).filter(Boolean)
  : null;

await loadTools(TOOL_DIR, selectedEndpoints);

const server = app.listen(RUNTIME_PORT, RUNTIME_HOST, () => {
  logger.info(`Runtime MCP Server running at http://${RUNTIME_HOST}:${RUNTIME_PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger.error(`Runtime MCP Server failed to start: http://${RUNTIME_HOST}:${RUNTIME_PORT} is already in use`);
    process.exit(1);
    return;
  }

  logger.error(`Runtime MCP Server failed to start: ${err.message}`);
  process.exit(1);
});
