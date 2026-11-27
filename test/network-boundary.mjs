import test from "node:test";
import assert from "node:assert/strict";

import {
  NETWORK_CAPABILITIES,
  networkCapability,
  normalizeNetworkId,
} from "../src/network-capabilities.mjs";
import { SERVICES } from "../src/catalog.mjs";

test("product execution networks stay out of Agent Exchange metadata", () => {
  const excluded = ["bnb:testnet", "zcash:testnet", "stellar:testnet"];
  const advertised = new Set(NETWORK_CAPABILITIES.map((network) => network.id));

  for (const network of excluded) {
    assert.equal(advertised.has(network), false, `${network} must not be advertised by Agent Exchange`);
    assert.equal(networkCapability(network), null, `${network} must not resolve in Agent Exchange`);
    assert.equal(normalizeNetworkId(network), network, `${network} must not have an Agent Exchange alias`);
  }

  assert.ok(networkCapability("solana"), "Solana Agent Exchange support must remain available");
  assert.equal(normalizeNetworkId("robinhood"), "robinhood-mainnet");
  assert.equal(networkCapability("robinhood:mainnet")?.status, "mainnet-read-only");
  assert.ok(networkCapability("robinhood:mainnet")?.capabilities.includes("transaction-simulation"));

  const robinhoodServices = new Set(SERVICES.filter((service) => service.supportedNetworks?.includes("robinhood-mainnet")).map((service) => service.id));
  assert.ok(robinhoodServices.has("token.intelligence"));
  assert.ok(robinhoodServices.has("transaction.simulate"));
  assert.equal(robinhoodServices.has("market.snapshot"), false);
  assert.equal(robinhoodServices.has("swap.quote"), false);
  assert.equal(robinhoodServices.has("privatepay.x402"), false);
});
