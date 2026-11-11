import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import { checkPrivatePayPayerDelegation, readPrivatePayPayerDelegationState } from "../src/privatepay.mjs";

const payer = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
const validator = "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo";
const config = {
  privatePayProviderUrl: "https://payments.example",
  privatePayConfidentialMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  privatePayMainnetValidator: validator,
};

function provider(status, body) {
  return async (url) => {
    assert.equal(new URL(url).pathname, "/v1/spl/balance");
    assert.equal(new URL(url).searchParams.get("address"), payer);
    assert.equal(new URL(url).searchParams.get("cluster"), "mainnet-private");
    return { ok: status === 200, status, async json() { return body; } };
  };
}

test("delegation metadata never pretends to reveal private USDC amount", async () => {
  const state = await readPrivatePayPayerDelegationState(config, payer, provider(200, {
    delegation: { status: "delegated", validator }, uiAmount: 1000000,
  }));
  assert.equal(state.status, "delegated");
  assert.equal(state.validator_matches, true);
  assert.equal(state.private_balance_verified, false);
  assert.equal(state.private_balance_usdc, null);
  await checkPrivatePayPayerDelegation(config, payer, provider(200, { delegation: { status: "delegated", validator } }));
});

test("different validator fails closed without recommending another shield", async () => {
  const fetcher = provider(200, { delegation: { status: "delegated", validator: payer } });
  const state = await readPrivatePayPayerDelegationState(config, payer, fetcher);
  assert.equal(state.validator_matches, false);
  await assert.rejects(() => checkPrivatePayPayerDelegation(config, payer, fetcher), error =>
    error.statusCode === 422 && error.code === "PRIVATEPAY_PAYER_DELEGATION_REQUIRED" && /Do not shield again/.test(error.message));
});

test("undelegated account stays blocked and reports shielding ambiguity", async () => {
  await assert.rejects(
    () => checkPrivatePayPayerDelegation(config, payer, provider(200, { delegation: { status: "undelegated" } })),
    error => error.statusCode === 422 && /already have shielded USDC/.test(error.message),
  );
});

test("unavailable public delegation read remains explicitly unverified", async () => {
  const state = await readPrivatePayPayerDelegationState(config, payer, provider(503, {}));
  assert.equal(state.status, "unavailable");
  assert.equal(state.private_balance_verified, false);
});

test("payer address is validated before touching provider", async () => {
  await assert.rejects(() => readPrivatePayPayerDelegationState(config, "invalid", async () => {
    throw new Error("should not be called");
  }), error => error.code === "PRIVATEPAY_INVALID_PAYER");
});

test("PrivatePAY in-app shield flow replaces external redirect and requires read-only finality", async () => {
  const src = await readFile(new URL("../src/handler.mjs", import.meta.url), "utf8");
  assert.match(src, /data-privatepay-shield-nav/);
  assert.match(src, /href="#privatepay-shield"/);
  assert.doesNotMatch(src, /href="https:\/\/one\.magicblock\.app\/"/);
  assert.match(src, /readonly placeholder="Connect a wallet to detect its public address"/);
  assert.match(src, /privatePayPayerAddress/);
  assert.match(src, /\/api\/privatepay\/private-balance-status/);
  assert.match(src, /\/api\/privatepay\/deposit-status/);
  assert.match(src, /This is shielding, NOT a settled service payment/);
});
