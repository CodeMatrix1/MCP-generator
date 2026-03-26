import Ajv from "ajv";
import { sanitizeGeminiJson } from "../llm/geminiCli.js";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

function formatAjvErrors(validate) {
  return (validate.errors || [])
    .map((error) => {
      const location = error.instancePath || error.schemaPath || "/";
      return `${location} ${error.message}`.trim();
    })
    .join("; ");
}

export function compileSchema(schema) {
  return ajv.compile(schema);
}

export function parseJsonWithSchema(value, validate, label = "JSON value") {
  let parsed;

  try {
    parsed = JSON.parse(String(value || ""));
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error.message}`);
  }

  if (!validate(parsed)) {
    throw new Error(`Invalid ${label}: ${formatAjvErrors(validate)}`);
  }

  return parsed;
}

export function parseGeminiJsonWithSchema(raw, validate, label = "Gemini JSON") {
  return parseJsonWithSchema(sanitizeGeminiJson(raw), validate, label);
}
