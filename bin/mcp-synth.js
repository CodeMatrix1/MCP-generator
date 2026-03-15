#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const entry = path.resolve(__dirname, "..", "src", "index.js");

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: false,
  cwd: repoRoot,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
