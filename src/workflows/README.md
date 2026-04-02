# Workflows

## Purpose
This directory contains the workflow-synthesis pipeline that turns a raw Rocket.Chat request plus endpoint context into an executable MCP workflow.

The workflow layer is responsible for:

1. drafting workflow steps
2. mapping steps to endpoints
3. refining step execution details
4. validating the workflow
5. generating executable module code

## Major stages

### Intent and tag nodes

- [WorkflowConfirmIntentNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowConfirmIntentNode.js)
  Workflow graph entry for intent confirmation.

- [WorkflowClassifyTagsNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowClassifyTagsNode.js)
  Workflow graph entry for domain/tag classification.

### Candidate retrieval and selection

- [WorkflowRetrieveCandidatesNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowRetrieveCandidatesNode.js)
  Pulls candidate endpoints from the endpoint index using upstream query/domain context.

- [WorkflowSelectFinalEndpointsNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowSelectFinalEndpointsNode.js)
  Narrows candidate endpoints into a final selected set used downstream.

### Drafting and review

- [WorkflowDraftNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowDraftNode.js)
  Produces the first structured workflow from the user query.

- [WorkflowDraftHelper.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowDraftHelper.js)
  Prompt-building, normalization, and schema logic for drafting.

- [WorkflowReviewDraftNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowReviewDraftNode.js)
  Reviews or stabilizes the drafted workflow.

- [WorkflowFinalizeDraftNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowFinalizeDraftNode.js)
  Finalizes draft-stage output before endpoint mapping.

- [WorkflowFinalizePlanNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowFinalizePlanNode.js)
  Final plan-shaping stage before execution details are filled.

### Endpoint mapping

- [WorkflowMapEndpointsNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowMapEndpointsNode.js)
  Takes the drafted workflow and selected endpoint pool, then asks Gemini to map step-level endpoint choices.

- [WorkflowMapEndpointsHelper.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowMapEndpointsHelper.js)
  Builds the mapping prompt, validates structured endpoint output, and merges candidate selections back into the workflow.

### Refinement

- [WorkflowRefineNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowRefineNode.js)
  Refines a mapped workflow into an execution-ready shape using focused LLM passes for I/O and conditions.

- [WorkflowRefineHelper.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowRefineHelper.js)
  Shared helpers for merging partial step patches and building endpoint-selection maps.

### Validation

- [WorkflowValidateNode.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowValidateNode.js)
  Checks whether the current workflow is complete and internally consistent and may attempt LLM-based repair.

- [WorkflowValidateHelper.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowValidateHelper.js)
  Data-flow and required-input validation helpers.

### Code generation

- [WorkflowCodegen.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowCodegen.js)
  Converts the validated workflow into executable JavaScript using templates and a final Gemini refinement pass.

- [templates](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/templates)
  Handlebars templates and partials used by code generation.

### Shared workflow utilities

- [WorkflowNodeHelpers.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowNodeHelpers.js)
  Shared normalization, dependency-ordering, and endpoint-index helpers.

- [WorkflowNodes.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowNodes.js)
  Node wiring and workflow graph composition.

- [store.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/store.js)
  Workflow-stage persistence and state helpers.

## Typical pipeline

The workflow path usually looks like this:

1. confirm intent
2. classify tags
3. retrieve candidate endpoints
4. draft workflow
5. select final endpoints
6. map endpoints onto workflow steps
7. refine inputs, outputs, bindings, and conditions
8. validate the workflow
9. generate executable code

## Important design notes

- Draft should establish the right step shape early, especially for non-runtime steps such as `llm_step`.
- Endpoint mapping should be the main source of runtime `endpointKey` decisions.
- Refinement should fill execution details, not silently invent structure through local heuristics.
- Validation should be a literal gate that exposes incompleteness rather than hiding it.
- Code generation should assume workflow intent is already settled and focus on producing runnable module code.

## Failure patterns worth knowing

- If a step that should be `llm_step` stays `runtime_tool`, refine and validate will usually struggle downstream.
- If refine throws or returns incomplete JSON, later workflow artifacts may be missing `inputs`, `outputs`, or `inputBindings`.
- If prompt payloads grow too large, Gemini CLI invocation can fail before any workflow stage logic completes.

## Related docs

- [GEMINI.md](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/GEMINI.md)
- [AGENTS.md](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/AGENTS.md)
