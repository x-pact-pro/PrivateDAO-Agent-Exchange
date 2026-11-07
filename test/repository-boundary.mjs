import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("published acquisition metadata does not point at the retired monorepo branch", async () => {
  const source = await readFile(new URL("../src/handler.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /github\.com\/X-PACT\/PrivateDAO\/tree\/codex\/agent-exchange-acquisition/);
  assert.match(source, /github\.com\/x-pact-pro\/PrivateDAO-Agent-Exchange/);
});
