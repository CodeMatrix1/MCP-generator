import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import { getEndpointContext } from "./WorkflowResolve.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "templates", "workflow-module.hbs");
const renderWorkflowModule = Handlebars.compile(
  fs.readFileSync(TEMPLATE_PATH, "utf8"),
  { noEscape: true },
);

const validateExecutionPlan = compileSchema({
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          description: { type: "string" },
          action: { type: "string" },
          kind: { type: "string" },
          purpose: { type: "string" },
          tool: { type: "string" },
          args: { type: "object" },
          context: { type: "object" },
          requiredResultPaths: {
            type: "array",
            items: { type: "string" },
          },
          continueOnError: { type: "boolean" },
          promptTemplate: { type: "string" },
          dependsOn: { type: "array", items: { type: "string" } },
        },
        required: ["key", "description", "action", "kind"],
        additionalProperties: true,
      },
    },
  },
  required: ["steps"],
  additionalProperties: true,
});

function sanitizeCodeBlock(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function buildExecutionPlanPrompt(workflow, pulledTools) {
  return `
Convert this abstract Rocket.Chat workflow into an executable workflow plan.
Return strict JSON only with this shape:
{
  "steps": [
    {
      "key": "step_key",
      "description": "what this step does",
      "action": "semantic_action",
      "kind": "runtime_tool",
      "purpose": "why this step exists",
      "tool": "operationId",
      "args": { "field": "{{inputs.someField}}" },
      "context": { "query": { "field": "{{inputs.someField}}" } },
      "requiredResultPaths": ["path.to.required.result"],
      "continueOnError": false
    },
    {
      "key": "summary_step",
      "description": "summarize the collected results",
      "action": "summarization.generate",
      "kind": "llm_step",
      "purpose": "produce a natural-language summary",
      "promptTemplate": "Summarize these results for the user:\n{{steps.fetch_messages.result}}",
      "dependsOn": ["fetch_messages"]
    }
  ]
}

Rules:
- Keep the workflow query-agnostic and use only the provided workflow plus candidate endpoints.
- For each runtime step, choose exactly one endpoint from that step's candidateEndpoints list.
- If a runtime step already has an endpointKey, use that exact endpoint as the tool.
- A step may either be a runtime_tool or an llm_step.
- Use kind "llm_step" when the step is summarization, classification, drafting, extraction, or another reasoning task that should be performed by Gemini instead of a Rocket.Chat API tool.
- For llm_step, provide promptTemplate and dependsOn when needed, and do not set tool/args/context unless they are genuinely required.
- Use template values like {{inputs.name}} and {{steps.step_key.result.someField}} instead of hardcoded user data.
- Add args/context only when needed.
- Add requiredResultPaths only when a later step depends on the result.
- Add continueOnError only when a failure should not stop the workflow.
- Do not include markdown.

Workflow with candidate endpoints:
${JSON.stringify(workflow, null, 2)}

Available runtime tools:
${JSON.stringify(pulledTools, null, 2)}
`;
}

function normalizeExecutionStep(step, fallbackStep) {
  return {
    key: String(step?.key || fallbackStep?.key || "").trim(),
    description: String(step?.description || fallbackStep?.description || "").trim(),
    action: String(step?.action || fallbackStep?.action || "").trim(),
    kind: String(step?.kind || fallbackStep?.kind || "runtime_tool").trim() || "runtime_tool",
    purpose: String(step?.purpose || step?.description || fallbackStep?.description || "").trim(),
    ...(step?.tool ? { tool: String(step.tool).trim() } : {}),
    ...(step?.args && typeof step.args === "object" ? { args: step.args } : {}),
    ...(step?.context && typeof step.context === "object" ? { context: step.context } : {}),
    ...(Array.isArray(step?.requiredResultPaths) ? { requiredResultPaths: step.requiredResultPaths.filter(Boolean) } : {}),
    ...(typeof step?.continueOnError === "boolean" ? { continueOnError: step.continueOnError } : {}),
    ...(step?.promptTemplate ? { promptTemplate: String(step.promptTemplate).trim() } : {}),
    ...(Array.isArray(step?.dependsOn) ? { dependsOn: step.dependsOn.filter(Boolean).map((value) => String(value).trim()) } : {}),
    ...(step?.dependsOn && !Array.isArray(step.dependsOn) ? { dependsOn: [String(step.dependsOn).trim()] } : {}),
  };
}

function normalizeExecutionWorkflow(workflow, candidate) {
  const draftSteps = Array.isArray(candidate?.steps) ? candidate.steps : [];
  const fallbackSteps = Array.isArray(workflow?.steps) ? workflow.steps : [];

  return {
    ...workflow,
    steps: fallbackSteps.map((step, index) =>
      normalizeExecutionStep(draftSteps[index] || {}, step),
    ),
  };
}

function buildStepViews(workflow) {
  return (workflow.steps || []).map((step, index) => ({
    number: index + 1,
    description: step.description || `Execute step ${index + 1}`,
    purpose: step.purpose || step.description || `Complete step ${index + 1}`,
    isRuntime: step.kind !== "llm_step",
    stepKeyLiteral: JSON.stringify(step.key),
    actionLiteral: JSON.stringify(step.action || ""),
    toolLiteral: JSON.stringify(step.tool || ""),
    argsLiteral: JSON.stringify(step.args || {}, null, 2),
    contextLiteral: JSON.stringify(step.context || {}, null, 2),
    requiredResultPathsLiteral: JSON.stringify(step.requiredResultPaths || [], null, 2),
    continueOnErrorLiteral: step.continueOnError ? "true" : "false",
    llmStepLiteral: JSON.stringify(step, null, 2),
    resultVar: `_step${index + 1}Result`,
    argsVar: `_step${index + 1}Args`,
    contextInputVar: `_step${index + 1}ContextInput`,
    contextVar: `_step${index + 1}Context`,
  }));
}

export function renderWorkflowModuleSource(workflow) {
  return renderWorkflowModule({
    workflowLiteral: JSON.stringify(workflow, null, 2),
    inputSchemaLiteral: JSON.stringify(workflow.inputSchema || { type: "object", properties: {} }, null, 2),
    steps: buildStepViews(workflow),
  });
}

export async function generateWorkflowModuleSource(
  workflow,
  selectedEndpoints = [],
  projectRoot = process.cwd(),
) {
  try {
    const allowed = new Set(
      Array.isArray(selectedEndpoints) ? selectedEndpoints.filter(Boolean) : [],
    );
    const pulledTools = getEndpointContext(projectRoot).filter((endpoint) =>
      allowed.size > 0 ? allowed.has(endpoint.key) : true,
    );
    const prompt = buildExecutionPlanPrompt(workflow, pulledTools);
    const raw = await runGeminiPrompt(prompt, 30000, 2 * 1024 * 1024);
    const parsed = parseGeminiJsonWithSchema(
      sanitizeCodeBlock(raw),
      validateExecutionPlan,
      "workflow execution plan JSON",
    );
    const executableWorkflow = normalizeExecutionWorkflow(workflow, parsed);
    const violatesPinnedEndpoint = (workflow.steps || []).some((step, index) => {
      const pinned = String(step?.endpointKey || "").trim();
      if (!pinned || step?.kind !== "runtime_tool") return false;
      return executableWorkflow.steps?.[index]?.tool !== pinned;
    });
    if (violatesPinnedEndpoint) {
      return null;
    }
    return renderWorkflowModuleSource(executableWorkflow);
  } catch {
    // fall back in store.js
  }

  return null;
}
