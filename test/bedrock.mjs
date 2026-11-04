import test from "node:test";
import assert from "node:assert/strict";
import { bedrockProviderStatus, runBedrockInference } from "../src/bedrock.mjs";

test("Bedrock is disabled by default and does not call AWS", async () => {
  let calls = 0;
  const result = await runBedrockInference({ bedrockEnabled: false, bedrockModel: "amazon.nova-micro-v1:0" }, {}, { send: async () => { calls += 1; } });
  assert.equal(result.status, "disabled");
  assert.equal(calls, 0);
});

test("Bedrock synthesis is bounded to evidence and never returns an execution capability", async () => {
  let command;
  const result = await runBedrockInference(
    { bedrockEnabled: true, bedrockModel: "amazon.nova-micro-v1:0", region: "eu-north-1" },
    { evidence: { risk: "medium" }, requested_output: "risk summary" },
    { send: async (value) => { command = value; return { output: { message: { content: [{ text: "bounded summary" }] } }, usage: { inputTokens: 10, outputTokens: 2 }, stopReason: "end_turn" }; } },
  );
  assert.equal(result.status, "completed");
  assert.equal(result.provider, "amazon-bedrock");
  assert.equal(result.result, "bounded summary");
  assert.equal(command.input.modelId, "amazon.nova-micro-v1:0");
  assert.match(command.input.system[0].text, /Never authorize transactions/);
  assert.match(command.input.messages[0].content[0].text, /untrusted data/);
  assert.match(command.input.messages[0].content[0].text, /medium/);
  assert.equal(bedrockProviderStatus({ bedrockEnabled: false, bedrockModel: "m" }).status, "disabled");
});
