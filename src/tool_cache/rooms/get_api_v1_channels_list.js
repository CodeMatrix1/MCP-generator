import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "GET";
const ROUTE_PATH = "/api/v1/channels.list";
const TOOL_KEY = "get-api-v1-channels.list";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Get Channel List",
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
    },
    {
      "name": "sort",
      "in": "query",
      "required": false,
      "description": "Sort the channels in ascending (`1`) or descending (`-1`) order. The value must be entered as a JSON object. The options are as follows:\n * `name`: Sort by the channel name. For example, `sort={\"name\":1}` (this is the default sorting mechanism).\n * `ts`: Sort by channel creation timestamp. For example, `sort={\"ts\":-1}`\n * `usersCount`: Sort by the number of users in the channel. For example, `sort={\"usersCount\":1}`",
      "schema": {
        "type": "string"
      }
    }
  ],
  "requestSchema": null
},
};

export async function get_api_v1_channels_list(args = {}, context = {}) {
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

export default get_api_v1_channels_list;
