import { execFile, spawn } from "node:child_process";
import { logger } from "../../config/loggerConfig.js";

export function sanitizeGeminiJson(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

const GEMINI_ARG_PROMPT_LIMIT = 16000;

function execGeminiPromptViaArgs(prompt, timeoutMs, maxBuffer) {
  const normalizedPrompt = String(prompt || "");
  return new Promise((resolve, reject) => {
    execFile(
      "gemini",
      ["-p", normalizedPrompt],
      { timeout: timeoutMs, maxBuffer },
      (err, stdout, stderr) => {
        const stdoutText = String(stdout || "").trim();
        const stderrText = String(stderr || "").trim();
        logger.debug(
          "[Gemini CLI] promptChars=%d stdoutChars=%d stderrChars=%d",
          normalizedPrompt.length,
          stdoutText.length,
          stderrText.length,
        );

        if (err) {
          const details = stderrText || stdoutText || err.message;
          reject(new Error(details));
          return;
        }

        resolve({ stdout: stdoutText, stderr: stderrText });
      },
    );
  });
}

function execGeminiPromptViaStdin(prompt, timeoutMs, maxBuffer) {
  const normalizedPrompt = String(prompt || "");
  return new Promise((resolve, reject) => {
    const child = spawn("gemini", [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`Gemini CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
      if (stdout.length > maxBuffer) {
        child.kill("SIGTERM");
        finish(new Error(`Gemini CLI stdout exceeded maxBuffer (${maxBuffer}).`));
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > maxBuffer) {
        child.kill("SIGTERM");
        finish(new Error(`Gemini CLI stderr exceeded maxBuffer (${maxBuffer}).`));
      }
    });

    child.on("error", (error) => {
      finish(error);
    });

    child.on("close", (code, signal) => {
      const stdoutText = String(stdout || "").trim();
      const stderrText = String(stderr || "").trim();
      logger.debug(
        "[Gemini CLI stdin] promptChars=%d stdoutChars=%d stderrChars=%d code=%s signal=%s",
        normalizedPrompt.length,
        stdoutText.length,
        stderrText.length,
        String(code ?? ""),
        String(signal ?? ""),
      );

      if (code !== 0) {
        const details = stderrText || stdoutText || `Gemini CLI exited with code ${code}${signal ? ` (${signal})` : ""}.`;
        finish(new Error(details));
        return;
      }

      finish(null, { stdout: stdoutText, stderr: stderrText });
    });

    child.stdin.write(normalizedPrompt);
    child.stdin.end();
  });
}

export async function runGeminiPrompt(prompt, timeoutMs = 45000, maxBuffer = 4 * 1024 * 1024) {
  const normalizedPrompt = String(prompt || "");
  if (!normalizedPrompt.trim()) {
    throw new Error("[Gemini CLI] Gemini prompt is empty.");
  }

  const execGeminiPrompt = normalizedPrompt.length > GEMINI_ARG_PROMPT_LIMIT
    ? execGeminiPromptViaStdin
    : execGeminiPromptViaArgs;

  logger.debug(
    "[Gemini CLI] mode=%s promptChars=%d",
    execGeminiPrompt === execGeminiPromptViaStdin ? "stdin" : "args",
    normalizedPrompt.length,
  );

  const firstAttempt = await execGeminiPrompt(normalizedPrompt, timeoutMs, maxBuffer);
  if (firstAttempt.stdout) {
    return firstAttempt.stdout;
  }

  logger.warn(
    "[Gemini CLI] Empty stdout on first attempt. Retrying once. stderrChars=%d",
    firstAttempt.stderr.length,
  );

  const secondAttempt = await execGeminiPrompt(normalizedPrompt, timeoutMs, maxBuffer);
  if (secondAttempt.stdout) {
    return secondAttempt.stdout;
  }

  const details = secondAttempt.stderr || firstAttempt.stderr || "Gemini CLI returned empty stdout.";
  throw new Error(["[Gemini CLI] ", details].join("\n").trim() || details);
}
