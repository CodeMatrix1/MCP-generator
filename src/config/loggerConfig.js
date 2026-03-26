import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { format } from "node:util";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const logFile = process.env.LOG_FILE || path.join(projectRoot, "Masterlog.log");
const fileLoggingEnabled = process.env.LOG_TO_FILE !== "false";
const levelOrder = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};
const configuredLevel = String(process.env.LOG_LEVEL || "info").toLowerCase();
const activeLevel = levelOrder[configuredLevel] ?? levelOrder.info;

function shouldLog(level) {
  return (levelOrder[level] ?? levelOrder.info) >= activeLevel;
}

function writeToFile(level, message) {
  if (!fileLoggingEnabled) return;

  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(
      logFile,
      `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}\n`,
      "utf8",
    );
  } catch {
    // Logging should never break the caller.
  }
}

function emit(level, stream, args) {
  if (!shouldLog(level)) return;

  const message = format(...args);
  stream.write(`${message}\n`);
  writeToFile(level, message);
}

export function resetLogFile(targetPath = logFile) {
  if (!fileLoggingEnabled) return;

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "", "utf8");
  } catch {
    // Logging should never break the caller.
  }
}

export const logger = {
  debug: (...args) => emit("debug", process.stdout, args),
  info: (...args) => emit("info", process.stdout, args),
  warn: (...args) => emit("warn", process.stderr, args),
  error: (...args) => emit("error", process.stderr, args),
};
