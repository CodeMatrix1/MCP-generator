import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "POST";
const ROUTE_PATH = "/api/v1/chat.update";
const TOOL_KEY = "post-api-v1-chat.update";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Update Message",
  input: {
  "parameters": [
    {
      "name": "X-Auth-Token",
      "in": "header",
      "required": true,
      "description": "The `authToken` of the authenticated user.",
      "schema": {
        "type": "string"
      },
      "example": "RScctEHSmLGZGywfIhWyRpyofhKOiMoUIpimhvheU3f"
    },
    {
      "name": "X-User-Id",
      "in": "header",
      "required": true,
      "description": "The `userId` of the authenticated user.",
      "schema": {
        "type": "string"
      },
      "example": "rbAXPnMktTFbNpwtJ"
    }
  ],
  "requestSchema": {
    "type": "object",
    "properties": {
      "roomId": {
        "type": "string",
        "description": "The room ID where the message is."
      },
      "msgId": {
        "type": "string",
        "description": "The message ID to update."
      },
      "text": {
        "type": "string",
        "description": "Updated text for the message."
      },
      "previewUrls": {
        "type": "array",
        "description": "An array to define which URL previews should be retrieved from each message.",
        "items": {
          "type": "string"
        }
      },
      "customFields": {
        "type": "object",
        "description": "You can add custom fields for messages. For example, set priorities for messages.\n\nYou must enable this option and define the validation in the workspace settings. See the <a href='https://docs.rocket.chat/use-rocket.chat/workspace-administration/settings/message' target='_blank'>Message</a> settings for further information.",
        "example": {
          "priority": "high"
        }
      }
    },
    "required": [
      "roomId",
      "msgId",
      "text"
    ]
  }
},
};

export async function post_api_v1_chat_update(args = {}, context = {}) {
  const {
    baseUrl = process.env.BASE_URL,
    pathParams = {},
    query = {},
    headers = {},
    body,
    signal,
  } = context;

  const resolvedBaseUrl = resolveBaseUrl(baseUrl);
  const resolvedPath = interpolatePath(ROUTE_PATH, pathParams);
  const queryString = encodeQuery(query);
  const url = queryString
    ? `${resolvedBaseUrl}${resolvedPath}?${queryString}`
    : `${resolvedBaseUrl}${resolvedPath}`;

  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };

  const request = {
    method: METHOD,
    headers: requestHeaders,
    signal,
  };

  if (METHOD !== "GET" && METHOD !== "HEAD") {
    const payload = body === undefined ? args : body;
    if (payload !== undefined) {
      request.headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(payload);
    }
  }

  const response = await fetch(url, request);
  const text = await response.text();
  let parsed;

  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const reason = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${TOOL_KEY}: ${reason}`);
  }

  return parsed;
}

export default post_api_v1_chat_update;
