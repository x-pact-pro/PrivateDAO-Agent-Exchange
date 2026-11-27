import { readFile } from "node:fs/promises";

const [workflow, verificationWorkflow, nodePin, packageText, deploymentPolicyText] = await Promise.all([
  readFile(new URL("../.github/workflows/agent-exchange-deploy.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/agent-exchange.yml", import.meta.url), "utf8"),
  readFile(new URL("../.nvmrc", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../infra/iam/agent-exchange-github-oidc-policy.json", import.meta.url), "utf8"),
]);

const packageJson = JSON.parse(packageText);
const deploymentPolicy = JSON.parse(deploymentPolicyText);
const requiredFragments = [
  'echo "should_deploy=true" >> "$GITHUB_OUTPUT"',
  "Successful main CI: automatically deploying the verified main revision.",
  "node-version-file: .nvmrc",
  '[[ "$NODE_VERSION" == "24.10.0" ]]',
  'test "$AWS_REGION" = "us-east-1"',
  'test "$FUNCTION_NAME" = "PrivateDAOAgentExchange-Virginia-Standby"',
  'test "$API_NAME" = "PrivateDAO-AgentExchange-Virginia-Standby"',
  '--runtime "$LAMBDA_RUNTIME"',
  'echo "PREVIOUS_RUNTIME=$PREVIOUS_RUNTIME" >> "$GITHUB_ENV"',
  'echo "- Restored Lambda runtime: $RESTORED_RUNTIME"',
  '.payment_link_buyer_checkout.funded_execution == "enabled"',
  "PREVIOUS_ENVIRONMENT_PATH=$RUNNER_TEMP/privatedao-agent-exchange.environment.previous.json",
  "PREVIOUS_INTEGRATIONS_PATH=$RUNNER_TEMP/privatedao-agent-exchange.integrations.previous.json",
  "PREVIOUS_CORS_PATH=$RUNNER_TEMP/privatedao-agent-exchange.cors.previous.json",
  "PREVIOUS_SCHEDULE_PATH=$RUNNER_TEMP/privatedao-agent-exchange.schedule.previous.json",
  "PREVIOUS_SCHEDULE_TARGETS_PATH=$RUNNER_TEMP/privatedao-agent-exchange.schedule-targets.previous.json",
  "PREVIOUS_LAMBDA_POLICY_SIDS_PATH=$RUNNER_TEMP/privatedao-agent-exchange.lambda-policy-sids.previous.json",
  '--environment "file://$PREVIOUS_ENVIRONMENT_PATH"',
  "--cors-configuration \"file://$PREVIOUS_CORS_PATH\"",
  'FUNCTION_ARN="${BASE_FUNCTION_ARN}:${DEPLOYED_VERSION}"',
  '--qualifier "$DEPLOYED_VERSION"',
  'API Gateway $API_ID routed to immutable Lambda version $DEPLOYED_VERSION',
  "API Gateway routing and CORS restored to their captured pre-deploy settings.",
  "EventBridge settlement rule and targets restored to their captured pre-deploy state.",
  "aws events remove-targets",
  "aws events delete-rule",
  "aws lambda remove-permission",
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) throw new Error(`deployment workflow is missing: ${fragment}`);
}

if (nodePin.trim() !== "24.10.0" || packageJson.engines?.node !== "24.10.0") {
  throw new Error("the Agent Exchange toolchain and package engine must both pin Node.js 24.10.0");
}
if (!verificationWorkflow.includes("node-version-file: .nvmrc")
  || !verificationWorkflow.includes('test "$(node --version)" = "v24.10.0"')) {
  throw new Error("CI is not enforcing the shared Node.js 24.10.0 pin");
}
if (workflow.includes('echo "should_deploy=false"')) {
  throw new Error("successful main CI is still configured as verification-only");
}
if (workflow.includes("authorization-type NONE") || workflow.includes("route_auth")) {
  throw new Error("deployment workflow must not weaken API Gateway route authorization");
}
if (workflow.includes("API Gateway $API_ID routed to unqualified Lambda")) {
  throw new Error("deployment workflow still claims an unqualified production route");
}
if (deploymentPolicy.RoleName !== "PrivateDAOAgentExchange-GitHubOIDCDeploy"
  || deploymentPolicy.PolicyName !== "AgentExchangeLambdaDeploy") {
  throw new Error("the reviewed Virginia deployment policy identity changed");
}
const policyText = JSON.stringify(deploymentPolicy.PolicyDocument);
if (policyText.includes("eu-north-1") || policyText.includes("PrivateDAOAgentExchange-Function-N2zgpQmMN41S")) {
  throw new Error("the production OIDC role policy still authorizes retired Stockholm resources");
}
for (const action of [
  "events:DescribeRule",
  "events:ListTargetsByRule",
  "events:RemoveTargets",
  "events:DeleteRule",
  "lambda:RemovePermission",
]) {
  if (!policyText.includes(action)) throw new Error(`the Virginia deploy policy cannot roll back: missing ${action}`);
}
const environmentUpdate = workflow.indexOf('--environment "$environment"');
const publishVersion = workflow.indexOf("aws lambda publish-version");
if (environmentUpdate < 0 || publishVersion < 0 || environmentUpdate > publishVersion) {
  throw new Error("payout/runtime configuration must be reconciled before publishing the immutable Lambda version");
}

console.log(`Deployment workflow verification: PASS (${requiredFragments.length} release and rollback guards; Node.js 24.10.0; Virginia only)`);
