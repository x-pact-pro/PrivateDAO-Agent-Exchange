import assert from "node:assert/strict";

const base = String(process.env.AGENT_EXCHANGE_PUBLIC_BASE_URL || "https://agents.privatedao.org").replace(/\/$/, "");

async function read(path) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(20_000) });
      const text = await response.text();
      assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
      return { response, text, json: () => JSON.parse(text) };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(`${path} unavailable after 3 attempts: ${lastError?.cause?.code || lastError?.message || "unknown error"}`);
}

const health = (await read("/api/health")).json();
assert.equal(health.status, "ok");
assert.equal(health.marketplace, "active");
assert.equal(health.paymentVerification, "finalized-usdc");

const services = (await read("/api/services")).json();
assert.ok(Array.isArray(services.services) && services.services.length >= 27, "service catalog is incomplete");
const privatePayService = services.services.find((service) => service.id === "privatepay.x402");
assert.ok(privatePayService, "PrivatePAY service is missing from the catalog");
assert.equal(services.services.filter((service) => service.id !== "privatepay.x402").length, 26, "catalog must expose 26 independent services plus PrivatePAY");
assert.equal(privatePayService.container, true, "PrivatePAY must be the marketplace container");
assert.equal(privatePayService.marketplace?.service_count, 26, "PrivatePAY marketplace must contain 26 services");
assert.equal(privatePayService.marketplace?.x402_available_for_paid_services?.length, 23, "PrivatePAY x402 availability must be limited to paid services");
assert.deepEqual(services.payment?.methods, ["direct_usdc", "privatepay_x402"], "payment methods must expose direct USDC and PrivatePAY x402");
const privatePayStatus = (await read("/api/privatepay/status")).json();
const autopilotStatus = (await read("/api/privatepay/autopilot/status")).json();
assert.equal(privatePayStatus.payment_ingress_configured, true, "PrivatePAY payment ingress is not configured");
assert.equal(privatePayStatus.merchant_accounts_delegated, true, "PrivatePAY merchant accounts are not delegated");
const delegatedAccounts = privatePayStatus.merchant_account_delegation?.accounts;
assert.ok(Array.isArray(delegatedAccounts), "PrivatePAY delegation account evidence is missing");
for (const role of ["merchant", "payment_ingress"]) {
  const account = delegatedAccounts.find((entry) => entry?.role === role);
  assert.equal(account?.delegated, true, `PrivatePAY ${role} account is not delegated`);
  assert.equal(account?.status, "delegated", `PrivatePAY ${role} delegation status is not delegated`);
}
assert.equal(autopilotStatus.custody, "delegated_agent_session_key", "Autopilot custody contract is stale");
assert.equal(autopilotStatus.reusable_x402_credentials, false, "Autopilot must not expose reusable x402 credentials");
assert.equal(autopilotStatus.policy_requires_explicit_network_asset_recipient_allowlists, true, "Autopilot target allowlists are missing");

const providers = (await read("/api/providers/status")).json();
const accountProviders = providers.providers.filter((provider) => provider.provider === "mongodb" && provider.role === "visitor-accounts-favorites-cart");
assert.equal(accountProviders.length, 1, "visitor account provider is missing or duplicated");
assert.equal(accountProviders[0].status, "configured", "visitor accounts are not configured");

const policy = (await read("/api/marketplace/policy")).json();
assert.equal(policy.seller_tiers?.free?.listing_fee_usd, 0, "free seller listing is not free");
for (const tier of ["basic", "pro"]) assert.ok(policy.seller_tiers?.[tier], `${tier} seller tier is missing`);

const sellerPage = (await read("/sellers")).text;
for (const tier of ["free", "basic", "pro"]) assert.match(sellerPage, new RegExp(`value=["']${tier}["']`), `${tier} is missing from seller UI`);

assert.match((await read("/robots.txt")).text, /Allow: \/sellers/);
assert.match((await read("/sitemap.xml")).text, /\/sellers/);

console.log(JSON.stringify({ base, status: "pass", marketplace: health.marketplace, paymentVerification: health.paymentVerification, services: services.services.length, independentServices: 26, privatePay: { catalogStatus: privatePayService.status, readiness: privatePayStatus.status, enabled: privatePayStatus.enabled, operational: privatePayStatus.operational }, autopilot: { custody: autopilotStatus.custody, enabled: autopilotStatus.enabled }, accountProvider: accountProviders[0].status, sellerTiers: Object.keys(policy.seller_tiers).sort() }));
