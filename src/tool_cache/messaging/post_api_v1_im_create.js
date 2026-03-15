import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "POST";
const ROUTE_PATH = "/api/v1/dm.create";
const TOOL_KEY = "post-api-v1-im.create";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Create DM",
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
    "oneOf": [
      {
        "type": "object",
        "properties": {
          "username": {
            "type": "string",
            "description": "The username of the user to open a direct message session."
          },
          "excludeSelf": {
            "type": "boolean",
            "description": "Creates the direct message session excluding the current authenticated user. The session will only be opened if the current user has the `view-room-administration` permission"
          }
        }
      },
      {
        "type": "object",
        "properties": {
          "usernames": {
            "type": "string",
            "description": "Comma-seperated list of usernames to open a multiple direct message session. "
          },
          "excludeSelf": {
            "type": "boolean",
            "description": "Creates the direct message session excluding the current authenticated user. The session will only be opened if the current user has the `view-room-administration` permission"
          }
        }
      }
    ]
  }
},
};

export async function post_api_v1_im_create(args = {}, context = {}) {
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

export default post_api_v1_im_create;
