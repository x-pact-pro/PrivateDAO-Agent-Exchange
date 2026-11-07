import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/agent-exchange-deploy.yml", import.meta.url), "utf8");

const requiredFragments = [
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

if (workflow.includes('API Gateway $API_ID routed to unqualified Lambda')) {
  throw new Error("deployment workflow still claims an unqualified production route");
}

console.log(`Deployment workflow verification: PASS (${requiredFragments.length} immutable-routing guards)`);
