import { exec } from "node:child_process";

export function sanitizeGeminiJson(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export function runGeminiPrompt(prompt, timeoutMs = 30000, maxBuffer = 4 * 1024 * 1024) {
  const escaped = String(prompt || "").replace(/(["\\$`])/g, "\\$1");
  return new Promise((resolve, reject) => {
    exec(
      `gemini -p "${escaped}"`,
      { timeout: timeoutMs, maxBuffer },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.trim() || err.message));
          return;
        }
        resolve(String(stdout || "").trim());
      }
    );
  });
}
