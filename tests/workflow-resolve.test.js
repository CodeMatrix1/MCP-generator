import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkflowCandidates, buildExecutableWorkflowFallback } from "../src/workflows/WorkflowResolve.js";

function createProjectRoot(endpointIndex) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-resolve-"));
  fs.mkdirSync(path.join(projectRoot, "data"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "data", "endpoint_index.json"),
    JSON.stringify(endpointIndex, null, 2),
    "utf8",
  );
  return projectRoot;
}

test("resolveWorkflowCandidates favors semantically aligned endpoints for workflow steps", () => {
  const projectRoot = createProjectRoot({
    "get-api-v1-channels.files": {
      method: "GET",
      path: "/api/v1/channels.files",
      summary: "List channel files",
      description: "Returns files from a channel.",
      tags: ["Channels"],
      inputs: [{ name: "roomId", required: true, in: "query" }],
      produces: ["files"]
    },
    "post-api-v1-users.create": {
      method: "POST",
      path: "/api/v1/users.create",
      summary: "Create user",
      description: "Creates a new user.",
      tags: ["Users"],
      inputs: [{ name: "username", required: true, in: "body" }],
      produces: ["user"]
    },
    "post-api-v1-channels.create": {
      method: "POST",
      path: "/api/v1/channels.create",
      summary: "Create channel",
      description: "Creates a new channel.",
      tags: ["Channels"],
      inputs: [{ name: "name", required: true, in: "body" }],
      produces: ["channel"]
    },
    "post-api-v1-channels.invite": {
      method: "POST",
      path: "/api/v1/channels.invite",
      summary: "Invite user to channel",
      description: "Adds a user to a channel.",
      tags: ["Channels"],
      inputs: [
        { name: "roomId", required: true, in: "body" },
        { name: "userId", required: true, in: "body" }
      ],
      produces: ["success"]
    },
    "post-api-v1-chat.sendMessage": {
      method: "POST",
      path: "/api/v1/chat.sendMessage",
      summary: "Send message",
      description: "Sends a message.",
      tags: ["Chat"],
      inputs: [
        { name: "roomId", required: true, in: "body" },
        { name: "text", required: true, in: "body" }
      ],
      produces: ["message"]
    }
  });

  const [workflow] = resolveWorkflowCandidates([
    {
      key: "onboard_new_user_to_channel_with_welcome",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string" },
          channel_name: { type: "string" },
          welcome_message: { type: "string" }
        }
      },
      steps: [
        {
          key: "identify_or_create_user",
          description: "Identifies an existing user or creates a new one.",
          action: "user_management"
        },
        {
          key: "identify_or_create_channel",
          description: "Identifies an existing channel or creates a new one.",
          action: "channel_management"
        },
        {
          key: "add_user_to_channel",
          description: "Adds the user to the specified channel.",
          action: "channel_membership"
        },
        {
          key: "send_welcome_message",
          description: "Sends a welcome message to the channel.",
          action: "message_sending"
        }
      ]
    }
  ], projectRoot, { limit: 3 });

  assert.equal(workflow.steps[0].candidateEndpoints[0].key, "post-api-v1-users.create");
  assert.equal(workflow.steps[1].candidateEndpoints[0].key, "post-api-v1-channels.create");
  assert.equal(workflow.steps[2].candidateEndpoints[0].key, "post-api-v1-channels.invite");
  assert.equal(workflow.steps[3].candidateEndpoints[0].key, "post-api-v1-chat.sendMessage");
});

test("buildExecutableWorkflowFallback prefers write-capable runtime tools", () => {
  const workflow = buildExecutableWorkflowFallback({
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string" }
      }
    },
    steps: [
      {
        key: "identify_or_create_user",
        description: "Identifies an existing user or creates a new one.",
        action: "user_management",
        candidateEndpoints: [
          { key: "get-api-v1-users.info", method: "GET", inputs: [] },
          { key: "post-api-v1-users.create", method: "POST", inputs: [] }
        ]
      }
    ]
  });

  assert.equal(workflow.steps[0].tool, "post-api-v1-users.create");
});
