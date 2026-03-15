import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "GET";
const ROUTE_PATH = "/api/v1/channels.messages";
const TOOL_KEY = "get-api-v1-channels.messages";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Get Channel Messages",
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
    },
    {
      "name": "roomId",
      "in": "query",
      "required": true,
      "description": "The room id.",
      "schema": {
        "type": "string"
      },
      "example": "jdiue8TGkodp"
    },
    {
      "name": "count",
      "in": "query",
      "required": false,
      "description": "The number of items to return. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#pagination) to learn more.",
      "schema": {
        "type": "integer"
      },
      "example": 50
    },
    {
      "name": "sort",
      "in": "query",
      "required": false,
      "description": "List of fields to order by, and in which direction. This is a JSON object, with properties listed in desired order, with values of 1 for ascending, or -1 for descending. For example, {\"value\": -1, \"_id\": 1}. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#pagination) to learn more.",
      "schema": {}
    },
    {
      "name": "offset",
      "in": "query",
      "required": false,
      "description": "Number of items to \"skip\" in the query, i.e. requests return count items, skipping the first offset items. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#pagination) to learn more.",
      "schema": {
        "type": "integer"
      },
      "example": 50
    },
    {
      "name": "mentionIds",
      "in": "query",
      "required": false,
      "description": "Filter the messages where a user has been mentioned by the userId. For a set of userIds, use an array (`[\"838ndhd79w\", \"dud0wu900\"]`).",
      "schema": {
        "type": "string"
      },
      "example": "838ndhd79w"
    },
    {
      "name": "starredIds",
      "in": "query",
      "required": false,
      "description": "Filter the messages a user have starred by userId. For a set of userIds, use an array (`[\"838ndhd79w\", \"dud0wu900\"]`).",
      "schema": {
        "type": "string"
      },
      "example": "dud0wu900"
    },
    {
      "name": "pinned",
      "in": "query",
      "required": false,
      "description": "Filter pinned messages.",
      "schema": {
        "type": "boolean"
      },
      "example": "true"
    }
  ],
  "requestSchema": null
},
};

export async function get_api_v1_channels_messages(args = {}, context = {}) {
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

export default get_api_v1_channels_messages;
