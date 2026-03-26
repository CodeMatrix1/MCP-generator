import { executeToolRequest } from '../../Tool_gen/Lib/ToolInternals.js';

const TOOL_KEY = "post-api-v1-chat.postMessage";
const METHOD = "POST";
const ROUTE_PATH = "/api/v1/chat.postMessage";

export const meta = {
  key: TOOL_KEY,
  method: METHOD,
  path: ROUTE_PATH,
  summary: "Post Message",
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
    "oneOf": [
      {
        "type": "object",
        "required": [
          "roomId"
        ],
        "properties": {
          "alias": {
            "type": "string",
            "description": "This will cause the message's name to appear as the given alias, but your username will still be displayed."
          },
          "avatar": {
            "type": "string",
            "description": "If provided, the avatar will be displayed as the provided image URL."
          },
          "emoji": {
            "type": "string",
            "description": "If provided, the avatar will be displayed as an emoji.",
            "example": ":smile:"
          },
          "roomId": {
            "type": "string",
            "description": "The room ID or an array of room IDs where the message is to be sent. You can use channel name or username. The channel name must have the `#` prefix. `@` refers to username.",
            "example": "#general"
          },
          "text": {
            "type": "string",
            "description": "The message text to send, it is optional because of attachments."
          },
          "parseUrls": {
            "type": "boolean",
            "description": "Set `parseUrls` to `false` to prevent Rocket.Chat from generating link previews when the message in `text` contains a URL."
          },
          "attachments": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "audio_url": {
                  "type": "string",
                  "description": "Audio file to attach. See the <a href='https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio'>HTML audio element</a> for information."
                },
                "author_icon": {
                  "type": "string",
                  "description": "Displays a tiny icon to the left of the author's name."
                },
                "author_link": {
                  "type": "string",
                  "description": "Providing this makes the author's name clickable and points to the provided link."
                },
                "author_name": {
                  "type": "string",
                  "description": "Name of the author."
                },
                "collapsed": {
                  "type": "boolean",
                  "description": "Causes the image, audio, and video sections to be displayed as collapsed when set to true."
                },
                "color": {
                  "type": "string",
                  "description": "See <a href='https://developer.mozilla.org/en-US/docs/Web/CSS/background-color'>background-css</a> for the supported colors.'"
                },
                "fields": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": [
                      "title",
                      "value"
                    ],
                    "properties": {
                      "short": {
                        "type": "boolean",
                        "description": "Whether this field should be a short field."
                      },
                      "title": {
                        "type": "string",
                        "description": "The title of this field."
                      },
                      "value": {
                        "type": "string",
                        "description": "The value of this field, displayed underneath the title value."
                      }
                    }
                  }
                },
                "image_url": {
                  "type": "string",
                  "description": "The image to display, will be big and easy to see."
                },
                "message_link": {
                  "type": "string",
                  "description": "Only applicable if the `ts` field is provided, as it makes the time clickable to this link."
                },
                "text": {
                  "type": "string",
                  "description": "The text to display for this attachment, it is different than the message's text."
                },
                "thumb_url": {
                  "type": "string",
                  "description": "An image that displays to the left of the text, looks better when this is relatively small."
                },
                "title": {
                  "type": "string",
                  "description": "Title to display for this attachment, displays under the author."
                },
                "title_link": {
                  "type": "string",
                  "description": "Providing this makes the title clickable, pointing to this link."
                },
                "title_link_download": {
                  "type": "boolean",
                  "description": "When this is true, a download icon appears and clicking this saves the link to file."
                },
                "ts": {
                  "type": "string",
                  "description": "Displays the time next to the text portion."
                },
                "video_url": {
                  "type": "string",
                  "description": "Video file to attach. See the <a href='https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video'>HTML video element</a> for information."
                }
              }
            }
          },
          "tmid": {
            "type": "string",
            "description": "The message ID of the original message to reply to or to create a thread on."
          },
          "customFields": {
            "type": "object",
            "description": "You can add custom fields for messages. For example, set priorities for messages.\n\nYou must enable this option and define the validation in the workspace settings. See the <a href=\"https://docs.rocket.chat/docs/message\" target=\"_blank\">Message</a> settings for further information.",
            "example": {
              "priority": "high"
            }
          }
        }
      },
      {
        "type": "object",
        "required": [
          "channel"
        ],
        "properties": {
          "alias": {
            "type": "string",
            "description": "This will cause the message's name to appear as the given alias, but your username will still be displayed."
          },
          "avatar": {
            "type": "string",
            "description": "If provided, the avatar will be displayed as the provided image URL."
          },
          "channel": {
            "type": "string",
            "description": "The channel ID or an array of channel IDs where the message is to be sent. You can use channel name or username. The channel name must have the `#` prefix. `@` refers to username.",
            "example": "#test-room"
          },
          "emoji": {
            "type": "string",
            "description": "If provided, the avatar will be displayed as an emoji.",
            "example": ":smile:"
          },
          "text": {
            "type": "string",
            "description": "The message text to send, it is optional because of attachments."
          },
          "parseUrls": {
            "type": "boolean",
            "description": "Set `parseUrls` to `false` to prevent Rocket.Chat from generating link previews when the message in `text` contains a URL."
          },
          "attachments": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "audio_url": {
                  "type": "string",
                  "description": "Audio file to attach. See the <a href='https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio'>HTML audio element</a> for information."
                },
                "author_icon": {
                  "type": "string",
                  "description": "Displays a tiny icon to the left of the author's name."
                },
                "author_link": {
                  "type": "string",
                  "description": "Providing this makes the author's name clickable and points to the provided link."
                },
                "author_name": {
                  "type": "string",
                  "description": "Name of the author."
                },
                "collapsed": {
                  "type": "boolean",
                  "description": "Causes the image, audio, and video sections to be displayed as collapsed when set to true."
                },
                "color": {
                  "type": "string",
                  "description": "See <a href='https://developer.mozilla.org/en-US/docs/Web/CSS/background-color'>background-css</a> for the supported colors.'"
                },
                "fields": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": [
                      "title",
                      "value"
                    ],
                    "properties": {
                      "short": {
                        "type": "boolean",
                        "description": "Whether this field should be a short field."
                      },
                      "title": {
                        "type": "string",
                        "description": "The title of this field."
                      },
                      "value": {
                        "type": "string",
                        "description": "The value of this field, displayed underneath the title value."
                      }
                    }
                  }
                },
                "image_url": {
                  "type": "string",
                  "description": "The image to display, will be big and easy to see."
                },
                "message_link": {
                  "type": "string",
                  "description": "Only applicable if the `ts` field is provided, as it makes the time clickable to this link."
                },
                "text": {
                  "type": "string",
                  "description": "The text to display for this attachment, it is different than the message's text."
                },
                "thumb_url": {
                  "type": "string",
                  "description": "An image that displays to the left of the text, looks better when this is relatively small."
                },
                "title": {
                  "type": "string",
                  "description": "Title to display for this attachment, displays under the author."
                },
                "title_link": {
                  "type": "string",
                  "description": "Providing this makes the title clickable, pointing to this link."
                },
                "title_link_download": {
                  "type": "boolean",
                  "description": "When this is true, a download icon appears and clicking this saves the link to file."
                },
                "ts": {
                  "type": "string",
                  "description": "Displays the time next to the text portion."
                },
                "video_url": {
                  "type": "string",
                  "description": "Video file to attach. See the <a href='https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video'>HTML video element</a> for information."
                }
              }
            }
          },
          "customFields": {
            "type": "object",
            "description": "You can add custom fields for messages. For example, set priorities for messages.\n\nYou must enable this option and define the validation in the workspace settings. See the <a href=\"https://docs.rocket.chat/docs/message\" target=\"_blank\">Message</a> settings for further information.",
            "example": {
              "priority": "high"
            }
          }
        }
      }
    ]
  },
  "requestExample": {
    "alias": "Gruggy",
    "avatar": "http://res.guggy.com/logo_128.png",
    "channel": "#general",
    "emoji": ":smirk:",
    "roomId": "Xnb2kLD2Pnhdwe3RH",
    "text": "Sample message",
    "attachments": [
      {
        "audio_url": "http://www.w3schools.com/tags/horse.mp3",
        "author_icon": "https://avatars.githubusercontent.com/u/850391?v=3",
        "author_link": "https://rocket.chat/",
        "author_name": "Bradley Hilton",
        "collapsed": false,
        "color": "#ff0000",
        "fields": [
          {
            "short": true,
            "title": "Test",
            "value": "Testing out something or other"
          },
          {
            "short": true,
            "title": "Another Test",
            "value": "[Link](https://google.com/) something and this and that."
          }
        ],
        "image_url": "http://res.guggy.com/logo_128.png",
        "message_link": "https://google.com",
        "text": "Yay for gruggy!",
        "thumb_url": "http://res.guggy.com/logo_128.png",
        "title": "Attachment Example",
        "title_link": "https://youtube.com",
        "title_link_download": true,
        "ts": "2016-12-09T16:53:06.761Z",
        "video_url": "http://www.w3schools.com/tags/movie.mp4"
      }
    ]
  }
},
  output: {
  "successStatus": "200",
  "description": "OK",
  "responseSchema": {
    "type": "object",
    "properties": {
      "ts": {
        "type": "integer"
      },
      "channel": {
        "type": "string"
      },
      "message": {
        "type": "object",
        "properties": {
          "alias": {
            "type": "string"
          },
          "msg": {
            "type": "string"
          },
          "parseUrls": {
            "type": "boolean"
          },
          "groupable": {
            "type": "boolean"
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
              }
            }
          },
          "rid": {
            "type": "string"
          },
          "_updatedAt": {
            "type": "string"
          },
          "_id": {
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
      "name": "ts",
      "path": "ts",
      "type": "integer",
      "description": ""
    },
    {
      "name": "channel",
      "path": "channel",
      "type": "string",
      "description": ""
    },
    {
      "name": "message",
      "path": "message",
      "type": "object",
      "description": ""
    },
    {
      "name": "alias",
      "path": "message.alias",
      "type": "string",
      "description": ""
    },
    {
      "name": "msg",
      "path": "message.msg",
      "type": "string",
      "description": ""
    },
    {
      "name": "parseUrls",
      "path": "message.parseUrls",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "groupable",
      "path": "message.groupable",
      "type": "boolean",
      "description": ""
    },
    {
      "name": "ts",
      "path": "message.ts",
      "type": "string",
      "description": ""
    },
    {
      "name": "u",
      "path": "message.u",
      "type": "object",
      "description": ""
    },
    {
      "name": "_id",
      "path": "message.u._id",
      "type": "string",
      "description": ""
    },
    {
      "name": "username",
      "path": "message.u.username",
      "type": "string",
      "description": ""
    },
    {
      "name": "rid",
      "path": "message.rid",
      "type": "string",
      "description": ""
    },
    {
      "name": "_updatedAt",
      "path": "message._updatedAt",
      "type": "string",
      "description": ""
    },
    {
      "name": "_id",
      "path": "message._id",
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

export async function post_api_v1_chat_postmessage(args = {}, context = {}) {
  return executeToolRequest({
    toolKey: TOOL_KEY,
    method: METHOD,
    routePath: ROUTE_PATH,
    args,
    context,
  });
}

export default post_api_v1_chat_postmessage;
