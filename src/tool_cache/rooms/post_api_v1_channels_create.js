import { executeToolRequest } from '../../Tool_gen/Lib/ToolInternals.js';

const TOOL_KEY = "post-api-v1-channels.create";
const METHOD = "POST";
const ROUTE_PATH = "/api/v1/channels.create";

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
    "required": [
      "name"
    ],
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
    }
  },
  "requestExample": {
    "name": "channelname",
    "members": [
      "rocket.cat"
    ],
    "readOnly": true,
    "excludeSelf": true,
    "customFields": {
      "type": "default"
    },
    "extraData": {
      "broadcast": true,
      "encrypted": false,
      "teamId": "658441562dd9f928ad9951aa"
    }
  }
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
          "_updatedAt": {
            "type": "string"
          },
          "customFields": {
            "type": "object"
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
              },
              "name": {
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
      "name": "_updatedAt",
      "path": "channel._updatedAt",
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
      "name": "name",
      "path": "channel.u.name",
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
      "name": "success",
      "path": "success",
      "type": "boolean",
      "description": ""
    }
  ]
},
};

export async function post_api_v1_channels_create(args = {}, context = {}) {
  return executeToolRequest({
    toolKey: TOOL_KEY,
    method: METHOD,
    routePath: ROUTE_PATH,
    args,
    context,
  });
}

export default post_api_v1_channels_create;
