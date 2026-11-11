import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.AGENT_EXCHANGE_TEST_MODE = "true";
process.env.AGENT_EXCHANGE_ALLOW_TEST_STORAGE = "true";

const { handler, resetForTests } = await import("../src/handler.mjs");

async function request(path, method, body = undefined) {
  const result = await handler({
    version: "2.0",
    routeKey: method + " " + path,
    rawPath: path,
    rawQueryString: "",
    headers: { "content-type": "application/json", host: "agents.privatedao.org" },
    requestContext: {
      stage: "$default",
      requestId: "privatepay-mcp-unit",
      http: { method, path, sourceIp: "127.0.0.1", userAgent: "unit-test" },
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body), isBase64Encoded: false }),
  });
  return { status: result.statusCode, body: result.body ? JSON.parse(result.body) : null };
}

test("dedicated PrivatePAY MCP discovers only scoped tools with real schemas", async () => {
  resetForTests();
  const init = await request("/mcp/privatepay", "POST", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.serverInfo.name, "pdao-privatepay-x402");
  const listed = await request("/mcp/privatepay", "POST", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.equal(listed.status, 200);
  const tools = listed.body.result.tools;
  assert.ok(tools.length >= 9);
  assert.ok(tools.every((tool) => tool.name.startsWith("privatepay_")));
  for (const name of ["privatepay_status", "privatepay_wallet_challenge", "privatepay_private_balance", "privatepay_checkout", "privatepay_verify", "privatepay_settle"]) {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool, "Missing " + name);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.outputSchema.type, "object");
  }
  assert.deepEqual(tools.find((tool) => tool.name === "privatepay_private_balance").inputSchema.required,
    ["wallet", "challenge", "signature"]);
  assert.equal(tools.find((tool) => tool.name === "privatepay_settle").annotations.readOnlyHint, false);
  const general = await request("/mcp", "POST", { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
  assert.ok(general.body.result.tools.some((tool) => tool.name === "list_catalog"));
  assert.ok(general.body.result.tools.some((tool) => tool.name === "privatepay_private_balance"));
});

test("dedicated PrivatePAY MCP forbids general tools and refuses unsigned private reads", async () => {
  resetForTests();
  const forbidden = await request("/mcp/privatepay", "POST", {
    jsonrpc: "2.0", id: 4, method: "tools/call",
    params: { name: "list_catalog", arguments: {} },
  });
  assert.equal(forbidden.body.result.isError, true);
  assert.equal(forbidden.body.result.structuredContent.code, "PRIVATEPAY_MCP_TOOL_NOT_ALLOWED");
  const unsigned = await request("/mcp/privatepay", "POST", {
    jsonrpc: "2.0", id: 5, method: "tools/call",
    params: {
      name: "privatepay_private_balance",
      arguments: {
        wallet: "4iS7L9jZMzCMZKFXLTkh5xXXxSJYJZfeibmPjoHwbEk9",
        challenge: "signed-by-wallet-in-real-client",
        signature: "not-a-signature",
      },
    },
  });
  assert.equal(unsigned.body.result.isError, true);
  assert.equal(unsigned.body.result.structuredContent.code, "PRIVATEPAY_AUTH_SIGNATURE_INVALID");
  assert.equal(unsigned.body.result.structuredContent.statusCode, 400);
  assert.doesNotMatch(JSON.stringify(unsigned.body), /Bearer |private-bearer/);
});

test("dedicated PrivatePAY MCP publishes machine-readable onboarding instructions", async () => {
  const metadata = await request("/mcp/privatepay", "GET");
  assert.equal(metadata.status, 200);
  assert.equal(metadata.body.endpoint, "https://agents.privatedao.org/mcp/privatepay");
  assert.match(metadata.body.authentication, /wallet-signed/);
  assert.match(metadata.body.payment_authorization, /separate signed wallet transaction/);
});
