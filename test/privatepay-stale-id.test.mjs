// Place under test/ of PrivateDAO-Agent-Exchange at adc78f67 and run with Node 22.
// Uses only the actual handler, its test storage, and an inert provider.
import assert from "node:assert/strict";
import test from "node:test";
import { encodePaymentRequiredHeader } from "@x402/core/http";

const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
Object.assign(process.env, {
  NODE_ENV: "test",
  AGENT_EXCHANGE_TEST_MODE: "true",
  AGENT_EXCHANGE_ALLOW_TEST_STORAGE: "true",
  AGENT_EXCHANGE_RPC_FIXTURE: "true",
  PRIVATEPAY_ENABLED: "true",
  PRIVATEPAY_PRIVACY_RAIL: "magicblock-private-ephemeral-rollup",
  PRIVATEPAY_FACILITATOR_URL: "https://privatepay-fixture.example",
  PRIVATEPAY_PROVIDER_URL: "https://privatepay-fixture.example",
  PRIVATEPAY_CONFIDENTIAL_MINT: mint,
  PRIVATEPAY_CONFIDENTIAL_MINT_PROGRAM: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  PRIVATEPAY_PDAO_GATE_ENABLED: "false",
  PRIVATEPAY_REQUIRE_ONCHAIN_SETTLEMENT_PROOF: "false",
  PRIVATEPAY_MERCHANT_CHECKOUT_ENABLED: "true",
  PRIVATEPAY_FACILITATOR_API_KEY: "fixture-merchant-key",
  PRIVATEPAY_PROVIDER_HANDLE: "provider@magicblock.id",
  PRIVATEPAY_PAYMENT_INGRESS: "So11111111111111111111111111111111111111112",
});
for (const flag of [
  "CONFORMANCE_VERIFIED", "MAINNET_VERIFIED", "RELATIONSHIP_PRIVACY_VERIFIED", "AMOUNT_PRIVACY_VERIFIED",
  "TIMING_PRIVACY_VERIFIED", "E2E_VERIFIED", "TREASURY_SPLIT_VERIFIED", "PUBLIC_TRACE_VERIFIED",
  "PROVIDER_METADATA_DISCLOSURE_VERIFIED", "MERCHANT_ACCOUNTS_DELEGATED", "PROVIDER_HANDLE_VERIFIED",
]) process.env[`PRIVATEPAY_${flag}`] = "true";

const { handler, resetForTests } = await import("../src/handler.mjs");
const input = {
  payer: "BkNcuvQZr6392aZCwcGnB6SQptV6vhWa7syJs5fgLz6",
  resource: "https://agents.example/api/stale-id",
  provider_id: "provider-1",
  amount_base_units: "1000",
  nonce: "same-logical-request",
};
const send = body => handler({
  requestContext: { http: { method: "POST", path: "/api/privatepay/x402" } },
  headers: {},
  body: JSON.stringify(body),
});
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test("retrying a superseded failed id uses the current bound replacement", async t => {
  resetForTests();
  const ids = ["a", "b", "c"].map(c => c.repeat(64));
  const creates = [], challenges = [], calls = [];
  t.mock.method(globalThis, "fetch", async (value, init = {}) => {
    const url = new URL(value);
    calls.push(url.origin + url.pathname);
    assert.equal(url.origin, "https://privatepay-fixture.example");
    if (url.pathname === "/v1/payments") {
      const id = ids[creates.length];
      assert.ok(id, "bounded checkout creations");
      creates.push({ id, externalReference: JSON.parse(init.body).externalReference });
      return json(id === ids[0] ? 202 : 200,
        { id, status: id === ids[0] ? "pending" : "created", expiresAt: "2099-01-01T00:00:00Z" });
    }
    const id = url.pathname.match(/^\/v1\/x402\/payments\/([a-f0-9]{64})\/pay$/)?.[1];
    assert.ok(id, "fixture allows checkout creation and unpaid challenge only");
    assert.deepEqual(JSON.parse(init.body), {});
    challenges.push(id);
    if (id === ids[0]) return json(409, { error: { code: "order_conflict" } });
    return json(402, {}, {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
        x402Version: 2,
        resource: { url: input.resource },
        accepts: [{
          scheme: "exact-magicblock",
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          asset: mint, amount: input.amount_base_units,
          payTo: "2BJ4ezxqV9YJXc38D9duKBkdn4su4jE1beKUHwH663sL",
          maxTimeoutSeconds: 60,
          extra: { paymentId: id, cluster: "mainnet-private", settlement: "ephemeral-rollup", transaction: "AQID" },
        }],
      }),
    });
  });
  const first = await send(input);
  assert.equal(first.statusCode, 202, JSON.stringify(calls));
  assert.equal(JSON.parse(first.body).payment_id, ids[0]);
  const replacement = await send({ ...input, payment_id: ids[0] });
  assert.equal(replacement.statusCode, 402);
  assert.equal(JSON.parse(replacement.body).payment_id, ids[1]);
  assert.equal(creates.length, 2);
  assert.notEqual(creates[0].externalReference, creates[1].externalReference);

  const retry = await send({ ...input, payment_id: ids[0] });
  assert.equal(retry.statusCode, 402);
  const retryId = JSON.parse(retry.body).payment_id;
  assert.deepEqual({ retryId, creates: creates.length, lastChallenge: challenges.at(-1) },
    { retryId: ids[1], creates: 2, lastChallenge: ids[1] });
});
