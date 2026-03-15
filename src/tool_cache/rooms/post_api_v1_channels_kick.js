import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "POST";
const ROUTE_PATH = "/api/v1/channels.kick";
const TOOL_KEY = "post-api-v1-channels.kick";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Remove User from Channel",
  input: {
  "parameters": [],
  "requestSchema": {
    "type": "object",
    "properties": {
      "roomId": {
        "type": "string",
        "description": "The channel's id"
      },
      "userId": {
        "type": "string",
        "description": "The id of the user to be removed."
      }
    },
    "required": [
      "roomId",
      "userId"
    ]
  }
},
};

export async function post_api_v1_channels_kick(args = {}, context = {}) {
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

export default post_api_v1_channels_kick;
