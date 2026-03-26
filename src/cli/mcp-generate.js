#!/usr/bin/env node
import process from "node:process";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Command } from "commander";
import { logger, resetLogFile } from "../config/loggerConfig.js";

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

async function runPlan(queryParts) {
  const query = queryParts.join(" ").trim();
  if (!query) {
    throw new Error("Missing query for plan.");
  }

  resetLogFile();
  const planOutput = execFileSync(
    process.execPath,
    [path.join(projectRoot, "src", "index.js"), "--query", query, "--draft-only", "--no-server", "--json"],
    {
      cwd: projectRoot,
      env: process.env,
      encoding: "utf8",
    },
  );
  logger.info(planOutput.trim());
}

function buildIndexArgs(queryParts, options = {}, extraArgs = []) {
  const query = queryParts.join(" ").trim();
  if (!query && !options.fromConfirmedWorkflow) {
    throw new Error("Missing query.");
  }

  const args = options.fromConfirmedWorkflow
    ? ["--from-confirmed-workflow"]
    : ["--query", query];

  return [...args, ...extraArgs, "--json"];
}

function runIndexCommand(args) {
  resetLogFile();
  const output = execFileSync(
    process.execPath,
    [path.join(projectRoot, "src", "index.js"), ...args],
    {
      cwd: projectRoot,
      env: process.env,
      encoding: "utf8",
    },
  );
  logger.info(output.trim());
}

async function runApply(queryParts, options) {
  runIndexCommand(buildIndexArgs(queryParts, options, ["--no-server", "--auto-approve"]));
}

async function runApplyAndStart(queryParts, options) {
  runIndexCommand(buildIndexArgs(queryParts, options, ["--restart-server", "--auto-approve"]));
}

async function main() {
  const program = new Command();

  program
    .name("mcp-generate")
    .showHelpAfterError()
    .helpOption("-h, --help", "Show this help");

  program
    .command("plan")
    .argument("[query...]")
    .action((queryParts) => runPlan(queryParts));

  program
    .command("apply")
    .argument("[query...]")
    .option("--from-confirmed-workflow", "Reuse the confirmed workflow")
    .action((queryParts, options) => runApply(queryParts, options));

  program
    .command("apply-and-start")
    .argument("[query...]")
    .option("--from-confirmed-workflow", "Reuse the confirmed workflow")
    .action((queryParts, options) => runApplyAndStart(queryParts, options));

  await program.parseAsync(process.argv);

  if (process.argv.slice(2).length === 0) {
    program.outputHelp();
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
