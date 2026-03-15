# RC_MCP_Synthesizer Agent Guide

## Purpose
This repository has two distinct operating modes:

1. MCP synthesis mode
Use this when the user wants to build, regenerate, refine, or start an MCP server for Rocket.Chat capabilities.

2. MCP usage mode
Use this when the user wants to perform Rocket.Chat actions through an already running MCP server, such as creating channels, sending messages, or managing DMs.

## Routing rules
- If the user asks to build, create, regenerate, refine, select endpoints, or start the Rocket.Chat MCP, use `/create:create`.
- If the user gives a direct Rocket.Chat action request and the MCP server is already running, do not use `/create:create`. Use the live MCP tools exposed by the running server instead.
- Do not answer a direct Rocket.Chat action request with a synthesis explanation if the request can be satisfied by calling an available MCP tool.
- If the live MCP server is not running or does not expose the required tools, say that briefly and then use `/create:create` to add the missing capability.

## Query handling
- Treat the user's Rocket.Chat request as raw input.
- Do not rewrite, expand, normalize, or reinterpret the request before passing it to the synthesis flow.
- For synthesis, `/create:create` should ask for the raw query and pass it unchanged to:
  `node ./bin/mcp-synth.js --no-server --json --query "{{args}}"`

## Live MCP usage
- The Gemini MCP manifest for this repo is at `src/gemini-extension.json`.
- The Rocket.Chat MCP server endpoint is `http://localhost:3001`.
- After the server is started, normal user requests like "create a channel called made_with_gemini and say hi" should be handled as tool-use requests, not as synthesis tasks.

## Fallback behavior
- If a requested Rocket.Chat action is missing from the currently loaded tools, explain which capability is missing in one short sentence.
- Then switch to synthesis mode to regenerate the MCP with the missing endpoints.
