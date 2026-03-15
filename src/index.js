import { spawn } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import dotenv from "dotenv";
import {
  generateFromQuery,
  generateFromSelection,
  loadLastSelection,
  parseEndpointCsv,
} from "./generation/service.js";
import { getRuntimeHost, getRuntimePort } from "./config/ports.js";
import { syncGeminiExtension } from "./config/geminiExtension.js";

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const SERVER_LOG_PATH = path.resolve(projectRoot, "mcp-runtime.log");
const SERVER_PID_PATH = path.resolve(projectRoot, ".mcp-runtime.pid");
const RUNTIME_PORT = getRuntimePort();
const RUNTIME_HOST = getRuntimeHost();

function killPort(port) {
  try {
    const pids = execSync(`lsof -t -i:${port}`, { encoding: "utf8" }).trim();
    if (!pids) return;

    for (const pid of pids.split("\n")) {
      execSync(`kill -9 ${pid}`);
      console.log(`Killed process ${pid} on port ${port}`);
    }
  } catch {
    console.log(`No process found on port ${port}`);
  }
}

function readPidFile() {
  try {
    if (!fs.existsSync(SERVER_PID_PATH)) return null;
    const pid = Number(fs.readFileSync(SERVER_PID_PATH, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writePidFile(pid) {
  fs.writeFileSync(SERVER_PID_PATH, String(pid), "utf8");
}

function removePidFile() {
  if (fs.existsSync(SERVER_PID_PATH)) {
    fs.rmSync(SERVER_PID_PATH, { force: true });
  }
}

function isPidRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopMcpServer() {
  const pid = readPidFile();

  if (pid && isPidRunning(pid)) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Stopped MCP server pid ${pid}`);
    } catch (err) {
      console.error(`Failed to stop MCP server pid ${pid}: ${err.message}`);
    }
    removePidFile();
    return;
  }

  removePidFile();
  if (isPortInUse(RUNTIME_PORT)) killPort(RUNTIME_PORT);

  console.log("Runtime MCP server is not running.");
}

function getServerStatus() {
  const pid = readPidFile();
  const pidRunning = isPidRunning(pid);

  return {
    pid,
    pidRunning,
    runtimeServer: {
      host: RUNTIME_HOST,
      port: RUNTIME_PORT,
      portInUse: isPortInUse(RUNTIME_PORT),
    },
    logPath: SERVER_LOG_PATH,
    pidPath: SERVER_PID_PATH,
  };
}

function isPortInUse(port) {
  try {
    const output = execSync(`lsof -t -i:${port}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const args = {
    query: "",
    endpoints: "",
    fromLastSelection: false,
    startServer: true,
    stopServer: false,
    restartServer: false,
    statusOnly: false,
    json: false,
    help: false,
  };

  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (token === "--no-server") {
      args.startServer = false;
      continue;
    }

    if (token === "--json") {
      args.json = true;
      continue;
    }

    if (token === "--query" || token === "-q") {
      args.query = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--endpoints") {
      args.endpoints = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--from-last-selection") {
      args.fromLastSelection = true;
      continue;
    }

    if (token === "--start-server") {
      args.startServer = true;
      continue;
    }

    if (token === "--stop-server") {
      args.stopServer = true;
      args.startServer = false;
      continue;
    }

    if (token === "--restart-server") {
      args.restartServer = true;
      args.startServer = true;
      continue;
    }

    if (token === "--status") {
      args.statusOnly = true;
      args.startServer = false;
      continue;
    }

    positional.push(token);
  }

  if (!args.query && positional.length > 0) {
    args.query = positional.join(" ");
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  mcp-synth --query "Create an MCP for channel and users"
  mcp-synth
  node src/index.js --query "Create an MCP for channel and users"

Options:
  -q, --query       User query for endpoint selection
      --endpoints   Comma-separated endpoint ids to use directly
      --from-last-selection Reuse the most recently generated endpoint set
      --status      Show MCP server status
      --stop-server Stop the running MCP server
      --restart-server Restart the MCP server after generation or from saved selection
      --no-server   Only run prompting + tool generation (do not start MCP server)
      --json        Print machine-readable JSON summary
  -h, --help        Show this help`);
}

const formatEndpoints = (str) =>
  str
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e, i) => `${i + 1}. ${e}`)
    .join("\n");

function startMcpServer(selectedEndpoints) {
  console.log("\nStarting runtime MCP server with selected tools...");
  const serverEntry = path.resolve(__dirname, "MCP_Runtime_Server.js");

  if (isPortInUse(RUNTIME_PORT)) {
    console.log(`Runtime MCP server already running on ${RUNTIME_HOST}:${RUNTIME_PORT}. Logs: ${SERVER_LOG_PATH}`);
    return;
  }

  const manifestPath = syncGeminiExtension({
    projectRoot,
    runtimeHost: RUNTIME_HOST,
    runtimePort: RUNTIME_PORT,
  });

  const logFd = fs.openSync(SERVER_LOG_PATH, "a");

  const proc = spawn(
    process.execPath,
    [serverEntry, selectedEndpoints.join(",")],
    {
      cwd: path.resolve(__dirname, ".."),
      detached: true,
      shell: false,
      stdio: ["ignore", logFd, logFd],
    }
  );

  writePidFile(proc.pid);
  proc.unref();
  fs.closeSync(logFd);
  console.log(
    `Runtime MCP server launched at http://${RUNTIME_HOST}:${RUNTIME_PORT}. Manifest: ${manifestPath}. Logs: ${SERVER_LOG_PATH}`
  );
}

async function run() {

  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.statusOnly) {
    const status = getServerStatus();
    if (args.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log("Runtime MCP Server Status:");
      console.log(`PID: ${status.pid ?? "none"}`);
      console.log(`PID Running: ${status.pidRunning}`);
      console.log(`Runtime: ${status.runtimeServer.host}:${status.runtimeServer.port}`);
      console.log(`Runtime In Use: ${status.runtimeServer.portInUse}`);
      console.log(`Logs: ${status.logPath}`);
    }
    return;
  }

  if (args.stopServer) {
    stopMcpServer();
    return;
  }

  if (args.restartServer) {
    stopMcpServer();
  }

  let selectedEndpoints = [];
  let userQuery = args.query.trim();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let selectionSource = "query";
  let selectionSummary = null;
  let generation = null;

  if (args.endpoints.trim()) {
    selectedEndpoints = parseEndpointCsv(args.endpoints);
    selectionSource = "endpoints";
  } else if (args.fromLastSelection) {
    const lastSelection = loadLastSelection();
    selectedEndpoints = Array.isArray(lastSelection.selectedEndpoints)
      ? lastSelection.selectedEndpoints.filter(Boolean)
      : [];
    userQuery = String(lastSelection.query || "").trim();
    totalInputTokens = Number(lastSelection.tokenUsage?.input || 0);
    totalOutputTokens = Number(lastSelection.tokenUsage?.output || 0);
    selectionSource = "last-selection";
  }

  if (selectedEndpoints.length === 0 && !userQuery) {
    const rl = readline.createInterface({ input, output });
    try {
      userQuery = (await rl.question("Enter user query: ")).trim();
    } finally {
      rl.close();
    }
  }

  if (selectedEndpoints.length === 0 && !userQuery) {
    console.error("Missing query or endpoints.");
    process.exitCode = 1;
    return;
  }

  if (selectionSource === "query") {
    if (!userQuery) {
      console.error("Missing query.");
      process.exitCode = 1;
      return;
    }
    console.log("\nUser Query:", userQuery);

    fs.rmSync(path.join(projectRoot, "src", "tool_cache"), { recursive: true, force: true });
    killPort(RUNTIME_PORT);
    selectionSummary = await generateFromQuery(userQuery);
    console.log("\nSelected Domains:", selectionSummary.parsedDomain);
    console.log("\nFinal Endpoints:\n" + formatEndpoints(selectionSummary.selectedEndpoints.join(",")));

    totalInputTokens = selectionSummary.tokenUsage.input;
    totalOutputTokens = selectionSummary.tokenUsage.output;
    selectedEndpoints = selectionSummary.selectedEndpoints;
    generation = selectionSummary.generationFull;
  } else {
    if (userQuery) {
      console.log("\nUsing saved query:", userQuery);
    }
    console.log(`\nUsing endpoint selection source: ${selectionSource}`);
    console.log("\nFinal Endpoints:\n" + formatEndpoints(selectedEndpoints.join(",")));
    const generated = await generateFromSelection({
      query: userQuery,
      selectedEndpoints,
      tokenUsage: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
    });
    generation = generated.generationFull;
  }

  console.log("\nToken Usage:");
  console.log("Input:", totalInputTokens);
  console.log("Output:", totalOutputTokens);
  console.log("\nSelected Tools:", selectedEndpoints.length);

  console.log(
    `Generated ${generation.generatedCount} tools, skipped ${generation.skippedCount}. Manifest: ${generation.manifestPath}`
  );

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          query: userQuery,
          selectedEndpoints,
          tokenUsage: {
            input: totalInputTokens,
            output: totalOutputTokens,
          },
          generation: {
            generatedCount: generation.generatedCount,
            skippedCount: generation.skippedCount,
            manifestPath: generation.manifestPath,
          },
        },
        null,
        2
      )
    );
  }

  if (args.startServer) {
    startMcpServer(selectedEndpoints);
  }
}

run();
