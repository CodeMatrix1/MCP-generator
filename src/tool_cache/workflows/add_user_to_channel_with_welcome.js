import { get_api_v1_channels_info, get_api_v1_users_info, post_api_v1_channels_create, post_api_v1_channels_invite, post_api_v1_chat_postmessage, post_api_v1_users_create } from "../index.js";

export const workflow = {
  "key": "add_user_to_channel_with_welcome",
  "label": "Generated Workflow",
  "description": "Finds or creates a user, finds or creates a channel, adds the user to the channel, generates a welcome message, and sends it to the channel.",
  "scope": "serve-only",
  "inputSchema": {
    "type": "object",
    "required": [
      "username",
      "channel_name"
    ],
    "properties": {
      "username": {
        "type": "string",
        "description": "The username of the user to add.",
        "example": "john.doe"
      },
      "channel_name": {
        "type": "string",
        "description": "The name of the channel to add the user to.",
        "example": "general"
      }
    }
  },
  "steps": [
    {
      "key": "find_user",
      "description": "Finds an existing user by their username.",
      "kind": "runtime_tool",
      "purpose": "Finds an existing user by their username.",
      "endpointKey": "get-api-v1-users.info",
      "tool": "get-api-v1-users.info",
      "inputs": []
    },
    {
      "key": "find_channel",
      "description": "Finds an existing channel by its name.",
      "kind": "runtime_tool",
      "purpose": "Finds an existing channel by its name.",
      "endpointKey": "get-api-v1-channels.info",
      "tool": "get-api-v1-channels.info",
      "inputs": []
    },
    {
      "key": "generate_welcome_message",
      "description": "Generates the content of the welcome message using an LLM.",
      "kind": "runtime_tool",
      "purpose": "Generates the content of the welcome message using an LLM.",
      "tool": "",
      "inputs": []
    },
    {
      "key": "create_user_if_missing",
      "description": "Creates a new user if the user was not found by the 'find_user' step.",
      "kind": "runtime_tool",
      "purpose": "Creates a new user if the user was not found by the 'find_user' step.",
      "endpointKey": "post-api-v1-users.create",
      "tool": "post-api-v1-users.create",
      "inputs": [],
      "dependsOn": [
        "find_user"
      ]
    },
    {
      "key": "create_channel_if_missing",
      "description": "Creates a new channel of type 'channel' if the channel was not found by the 'find_channel' step.",
      "kind": "runtime_tool",
      "purpose": "Creates a new channel of type 'channel' if the channel was not found by the 'find_channel' step.",
      "endpointKey": "post-api-v1-channels.create",
      "tool": "post-api-v1-channels.create",
      "inputs": [],
      "dependsOn": [
        "find_channel"
      ]
    },
    {
      "key": "add_user_to_channel",
      "description": "Adds the user (found or created) to the channel (found or created).",
      "kind": "runtime_tool",
      "purpose": "Adds the user (found or created) to the channel (found or created).",
      "endpointKey": "post-api-v1-channels.invite",
      "tool": "post-api-v1-channels.invite",
      "inputs": [],
      "dependsOn": [
        "create_user_if_missing",
        "create_channel_if_missing"
      ]
    },
    {
      "key": "send_welcome_message",
      "description": "Sends the generated welcome message to the specified channel.",
      "kind": "runtime_tool",
      "purpose": "Sends the generated welcome message to the specified channel.",
      "endpointKey": "post-api-v1-chat.postMessage",
      "tool": "post-api-v1-chat.postMessage",
      "inputs": [],
      "dependsOn": [
        "generate_welcome_message",
        "add_user_to_channel"
      ]
    }
  ]
};

export const meta = {
  key: workflow.key,
  label: workflow.label,
  description: workflow.description,
  scope: workflow.scope || "serve-only",
  inputSchema: workflow.inputSchema || null,
};

function getValueByPath(source, pathExpression) {
  const normalizedPath = String(pathExpression || "")
    .replace(/\[\]/g, ".0")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\.+|\.+$/g, "");

  if (!normalizedPath) return source;

  return normalizedPath.split(".").reduce((value, segment) => {
    if (value === null || value === undefined) return undefined;
    return value[segment];
  }, source);
}

