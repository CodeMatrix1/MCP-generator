# Gemini Integration Guide

## Purpose
This document explains how Gemini is used inside this repository, where prompts are built, how responses are consumed, and what to check when Gemini-based workflow generation fails.

The repository uses Gemini as a structured-generation engine for the Rocket.Chat MCP synthesis pipeline. Gemini is not the source of truth for repository state or endpoint metadata; it is used to transform a raw user query and repo-provided context into workflow artifacts.

## Where Gemini is used

Gemini is currently used in these main areas:

- `src/selection/ConfirmIntent.js`
  Confirms or lightly clarifies the user's raw request.

- `src/selection/DomainSelect.js`
  Classifies the query into domain tags and keywords.

- `src/workflows/WorkflowDraftHelper.js`
  Produces the initial workflow decomposition from the raw user query.

- `src/workflows/WorkflowMapEndpointsHelper.js`
  Maps workflow steps to Rocket.Chat endpoint candidates.

- `src/workflows/WorkflowRefineNode.js`
  Refines workflow execution details such as inputs, outputs, bindings, and conditions.

- `src/workflows/WorkflowValidateNode.js`
  Optionally attempts LLM-based repair when validation fails.

## Core Gemini wrapper

The common Gemini wrapper lives in:

- [src/core/llm/geminiCli.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/core/llm/geminiCli.js)

### What it does

- Uses the external `gemini` CLI.
- Sends short prompts through command-line args:
  - `gemini -p "<prompt>"`
- Sends large prompts through `stdin` to avoid OS argument-size failures.
- Retries once if Gemini returns empty `stdout`.
- Logs prompt size and output sizes through the repo logger.

### Current behavior

- `sanitizeGeminiJson(raw)`
  Removes code fences when Gemini wraps JSON in fenced markdown.

- `runGeminiPrompt(prompt, timeoutMs, maxBuffer)`
  Main wrapper used across the repo.

### Prompt transport modes

- Arg mode
  Used when prompt length is below `GEMINI_ARG_PROMPT_LIMIT`.

- Stdin mode
  Used when prompt length exceeds the threshold.
  This was added to avoid `spawn E2BIG` failures caused by large prompts.

## Prompt flow in synthesis mode

The typical synthesis path is:

1. Confirm intent
2. Select domain
3. Draft workflow
4. Map endpoints
5. Refine workflow
6. Validate workflow
7. Generate MCP artifacts

Each stage uses Gemini differently.

### 1. Confirm intent

File:

- [src/selection/ConfirmIntent.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/ConfirmIntent.js)

Purpose:

- Preserve the user's raw request.
- Ask Gemini for a lightweight structured understanding without rewriting the request into a different task.

Failure impact:

- If this fails, the whole pipeline loses its first structured interpretation of the query.

### 2. Domain selection

File:

- [src/selection/DomainSelect.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/DomainSelect.js)

Purpose:

- Classify the request into Rocket.Chat domain tags and keywords.
- Narrow endpoint search space before workflow mapping.

Failure impact:

- Candidate endpoint retrieval can become noisy or incomplete.

### 3. Draft workflow

File:

- [src/workflows/WorkflowDraftHelper.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowDraftHelper.js)

Purpose:

- Produce the first workflow shape.
- Establish steps, step descriptions, and sometimes semantic `dependsOn`.

Important note:

- This stage is where non-runtime steps such as LLM-generated text should ideally be made explicit.
- If draft emits a step like `generate_welcome_message` without clearly indicating it is an `llm_step`, later stages may mis-handle it.

### 4. Endpoint mapping

Files:

- [src/workflows/WorkflowMapEndpointsNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowMapEndpointsNode.js)
- [src/workflows/WorkflowMapEndpointsHelper.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowMapEndpointsHelper.js)

Purpose:

- Ask Gemini to choose endpoint candidates for each workflow step.
- Use a compact endpoint catalog, not the full raw endpoint index.

Current endpoint context shape:

- `id`
- `summary`
- `outputs`

Important note:

- This stage should be the main source of `endpointKey` decisions for runtime steps.
- It should not be relied on to infer all execution details.

### 5. Workflow refinement

File:

- [src/workflows/WorkflowRefineNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowRefineNode.js)

Purpose:

- Convert a mapped workflow into something closer to execution-ready.

Current refine passes:

- I/O pass
  - fills `promptTemplate`
  - fills `inputs`
  - fills `outputs`
  - fills `inputBindings`

- Conditions pass
  - fills top-level `conditions`
  - fills step-level `condition`
  - adjusts condition-driven `dependsOn`

Important note:

- The older structure pass was removed.
- This means refine no longer corrects `kind` or `endpointKey` as a normal step.

Current failure behavior:

- Refinement now throws on failure.
- It no longer silently falls back to the base workflow.

This is important because silent fallback previously hid the real problem and made it look like Gemini had returned a refined workflow when it had not.

### 6. Validation repair

File:

- [src/workflows/WorkflowValidateNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowValidateNode.js)

Purpose:

- Check whether the workflow is internally consistent.
- Optionally ask Gemini to repair a workflow that failed validation.

Current validation focus:

- Missing endpoint keys
- Missing inputs
- Missing outputs
- Missing required bindings
- Unknown endpoint keys
- Unresolved data-flow references

Important note:

- Proxy-style heuristic repairs were intentionally removed.
- Validation is now more literal and less likely to invent missing structure locally.

## Why Gemini can appear to "fail"

There are two broad failure classes in this repo.

### 1. Technical invocation failures

