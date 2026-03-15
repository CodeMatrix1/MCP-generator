import fs from "node:fs";
import path from "node:path";

export function syncGeminiExtension({ projectRoot, runtimeHost, runtimePort }) {
  const targetPath = path.join(projectRoot, "src", "gemini-extension.json");
  const payload = {
    name: "rocket-chat-mcp",
    version: "1.0.0",
    description: "Gemini CLI bridge for Rocket.Chat MCP Server",
    mcpServers: [
      {
        name: "rocket-chat",
        url: `http://${runtimeHost}:${runtimePort}`,
      },
    ],
  };

  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf8");
  return targetPath;
}
