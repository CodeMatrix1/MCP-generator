# Selection

## Purpose
This directory contains the early query-understanding and endpoint-selection stages used before workflow synthesis becomes detailed.

The selection layer answers three questions:

1. What does the user want?
2. Which Rocket.Chat domains are relevant?
3. Which endpoints are plausible candidates for the request?

## Files

- [ConfirmIntent.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/ConfirmIntent.js)
  Confirms the raw user request in a structured way without rewriting the task.

- [DomainSelect.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/DomainSelect.js)
  Maps the query to domain tags and keywords used to narrow endpoint retrieval.

- [IntentToCandEndpoints.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/IntentToCandEndpoints.js)
  Converts selection output into a candidate endpoint set.

- [FinalEndpoints.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/FinalEndpoints.js)
  Handles narrowing or finalizing endpoint choices before workflow execution stages.

- [service.js](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/service.js)
  Orchestrates selection-stage execution for the rest of the app.

- [lib](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/lib)
  Shared helpers used by selection modules.

## Typical flow

The normal selection path is:

1. Confirm intent from the raw query.
2. Classify the query into Rocket.Chat domains.
3. Retrieve or rank candidate endpoints from those domains.
4. Pass the candidate endpoint set into the workflow pipeline.

## Design notes

- The user query should be preserved as raw input.
- Selection should narrow the search space, not invent workflow execution details.
- Endpoint selection here is upstream context for workflows, not the final executable plan.

## Related docs

- [GEMINI.md](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/GEMINI.md)
- [AGENTS.md](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/AGENTS.md)
