import { interpolatePath , resolveBaseUrl , encodeQuery } from '../../Tool_gen/Lib/ToolInternals.js';  

const METHOD = "POST";
const ROUTE_PATH = "/api/v1/chat.postMessage";
const TOOL_KEY = "post-api-v1-chat.postMessage";

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
                    },
                    "required": [
                      "title",
                      "value"
                    ]
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
                    },
                    "required": [
                      "title",
                      "value"
                    ]
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
  }
},
};

export async function post_api_v1_chat_postmessage(args = {}, context = {}) {
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

export default post_api_v1_chat_postmessage;
