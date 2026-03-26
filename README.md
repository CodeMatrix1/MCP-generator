# RC MCP Synthesizer

This repo generates Rocket.Chat MCP tools from natural-language capability requests and serves them through a local MCP server.

## Architecture

The project is organized around two runtime roles:

- `Control MCP`
  - handles planning, workflow drafting, endpoint narrowing, final selection, and generation
- `Runtime MCP`
  - loads only the generated tools and executes the accepted workflow against Rocket.Chat

At a high level, the system follows three stages:

1. `Selection`
   - interpret the request and build a workflow-oriented plan
2. `Generation`
   - generate a minimal MCP toolset and workflow modules from the accepted plan
3. `Serve`
   - execute the generated runtime artifacts through the local runtime server

## Selection Pipeline

Selection is orchestrated in [`src/selection/service.js`](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/selection/service.js) using `@langchain/langgraph`.

The graph runs in this order:

1. `classify_tags`
   - classify the query into Rocket.Chat domains and tags
2. `retrieve_candidates`
   - narrow the Rocket.Chat API surface to a candidate endpoint pool
3. `draft_workflow`
   - convert the free-form query into an abstract serve-only workflow
4. `select_final_endpoints`
   - choose the final endpoint set from the candidate pool
5. `map_endpoints`
   - map workflow steps to endpoint candidates and runtime-facing step metadata
6. `refine_workflow`
   - improve the workflow structure and step composition after mapping
7. `validate_selection`
   - verify that the workflow and endpoint mapping are usable
8. `finalize_plan`
   - return the final structured planning artifact

This graph-based design keeps intermediate state explicit, so the system can preserve artifacts such as parsed domains, candidate endpoints, draft workflows, refined workflows, mapped steps, and validation output.

## Workflow Model

Workflow drafting starts in [`src/workflows/WorkflowSelect.js`](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowSelect.js).

The draft workflow is intentionally abstract. It contains:

- `key`
- `label`
- `description`
- `inputSchema`
- ordered `steps`

At this stage, the workflow describes what should happen semantically, not which exact Rocket.Chat endpoint should be called. This keeps the workflow usable as the main planning artifact for review, refinement, regeneration, and endpoint mapping.

Drafting is LLM-driven through the local Gemini bridge, but the result is parsed into structured JSON and validated before later stages consume it.

Workflow refinement happens in [`src/workflows/WorkflowRefineNode.js`](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/workflows/WorkflowRefineNode.js). This stage improves the workflow structure after endpoint mapping and can shape richer step kinds such as runtime steps, LLM steps, compute steps, condition steps, and loop steps when needed.

## Generation Pipeline

Generation is coordinated in [`src/generation/service.js`](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/generation/service.js).

After a selection is accepted, the generation layer:

1. collects the final selected endpoints
2. resolves workflow steps into executable endpoint candidates
3. clears the previous tool cache
4. generates MCP tool modules for the selected Rocket.Chat operations
5. writes executable workflow modules into `src/tool_cache/workflows`
6. saves artifacts such as `last_selection.json`, `confirmed_workflow.json`, and the generated manifest

This means the planning output is compiled into concrete runtime artifacts instead of remaining only as selection metadata.

## Runtime Execution

Runtime execution is handled by [`src/MCP_Runtime_Server.js`](/home/vallabh/github/MCP_Tryouts/RC_MCP_Synthesizer/src/MCP_Runtime_Server.js).

When the runtime server starts, it:

1. scans the generated tool cache
2. dynamically imports each generated tool module
3. registers the tool metadata and handlers in memory
4. exposes lightweight endpoints such as `/tools`, `/health`, and `/call/:key`

During execution, the runtime server does not redo planning. It uses the generated workflow and tool bindings from the earlier phases and dispatches calls directly to the generated tool functions with their resolved arguments and context.

## Main Libraries

- `@langchain/langgraph`
  - graph-based orchestration for the selection pipeline
- `ajv`
  - JSON Schema validation for workflow drafts and executable workflow structures
- `express`
  - local runtime server for generated MCP tool execution
- `handlebars`
  - workflow/module code generation from templates
- `commander`
  - CLI entry points such as `mcp-generate` and runtime calls
- `dotenv`
  - runtime configuration loading
- `@dqbd/tiktoken`
  - token counting for prompt-size accounting

## Modes

- `/mcp:generate`
  - planning + generation
  - this is the only mode that should use `--from-last-selection`
  - `--from-last-selection` here means "reuse the just-saved generated endpoint set to start the runtime server"
- `/mcp:serve`
  - live action mode
  - should use only the control/runtime servers
  - should not talk about `--from-last-selection` during normal requests

## Auth setup

Add your Rocket.Chat auth values in `.env`.

Supported variables:

```env
BASE_URL="http://localhost:3000"
ROCKETCHAT_BASE_URL=""

ROCKETCHAT_AUTH_TOKEN=""
ROCKETCHAT_USER_ID=""

AUTH_TOKEN=""
USER_ID=""
```

Notes:

- `ROCKETCHAT_BASE_URL` overrides `BASE_URL` if both are set.
- `ROCKETCHAT_AUTH_TOKEN` or `AUTH_TOKEN` will be sent as `X-Auth-Token`.
- `ROCKETCHAT_USER_ID` or `USER_ID` will be sent as `X-User-Id`.

Example:

```env
ROCKETCHAT_BASE_URL="http://localhost:3000"
ROCKETCHAT_AUTH_TOKEN="your_auth_token_here"
ROCKETCHAT_USER_ID="your_user_id_here"
MCP_SERVER_PORT="3001"
MCP_SERVER_HOST="127.0.0.1"
```

After updating `.env`, restart the MCP server.

## On-the-spot auth

If auth is missing during `/mcp:execute`, the system can ask for:

- base URL
- auth token
- user ID

and store them at runtime through:

```bash
node src/cli/mcp-call.js rc.server.overview '{"baseUrl":"http://localhost:3000","authToken":"...","userId":"..."}'
```

To clear saved runtime auth:

```bash
rm -f .mcp-auth.json
```
