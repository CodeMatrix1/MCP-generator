import { executeToolRequest } from '../../Tool_gen/Lib/ToolInternals.js';

const TOOL_KEY = "get-api-v1-users.info";
const METHOD = "GET";
const ROUTE_PATH = "/api/v1/users.info";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Get User's Info",
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
      "name": "userId",
      "in": "query",
      "required": true,
      "description": "The `userId` of the user. Alternatively, you can use the `username` parameter and value.",
      "schema": {
        "type": "string"
      },
      "example": "W7NHuX5ri2e3mu2Fc"
    },
    {
      "name": "includeUserRooms",
      "in": "query",
      "required": false,
      "description": "Enter whether or not the rooms that the user is a member of are included in the response. To view the list of rooms, you need the `view-other-user-channels` permission.",
      "schema": {
        "type": "boolean",
        "example": true
      },
      "example": true
    },
    {
      "name": "importId",
      "in": "query",
      "required": false,
      "description": "You can use this parameter to search for users that were imported from external channels, such as Slack. You can also get the value of the import ID using this endpoint if you have the `view-full-other-user-info` permission.",
      "schema": {
        "type": "string",
        "example": "hXBuCLPDnsLgSJLiL"
      },
      "example": "hXBuCLPDnsLgSJLiL"
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
      "user": {
        "type": "object",
        "properties": {
          "_id": {
            "type": "string"
          },
          "createdAt": {
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
          "requirePasswordChange": {
            "type": "boolean"
          },
          "lastLogin": {
            "type": "string"
          },
          "statusConnection": {
            "type": "string"
          },
          "utcOffset": {
            "type": "integer"
          },
          "freeSwitchExtension": {
            "type": "string"
          },
          "canViewAllInfo": {
            "type": "boolean"
          }
        }
      },
      "success": {
        "type": "boolean"
      }
    }
  },
  "outputFields": [
    {
      "name": "user",
      "path": "user",
      "type": "object",
      "description": ""
    },
    {
      "name": "_id",
      "path": "user._id",
      "type": "string",
      "description": ""
    },
    {
      "name": "createdAt",
      "path": "user.createdAt",
      "type": "string",
      "description": ""
    },
    {
      "name": "username",
      "path": "user.username",
      "type": "string",
      "description": ""
    },
    {
      "name": "emails",
      "path": "user.emails",
      "type": "array",
      "description": ""
    },
    {
      "name": "address",
      "path": "user.emails[].address",
      "type": "string",
      "description": ""
    },
    {
      "name": "verified",
      "path": "user.emails[].verified",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "type",
      "path": "user.type",
      "type": "string",
      "description": ""
    },
    {
      "name": "status",
      "path": "user.status",
      "type": "string",
      "description": ""
    },
    {
      "name": "active",
      "path": "user.active",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "roles",
      "path": "user.roles",
      "type": "array",
      "description": ""
    },
    {
      "name": "name",
      "path": "user.name",
      "type": "string",
      "description": ""
    },
    {
      "name": "requirePasswordChange",
      "path": "user.requirePasswordChange",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "lastLogin",
      "path": "user.lastLogin",
      "type": "string",
      "description": ""
    },
    {
      "name": "statusConnection",
      "path": "user.statusConnection",
      "type": "string",
      "description": ""
    },
    {
      "name": "utcOffset",
      "path": "user.utcOffset",
      "type": "integer",
      "description": ""
    },
    {
      "name": "freeSwitchExtension",
      "path": "user.freeSwitchExtension",
      "type": "string",
      "description": ""
    },
    {
      "name": "canViewAllInfo",
      "path": "user.canViewAllInfo",
      "type": "boolean",
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

export async function get_api_v1_users_info(args = {}, context = {}) {
  return executeToolRequest({
    toolKey: TOOL_KEY,
    method: METHOD,
    routePath: ROUTE_PATH,
    args,
    context,
  });
}

export default get_api_v1_users_info;
