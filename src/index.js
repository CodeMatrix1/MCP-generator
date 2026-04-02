import { spawn } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import dotenv from "dotenv";
import { Command } from "commander";
import {
  generateFromSelection,
  loadConfirmedWorkflow,
  loadLastSelection,
  parseEndpointCsv,
  saveConfirmedWorkflow,
} from "./generation/service.js";
import {
  draftSelection,
  finalizeSelection,
} from "./selection/service.js";
import { confirmIntent } from "./selection/ConfirmIntent.js";
import { getRuntimeHost, getRuntimePort } from "./config/ports.js";
import { syncGeminiExtension } from "./config/geminiExtension.js";
import { logger } from "./config/loggerConfig.js";

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
      logger.info(`Killed process ${pid} on port ${port}`);
    }
  } catch {
    logger.info(`No process found on port ${port}`);
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
      logger.info(`Stopped MCP server pid ${pid}`);
    } catch (err) {
      logger.error(`Failed to stop MCP server pid ${pid}: ${err.message}`);
    }
    removePidFile();
    return;
  }

  removePidFile();
  if (isPortInUse(RUNTIME_PORT)) killPort(RUNTIME_PORT);

  logger.info("Runtime MCP server is not running.");
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
    const output = execSync(`lsof -t -i:${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const program = new Command();

  program
    .name("mcp-synth")
    .allowUnknownOption(true)
    .argument("[query...]")
    .option("-q, --query <query>", "User query for endpoint selection")
    .option(
      "--endpoints <endpoints>",
      "Comma-separated endpoint ids to use directly",
    )
    .option(
      "--from-last-selection",
      "Reuse the most recently generated endpoint set",
    )
    .option(
      "--from-confirmed-workflow",
      "Resume from the most recently saved draft workflow",
    )
    .option(
      "--draft-only",
      "Stop after drafting the workflow and save it for approval",
    )
    .option(
      "--intent-confirmed",
      "Skip intent confirmation and continue the workflow graph",
    )
    .option(
      "--auto-approve",
      "Skip the draft approval prompt and continue automatically",
    )
    .option(
      "--start-server",
      "Start MCP server after generation or from saved selection",
    )
    .option("--stop-server", "Stop the running MCP server")
    .option(
      "--restart-server",
      "Restart the MCP server after generation or from saved selection",
    )
    .option("--status", "Show MCP server status")
    .option("--no-server", "Only run prompting + tool generation")
    .option("--json", "Print machine-readable JSON summary")
    .helpOption("-h, --help", "Show this help");

  program.parse([process.argv[0], process.argv[1], ...argv]);

  const options = program.opts();
  const positionalQuery = program.processedArgs[0]?.join(" ") || "";
  const args = {
    query: typeof options.query === "string" ? options.query : positionalQuery,
    endpoints: typeof options.endpoints === "string" ? options.endpoints : "",
    fromLastSelection: Boolean(options.fromLastSelection),
    fromConfirmedWorkflow: Boolean(options.fromConfirmedWorkflow),
    draftOnly: Boolean(options.draftOnly),
    intentConfirmed: Boolean(options.intentConfirmed),
    autoApprove: Boolean(options.autoApprove),
    startServer: options.server,
    stopServer: Boolean(options.stopServer),
    restartServer: Boolean(options.restartServer),
    statusOnly: Boolean(options.status),
    json: Boolean(options.json),
    help: false,
  };

  if (options.startServer) {
    args.startServer = true;
  }

  if (args.stopServer) {
    args.startServer = false;
  }

  if (args.restartServer) {
    args.startServer = true;
  }

  if (args.statusOnly) {
    args.startServer = false;
  }

  return args;
}

const formatEndpoints = (str) =>
  str
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e, i) => `${i + 1}. ${e}`)
    .join("\n");

function summarizeWorkflowDraft(selectionSummary) {
  const clamp = (value, limit = 90) => {
    const text = String(value || "").trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1).trim()}…`;
  };

  const refined = selectionSummary?.refinedWorkflow && typeof selectionSummary.refinedWorkflow === "object"
    ? [selectionSummary.refinedWorkflow]
    : [];
  const workflows = refined.length > 0 ? refined : (selectionSummary?.workflows || []);

  return workflows
    .map((workflow, workflowIndex) => {
      const steps = (workflow?.steps || [])
        .map((step, index) => `  ${index + 1}. ${step.key} — ${clamp(step.description || step.purpose || "")}`)
        .join("\n");
      const label = workflow?.label || workflow?.key || "Workflow";
      return `Workflow ${workflowIndex + 1}: ${label}\n${steps}`;
    })
    .join("\n\n");
}

