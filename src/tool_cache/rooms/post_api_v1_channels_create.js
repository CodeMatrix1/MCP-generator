import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "POST";
const ROUTE_PATH = "/api/v1/channels.create";
const TOOL_KEY = "post-api-v1-channels.create";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Create Channel",
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
      "name": {
        "type": "string",
        "description": "The name of the channel."
      },
      "members": {
        "type": "array",
        "description": "An array of the users to be added to the channel when it is created.",
        "items": {
          "type": "string"
        }
      },
      "readOnly": {
        "type": "boolean",
        "description": "Set if the channel is read only or not. It is `false` by default."
      },
      "excludeSelf": {
        "type": "boolean",
        "description": "If set to true, the user calling the endpoint is not automatically added as a member of the channel. The default `value` is false."
      },
      "customFields": {
        "type": "object",
        "description": "If you have defined custom fields for your workspace, you can provide them in this object parameter. For details, see the <a href='https://docs.rocket.chat/docs/custom-fields' target='_blank'>Custom Fields</a> document."
      },
      "extraData": {
        "type": "object",
        "description": "Enter the following details for the object:\n- `broadcast`: Whether the channel should be a broadcast room.\n- `encrypted`: Whether the channel should be encrypted.\n- `teamId`: Enter an existing team ID for this channel. You need the `create-team-channel` permission to add a team to a channel.\n\nFor more information, see <a href='https://docs.rocket.chat/use-rocket.chat/user-guides/rooms/channels#channel-privacy-and-encryption' target='_blank'>Channels</a>"
      }
    },
    "required": [
      "name"
    ]
  }
},
};

export async function post_api_v1_channels_create(args = {}, context = {}) {
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

export default post_api_v1_channels_create;
