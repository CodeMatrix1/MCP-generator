import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const ENDPOINT_INDEX_PATH = path.join(PROJECT_ROOT, "data", "endpoint_index.json");
const TEMPLATE_PATH = path.join(__dirname, "templates", "tool-module.hbs");
const DEFAULT_OUTPUT_DIR = path.join(__dirname, "..", "tool_cache");

const renderToolModule = Handlebars.compile(
  fs.readFileSync(TEMPLATE_PATH, "utf8"),
  { noEscape: true },
);

function loadEndpointIndex() {
  if (!fs.existsSync(ENDPOINT_INDEX_PATH)) {
    throw new Error(`Missing endpoint index at ${ENDPOINT_INDEX_PATH}`);
  }

  return JSON.parse(fs.readFileSync(ENDPOINT_INDEX_PATH, "utf8"));
}

function sanitizeToken(input, fallback = "unknown") {
  const value = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return value || fallback;
}

function toPosixPath(routePath) {
  const normalized = String(routePath ?? "").trim();
  return normalized.startsWith("/") ? normalized.replace(/\\/g, "/") : "";
}

function buildInputMeta(op) {
  return {
    parameters: (Array.isArray(op.parameters) ? op.parameters : []).map((param) => ({
      name: param.name,
      in: param.in,
      required: Boolean(param.required),
      description: param.description || "",
      schema: param.schema || {},
      example: param.example,
    })),
    requestSchema: op.requestBody?.content?.["application/json"]?.schema || null,
    requestExample: op.requestBody?.content?.["application/json"]?.example,
  };
}

function buildOutputMeta(op) {
  return {
    successStatus: op.successResponse?.status || null,
    description: op.successResponse?.description || "",
    responseSchema: op.successResponse?.schema || null,
    outputFields: Array.isArray(op.successResponse?.outputFields)
      ? op.successResponse.outputFields
      : [],
  };
}

function buildToolModuleCode({ endpointKey, functionName, method, routePath, summary, inputMeta, outputMeta }) {
  return renderToolModule({
    toolKeyLiteral: JSON.stringify(endpointKey),
    methodLiteral: JSON.stringify(method),
    routePathLiteral: JSON.stringify(routePath),
    summaryLiteral: JSON.stringify(summary || ""),
    inputMetaLiteral: JSON.stringify(
      inputMeta || { parameters: [], requestSchema: null, requestExample: undefined },
      null,
      2,
    ),
    outputMetaLiteral: JSON.stringify(
      outputMeta || { successStatus: null, description: "", responseSchema: null, outputFields: [] },
      null,
      2,
    ),
    functionName,
  });
}

function resolveEndpointRecord(endpointIndex, endpointKey) {
  const op = endpointIndex[endpointKey];
  if (!op) {
    return { skipped: { endpoint: endpointKey, reason: "Endpoint not found in endpoint_index.json" } };
  }

  const method = String(op.method || "").toUpperCase();
  const routePath = toPosixPath(op.path);
  if (!method || !routePath) {
    return { skipped: { endpoint: endpointKey, reason: "Missing or invalid method/path metadata" } };
  }

  return {
    op,
    method,
    routePath,
    category: sanitizeToken(op.file || op.tags?.[0] || "misc"),
    functionName: sanitizeToken(endpointKey, "tool_handler"),
  };
}

function writeToolModule(outputDir, endpointKey, endpointRecord) {
  const { op, method, routePath, category, functionName } = endpointRecord;
  const targetDir = path.join(outputDir, category);
  const targetPath = path.join(targetDir, `${functionName}.js`);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    targetPath,
    buildToolModuleCode({
      endpointKey,
      functionName,
      method,
      routePath,
      summary: op.summary || "",
      inputMeta: buildInputMeta(op),
      outputMeta: buildOutputMeta(op),
    }),
    "utf8",
  );

  return {
    endpoint: endpointKey,
    method,
    path: routePath,
    category,
    functionName,
    file: targetPath,
  };
}

function writeToolIndex(outputDir, generated) {
  const lines = generated.flatMap(({ file, functionName }) => {
    const relativePath = path.relative(outputDir, file).replace(/\\/g, "/");
    const importPath = `./${relativePath}`;
    return [
      `export { default as ${functionName} } from ${JSON.stringify(importPath)};`,
      `export * from ${JSON.stringify(importPath)};`,
    ];
  });

  fs.writeFileSync(path.join(outputDir, "index.ts"), `${lines.join("\n")}\n`, "utf8");
}

export async function generateMcpTools(MCP_Endpoints = [], options = {}) {
  const endpointIndex = loadEndpointIndex();
  const selectedEndpoints = Array.isArray(MCP_Endpoints) && MCP_Endpoints.length > 0
    ? MCP_Endpoints
    : Object.keys(endpointIndex);
  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : DEFAULT_OUTPUT_DIR;
  const report = { generated: [], skipped: [] };

  fs.mkdirSync(outputDir, { recursive: true });

  for (const endpointKey of selectedEndpoints) {
    const endpointRecord = resolveEndpointRecord(endpointIndex, endpointKey);
    if (endpointRecord.skipped) {
      report.skipped.push(endpointRecord.skipped);
      continue;
    }

    report.generated.push(writeToolModule(outputDir, endpointKey, endpointRecord));
  }

  writeToolIndex(outputDir, report.generated);

  const manifestPath = path.join(outputDir, "manifest.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    totalRequested: selectedEndpoints.length,
    generatedCount: report.generated.length,
    skippedCount: report.skipped.length,
    generated: report.generated,
    skipped: report.skipped,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return {
    outputDir,
    manifestPath,
    ...manifest,
  };
}
