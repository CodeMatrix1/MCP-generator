import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import {
  getEndpointContext,
} from "./WorkflowMapEndpointsHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "templates", "workflow.hbs");
const PARTIALS_DIR = path.join(__dirname, "templates");
const PARTIALS = [
  { name: "runtime_tool_step", file: "runtime_tool_step.hbs" },
  { name: "llm_step", file: "llm_step.hbs" },
  { name: "compute_step", file: "compute_step.hbs" },
  { name: "condition_step", file: "condition_step.hbs" },
];

Handlebars.registerHelper("eq", (left, right) => left === right);
for (const partial of PARTIALS) {
  const partialPath = path.join(PARTIALS_DIR, partial.file);
  Handlebars.registerPartial(partial.name, fs.readFileSync(partialPath, "utf8"));
}
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
        required: ["key", "description", "kind"],
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

function buildCodeRefinementPrompt(workflow, pulledTools, draftCode) {
  return `
Refine the following generated workflow module to be production-ready.
Return ONLY valid JavaScript module code (no markdown, no explanations).

Rules:
- Preserve the exported workflow object structure and metadata.
- Preserve the module shape from the draft: imports, \`export const workflow\`, \`export const meta\`, a named async function, and the default wrapper.
- This module does NOT use \`state\`, \`helpers\`, \`ctx\`, \`getValueByPath\`, or \`resolveTemplateValue\`. Do not generate code that references those.
- The named workflow function receives destructured local inputs directly, for example \`async function onboardMember({ username, channel_name, welcome_message })\`.
- Keep tool selections consistent with the workflow as provided.
- Do not change step kind, endpointKey, condition keys, or tool selection in this pass.
- Actively fix inconsistencies in the draft instead of preserving them. If the draft code, endpoint choice, arg binding, outputs, or control flow contradict the workflow spec, correct them.
- Invoke runtime tools as \`await toolName(args, context)\`.
- Fill \`args\` and \`context\` from explicit \`inputBindings\`, workflow inputs, and prior step outputs.
- Use \`context.query\` for query-string parameters, \`context.pathParams\` for path parameters, and body args in the first argument.
- Keep step order and keys stable.
- Avoid hardcoded user data.
- Add small runtime guards when needed, for example fail if a required user or channel id is missing before later steps.
- If a step exposes outputs, derive concrete local variables only from the step's explicit \`outputs\` mapping.
- Keep the exported \`workflow\` object aligned with the code you emit. If you add step-level metadata needed by the implementation, preserve it in \`workflow.steps\`.
- Respect \`dependsOn\` and \`condition\` from the workflow. When a step is conditional, emit an actual JavaScript guard such as \`if (!channelMissing) { ... }\` or equivalent readable logic.
- Never redeclare a variable name in the same scope. Do not shadow function inputs like \`username\` or \`channel_name\`. Use unique names or reuse existing variables safely.
- Do not emit helper calls that are unavailable in this module shape.
- Do not emit syntactically invalid JavaScript. The final module must parse cleanly with Node.
- Do not emit duplicate derived aliases like \`const channel_id\` or \`const username\` more than once in the same function. If a later step produces the same alias, either reuse the existing variable or assign to a different safe name.
- If a function input already exists, never emit a local declaration with the same name. For example, do not emit \`const username = ...\` or \`const channel_name = ...\` inside the function body.
- If a conditional create step depends on a prior lookup, keep the create call inside the emitted \`if\` block and do not redeclare aliases from earlier lookup steps inside that block unless the names are unique.
- Before finalizing the code, mentally self-check these failure cases and correct them if present:
  - missing query binding for lookup endpoints
  - create step runs unconditionally even though workflow has a condition
  - required message text is not passed
  - both \`userId\` and \`userIds\` are sent for a single-user invite
  - duplicate \`const\` declarations in the same scope
  - references to unavailable helpers
- Prefer simple, explicit, readable JavaScript over clever abstractions.

Implementation guidance:
- Follow the workflow literally.
- Use explicit \`inputBindings\` to resolve runtime arguments.
- Use explicit \`outputs\` to expose local variables.
- Use top-level \`conditions\` and step \`condition\` references as given.

Workflow (authoritative spec):
${JSON.stringify(workflow, null, 2)}

Available runtime tools (schemas):
${JSON.stringify(pulledTools, null, 2)}

Draft module to refine:
${draftCode}
`;
}

