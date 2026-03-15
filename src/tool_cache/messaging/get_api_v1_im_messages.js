import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "GET";
const ROUTE_PATH = "/api/v1/dm.messages";
const TOOL_KEY = "get-api-v1-im.messages";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "List DM Messages",
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
      "description": "The number of items to return.  Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#pagination) to learn more.",
      "schema": {
        "type": "integer"
      },
      "example": 50
    },
    {
      "name": "fields",
      "in": "query",
      "required": false,
      "description": "This parameter accepts a JSON object with properties that have a value of 1 or 0 to include or exclude them in the response. For example, to only retrieve the usernames of users: fields=`{ \"username\": 1 }`. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#query-and-fields) to learn more.",
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "query",
      "in": "query",
      "required": false,
      "description": "This parameter allows you to use MongoDB query operators to search for specific data. For example, to query users with a name that contains the letter \"g\": query=`{ \"name\": { \"$regex\": \"g\" }}`. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#query-and-fields) to learn more.",
      "schema": {}
    },
    {
      "name": "roomId",
      "in": "query",
      "required": false,
      "description": "The room ID of the DM. It is required if `username` is not provided.",
      "schema": {
        "type": "string"
      }
    },
    {
      "name": "username",
      "in": "query",
      "required": false,
      "description": "The username of the user in the DM. It is required if `roomId` is not provided.",
      "schema": {
        "type": "string"
      }
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
        "type": "string"
      },
      "example": "true"
    },
    {
      "name": "sort",
      "in": "query",
      "required": false,
      "description": "Sort the order in which messages are returned, ascending (`1`) or descending (`-1`). The options are:\n * `ts`: Sort by message timestamp. For example, `{\"ts\": -1}`, this is the default sorting mechanism.\n * `u.username`: Sort by username. For example, `{\"u.username\": 1}`.\n * `msg`: Sort by message content. For example, `{\"msg\": 1}`.\n * `_id`: Sort by message ID. For example, `{\"_id\": -1}`.\n * `mentions._id`: Sort by mentioned user IDs. For example, `{\"mentions._id\": 1}`.",
      "schema": {}
    }
  ],
  "requestSchema": null
},
};

export async function get_api_v1_im_messages(args = {}, context = {}) {
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

export default get_api_v1_im_messages;
