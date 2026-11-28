const SOLANA_RPC_HOSTS = new Set([
  "api.mainnet-beta.solana.com",
  "solana-mainnet.g.alchemy.com",
]);

export async function withSolanaAccountInfoFixture(operation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    let hostname = "";
    try {
      hostname = new URL(typeof input === "string" ? input : input.url).hostname;
    } catch {
      // Leave non-URL and non-RPC requests to the real fetch implementation.
    }

    if (body?.method === "getAccountInfo" && SOLANA_RPC_HOSTS.has(hostname)) {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { context: { slot: 1 }, value: null },
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
