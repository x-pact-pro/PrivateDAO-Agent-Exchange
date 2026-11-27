export const MAGICBLOCK_MAINNET_ROUTER_RPC = "https://router.magicblock.app";
export const MAGICBLOCK_MAINNET_US_ER_RPC = "https://us.magicblock.app/";
export const MAGICBLOCK_MAINNET_US_VALIDATOR = "MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd";
export const MAGICBLOCK_MAINNET_TEE_RPC = "https://mainnet-tee.magicblock.app/";
export const MAGICBLOCK_MAINNET_TEE_VALIDATOR = "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo";

async function jsonRpc(rpcUrl, method, params = [], fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network request failed";
    throw new Error(`MagicBlock ${method} failed: ${detail}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(`MagicBlock ${method} failed: ${detail}`);
  }
  return payload.result;
}

export async function getMagicBlockRoutes({
  routerRpc = MAGICBLOCK_MAINNET_ROUTER_RPC,
  fetchImpl = fetch,
} = {}) {
  const result = await jsonRpc(routerRpc, "getRoutes", [], fetchImpl);
  if (!Array.isArray(result)) throw new Error("MagicBlock getRoutes did not return an array");
  return result;
}

export function selectMagicBlockRoute(routes, { countryCode, identity } = {}) {
  if (!Array.isArray(routes)) throw new Error("MagicBlock routes must be an array");
  const expectedCountry = String(countryCode || "").toUpperCase();
  return routes.find((route) =>
    (!expectedCountry || String(route?.countryCode || "").toUpperCase() === expectedCountry) &&
    (!identity || route?.identity === identity)
  ) || null;
}

export async function getMagicBlockIdentity({
  rpcUrl,
  expectedIdentity = "",
  fetchImpl = fetch,
} = {}) {
  if (!rpcUrl) throw new Error("MagicBlock identity check requires an RPC URL");
  const result = await jsonRpc(rpcUrl, "getIdentity", [], fetchImpl);
  if (!result?.identity) throw new Error("MagicBlock getIdentity did not return an identity");
  if (expectedIdentity && result.identity !== expectedIdentity) {
    throw new Error(`MagicBlock identity mismatch: expected ${expectedIdentity}, received ${result.identity}`);
  }
  return result;
}

export async function getMagicBlockEndpointStatus({
  rpcUrl,
  expectedIdentity,
  fetchImpl = fetch,
} = {}) {
  if (!rpcUrl) throw new Error("MagicBlock endpoint check requires an RPC URL");
  try {
    const [health, identity] = await Promise.all([
      jsonRpc(rpcUrl, "getHealth", [], fetchImpl),
      getMagicBlockIdentity({
        rpcUrl,
        expectedIdentity,
        fetchImpl,
      }),
    ]);
    if (health !== "ok") return { status: "unhealthy", health, identity: identity.identity };
    return { status: "ready", health, identity: identity.identity };
  } catch (error) {
    const message = error instanceof Error ? error.message : "MagicBlock endpoint check failed";
    const status = /identity mismatch/i.test(message)
      ? "identity-mismatch"
      : /failed: HTTP \d+/.test(message) ? "rpc-error" : "unavailable";
    return { status, message };
  }
}

export async function getMagicBlockDelegationStatus({
  account,
  routerRpc = MAGICBLOCK_MAINNET_ROUTER_RPC,
  fetchImpl = fetch,
} = {}) {
  if (!account) throw new Error("MagicBlock delegation check requires an account");
  return jsonRpc(routerRpc, "getDelegationStatus", [account], fetchImpl);
}
