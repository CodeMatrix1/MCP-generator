import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  generateWorkflowModuleSource,
  renderWorkflowModuleSource,
} from "./WorkflowCodegen.js";
import { buildExecutableWorkflowFallback } from "./WorkflowResolve.js";
import { validateExecutableWorkflow } from "./WorkflowValidate.js";

function sanitizeToken(input, fallback = "workflow") {
  const value = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return value || fallback;
}

export function getWorkflowDir(projectRoot = process.cwd()) {
  return path.join(projectRoot, "src", "tool_cache", "workflows");
}

async function validateGeneratedModuleCode(code, targetPath, projectRoot, allowedTools = []) {
  const tempPath = `${targetPath}.tmp-${Date.now()}.mjs`;
  fs.writeFileSync(tempPath, code, "utf8");
  try {
    const mod = await import(`${pathToFileURL(tempPath).href}?t=${Date.now()}`);
    const workflow = mod.workflow || null;
    const execute = typeof mod.default === "function" ? mod.default : null;
    if (!workflow || !execute) {
      return {
        ok: false,
        errors: ["Generated module missing workflow export or default execute function."],
      };
    }
    return validateExecutableWorkflow(workflow, projectRoot, { allowedTools });
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export async function writeWorkflowModules(
  workflows,
  projectRoot = process.cwd(),
  selectedEndpoints = [],
) {
  const workflowDir = getWorkflowDir(projectRoot);
  fs.mkdirSync(workflowDir, { recursive: true });

  for (const workflow of workflows || []) {
    const fileName = `${sanitizeToken(workflow.key)}.js`;
    const targetPath = path.join(workflowDir, fileName);
    const fallbackWorkflow = buildExecutableWorkflowFallback(workflow);
    const generatedCode = await generateWorkflowModuleSource(
      workflow,
      selectedEndpoints,
      projectRoot,
    );
    let finalCode = renderWorkflowModuleSource(fallbackWorkflow);
    const allowedTools = new Set(
      (workflow.steps || [])
        .flatMap((step) => step.candidateEndpoints || [])
        .map((endpoint) => endpoint?.key)
        .filter(Boolean),
    );

    if (generatedCode) {
      const validation = await validateGeneratedModuleCode(
        generatedCode,
        targetPath,
        projectRoot,
        Array.from(allowedTools),
      );
      if (validation.ok) {
        finalCode = generatedCode;
      }
    }

    fs.writeFileSync(targetPath, finalCode, "utf8");
  }

  return workflowDir;
}

export async function loadWorkflowModules(projectRoot = process.cwd()) {
  const workflowDir = getWorkflowDir(projectRoot);
  if (!fs.existsSync(workflowDir)) return [];

  const entries = fs.readdirSync(workflowDir, { withFileTypes: true });
  const workflows = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

    const fullPath = path.join(workflowDir, entry.name);
    const mtime = fs.statSync(fullPath).mtimeMs;
    const mod = await import(`${pathToFileURL(fullPath).href}?v=${mtime}`);
    const workflow = mod.workflow || null;
    const meta = mod.meta || null;
    const execute = typeof mod.default === "function" ? mod.default : null;

    if (!workflow?.key || !meta?.key || !execute) continue;

    workflows.push({
      workflow,
      meta,
      execute,
      file: fullPath,
    });
  }

  return workflows;
}
