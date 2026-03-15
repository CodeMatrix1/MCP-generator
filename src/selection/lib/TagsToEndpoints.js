import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const tagIndex = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "data", "tag_index.json"), "utf8")
);

export function buildEndpointList(operationIds) {
  return operationIds.map((id, index) => `${index + 1}. ${id}`).join("\n");
}

export function TagsToEndpoints(categoryTagMap = {}) {
  const relevantEndpoints = new Set();
  const lines = [];

  for (const [category, tags] of Object.entries(categoryTagMap || {})) {
    const categoryEntry = tagIndex[category];
    if (!categoryEntry) continue;

    const validTags = Array.isArray(tags) ? tags : [];
    for (const tag of validTags) {
      const endpoints = categoryEntry[tag];
      if (!Array.isArray(endpoints) || endpoints.length === 0) continue;

      lines.push(`${category} :: ${tag} -> ${endpoints.length} endpoints`);
      for (const operationId of endpoints) {
        relevantEndpoints.add(operationId);
      }
    }
  }

  return {
    relevant_endpoints: relevantEndpoints,
    output: lines.join("\n"),
  };
}
