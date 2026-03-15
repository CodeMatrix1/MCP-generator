import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "GET";
const ROUTE_PATH = "/api/v1/channels.anonymousread";
const TOOL_KEY = "get-api-v1-channels.anonymousread";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Read Channel Messages Anonymously",
  input: {
  "parameters": [
    {
      "name": "roomId",
      "in": "query",
      "required": false,
      "description": "The room ID. It is required if the `roomName` is not provided.",
      "schema": {
        "type": "string"
      },
      "example": "dlpfuijw7ej"
    },
    {
      "name": "roomName",
      "in": "query",
      "required": false,
      "description": "The room name.  It is required if the `roomId` is not provided.",
      "schema": {
        "type": "string"
      },
      "example": "general"
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
      "name": "query",
      "in": "query",
      "required": false,
      "description": "This parameter allows you to use MongoDB query operators to search for specific data. For example, to query users with a name that contains the letter \"g\": `query={ \"name\": { \"$regex\": \"g\" } }`. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#query-and-fields) to learn more.",
      "schema": {}
    },
    {
      "name": "fields",
      "in": "query",
      "required": false,
      "description": "This parameter accepts a JSON object with properties that have a value of 1 or 0 to include or exclude them in the response. For example, to only retrieve the usernames of users: `fields={ \"username\": 1 }`. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#query-and-fields) to learn more.",
      "schema": {
        "type": "string"
      }
    }
  ],
  "requestSchema": null
},
};

export async function get_api_v1_channels_anonymousread(args = {}, context = {}) {
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

export default get_api_v1_channels_anonymousread;
