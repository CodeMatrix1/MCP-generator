import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const ENDPOINT_INDEX_PATH = path.join(PROJECT_ROOT, "data", "endpoint_index.json");
const DEFAULT_OUTPUT_DIR = path.join(__dirname,"..", "tool_cache");

function loadEndpointIndex() {
  if (!fs.existsSync(ENDPOINT_INDEX_PATH)) {
    throw new Error(`Missing endpoint index at ${ENDPOINT_INDEX_PATH}`);
  }

  const raw = fs.readFileSync(ENDPOINT_INDEX_PATH, "utf8");
  return JSON.parse(raw);
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
  if (!normalized.startsWith("/")) return "";
  return normalized.replace(/\\/g, "/");
}

function buildInputMeta(op) {
  const parameters = Array.isArray(op.parameters) ? op.parameters : [];
  const requestSchema =
    op.requestBody?.content?.["application/json"]?.schema ||
    null;

  return {
    parameters: parameters.map((param) => ({
      name: param.name,
      in: param.in,
      required: Boolean(param.required),
      description: param.description || "",
      schema: param.schema || {},
      example: param.example,
    })),
    requestSchema,
  };
}

function buildToolModuleCode({ endpointKey, functionName, method, routePath, summary, inputMeta }) {
  const upperMethod = method.toUpperCase();
  const routeLiteral = JSON.stringify(routePath);
  const summaryLiteral = JSON.stringify(summary || "");
  const endpointKeyLiteral = JSON.stringify(endpointKey);
  const methodLiteral = JSON.stringify(upperMethod);
  const inputMetaLiteral = JSON.stringify(inputMeta || { parameters: [], requestSchema: null }, null, 2);

  return `import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = ${methodLiteral};
const ROUTE_PATH = ${routeLiteral};
const TOOL_KEY = ${endpointKeyLiteral};

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: ${summaryLiteral},
  input: ${inputMetaLiteral},
};

export async function ${functionName}(args = {}, context = {}) {
  const {
    baseUrl = process.env.BASE_URL,
    pathParams = {},
    query = {},
    headers = {},
    body,
    signal,
  } = context;

  const resolvedBaseUrl = resolveBaseUrl(baseUrl);
  const resolvedPath = interpolatePath(ROUTE_PATH, pathParams);
  const queryString = encodeQuery(query);
  const url = queryString
    ? \`\${resolvedBaseUrl}\${resolvedPath}?\${queryString}\`
    : \`\${resolvedBaseUrl}\${resolvedPath}\`;

  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };

  const request = {
    method: METHOD,
    headers: requestHeaders,
    signal,
  };

  if (METHOD !== "GET" && METHOD !== "HEAD") {
    const payload = body === undefined ? args : body;
    if (payload !== undefined) {
      request.headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(payload);
    }
  }

  const response = await fetch(url, request);
  const text = await response.text();
  let parsed;

  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const reason = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(\`HTTP \${response.status} \${response.statusText} for \${TOOL_KEY}: \${reason}\`);
  }

  return parsed;
}

export default ${functionName};
`;
}

export async function generateMcpTools(MCP_Endpoints = [], options = {}) {
  const endpointIndex = loadEndpointIndex();
  const selectedEndpoints = Array.isArray(MCP_Endpoints) && MCP_Endpoints.length > 0
    ? MCP_Endpoints
    : Object.keys(endpointIndex);

  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : DEFAULT_OUTPUT_DIR;

  fs.mkdirSync(outputDir, { recursive: true });

  const report = {
    generated: [],
    skipped: [],
  };

  for (const endpointKey of selectedEndpoints) {
    const op = endpointIndex[endpointKey];
    if (!op) {
      report.skipped.push({ endpoint: endpointKey, reason: "Endpoint not found in endpoint_index.json" });
      continue;
    }

    const method = String(op.method || "").toUpperCase();
    const routePath = toPosixPath(op.path);
    if (!method || !routePath) {
      report.skipped.push({ endpoint: endpointKey, reason: "Missing or invalid method/path metadata" });
      continue;
    }

    const category = sanitizeToken(op.file || op.tags?.[0] || "misc");
    const functionName = sanitizeToken(endpointKey, "tool_handler");
    const fileName = `${functionName}.js`;
    const targetDir = path.join(outputDir, category);
    const targetPath = path.join(targetDir, fileName);

    fs.mkdirSync(targetDir, { recursive: true });

    const code = buildToolModuleCode({
      endpointKey,
      functionName,
      method,
      routePath,
      summary: op.summary || "",
      inputMeta: buildInputMeta(op),
    });
    fs.writeFileSync(targetPath, code, "utf8");

    report.generated.push({
      endpoint: endpointKey,
      method,
      path: routePath,
      category,
      functionName,
      file: targetPath,
    });
  }

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
