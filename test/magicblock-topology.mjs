import test from "node:test";
import assert from "node:assert/strict";
import {
  MAGICBLOCK_MAINNET_TEE_VALIDATOR,
  MAGICBLOCK_MAINNET_US_VALIDATOR,
  getMagicBlockDelegationStatus,
  getMagicBlockEndpointStatus,
  getMagicBlockIdentity,
  getMagicBlockRoutes,
  selectMagicBlockRoute,
} from "../src/magicblock-topology.mjs";

function rpcFixture(results) {
  return async (_url, options) => {
    const request = JSON.parse(options.body);
    const result = results[request.method];
    if (result === undefined) throw new Error(`unexpected RPC method ${request.method}`);
    return { ok: true, status: 200, async json() { return { jsonrpc: "2.0", id: request.id, result }; } };
  };
}

test("selects the official US route without conflating it with the private TEE", async () => {
  const routes = [
    { identity: MAGICBLOCK_MAINNET_TEE_VALIDATOR, fqdn: "https://mainnet-tee.magicblock.app/", countryCode: "SGP" },
    { identity: MAGICBLOCK_MAINNET_US_VALIDATOR, fqdn: "https://us.magicblock.app/", countryCode: "USA" },
  ];
  const fetched = await getMagicBlockRoutes({ fetchImpl: rpcFixture({ getRoutes: routes }) });
  assert.deepEqual(selectMagicBlockRoute(fetched, {
    countryCode: "USA",
    identity: MAGICBLOCK_MAINNET_US_VALIDATOR,
  }), routes[1]);
});

test("verifies provider identity and reads delegation status", async () => {
  const fetchImpl = rpcFixture({
    getIdentity: { identity: MAGICBLOCK_MAINNET_US_VALIDATOR, fqdn: "https://us.magicblock.app/" },
    getDelegationStatus: { isDelegated: false },
  });
  const identity = await getMagicBlockIdentity({
    rpcUrl: "https://us.magicblock.app/",
    expectedIdentity: MAGICBLOCK_MAINNET_US_VALIDATOR,
    fetchImpl,
  });
  assert.equal(identity.identity, MAGICBLOCK_MAINNET_US_VALIDATOR);
  assert.deepEqual(await getMagicBlockDelegationStatus({
    account: "2BJ4ezxqV9YJXc38D9duKBkdn4su4jE1beKUHwH663sL",
    fetchImpl,
  }), { isDelegated: false });
});

test("rejects a mismatched validator identity", async () => {
  await assert.rejects(
    getMagicBlockIdentity({
      rpcUrl: "https://us.magicblock.app/",
      expectedIdentity: MAGICBLOCK_MAINNET_US_VALIDATOR,
      fetchImpl: rpcFixture({ getIdentity: { identity: MAGICBLOCK_MAINNET_TEE_VALIDATOR } }),
    }),
    /identity mismatch/,
  );
});

test("checks MagicBlock TEE Mainnet health and validator identity", async () => {
  const fetchImpl = rpcFixture({
    getHealth: "ok",
    getIdentity: { identity: MAGICBLOCK_MAINNET_TEE_VALIDATOR },
  });
  assert.deepEqual(await getMagicBlockEndpointStatus({
    rpcUrl: "https://mainnet-tee.magicblock.app/",
    expectedIdentity: MAGICBLOCK_MAINNET_TEE_VALIDATOR,
    fetchImpl,
  }), {
    status: "ready",
    health: "ok",
    identity: MAGICBLOCK_MAINNET_TEE_VALIDATOR,
  });
});

test("reports a MagicBlock identity mismatch without treating the endpoint as ready", async () => {
  const fetchImpl = rpcFixture({
    getHealth: "ok",
    getIdentity: { identity: MAGICBLOCK_MAINNET_US_VALIDATOR },
  });
  assert.equal((await getMagicBlockEndpointStatus({
    rpcUrl: "https://mainnet-tee.magicblock.app/",
    expectedIdentity: MAGICBLOCK_MAINNET_TEE_VALIDATOR,
    fetchImpl,
  })).status, "identity-mismatch");
});

test("reports an unreachable Mainnet endpoint as unavailable", async () => {
  const fetchImpl = async () => { throw new Error("connection refused"); };
  assert.deepEqual(await getMagicBlockEndpointStatus({
    rpcUrl: "https://mainnet-tee.magicblock.app/",
    expectedIdentity: MAGICBLOCK_MAINNET_TEE_VALIDATOR,
    fetchImpl,
  }), {
    status: "unavailable",
    message: "MagicBlock getHealth failed: connection refused",
  });
});