export async function addUserToChannelWithWelcome({
  username,
  channel_name,
}, runtime = {}) {
  try {
    // =========================================================
    // STEP 1: Finds an existing user by their username.
    // =========================================================
    // find_user (runtime_tool)
    const step_find_user_context = runtime && typeof runtime.buildStepContext === "function"
      ? runtime.buildStepContext({ "query": { "query": JSON.stringify({ username: username }) } })
      : { "query": { "query": JSON.stringify({ username: username }) } };
    const step_find_user = await get_api_v1_users_info(
      {  },
      step_find_user_context
    );
    const matchedUser_find_user = Array.isArray(step_find_user?.users)
          ? step_find_user.users.find((candidate) => !username || candidate?.username === username)
          : step_find_user?.user;
    let userId = matchedUser_find_user?._id || step_find_user?.user?._id;
    // =========================================================
    // STEP 2: Finds an existing channel by its name.
    // =========================================================
    // find_channel (runtime_tool)
    const step_find_channel_context = runtime && typeof runtime.buildStepContext === "function"
      ? runtime.buildStepContext({ "query": { "roomName": channel_name } })
      : { "query": { "roomName": channel_name } };
    const step_find_channel = await get_api_v1_channels_info(
      {  },
      step_find_channel_context
    );
    let channelId = step_find_channel?.channel?._id || step_find_channel?.room?._id;
    // =========================================================
    // STEP 3: Generates the content of the welcome message using an LLM.
    // =========================================================
    // generate_welcome_message (runtime_tool)
    const step_generate_welcome_message_context = runtime && typeof runtime.buildStepContext === "function"
      ? runtime.buildStepContext({  })
      : {  };
    const step_generate_welcome_message = await (
      { "roomId": channelId },
      step_generate_welcome_message_context
    );
    const messageId = step_generate_welcome_message?.message?._id || step_generate_welcome_message?.message?.id;
    // =========================================================
    // STEP 4: Creates a new user if the user was not found by the 'find_user' step.
    // =========================================================
    // create_user_if_missing (runtime_tool)
    const step_create_user_if_missing_context = runtime && typeof runtime.buildStepContext === "function"
      ? runtime.buildStepContext({  })
      : {  };
    const step_create_user_if_missing = await post_api_v1_users_create(
      {  },
      step_create_user_if_missing_context
    );
    // =========================================================
    // STEP 5: Creates a new channel of type 'channel' if the channel was not found by the 'find_channel' step.
    // =========================================================
    // create_channel_if_missing (runtime_tool)
    const step_create_channel_if_missing_context = runtime && typeof runtime.buildStepContext === "function"
      ? runtime.buildStepContext({  })
      : {  };
    const step_create_channel_if_missing = await post_api_v1_channels_create(
      {  },
      step_create_channel_if_missing_context
    );
    // =========================================================
    // STEP 6: Adds the user (found or created) to the channel (found or created).
    // =========================================================
    // add_user_to_channel (runtime_tool)
    const step_add_user_to_channel_context = runtime && typeof runtime.buildStepContext === "function"
      ? runtime.buildStepContext({  })
      : {  };
    const step_add_user_to_channel = await post_api_v1_channels_invite(
      {  },
      step_add_user_to_channel_context
    );
    // =========================================================
    // STEP 7: Sends the generated welcome message to the specified channel.
    // =========================================================
    // send_welcome_message (runtime_tool)
    const step_send_welcome_message_context = runtime && typeof runtime.buildStepContext === "function"
      ? runtime.buildStepContext({  })
      : {  };
    const step_send_welcome_message = await post_api_v1_chat_postmessage(
      { "roomId": channelId },
      step_send_welcome_message_context
    );
    return {
      status: "ok",
      result: {
        userId,
        channelId,
        messageId,
      },
    };
  } catch (err) {
    return {
      status: "error",
      error: err && err.message ? err.message : String(err || "Unknown error"),
    };
  }
}

export default async function executeGeneratedWorkflow(input = {}, runtime = {}) {
  return addUserToChannelWithWelcome(input, runtime);
}
