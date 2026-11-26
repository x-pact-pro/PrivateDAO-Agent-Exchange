import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/agent-exchange-deploy.yml", import.meta.url), "utf8");
const verificationWorkflow = await readFile(new URL("../.github/workflows/agent-exchange.yml", import.meta.url), "utf8");
const nodeVersion = (await readFile(new URL("../.nvmrc", import.meta.url), "utf8")).trim();

const requiredFragments = [
  'echo "should_deploy=true" >> "$GITHUB_OUTPUT"',
  "Successful main CI: automatically deploying the verified main revision.",
  "node-version-file: .nvmrc",
  '--runtime "$LAMBDA_RUNTIME"',
  'echo "PREVIOUS_RUNTIME=$PREVIOUS_RUNTIME" >> "$GITHUB_ENV"',
  'echo "- Restored Lambda runtime: $RESTORED_RUNTIME"',
  '.payment_link_buyer_checkout.funded_execution == "enabled"',
  'BASE_FUNCTION_ARN="$(aws lambda get-function',
  '--function-name "$FUNCTION_NAME"',
  'FUNCTION_ARN="${BASE_FUNCTION_ARN}:${DEPLOYED_VERSION}"',
  '--qualifier "$DEPLOYED_VERSION"',
  'API Gateway $API_ID routed to immutable Lambda version $DEPLOYED_VERSION',
  'API Gateway routing restored to the rollback Lambda package.',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) throw new Error(`deployment workflow is missing: ${fragment}`);
}

if (nodeVersion !== "24.10.0") throw new Error(`unexpected Node.js source pin: ${nodeVersion}`);
if (!verificationWorkflow.includes("node-version-file: .nvmrc")) {
  throw new Error("CI is not using the shared Node.js version pin");
}
if (workflow.includes('echo "should_deploy=false"')) {
  throw new Error("successful main CI is still configured as verification-only");
}
if (workflow.includes('API Gateway $API_ID routed to unqualified Lambda')) {
  throw new Error("deployment workflow still claims an unqualified production route");
}

console.log(`Deployment workflow verification: PASS (${requiredFragments.length} release guards; Node.js ${nodeVersion})`);
