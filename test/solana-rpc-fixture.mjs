const SOLANA_RPC_HOSTS = new Set([
  "api.mainnet-beta.solana.com",
  "solana-mainnet.g.alchemy.com",
]);

const SOLANA_RPC_RESULTS = {
  getAccountInfo: { context: { slot: 1 }, value: null },
  getEpochInfo: {
    absoluteSlot: 1,
    blockHeight: 1,
    epoch: 0,
    slotIndex: 1,
    slotsInEpoch: 432000,
    transactionCount: 0,
  },
};

export async function withSolanaRpcFixture(operation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    let hostname = "";
    try {
      hostname = new URL(typeof input === "string" ? input : input.url).hostname;
    } catch {
      // Leave non-URL and non-RPC requests to the real fetch implementation.
    }

    if (Object.hasOwn(SOLANA_RPC_RESULTS, body?.method) && SOLANA_RPC_HOSTS.has(hostname)) {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: SOLANA_RPC_RESULTS[body.method],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
