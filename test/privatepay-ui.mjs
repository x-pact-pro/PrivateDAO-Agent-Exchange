import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PrivatePAY browser checkout uses canonical x402 encoding and address fields", async () => {
  const source = await readFile(new URL("../src/handler.mjs", import.meta.url), "utf8");

  assert.match(source, /const privatePayEncode=bytes=>\{[^\n]*return btoa\(binary\)\}/);
  assert.match(source, /const transaction=privatePayEncode\(signed\.serialize\(/);
  assert.match(source, /id="privatePayPayerAddress"/);
  assert.match(source, /id="privatePayRequestAddress"/);
  assert.match(source, /accepted\.payTo/);
  assert.match(source, /must match the connected wallet/);
  assert.doesNotMatch(source, /privatePayEncode\(signed\.serialize\([^\n]*replace\(/);
});
