#!/usr/bin/env node
import process from "node:process";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  generateFromQuery,
  generateFromSelection,
  loadLastSelection,
  synthesizeSelection,
} from "../src/generation/service.js";

dotenv.config({ quiet: true });

import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const LAST_SELECTION_PATH = path.join(
  projectRoot,
  "src",
  "tool_cache",
  "last_selection.json"
);

function saveLastSelection(result) {
  const selection = {
    query: result.query,
    selectedEndpoints: result.selectedEndpoints,
    tokenUsage: result.tokenUsage,
  };

  fs.writeFileSync(
    LAST_SELECTION_PATH,
    JSON.stringify(selection, null, 2),
    "utf8"
  );
}

function printUsage() {
  console.error("Usage:");
  console.error("  node scripts/mcp-generate.js plan <query>");
  console.error("  node scripts/mcp-generate.js apply <query>");
  console.error("  node scripts/mcp-generate.js apply --from-last-selection");
  console.error("  node scripts/mcp-generate.js apply-and-start --from-last-selection");
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exitCode = command ? 0 : 1;
    return;
  }

  if (command === "plan") {
    const query = rest.join(" ").trim();
    if (!query) {
      throw new Error("Missing query for plan.");
    }

    const plan = await synthesizeSelection(query);
    saveLastSelection(plan);
    console.log(
      JSON.stringify(
        {
          query: plan.query,
          parsedDomain: plan.parsedDomain,
          selectedEndpoints: plan.selectedEndpoints,
          tokenUsage: plan.tokenUsage,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "apply") {
    const fromLastSelection = rest.includes("--from-last-selection");

    if (fromLastSelection) {
      const selection = loadLastSelection();
      const result = await generateFromSelection(selection);
      console.log(
        JSON.stringify(
          {
            query: result.query,
            selectedEndpoints: result.selectedEndpoints,
            tokenUsage: result.tokenUsage,
            generation: result.generation,
          },
          null,
          2
        )
      );
      return;
    }

    const query = rest.join(" ").trim();
    if (!query) {
      throw new Error("Missing query for apply.");
    }

    const result = await generateFromQuery(query);
    console.log(
      JSON.stringify(
        {
          query: result.query,
          parsedDomain: result.parsedDomain,
          selectedEndpoints: result.selectedEndpoints,
          tokenUsage: result.tokenUsage,
          generation: result.generation,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "apply-and-start") {
    const fromLastSelection = rest.includes("--from-last-selection");
    let result;

    if (fromLastSelection) {
      const selection = loadLastSelection();
      result = await generateFromSelection(selection);
    } else {
      const query = rest.join(" ").trim();
      if (!query) {
        throw new Error("Missing query for apply-and-start.");
      }
      result = await generateFromQuery(query);
    }

    const runtimeOutput = execFileSync(
      process.execPath,
      [path.join(projectRoot, "src", "index.js"), "--from-last-selection", "--restart-server", "--json"],
      {
        cwd: projectRoot,
        env: process.env,
        encoding: "utf8",
      }
    );

    console.log(
      JSON.stringify(
        {
          query: result.query,
          selectedEndpoints: result.selectedEndpoints,
          tokenUsage: result.tokenUsage,
          generation: result.generation,
          runtimeStart: runtimeOutput.trim(),
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
