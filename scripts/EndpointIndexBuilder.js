import fs from "fs";
import path from "path";
import { logger } from "../src/config/loggerConfig.js";

const astPath = path.join("data", "ast_object.json");
const outDir = path.join("data");
const outPath = path.join(outDir, "endpoint_index.json");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const ast = JSON.parse(fs.readFileSync(astPath, "utf8"));

const OperationIndex = {};

function pickExample(schema, examples) {
  if (schema && typeof schema === "object" && schema.example !== undefined) {
    return schema.example;
  }

  if (examples && typeof examples === "object") {
    const firstExample = Object.values(examples).find(
      (entry) => entry && typeof entry === "object" && "value" in entry,
    );
    if (firstExample) return firstExample.value;
  }

  return undefined;
}

function minimizeSchema(schema) {
  if (!schema || typeof schema !== "object") return null;

  const minimized = {};
  for (const key of ["type", "description", "format", "default", "enum", "example"]) {
    if (schema[key] !== undefined) minimized[key] = schema[key];
  }

  if (Array.isArray(schema.required) && schema.required.length > 0) {
    minimized.required = schema.required;
  }

  if (schema.properties && typeof schema.properties === "object") {
    const properties = Object.fromEntries(
      Object.entries(schema.properties)
        .map(([name, value]) => [name, minimizeSchema(value)])
        .filter(([, value]) => value),
    );
    if (Object.keys(properties).length > 0) minimized.properties = properties;
  }

  if (schema.items) {
    const items = minimizeSchema(schema.items);
    if (items) minimized.items = items;
  }

  for (const key of ["oneOf", "anyOf", "allOf"]) {
    if (Array.isArray(schema[key]) && schema[key].length > 0) {
      const variants = schema[key].map(minimizeSchema).filter(Boolean);
      if (variants.length > 0) minimized[key] = variants;
    }
  }

  return Object.keys(minimized).length > 0 ? minimized : {};
}

function minimizeParameter(parameter) {
  if (!parameter || typeof parameter !== "object") return null;

  return {
    name: parameter.name || "",
    in: parameter.in || "",
    required: Boolean(parameter.required),
    description: parameter.description || "",
    schema: minimizeSchema(parameter.schema) || {},
    example:
      parameter.example !== undefined
        ? parameter.example
        : pickExample(parameter.schema, parameter.examples),
  };
}

function minimizeRequestBody(requestBody) {
  const jsonContent = requestBody?.content?.["application/json"];
  if (!jsonContent) return null;

  return {
    required: Boolean(requestBody?.required),
    description: requestBody?.description || "",
    content: {
      "application/json": {
        schema: minimizeSchema(jsonContent.schema) || null,
        example: pickExample(jsonContent.schema, jsonContent.examples),
      },
    },
  };
}

function flattenSchemaOutputs(schema, prefix = "", bucket = []) {
  if (!schema || typeof schema !== "object") return bucket;

  if (schema.properties && typeof schema.properties === "object") {
    for (const [name, value] of Object.entries(schema.properties)) {
      const pathKey = prefix ? `${prefix}.${name}` : name;
      bucket.push({
        name,
        path: pathKey,
        type: value?.type || "",
        description: value?.description || "",
      });

      if (value?.type === "object" || value?.properties) {
        flattenSchemaOutputs(value, pathKey, bucket);
      } else if (value?.type === "array" && value?.items) {
        flattenSchemaOutputs(value.items, `${pathKey}[]`, bucket);
      }
    }
  }

  for (const key of ["oneOf", "anyOf", "allOf"]) {
    for (const variant of schema[key] || []) {
      flattenSchemaOutputs(variant, prefix, bucket);
    }
  }

  return bucket;
}

function minimizeSuccessResponse(responses) {
  if (!responses || typeof responses !== "object") return null;

  const successEntry =
    Object.entries(responses).find(([status]) => /^20\d$/.test(status)) ||
    null;
  if (!successEntry) return null;

  const [status, response] = successEntry;
  const jsonContent = response?.content?.["application/json"];
  const schema = minimizeSchema(jsonContent?.schema) || null;

  return {
    status,
    description: response?.description || "",
    schema,
    outputFields: flattenSchemaOutputs(schema),
  };
}

function collectBodyFields(schema, bucket = new Map(), requiredNames = new Set()) {
  if (!schema || typeof schema !== "object") return bucket;

  const required = new Set([
    ...requiredNames,
    ...(Array.isArray(schema.required) ? schema.required : []),
  ]);

  if (schema.properties && typeof schema.properties === "object") {
    for (const [name, value] of Object.entries(schema.properties)) {
      if (!bucket.has(name)) {
        bucket.set(name, {
          name,
          in: "body",
          required: required.has(name),
          type: value?.type || "",
          description: value?.description || "",
          enum: Array.isArray(value?.enum) ? value.enum : undefined,
          default: value?.default,
          example: value?.example,
        });
      } else if (required.has(name)) {
        bucket.get(name).required = true;
      }
    }
  }

  for (const key of ["oneOf", "anyOf", "allOf"]) {
    for (const variant of schema[key] || []) {
      collectBodyFields(variant, bucket, required);
    }
  }

  return bucket;
}

function buildInputs(parameters, requestBody) {
  const inputs = [];
  const seen = new Set();

  for (const parameter of parameters || []) {
    const key = `${parameter.in}:${parameter.name}`;
    if (!parameter.name || seen.has(key)) continue;
    seen.add(key);
    inputs.push({
      name: parameter.name,
      in: parameter.in,
      required: Boolean(parameter.required),
      type: parameter.schema?.type || "",
      description: parameter.description || "",
      enum: Array.isArray(parameter.schema?.enum) ? parameter.schema.enum : undefined,
      default: parameter.schema?.default,
      example: parameter.example,
    });
  }

  const requestSchema = requestBody?.content?.["application/json"]?.schema || null;
  for (const field of collectBodyFields(requestSchema).values()) {
    const key = `${field.in}:${field.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push(field);
  }

  return inputs;
}

function buildProduces(successResponse) {
  const seen = new Set();
  const produces = [];

  for (const field of successResponse?.outputFields || []) {
    const name = String(field?.path || field?.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    produces.push(name);
  }

  return produces;
}

for (const file in ast) {
  const paths = ast[file]?.paths || {};
  const filename = file.replace(/\.(yaml|yml)$/i, "");

  for (const endpoint in paths) {
    const methods = paths[endpoint];

    for (const method in methods) {
      if (method.toLowerCase() === "parameters") continue;
      const op = methods[method];
      if (!("operationId" in op)) {
        logger.warn(
          `Missing operationId for ${method.toUpperCase()} ${endpoint} in file ${file}`,
        );
        continue;
      }

      const parameters = (op.parameters || []).map(minimizeParameter).filter(Boolean);
      const requestBody = minimizeRequestBody(op.requestBody);
      const successResponse = minimizeSuccessResponse(op.responses);

      OperationIndex[`${op.operationId}`] = {
        file: filename,
        method: method.toUpperCase(),
        path: endpoint,
        summary: op.summary || "",
        description: op.description || "",
        purpose: op.summary || op.description || "",
        tags: op.tags || [],
        operationId: op.operationId || "",
        inputs: buildInputs(parameters, requestBody),
        produces: buildProduces(successResponse),
        parameters,
        requestBody,
        successResponse,
      };
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(OperationIndex, null, 2));
logger.info(`Endpoint index built: ${outPath}`);