function normalizeExecutionStep(step, fallbackStep) {
  return {
    key: String(step?.key || fallbackStep?.key || "").trim(),
    description: String(step?.description || fallbackStep?.description || "").trim(),
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
    ...(Array.isArray(step?.condition) ? { condition: step.condition.filter(Boolean).map((value) => String(value).trim()) } : {}),
    ...(step?.condition && !Array.isArray(step.condition) ? { condition: [String(step.condition).trim()] } : {}),
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

function escapeTemplateLiteral(value) {
  return String(value || "")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function compileTemplateToCode(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    const exactMatch = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (exactMatch) {
      return `getValueByPath(state, ${JSON.stringify(exactMatch[1])})`;
    }

    if (value.includes("{{")) {
      const parts = [];
      let lastIndex = 0;
      const regex = /\{\{\s*([^}]+?)\s*\}\}/g;
      let match;
      while ((match = regex.exec(value)) !== null) {
        const literal = value.slice(lastIndex, match.index);
        if (literal) {
          parts.push(escapeTemplateLiteral(literal));
        }
        parts.push(`\${getValueByPath(state, ${JSON.stringify(match[1])})}`);
        lastIndex = match.index + match[0].length;
      }
      const tail = value.slice(lastIndex);
      if (tail) parts.push(escapeTemplateLiteral(tail));
      return `\`${parts.join("")}\``;
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => compileTemplateToCode(item));
    return `[${items.join(", ")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).map(([key, val]) => {
      return `${JSON.stringify(key)}: ${compileTemplateToCode(val)}`;
    });
    return `{ ${entries.join(", ")} }`;
  }

  return JSON.stringify(value);
}

function compileOutputVarExpression(expr, stepKey, inputProps) {
  const raw = String(expr || "").trim();
  if (!raw) return "undefined";
  if (raw === "result") return `step_${stepKey}`;
  if (raw.startsWith("steps.")) {
    const match = raw.match(/^steps\.([^.]+)\.result(?:\.(.+))?$/);
    if (match) {
      const [, sourceStepKey, sourcePath = ""] = match;
      return sourcePath
        ? `getValueByPath(step_${sourceStepKey}, ${JSON.stringify(sourcePath)})`
        : `step_${sourceStepKey}`;
    }
  }
  const stepPrefix = `steps.${stepKey}.result`;
  if (raw === stepPrefix) return `step_${stepKey}`;
  if (raw.startsWith(`${stepPrefix}.`)) {
    const path = raw.slice(stepPrefix.length + 1);
    return `getValueByPath(step_${stepKey}, ${JSON.stringify(path)})`;
  }
  if (raw.startsWith("inputs.")) {
    const name = raw.slice("inputs.".length);
    if (inputProps.includes(name)) return name;
  }
  return `getValueByPath(step_${stepKey}, ${JSON.stringify(raw)})`;
}

function conditionVariableName(key) {
  const normalized = toCamelCase(key || "condition");
  return `condition_${normalized || "condition"}`;
}

function buildConditionViews(workflowConditions = []) {
  return (workflowConditions || [])
    .map((condition) => {
      const key = String(condition?.key || "").trim();
      if (!key) return null;
      return {
        key,
        varName: conditionVariableName(key),
        promptLiteral: JSON.stringify(String(condition?.promptTemplate || "")),
      };
    })
    .filter(Boolean);
}

function buildStepConditionCode(step, workflowConditions = []) {
  const conditions = Array.isArray(step?.condition) ? step.condition : (step?.condition ? [step.condition] : []);
  if (conditions.length === 0) return "true";

  const conditionMap = new Map(
    (workflowConditions || []).map((condition) => [String(condition?.key || "").trim(), conditionVariableName(condition?.key)]),
  );

  const parts = conditions
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => {
      const negated = value.startsWith("!");
      const key = negated ? value.slice(1) : value;
      const expr = conditionMap.get(key) || "true";
      return negated ? `!(${expr})` : `(${expr})`;
    });

  return parts.length > 0 ? parts.join(" && ") : "true";
}

function compileRuntimeBindingToCode(value, inputProps) {
  if (value === null) return "null";
  if (value === undefined) return "{}";
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (value.startsWith("__expr__:")) {
      return value.slice("__expr__:".length);
    }
    const exactMatch = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (exactMatch) {
      const ref = exactMatch[1];
      if (ref.startsWith("inputs.")) {
        const inputName = ref.slice("inputs.".length);
        return inputProps.includes(inputName) ? inputName : JSON.stringify(value);
      }
      return JSON.stringify(value);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => compileRuntimeBindingToCode(item, inputProps)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([key, val]) =>
      `${JSON.stringify(key)}: ${compileRuntimeBindingToCode(val, inputProps)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value);
}

function compileInputBindingExpression(binding, inputProps) {
  const raw = String(binding || "").trim();
  if (!raw) return null;
  if (raw.startsWith("inputs.")) {
    const inputName = raw.slice("inputs.".length);
    return inputProps.includes(inputName) ? inputName : null;
  }
  const stepMatch = raw.match(/^steps\.([^.]+)\.result(?:\.(.+))?$/);
  if (stepMatch) {
    const [, stepKey, resultPath = ""] = stepMatch;
    return resultPath
      ? `getValueByPath(step_${stepKey}, ${JSON.stringify(resultPath)})`
      : `step_${stepKey}`;
  }
  return null;
}

function buildStepViews(workflow) {
  const inputProps = Object.keys(workflow?.inputSchema?.properties || {});
  const declaredVars = new Set(inputProps);
  const outputVarNames = [];
  const workflowConditions = Array.isArray(workflow?.conditions) ? workflow.conditions : [];
  const conditionViews = buildConditionViews(workflowConditions);

  const steps = (workflow.steps || []).map((step, index) => {
    const stepKey = step.key;
    const toolKey = String(step.tool || step.endpointKey || "").trim();
    const toolFunction = toolKey ? toToolFunctionName(toolKey) : "";
    const argsEntries = {};
    const contextEntries = {};
    const inputs = Array.isArray(step.inputs) ? step.inputs : [];

    if (step.args && typeof step.args === "object" && !Array.isArray(step.args)) {
      Object.assign(argsEntries, step.args);
    }
    if (step.context && typeof step.context === "object" && !Array.isArray(step.context)) {
      Object.assign(contextEntries, step.context);
    }

    if (Object.keys(argsEntries).length === 0 && Object.keys(contextEntries).length === 0) {
      for (const input of inputs) {
        const name = String(input?.name || "").trim();
        const explicitBinding = step?.inputBindings && typeof step.inputBindings === "object"
          ? step.inputBindings[name]
          : null;
        const bindingExpr = compileInputBindingExpression(explicitBinding, inputProps);
        if (!name || !bindingExpr) continue;
        if (String(input?.in || "").toLowerCase() === "header") continue;

        if (String(input?.in || "").toLowerCase() === "query") {
          contextEntries.query = contextEntries.query || {};
          contextEntries.query[name] = `__expr__:${bindingExpr}`;
        } else {
          argsEntries[name] = `__expr__:${bindingExpr}`;
        }
      }
    }

    const argsCode = compileRuntimeBindingToCode(argsEntries, inputProps);
    const contextCode = compileRuntimeBindingToCode(contextEntries, inputProps);

    const outputAssignments = [];
    if (step.outputs && typeof step.outputs === "object" && !Array.isArray(step.outputs)) {
      for (const [varName, expr] of Object.entries(step.outputs)) {
        const safeName = String(varName || "").trim();
        if (!safeName || declaredVars.has(safeName)) continue;
        if (/^(username|channel_name|name)$/i.test(safeName)) continue;
        const assignmentExpr = compileOutputVarExpression(expr, stepKey, inputProps);
        outputAssignments.push(`const ${safeName} = ${assignmentExpr};`);
        declaredVars.add(safeName);
        outputVarNames.push(safeName);
      }
    }

    return {
      number: index + 1,
      description: step.description || `Execute step ${index + 1}`,
      purpose: step.purpose || step.description || `Complete step ${index + 1}`,
      kind: step.kind || "runtime_tool",
      key: stepKey,
      hasCondition: buildStepConditionCode(step, workflowConditions) !== "true",
      conditionCode: buildStepConditionCode(step, workflowConditions),
      toolFunction,
      argsCode,
      contextCode,
      outputAssignments,
      promptLiteral: JSON.stringify(step.promptTemplate || ""),
    };
  });

  return {
    conditionViews,
    steps,
    inputProps,
    outputVarNames: Array.from(new Set(outputVarNames)),
    hasLLMSteps: conditionViews.length > 0 || steps.some((step) => step.kind === "llm_step" || step.kind === "condition_step"),
    toolImports: Array.from(
      new Set(
        steps
          .map((step) => step.toolFunction)
          .filter(Boolean),
      ),
    ).sort(),
    functionName: toCamelCase(workflow?.key || "workflow"),
  };
}

export function renderWorkflowModuleSource(workflow) {
  const workflowForRender = {
    ...workflow,
    steps: (workflow?.steps || []).map((step) => {
      const endpointKey = String(step?.endpointKey || "").trim();
      const { action, ...stepWithoutAction } = step || {};
      if (stepWithoutAction?.tool || !endpointKey || String(stepWithoutAction?.kind || "runtime_tool").trim() !== "runtime_tool") {
        return stepWithoutAction;
      }
      return {
        ...stepWithoutAction,
        tool: endpointKey,
      };
    }),
  };
  const view = buildStepViews(workflowForRender);
  return renderWorkflowModule({
    workflowLiteral: JSON.stringify(workflowForRender, null, 2),
    inputSchemaLiteral: JSON.stringify(workflowForRender.inputSchema || { type: "object", properties: {} }, null, 2),
    steps: view.steps,
    inputProps: view.inputProps,
    outputVarNames: view.outputVarNames,
    hasLLMSteps: view.hasLLMSteps,
    toolImports: view.toolImports.join(", "),
    functionName: view.functionName,
  });
}

export async function generateWorkflowModuleSource(
  workflow,
  selectedEndpoints = [],
  projectRoot = process.cwd(),
  existingDraftCode = "",
) {
  try {
    const pulledTools = getEndpointContext(projectRoot);
    const normalizedWorkflow = normalizeExecutionWorkflow(workflow, workflow);
    const draftCode = String(existingDraftCode || "").trim() || renderWorkflowModuleSource(normalizedWorkflow);
    const prompt = buildCodeRefinementPrompt(workflow, pulledTools, draftCode);
    const raw = await runGeminiPrompt(prompt, 30000, 2 * 1024 * 1024);
    const refinedCode = sanitizeCodeBlock(raw);
    if (!refinedCode) return null;
    return refinedCode;
  } catch {
    // fall back in store.js
  }

  return null;
}

function toCamelCase(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

function toToolFunctionName(operationId) {
  return String(operationId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildEndpointSelectionMap(endpointSelections = []) {
  return new Map(
    (endpointSelections || [])
      .filter((entry) => entry?.key && entry?.endpointKey)
      .map((entry) => [entry.key, entry.endpointKey]),
  );
}

export function renderCompiledWorkflowFunctionFromFinal(
  workflow,
  endpointSelections = [],
) {
  const functionName = toCamelCase(workflow?.key || "workflow");
  const inputProps = Object.keys(workflow?.inputSchema?.properties || {});
  const endpointMap = buildEndpointSelectionMap(endpointSelections);
  const toolNames = new Set(
    (workflow?.steps || [])
      .map((step) => step.tool || endpointMap.get(step.key) || "")
      .filter(Boolean)
      .map(toToolFunctionName),
  );
  const importsLine = toolNames.size > 0
    ? `import { ${Array.from(toolNames).sort().join(", ")} } from "../index.js";`
    : "";

  const lines = [];
  if (importsLine) {
    lines.push(importsLine, "");
  }
  lines.push(`export async function ${functionName}({`);
  for (const prop of inputProps) {
    lines.push(`  ${prop},`);
  }
  lines.push(`}: {`);
  for (const prop of inputProps) {
    lines.push(`  ${prop}: string;`);
  }
  lines.push(`}) {`);
  lines.push(`  try {`);

  for (const step of workflow?.steps || []) {
    const stepKey = String(step?.key || "").trim();
    const stepdescription = String(step?.description || "").trim();
    if (!stepKey) continue;
    const toolKey = step.tool || endpointMap.get(stepKey) || "";
    const toolFn = toToolFunctionName(toolKey);

    lines.push(`    // =========================================================`);
    lines.push(`    // STEP: ${stepKey}`);
    lines.push(`    // STEP: ${stepdescription}`);
    lines.push(`    // =========================================================`);

    if (step.kind === "runtime_tool" && toolFn) {
      const argLines = [];
      const inputs = Array.isArray(step.inputs) ? step.inputs : [];
      for (const input of inputs) {
        const name = String(input?.name || "").trim();
        if (!name) continue;
        if (inputProps.includes(name)) {
          argLines.push(`      ${name}: ${name},`);
        }
      }
      lines.push(`    const step_${stepKey} = await ${toolFn}({`);
      if (argLines.length > 0) {
        lines.push(...argLines);
      }
      lines.push(`    });`);
    } else if (step.kind === "llm_step" || step.kind === "compute_step") {
      lines.push(`    const step_${stepKey} = null;`);
    } else {
      lines.push(`    const step_${stepKey} = null;`);
    }
    lines.push("");
  }

  lines.push(`    return { status: "ok" };`);
  lines.push(`  } catch (err: any) {`);
  lines.push(`    return { status: "error", error: err.message };`);
  lines.push(`  }`);
  lines.push(`}`);

  return lines.join("\n");
}
