import { executeToolRequest } from '../../Tool_gen/Lib/ToolInternals.js';

const TOOL_KEY = "get-api-v1-users.list";
const METHOD = "GET";
const ROUTE_PATH = "/api/v1/users.list";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Get Users List",
  input: {
  "parameters": [
    {
      "name": "X-Auth-Token",
      "in": "header",
      "required": true,
      "description": "The authenticated user token.",
      "schema": {
        "type": "string"
      },
      "example": "RScctEHSmLGZGywfIhWyRpyofhKOiMoUIpimhvheU3f"
    },
    {
      "name": "X-User-Id",
      "in": "header",
      "required": true,
      "description": "The authenticated user ID.",
      "schema": {
        "type": "string"
      },
      "example": "rbAXPnMktTFbNpwtJ"
    },
    {
      "name": "query",
      "in": "query",
      "required": false,
      "description": "This parameter allows you to use [MongoDB query](https://www.mongodb.com/docs/manual/reference/operator/query/) operators to search for specific data. For example, to query users with a name that contains the letter \"g\": query=`{ \"name\": { \"$regex\": \"g\" } }`. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#query-and-fields) to learn more. ",
      "schema": {}
    },
    {
      "name": "fields",
      "in": "query",
      "required": false,
      "description": " This parameter accepts a JSON object with properties that have a value of 1 or 0 to include or exclude them in the response. For example, to only retrieve the usernames of users: fields=`{ \"username\": 1 }`. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#query-and-fields) to learn more.",
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
      "name": "count",
      "in": "query",
      "required": false,
      "description": "How many items to return. Refer to the [official documentation](https://developer.rocket.chat/apidocs/query-parameters#pagination) to learn more.",
      "schema": {
        "type": "integer"
      },
      "example": 50
    },
    {
      "name": "sort",
      "in": "query",
      "required": false,
      "description": "Sort the users in ascending (`1`) or descending (`-1`) order. The value must be entered as a JSON string. The options are as follows:\n * `status`: Sort by users' status. For example, `sort={\"status\":1}` (this maps to the `active` status).\n * `createdAt`: Sort by the time of user creation. For example, `sort={\"createdAt\":-1}`\n * `sort`: Sort by user name. For example, `sort={\"name\":1}`",
      "schema": {
        "type": "string"
      }
    }
  ],
  "requestSchema": null
},
  output: {
  "successStatus": "200",
  "description": "OK",
  "responseSchema": {
    "type": "object",
    "properties": {
      "users": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "_id": {
              "type": "string"
            },
            "username": {
              "type": "string"
            },
            "emails": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "address": {
                    "type": "string"
                  },
                  "verified": {
                    "type": "boolean"
                  }
                }
              }
            },
            "type": {
              "type": "string"
            },
            "status": {
              "type": "string"
            },
            "active": {
              "type": "boolean"
            },
            "roles": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "name": {
              "type": "string"
            },
            "lastLogin": {
              "type": "string"
            },
            "nameInsensitive": {
              "type": "string"
            },
            "avatarETag": {
              "type": "string"
            }
          }
        }
      },
      "count": {
        "type": "integer"
      },
      "offset": {
        "type": "integer"
      },
      "total": {
        "type": "integer"
      },
      "success": {
        "type": "boolean"
      }
    }
  },
  "outputFields": [
    {
      "name": "users",
      "path": "users",
      "type": "array",
      "description": ""
    },
    {
      "name": "_id",
      "path": "users[]._id",
      "type": "string",
      "description": ""
    },
    {
      "name": "username",
      "path": "users[].username",
      "type": "string",
      "description": ""
    },
    {
      "name": "emails",
      "path": "users[].emails",
      "type": "array",
      "description": ""
    },
    {
      "name": "address",
      "path": "users[].emails[].address",
      "type": "string",
      "description": ""
    },
    {
      "name": "verified",
      "path": "users[].emails[].verified",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "type",
      "path": "users[].type",
      "type": "string",
      "description": ""
    },
    {
      "name": "status",
      "path": "users[].status",
      "type": "string",
      "description": ""
    },
    {
      "name": "active",
      "path": "users[].active",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "roles",
      "path": "users[].roles",
      "type": "array",
      "description": ""
    },
    {
      "name": "name",
      "path": "users[].name",
      "type": "string",
      "description": ""
    },
    {
      "name": "lastLogin",
      "path": "users[].lastLogin",
      "type": "string",
      "description": ""
    },
    {
      "name": "nameInsensitive",
      "path": "users[].nameInsensitive",
      "type": "string",
      "description": ""
    },
    {
      "name": "avatarETag",
      "path": "users[].avatarETag",
      "type": "string",
      "description": ""
    },
    {
      "name": "count",
      "path": "count",
      "type": "integer",
      "description": ""
    },
    {
      "name": "offset",
      "path": "offset",
      "type": "integer",
      "description": ""
    },
    {
      "name": "total",
      "path": "total",
      "type": "integer",
      "description": ""
    },
    {
      "name": "success",
      "path": "success",
      "type": "boolean",
      "description": ""
    }
  ]
},
};

export async function get_api_v1_users_list(args = {}, context = {}) {
  return executeToolRequest({
    toolKey: TOOL_KEY,
    method: METHOD,
    routePath: ROUTE_PATH,
    args,
    context,
  });
}

export default get_api_v1_users_list;
