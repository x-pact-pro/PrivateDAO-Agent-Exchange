import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { handler, resetForTests } from "../src/handler.mjs";

const wallet = new PublicKey(nacl.sign.keyPair.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1)).publicKey).toBase58();

test("Questline Pull API returns a boolean without credentials", async () => {
  resetForTests();
  const response = await handler({
    requestContext: { http: { method: "GET", path: "/api/questline/94/status" } },
    rawPath: "/api/questline/94/status",
    queryStringParameters: { user: wallet },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body), false);
  assert.match(response.headers["content-type"], /application\/json/);
});

test("Questline Pull API rejects an unconfigured quest", async () => {
  resetForTests();
  const response = await handler({
    requestContext: { http: { method: "GET", path: "/api/questline/95/status" } },
    rawPath: "/api/questline/95/status",
    queryStringParameters: { user: wallet },
  });
  assert.equal(response.statusCode, 404);
});
