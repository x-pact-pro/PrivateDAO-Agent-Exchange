import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import { requestPrivatePayWalletChallenge, readAuthenticatedPrivatePayBalance } from "../src/privatepay.mjs";

const wallet = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
const other = new PublicKey(new Uint8Array(32).fill(8)).toBase58();
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const cfg = { privatePayProviderUrl: "https://payments.example", privatePayConfidentialMint: mint, privatePayCluster: "mainnet-beta" };
const signature = Buffer.alloc(64, 1).toString("base64");
function reply(status, body) {
  return { status, ok: status >= 200 && status < 300, async json() { return body; } };
}

test("MagicBlock challenge is wallet-bound, read-only and Mainnet only", async () => {
  const challenge = await requestPrivatePayWalletChallenge(cfg, wallet, async (url) => {
    assert.equal(url.pathname, "/v1/spl/challenge");
    assert.equal(url.searchParams.get("pubkey"), wallet);
    assert.equal(url.searchParams.get("cluster"), "mainnet");
    return reply(200, { challenge: "nonce-123", message: "Sign challenge nonce-123", expiresAt: "2026-11-11T03:00:00Z" });
  });
  assert.deepEqual({ wallet: challenge.wallet, cluster: challenge.cluster, challenge: challenge.challenge, message: challenge.message, read_only: challenge.read_only }, {
    wallet, cluster: "mainnet", challenge: "nonce-123", message: "Sign challenge nonce-123", read_only: true,
  });
});

test("wallet signing authorizes exact shielded USDC read and hides bearer token", async () => {
  const calls = [];
  const read = await readAuthenticatedPrivatePayBalance(cfg, { wallet, challenge: "nonce-123", signature }, async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/v1/spl/login")) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body, { pubkey: wallet, challenge: "nonce-123", signature, cluster: "mainnet" });
      return reply(200, { token: "private-bearer-fixture", expiresAt: "2026-11-11T03:00:00Z" });
    }
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/v1/spl/private-balance");
    assert.equal(parsed.searchParams.get("address"), wallet);
    assert.equal(parsed.searchParams.get("mint"), mint);
    assert.equal(parsed.searchParams.get("cluster"), "mainnet");
    assert.equal(init.headers.authorization, "Bearer private-bearer-fixture");
    return reply(200, { address: wallet, mint, location: "ephemeral", balance: "1000000" });
  });
  assert.equal(calls.length, 2);
  assert.deepEqual({ wallet: read.wallet, amount_base_units: read.amount_base_units, amount_usdc: read.amount_usdc, authenticated: read.authenticated, source: read.source },
    { wallet, amount_base_units: "1000000", amount_usdc: "1.000000", authenticated: true, source: "magicblock_wallet_authorized_private_balance" });
  assert.doesNotMatch(JSON.stringify(read), /private-bearer-fixture|nonce-123|signature/);
});

test("private account data from another wallet is rejected", async () => {
  await assert.rejects(
    readAuthenticatedPrivatePayBalance(cfg, { wallet, challenge: "nonce", signature }, async (url) =>
      String(url).endsWith("/v1/spl/login")
        ? reply(200, { token: "private-bearer-fixture" })
        : reply(200, { address: other, mint, location: "ephemeral", balance: "90000000" })),
    error => error.code === "PRIVATEPAY_PRIVATE_BALANCE_BINDING_MISMATCH",
  );
});

test("public base balance cannot masquerade as private balance", async () => {
  await assert.rejects(
    readAuthenticatedPrivatePayBalance(cfg, { wallet, challenge: "nonce", signature }, async url =>
      String(url).endsWith("/v1/spl/login")
        ? reply(200, { token: "private-bearer-fixture" })
        : reply(200, { address: wallet, mint, location: "base", balance: "20000000" })),
    error => error.code === "PRIVATEPAY_PRIVATE_BALANCE_BINDING_MISMATCH",
  );
});

test("invalid, unsigned and failed wallet logins never produce a private read", async () => {
  let calls = 0;
  await assert.rejects(readAuthenticatedPrivatePayBalance(cfg, { wallet, challenge: "nonce", signature: "not-a-signature" },
    async () => { calls += 1; throw Error("must not call provider"); }),
    error => error.code === "PRIVATEPAY_AUTH_SIGNATURE_INVALID");
  assert.equal(calls, 0);
  await assert.rejects(readAuthenticatedPrivatePayBalance(cfg, { wallet, challenge: "nonce", signature },
    async () => { calls += 1; return reply(401, { error: "invalid_auth" }); }),
    error => error.code === "PRIVATEPAY_AUTH_LOGIN_REJECTED");
  assert.equal(calls, 1);
});

test("merchant checkout validates treasury payTo before signing and surfaces private balance button", async () => {
  const source = await readFile(new URL("../src/handler.mjs", import.meta.url), "utf8");
  assert.match(source, /\/api\/privatepay\/route-audit/);
  assert.match(source, /merchant_pay_to_matches_treasury/);
  assert.match(source, /accepted\.payTo!==route\.privatepay_x402_pay_to/);
  assert.match(source, /accepted\.extra\?\.payer!==payer/);
  assert.match(source, /accepted\.extra\?\.merchantId!==route\.privatepay_x402_pay_to/);
  assert.match(source, /\["payer", provider\?\.extra\?\.payer, expectedPayer\]/);
  assert.match(source, /\["merchant_id", provider\?\.extra\?\.merchantId, local\?\.payTo\]/);
  assert.match(source, /\/api\/privatepay\/private-auth-challenge/);
  assert.match(source, /\/api\/privatepay\/private-balance/);
  assert.match(source, /id="privatePayReadPrivateBalance"/);
  assert.match(source, /id="privatePayPrivateBalance"/);
  assert.doesNotMatch(source, /privatePayX402.*rawSecret/i);
});
