import dotenv from "dotenv";

dotenv.config({ quiet: true });

export function getRuntimeHost() {
  return process.env.MCP_RUNTIME_HOST || process.env.MCP_SERVER_HOST || "127.0.0.1";
}

export function getRuntimePort() {
  return String(process.env.MCP_RUNTIME_PORT || process.env.MCP_SERVER_PORT || 3001);
}

export function getControlHost() {
  return process.env.MCP_CONTROL_HOST || getRuntimeHost();
}

export function getControlPort() {
  return String(process.env.MCP_CONTROL_PORT || 3002);
}
