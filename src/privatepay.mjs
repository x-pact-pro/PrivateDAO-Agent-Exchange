//... (other imports and functions remain unchanged)

export async function readAuthenticatedPrivatePayBalance(config, input = {}, fetchImpl = fetch) {
  const wallet = String(input.wallet || "").trim();
  const challenge = String(input.challenge || "");
  const signature = String(input.signature || "");
  if (!SOLANA_ADDRESS.test(wallet))
    throw Object.assign(new Error("A valid Solana wallet is required"), { statusCode: 400, code: "PRIVATEPAY_INVALID_WALLET" });
  if (!challenge || challenge.length > 4096 ||!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)
      || Buffer.from(signature, "base64").length!== 64)
    throw Object.assign(new Error("A signed MagicBlock wallet challenge is required"), { statusCode: 400, code: "PRIVATEPAY_AUTH_SIGNATURE_INVALID" });
  const cluster = providerCluster(config);
  let loginResponse;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      loginResponse = await fetchImpl(privatePayProviderUrl(config, "/v1/spl/login"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pubkey: wallet, challenge, signature, cluster }),
        signal: AbortSignal.timeout(8000),
      });
      if (loginResponse.ok) break;
    } catch (error) {
      if (attempt === 2) throw Object.assign(new Error("MagicBlock private authorization is unavailable after retries"), { statusCode: 503, code: "PRIVATEPAY_AUTH_LOGIN_UNAVAILABLE" });
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  if (!loginResponse.ok)
    throw Object.assign(new Error("MagicBlock rejected wallet authorization"), { statusCode: 403, code: "PRIVATEPAY_AUTH_LOGIN_REJECTED", provider_status: loginResponse.status });
  const login = await loginResponse.json().catch(() => ({}));
  const token = typeof login.token === "string"? login.token : "";
  if (!token || token.length > 8192 || /[\r\n]/.test(token))
    throw Object.assign(new Error("MagicBlock login did not issue a valid session"), { statusCode: 503, code: "PRIVATEPAY_AUTH_TOKEN_INVALID" });
  const url = new URL(privatePayProviderUrl(config, "/v1/spl/private-balance"));
  url.search = new URLSearchParams({ address: wallet, mint: config.privatePayConfidentialMint, cluster }).toString();
  let balanceResponse;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      balanceResponse = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (balanceResponse.ok) break;
    } catch (error) {
      if (attempt === 2) {
        const onChainBalance = await readOnChainBalance(config, wallet, fetchImpl);
        return onChainBalance;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  if (!balanceResponse.ok) {
    const providerPayload = await balanceResponse.json().catch(() => ({}));
    const candidateCode = providerPayload?.error?.code?? providerPayload?.code?? providerPayload?.errorCode?? providerPayload?.error_code;
    const providerErrorCode = typeof candidateCode === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(candidateCode)
     ? candidateCode : null;
    throw Object.assign(new Error(
      balanceResponse.status === 400
       ? "MagicBlock rejected this wallet's private-balance account query. Reconcile the existing delegated account; do not make another deposit."
        : "MagicBlock refused the authenticated private balance read"
    ), {
      statusCode: balanceResponse.status === 400? 422 : [401, 403].includes(balanceResponse.status)? 403 : 503,
      code: "PRIVATEPAY_PRIVATE_BALANCE_REJECTED",
      provider_status: balanceResponse.status,
      provider_error_code: providerErrorCode,
    });
  }
  const balance = await balanceResponse.json().catch(() => ({}));
  if (balance.address!== wallet || balance.mint!== config.privatePayConfidentialMint || balance.location!== "ephemeral")
    throw Object.assign(new Error("MagicBlock private balance does not match the authenticated wallet and asset"), { statusCode: 503, code: "PRIVATEPAY_PRIVATE_BALANCE_BINDING_MISMATCH" });
  const raw = typeof balance.balance === "number" && Number.isSafeInteger(balance.balance)
   ? String(balance.balance) : typeof balance.balance === "string"? balance.balance : "";
  if (!/^(0|[1-9][0-9]*)$/.test(raw) || raw.length > 25)
    throw Object.assign(new Error("MagicBlock private balance returned an invalid amount"), { statusCode: 503, code: "PRIVATEPAY_PRIVATE_BALANCE_AMOUNT_INVALID" });
  const amount = BigInt(raw);
  return {
    wallet,
    mint: config.privatePayConfidentialMint,
    cluster,
    location: "ephemeral",
    amount_base_units: String(amount),
    amount_usdc: `${amount / 1000000n}.${String(amount % 1000000n).padStart(6, "0")}`,
    authenticated: true,
    payment_requires_separate_transaction_signature: true,
    source: "magicblock_wallet_authorized_private_balance",
  };
}

async function readOnChainBalance(config, wallet, fetchImpl) {
  const response = await fetchImpl(`${config.privatePayProviderUrl}/v1/spl/balance`, {
    method: "GET",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error("Failed to read on-chain balance"), { statusCode: 503, code: "PRIVATEPAY_ONCHAIN_BALANCE_READ_FAILED" });
  const balance = await response.json().catch(() => ({}));
  const amount = BigInt(balance.balance);
  return {
    wallet,
    mint: config.privatePayConfidentialMint,
    cluster,
    location: "on-chain",
    amount_base_units: String(amount),
    amount_usdc: `${amount / 1000000n}.${String(amount % 1000000n).padStart(6, "0")}`,
    authenticated: false,
    payment_requires_separate_transaction_signature: true,
    source: "on-chain_balance",
  };
}

//... (other functions remain unchanged)
```