function startMcpServer(selectedEndpoints) {
  logger.info("\nStarting runtime MCP server with selected tools...");
  const serverEntry = path.resolve(__dirname, "MCP_Runtime_Server.js");

  if (isPortInUse(RUNTIME_PORT)) {
    logger.info(
      `Runtime MCP server already running on ${RUNTIME_HOST}:${RUNTIME_PORT}. Logs: ${SERVER_LOG_PATH}`,
    );
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
      stdio: ["ignore", logFd, logFd],
      env: process.env,
    },
  );

  proc.unref();
  fs.closeSync(logFd);
  writePidFile(proc.pid);

  logger.info(
    `Runtime MCP server started on ${RUNTIME_HOST}:${RUNTIME_PORT} (pid ${proc.pid}). Gemini manifest synced at ${manifestPath}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.stopServer) {
    stopMcpServer();
    return;
  }

  if (args.statusOnly) {
    const status = getServerStatus();
    const payload = JSON.stringify(status, null, 2);
    logger.info(payload);
    return;
  }

  let selectedEndpoints = [];
  let selectionSummary = null;

  if (args.endpoints) {
    selectedEndpoints = parseEndpointCsv(args.endpoints);
  } else if (args.fromLastSelection) {
    const lastSelection = loadLastSelection();
    selectedEndpoints = lastSelection.selectedEndpoints || [];
    selectionSummary = lastSelection;
  } else if (args.fromConfirmedWorkflow) {
    const confirmedWorkflow = loadConfirmedWorkflow();
    let selection;
    try {
      selection = await finalizeSelection(confirmedWorkflow);
    } catch (err) {
      if (err?.selection) {
        saveConfirmedWorkflow(err.selection);
      }
      throw err;
    }
    saveConfirmedWorkflow(selection);
    selectionSummary = await generateFromSelection(selection);
    selectedEndpoints = selectionSummary.selectedEndpoints || [];
  } else {
    const userQuery = String(args.query || "").trim();
    if (!userQuery && args.intentConfirmed) {
      const confirmedWorkflow = loadConfirmedWorkflow();
      args.query = String(confirmedWorkflow?.query || "").trim();
      if (!args.query) {
        throw new Error("No saved query found for --intent-confirmed.");
      }
    }

    if (!String(args.query || "").trim()) {
      const rl = readline.createInterface({ input, output });
      const answer = await rl.question("What Rocket.Chat MCP do you want to generate? ");
      rl.close();
      args.query = answer.trim();
    }

    if (args.draftOnly && !args.intentConfirmed) {
      const intentResult = await confirmIntent(args.query);
      let intentConfirmation = {};
      try {
        intentConfirmation = JSON.parse(intentResult?.gemini || "{}");
      } catch {
        intentConfirmation = {};
      }

      const intentPayload = {
        query: args.query,
        intentConfirmation,
        tokenUsage: { input: intentResult?.tokenMetrics || 0, output: 0 },
        approvalRequired: true,
        resumeArgs: ["--intent-confirmed"],
      };
      saveConfirmedWorkflow(intentPayload);

      if (args.json) {
        logger.info(JSON.stringify(intentPayload, null, 2));
        return;
      }

      logger.info("Intent confirmation required before drafting.");
      logger.info(JSON.stringify(intentConfirmation, null, 2));
      logger.info("Rerun with --intent-confirmed to continue.");
      return;
    }

    const resumedIntentConfirmation = args.intentConfirmed
      ? (() => {
          try {
            return loadConfirmedWorkflow()?.intentConfirmation || {};
          } catch {
            return {};
          }
        })()
      : {};

    const draft = await draftSelection(args.query, {
      intentConfirmed: args.intentConfirmed || args.autoApprove,
      intentConfirmation: resumedIntentConfirmation,
    });
    if (!draft.intentOnly) {
      saveConfirmedWorkflow(draft);
    }

    if (args.draftOnly) {
      const draftPayload = {
        query: draft.query,
        intentConfirmation: draft.intentConfirmation || {},
        candidateEndpoints: draft.candidateEndpoints || [],
        selectedEndpoints: draft.selectedEndpoints || [],
        tokenUsage: draft.tokenUsage || { input: 0, output: 0 },
        draftWorkflow: draft.draftWorkflow || null,
        refinedWorkflow: draft.refinedWorkflow || null,
        finalWorkflow: draft.finalWorkflow || null,
        mappedWorkflow: draft.mappedWorkflow || null,
        workflows: draft.workflows || [],
        approvalRequired: true,
        resumeArgs: ["--from-confirmed-workflow", "--no-server"],
      };

      if (args.json) {
        logger.info(JSON.stringify(draftPayload, null, 2));
        return;
      }

      logger.info("Draft workflow saved. Review it below and rerun with --from-confirmed-workflow after approval.");
      logger.info(`\n${summarizeWorkflowDraft(draft)}`);
      return;
    }

    let approved = Boolean(args.autoApprove);
    if (!approved) {
      logger.info("Draft workflow prepared for approval:");
      logger.info(`\n${summarizeWorkflowDraft(draft)}`);
      const rl = readline.createInterface({ input, output });
      const answer = await rl.question("\nApprove this draft workflow and continue? (y/N) ");
      rl.close();
      approved = /^(y|yes)$/i.test(String(answer || "").trim());
    }

    if (!approved) {
      logger.info("Draft workflow saved. Rerun with --from-confirmed-workflow after approval.");
      return;
    }

    let selection;
    try {
      selection = await finalizeSelection(draft);
    } catch (err) {
      if (err?.selection) {
        saveConfirmedWorkflow(err.selection);
        if (args.json) {
          logger.info(JSON.stringify(err.selection, null, 2));
          return;
        }
      }
      throw err;
    }

    selectionSummary = await generateFromSelection(selection);
    selectedEndpoints = selectionSummary.selectedEndpoints || [];
  }

  if (selectedEndpoints.length === 0) {
    throw new Error("No endpoints selected or loaded.");
  }

  if (!selectionSummary) {
    const generated = await generateFromSelection({
      query: args.query || "",
      selectedEndpoints,
    });
    selectionSummary = generated;
  }

  if (args.restartServer) {
    stopMcpServer();
  }

  if (args.startServer !== false) {
    startMcpServer(selectedEndpoints);
  }

  const responsePayload = {
    query: selectionSummary.query || args.query || "",
    selectedEndpoints,
    tokenUsage: selectionSummary.tokenUsage || { input: 0, output: 0 },
    draftWorkflow: selectionSummary.draftWorkflow || null,
    refinedWorkflow: selectionSummary.refinedWorkflow || null,
    validatedWorkflow: selectionSummary.validatedWorkflow || null,
    finalWorkflow: selectionSummary.finalWorkflow || null,
    mappedWorkflow: selectionSummary.mappedWorkflow || null,
    mappedSteps: selectionSummary.mappedSteps || [],
    generation: selectionSummary.generation,
    workflows: selectionSummary.workflows || [],
    server: getServerStatus(),
  };

  if (args.json) {
    logger.info(JSON.stringify(responsePayload, null, 2));
    return;
  }

  logger.info("\nFinal Endpoints:\n" + formatEndpoints(selectedEndpoints.join(",")));
  logger.info("\nToken Usage:\n" +
    `Input: ${responsePayload.tokenUsage.input || 0}\nOutput: ${responsePayload.tokenUsage.output || 0}`);
  logger.info(`\nSelected Tools: ${selectedEndpoints.length}`);
  if (responsePayload.generation) {
    logger.info(
      `Generated ${responsePayload.generation.generatedCount} tools, skipped ${responsePayload.generation.skippedCount}. Manifest: ${responsePayload.generation.manifestPath}`,
    );
  }
}

main().catch((err) => {
  logger.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
