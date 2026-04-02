import { executeToolRequest } from '../../Tool_gen/Lib/ToolInternals.js';

const TOOL_KEY = "post-api-v1-users.create";
const METHOD = "POST";
const ROUTE_PATH = "/api/v1/users.create";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Create User",
  input: {
  "parameters": [
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
      "name": "X-Auth-Token",
      "in": "header",
      "required": true,
      "description": "The authenticated user token.",
      "schema": {
        "type": "string"
      },
      "example": "RScctEHSmLGZGywfIhWyRpyofhKOiMoUIpimhvheU3f"
    }
  ],
  "requestSchema": {
    "type": "object",
    "required": [
      "name",
      "email",
      "password",
      "username"
    ],
    "properties": {
      "name": {
        "type": "string",
        "description": "The display name of the user.",
        "example": "Test User"
      },
      "email": {
        "type": "string",
        "description": "The email address for the user.",
        "example": "email@user.tld1"
      },
      "password": {
        "type": "string",
        "description": "The password for the user.",
        "example": "anypassyouwant"
      },
      "username": {
        "type": "string",
        "description": "The username for the user.",
        "example": "uniqueusername1"
      },
      "active": {
        "type": "boolean",
        "description": "Set the users' active status.  If the user is deactivated, they can not login. By default, the user is active.",
        "default": true,
        "example": true
      },
      "nickname": {
        "type": "string",
        "description": "The nickname for the user. ",
        "example": "testusername"
      },
      "bio": {
        "type": "string",
        "description": "The bio for the user.",
        "example": "All about the user"
      },
      "joinDefaultChannels": {
        "type": "boolean",
        "description": "Select whether users should automatically join default channels once they are created. By default, it is set to `true`.",
        "default": true,
        "example": true
      },
      "statusText": {
        "type": "string",
        "description": "The status text of the user.",
        "example": "On a vacation"
      },
      "roles": {
        "type": "array",
        "description": "The roles to be assigned to this user. If it is not specified, the `user` role is assigned by default.\n**Note:**\n* For default roles, the role name and ID are the same. For custom roles, the name and ID are different. \n* If you are setting a custom role for a user, make sure to enter the custom role ID, and not the role name.\nRefer to [Roles](https://docs.rocket.chat/use-rocket.chat/workspace-administration/permissions#roles) for more information.",
        "items": {
          "type": "string",
          "example": "bot"
        }
      },
      "requirePasswordChange": {
        "type": "boolean",
        "description": "Should the user be required to change their password when they login? It is set to `false` by default",
        "default": false,
        "example": false
      },
      "setRandomPassword": {
        "type": "boolean",
        "description": "Should the user be assigned a random password once they are created? It is set to `false` by defualt.",
        "default": false,
        "example": false
      },
      "sendWelcomeEmail": {
        "type": "boolean",
        "description": "Should the user get a welcome email? It is set to `true` by default.",
        "default": false,
        "example": false
      },
      "verified": {
        "type": "boolean",
        "description": "Should the user's email address be verified when created? It is set to `false` by default.",
        "default": false,
        "example": false
      },
      "customFields": {
        "type": "object",
        "description": "A valid JSON object of key-value pairs consisting of additional fields to be\nadded during user registration. By default, the value is `undefined`.\nTo save custom fields, you must first define them in the [workspace admin settings](https://docs.rocket.chat/use-rocket.chat/workspace-administration/settings/accounts/custom-fields).\nFor information on how to view the custom fields, see the [Get Users List](https://developer.rocket.chat/reference/api/rest-api/endpoints/user-management/users-endpoints/get-users-list) endpoint.",
        "example": {
          "clearance": "High",
          "team": "Queen"
        }
      }
    }
  }
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
          "roles": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "status": {
            "type": "string"
          },
          "active": {
            "type": "boolean"
          },
          "_updatedAt": {
            "type": "string"
          },
          "bio": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "nickname": {
            "type": "string"
          },
          "requirePasswordChange": {
            "type": "boolean"
          },
          "settings": {
            "type": "object"
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
      "name": "roles",
      "path": "user.roles",
      "type": "array",
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
      "name": "_updatedAt",
      "path": "user._updatedAt",
      "type": "string",
      "description": ""
    },
    {
      "name": "bio",
      "path": "user.bio",
      "type": "string",
      "description": ""
    },
    {
      "name": "name",
      "path": "user.name",
      "type": "string",
      "description": ""
    },
    {
      "name": "nickname",
      "path": "user.nickname",
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
      "name": "settings",
      "path": "user.settings",
      "type": "object",
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

export async function post_api_v1_users_create(args = {}, context = {}) {
  return executeToolRequest({
    toolKey: TOOL_KEY,
    method: METHOD,
    routePath: ROUTE_PATH,
    args,
    context,
  });
}

export default post_api_v1_users_create;
