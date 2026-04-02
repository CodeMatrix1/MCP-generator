import { executeToolRequest } from '../../Tool_gen/Lib/ToolInternals.js';

const TOOL_KEY = "get-api-v1-channels.info";
const METHOD = "GET";
const ROUTE_PATH = "/api/v1/channels.info";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Get Channel Information",
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
      "channel": {
        "type": "object",
        "properties": {
          "_id": {
            "type": "string"
          },
          "fname": {
            "type": "string"
          },
          "customFields": {
            "type": "object"
          },
          "topic": {
            "type": "string"
          },
          "broadcast": {
            "type": "boolean"
          },
          "encrypted": {
            "type": "boolean"
          },
          "name": {
            "type": "string"
          },
          "t": {
            "type": "string"
          },
          "msgs": {
            "type": "integer"
          },
          "usersCount": {
            "type": "integer"
          },
          "u": {
            "type": "object",
            "properties": {
              "_id": {
                "type": "string"
              },
              "username": {
                "type": "string"
              }
            }
          },
          "ts": {
            "type": "string"
          },
          "ro": {
            "type": "boolean"
          },
          "default": {
            "type": "boolean"
          },
          "sysMes": {
            "type": "boolean"
          },
          "_updatedAt": {
            "type": "string"
          },
          "lastMessage": {
            "type": "object",
            "properties": {
              "_id": {
                "type": "string"
              },
              "rid": {
                "type": "string"
              },
              "msg": {
                "type": "string"
              },
              "ts": {
                "type": "string"
              },
              "u": {
                "type": "object",
                "properties": {
                  "_id": {
                    "type": "string"
                  },
                  "username": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  }
                }
              },
              "_updatedAt": {
                "type": "string"
              },
              "urls": {
                "type": "array",
                "items": {
                  "type": "object"
                }
              },
              "mentions": {
                "type": "array",
                "items": {
                  "type": "object"
                }
              },
              "channels": {
                "type": "array",
                "items": {
                  "type": "object"
                }
              },
              "md": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "type": {
                      "type": "string"
                    },
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "type": {
                            "type": "string"
                          },
                          "value": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "lm": {
            "type": "string"
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
      "name": "channel",
      "path": "channel",
      "type": "object",
      "description": ""
    },
    {
      "name": "_id",
      "path": "channel._id",
      "type": "string",
      "description": ""
    },
    {
      "name": "fname",
      "path": "channel.fname",
      "type": "string",
      "description": ""
    },
    {
      "name": "customFields",
      "path": "channel.customFields",
      "type": "object",
      "description": ""
    },
    {
      "name": "topic",
      "path": "channel.topic",
      "type": "string",
      "description": ""
    },
    {
      "name": "broadcast",
      "path": "channel.broadcast",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "encrypted",
      "path": "channel.encrypted",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "name",
      "path": "channel.name",
      "type": "string",
      "description": ""
    },
    {
      "name": "t",
      "path": "channel.t",
      "type": "string",
      "description": ""
    },
    {
      "name": "msgs",
      "path": "channel.msgs",
      "type": "integer",
      "description": ""
    },
    {
      "name": "usersCount",
      "path": "channel.usersCount",
      "type": "integer",
      "description": ""
    },
    {
      "name": "u",
      "path": "channel.u",
      "type": "object",
      "description": ""
    },
    {
      "name": "_id",
      "path": "channel.u._id",
      "type": "string",
      "description": ""
    },
    {
      "name": "username",
      "path": "channel.u.username",
      "type": "string",
      "description": ""
    },
    {
      "name": "ts",
      "path": "channel.ts",
      "type": "string",
      "description": ""
    },
    {
      "name": "ro",
      "path": "channel.ro",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "default",
      "path": "channel.default",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "sysMes",
      "path": "channel.sysMes",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "_updatedAt",
      "path": "channel._updatedAt",
      "type": "string",
      "description": ""
    },
    {
      "name": "lastMessage",
      "path": "channel.lastMessage",
      "type": "object",
      "description": ""
    },
    {
      "name": "_id",
      "path": "channel.lastMessage._id",
      "type": "string",
      "description": ""
    },
    {
      "name": "rid",
      "path": "channel.lastMessage.rid",
      "type": "string",
      "description": ""
    },
    {
      "name": "msg",
      "path": "channel.lastMessage.msg",
      "type": "string",
      "description": ""
    },
    {
      "name": "ts",
      "path": "channel.lastMessage.ts",
      "type": "string",
      "description": ""
    },
    {
      "name": "u",
      "path": "channel.lastMessage.u",
      "type": "object",
      "description": ""
    },
    {
      "name": "_id",
      "path": "channel.lastMessage.u._id",
      "type": "string",
      "description": ""
    },
    {
      "name": "username",
      "path": "channel.lastMessage.u.username",
      "type": "string",
      "description": ""
    },
    {
      "name": "name",
      "path": "channel.lastMessage.u.name",
      "type": "string",
      "description": ""
    },
    {
      "name": "_updatedAt",
      "path": "channel.lastMessage._updatedAt",
      "type": "string",
      "description": ""
    },
    {
      "name": "urls",
      "path": "channel.lastMessage.urls",
      "type": "array",
      "description": ""
    },
    {
      "name": "mentions",
      "path": "channel.lastMessage.mentions",
      "type": "array",
      "description": ""
    },
    {
      "name": "channels",
      "path": "channel.lastMessage.channels",
      "type": "array",
      "description": ""
    },
    {
      "name": "md",
      "path": "channel.lastMessage.md",
      "type": "array",
      "description": ""
    },
    {
      "name": "type",
      "path": "channel.lastMessage.md[].type",
      "type": "string",
      "description": ""
    },
    {
      "name": "value",
      "path": "channel.lastMessage.md[].value",
      "type": "array",
      "description": ""
    },
    {
      "name": "type",
      "path": "channel.lastMessage.md[].value[].type",
      "type": "string",
      "description": ""
    },
    {
      "name": "value",
      "path": "channel.lastMessage.md[].value[].value",
      "type": "string",
      "description": ""
    },
    {
      "name": "lm",
      "path": "channel.lm",
      "type": "string",
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

export async function get_api_v1_channels_info(args = {}, context = {}) {
  return executeToolRequest({
    toolKey: TOOL_KEY,
    method: METHOD,
    routePath: ROUTE_PATH,
    args,
    context,
  });
}

export default get_api_v1_channels_info;
