import { fuzzyMatch, tokenize } from "../core/query/textMatching.js";

function scoreIntentCoverage(queryTokens, stepTexts) {
  let hits = 0;
  for (const token of queryTokens) {
    if (stepTexts.some((text) => fuzzyMatch(text, token))) {
      hits += 1;
    }
  }
  return hits;
}

function buildIntentConfirmation(query, workflow) {
  const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
  const stepTexts = steps.map((step) =>
    String(`${step?.key || ""} ${step?.description || ""} ${step?.purpose || ""}`)
      .toLowerCase()
      .trim(),
  );
  const queryTokens = tokenize(query);
  const uniqueTokens = Array.from(new Set(queryTokens));
  const coverage = uniqueTokens.length === 0
    ? 0
    : scoreIntentCoverage(uniqueTokens, stepTexts) / uniqueTokens.length;

  const stepsSummary = steps
    .map((step) => {
      const label = step?.description || step?.purpose || step?.key || "step";
      return String(label).trim();
    })
    .filter(Boolean)
    .slice(0, 6)
    .join(" | ");

  return {
    intentSummary: stepsSummary || "Draft workflow generated.",
    coverageScore: Number(coverage.toFixed(2)),
    queryTokens: uniqueTokens.slice(0, 20),
  };
}

export async function reviewDraft(state) {
  const workflow = state.draftWorkflow || state.workflow || null;
  const errors = [];

  if (!workflow || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    errors.push("Workflow draft is empty.");
  } else {
    const seenKeys = new Set();
    for (const step of workflow.steps) {
      const key = String(step?.key || "").trim();
      const kind = String(step?.kind || "").trim();
      if (!key) {
        errors.push("A workflow step is missing a key.");
        continue;
      }
      if (!kind) {
        errors.push(`Workflow step "${key}" is missing kind.`);
      }
      if (seenKeys.has(key)) {
        errors.push(`Duplicate step key detected: ${key}`);
      }
      seenKeys.add(key);
    }
  }

  const intentConfirmation = buildIntentConfirmation(state.query || "", workflow || {});

  return {
    currentNode: "review_draft",
    draftWorkflow: workflow,
    intentConfirmation,
    validation: {
      stage: "draft",
      isValid: errors.length === 0,
      errors,
    },
  };
}
