import test from "node:test";
import assert from "node:assert/strict";
import { draftSelection } from "../src/selection/service.js";

test("draft selection stops before refinement and keeps the raw workflow draft", async () => {
  const draft = await draftSelection("scan all messages in a channel and give me a summary of all messages");
  const workflow = draft.workflows[0];
  assert.ok(workflow);
  assert.ok(draft.draftWorkflow);
  assert.equal(draft.refinedWorkflow, null);
  assert.equal(draft.finalWorkflow, null);
  assert.ok(Array.isArray(workflow.steps));
  assert.equal(workflow.steps[0].action, "messages.list");
  assert.equal(workflow.steps[1].action, "summarization.generate");
  assert.equal(workflow.steps[1].kind, undefined);
  assert.equal(workflow.steps[1].dependsOn, undefined);
  assert.equal(typeof draft.refinement, "object");
});
