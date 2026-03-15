# RC MCP Synthesizer

This repo generates Rocket.Chat MCP tools from natural-language capability requests and serves them through a local MCP server.

## Modes

- `/mcp:generate`
  - planning + generation
  - this is the only mode that should use `--from-last-selection`
  - `--from-last-selection` here means "reuse the just-saved generated endpoint set to start the runtime server"
- `/mcp:execute`
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
node scripts/mcp-call.js rc.auth.configure '{"baseUrl":"http://localhost:3000","authToken":"...","userId":"..."}'
```

To clear saved runtime auth:

```bash
rm -f .mcp-auth.json
```
