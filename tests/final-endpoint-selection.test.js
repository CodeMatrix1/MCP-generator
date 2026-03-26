import test from "node:test";
import assert from "node:assert/strict";
import { selectFinalEndpoints } from "../src/workflows/WorkflowSelectFinalEndpointsNode.js";

test("final endpoint selection keeps summary as llm step and prefers message retrieval endpoints", async () => {
  const result = await selectFinalEndpoints({
    query: "scan all messages in an input channel and give me a summary of all messages",
    candidateEndpoints: [
      "post-api-v1-chat.postMessage",
      "post-api-v1-chat.delete",
      "get-api-v1-channels.messages",
      "get-api-v1-im.messages",
      "get-api-v1-chat.search",
    ],
    workflow: {
      key: "summarize_messages",
      label: "Summarize Messages",
      description: "Collect messages and generate a summary.",
      steps: [
        {
          key: "list_messages",
          description: "Collect the messages that should be summarized.",
          action: "messages.list",
        },
        {
          key: "generate_summary",
          description: "Generate a concise summary from the collected messages.",
          action: "summarization.generate",
        },
      ],
    },
  });

  assert.ok(Array.isArray(result.finalSelection));
  assert.ok(result.finalSelection.includes("get-api-v1-channels.messages")
    || result.finalSelection.includes("get-api-v1-im.messages")
    || result.finalSelection.includes("get-api-v1-chat.search"));
  assert.ok(!result.finalSelection.includes("post-api-v1-chat.delete"));

  const steps = result.workflow.steps;
  assert.equal(steps[0].kind, "runtime_tool");
  assert.notEqual(steps[0].endpointKey, "post-api-v1-chat.postMessage");
  assert.notEqual(steps[0].endpointKey, "post-api-v1-chat.delete");
  assert.equal(steps[1].kind, "llm_step");
  assert.equal(steps[1].endpointKey, undefined);
});
