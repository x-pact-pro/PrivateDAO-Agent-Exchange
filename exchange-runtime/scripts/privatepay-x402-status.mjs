import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const artifactPath = resolve(process.env.PRIVATEPAY_X402_ARTIFACT_PATH || "output/privatepay/x402-payment-unsigned.json");
let artifact = null;
try {
  await access(artifactPath);
  artifact = JSON.parse(await readFile(artifactPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw new Error(`Unable to read x402 artifact: ${error instanceof Error ? error.message : String(error)}`);
}

const paymentId = String(artifact?.paymentId || process.env.PRIVATEPAY_X402_PAYMENT_ID || "");
if (!/^[a-f0-9]{64}$/.test(paymentId)) {
  throw new Error(
    `No valid PrivatePAY payment id. Supply PRIVATEPAY_X402_ARTIFACT_PATH or PRIVATEPAY_X402_PAYMENT_ID; no payment was created.`,
  );
}

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-north-1" });
const secretResponse = await client.send(new GetSecretValueCommand({
  SecretId: process.env.PRIVATEPAY_SECRET_ID || "pdao/agent-exchange/privatepay-production",
}));
const secret = JSON.parse(secretResponse.SecretString || "{}");
if (!secret.PRIVATEPAY_FACILITATOR_API_KEY || !secret.PRIVATEPAY_MERCHANT_ID)
  throw new Error("PrivatePAY merchant credentials are incomplete");

const apiBase = process.env.PRIVATEPAY_API_BASE || "https://payments.magicblock.app";
const response = await fetch(`${apiBase}/v1/payments/${paymentId}`, {
  headers: {
    authorization: `Bearer ${secret.PRIVATEPAY_FACILITATOR_API_KEY}`,
    "x-merchant-id": secret.PRIVATEPAY_MERCHANT_ID,
  },
});
const payload = await response.json().catch(() => ({}));
const payment = payload.payment && typeof payload.payment === "object" ? payload.payment : payload;
const allowedKeys = [
  "id", "status", "state", "amount", "amountBaseUnits", "asset", "mint", "cluster", "resource",
  "payer", "payTo", "merchantId", "externalReference", "createdAt", "expiresAt", "updatedAt",
  "settledAt", "transaction", "signature", "settlementSignature", "paymentResponse", "error", "message",
];
const safe = Object.fromEntries(allowedKeys.filter((key) => Object.hasOwn(payment, key)).map((key) => [key, payment[key]]));
const result = {
  checkedAt: new Date().toISOString(),
  status: response.status,
  paymentId,
  artifactPresent: Boolean(artifact),
  payment: safe,
};
const outputPath = resolve(process.env.PRIVATEPAY_X402_STATUS_OUTPUT || "output/privatepay/x402-payment-status.json");
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
await chmod(outputPath, 0o600);
console.log(JSON.stringify({ ...result, outputPath }, null, 2));