These are not really "LLM slop." They are wrapper or execution failures.

Examples:

- `spawn E2BIG`
  Prompt was too large for CLI arg transport.

- Empty `stdout`
  Gemini CLI returned no usable output.

- Timeout
  Gemini CLI took too long and the wrapper killed it.

- Invalid JSON
  Gemini returned text that did not match the required schema.

### 2. Pipeline-shape failures

These are cases where Gemini returned something, but not enough for the pipeline to proceed cleanly.

Examples:

- A runtime step gets an endpoint but no `inputs` or `outputs`.
- A step that should be `llm_step` stays `runtime_tool`.
- A condition is referenced but not defined.
- Required `inputBindings` are omitted.

These are not always pure model failures. Sometimes they happen because earlier pipeline stages passed an ambiguous workflow shape forward.

## Known repository-specific failure pattern

One recurring failure in this repo is:

- Draft emits a step like `generate_welcome_message`
- The step is not strongly typed as non-runtime upstream
- Map/refine trust the existing structure too literally
- Refine tries to fill execution details but the step is still malformed
- Validation then reports:
  - missing endpoint
  - missing outputs
  - wrong kind or unusable structure

This is not usually caused by "big outputs." It is more often caused by:

- bad step typing upstream
- incomplete refine output
- or a thrown refine failure that used to be hidden by fallback

## How to diagnose Gemini issues

### Check the wrapper logs

Look in:

- `Masterlog.log`

Useful signals:

- `mode=args` vs `mode=stdin`
- `promptChars`
- `stdoutChars`
- `stderrChars`
- empty-stdout retry warnings

If `stdoutChars=0` repeatedly, the problem is likely at the Gemini CLI or prompt-contract level.

### Check cached workflow JSON

Look in:

- [src/tool_cache/confirmed_workflow.json](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/tool_cache/confirmed_workflow.json)

Useful signals:

- `refinement.strategy`
- `validation.errors`
- whether steps have:
  - `endpointKey`
  - `inputs`
  - `outputs`
  - `inputBindings`

If `inputs` are empty and `outputs` are missing everywhere, refine probably did not complete successfully.

### Distinguish runtime failure from model incompleteness

Likely runtime failure:

- Gemini returned empty output
- Gemini returned malformed JSON
- process errors like `E2BIG`
- refine throws before producing a valid result

Likely model or prompt-contract failure:

- JSON parses successfully
- but required fields are omitted
- or step-level intent is still wrong

## Current design constraints

This repo intentionally avoids proxy-style helper logic in several workflow stages.

That means:

- The pipeline prefers explicit LLM output over local heuristic filling.
- Missing fields should generally be fixed by better prompts or better upstream structure.
- Silent local "smart" repair is discouraged.

This is a deliberate tradeoff:

- Better transparency
- Less accidental invention
- But more visible failures when Gemini output is incomplete

## Best practices for editing Gemini prompts here

### Keep contracts narrow

Each Gemini prompt should own a limited set of fields.

Good:

- map endpoints chooses endpoint candidates
- refine I/O fills inputs/outputs/bindings
- refine conditions fills conditions only

Bad:

- one giant prompt that tries to re-plan, re-type, re-map, re-bind, and re-validate everything at once

### Keep endpoint context compact

Do not pass the whole endpoint index when a smaller catalog is enough.

Prefer compact fields such as:

- `key`
- `summary`
- `inputs`
- `produces`

### Fail loudly when completeness matters

For later stages like refine:

- do not silently continue if required fields are missing
- surface the actual failure reason

### Avoid rewriting the user request

The repo policy is to preserve the raw user query through synthesis mode.

## Troubleshooting checklist

If Gemini-based synthesis fails, check these in order:

1. Did Gemini CLI run at all?
   - Look for process errors such as `E2BIG`.

2. Did Gemini return non-empty `stdout`?
   - If no, inspect `stderr` and wrapper logs.

3. Did JSON parse against the expected schema?
   - If no, the prompt contract is too weak or Gemini ignored it.

4. Did the workflow stage get the fields it owns?
   - Map stage: endpoint choices
   - Refine I/O stage: inputs, outputs, bindings, promptTemplate
   - Refine condition stage: conditions and conditional dependencies

5. Was the upstream workflow shape already wrong?
   - Especially step `kind`
   - Especially non-runtime steps accidentally treated as runtime

6. Are validation errors literal missing-field errors?
   - If yes, inspect whether refine ever succeeded.

## Recommended future improvements

- Add explicit refine error logging to `Masterlog.log`
- Persist raw Gemini responses for failed refine attempts in debug mode
- Keep prompt payloads small and avoid repeated large JSON blocks
- Improve upstream draft typing for clearly non-runtime steps
- Add per-stage debug metadata indicating:
  - prompt name
  - success/failure
  - parse success
  - completeness assertion result

## Related files

- [AGENTS.md](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/AGENTS.md)
- [src/core/llm/geminiCli.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/core/llm/geminiCli.js)
- [src/selection/ConfirmIntent.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/ConfirmIntent.js)
- [src/selection/DomainSelect.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/DomainSelect.js)
- [src/workflows/WorkflowDraftHelper.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowDraftHelper.js)
- [src/workflows/WorkflowMapEndpointsHelper.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowMapEndpointsHelper.js)
- [src/workflows/WorkflowRefineNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowRefineNode.js)
- [src/workflows/WorkflowValidateNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowValidateNode.js)
- [src/tool_cache/confirmed_workflow.json](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/tool_cache/confirmed_workflow.json)
