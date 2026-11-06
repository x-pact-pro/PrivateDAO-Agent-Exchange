# Questline Secret Cutover

This runbook rotates the Questline bearer credential without placing the
credential in Git, chat, build logs, or Lambda environment variables.

## Preconditions

- Use the production AWS account and `eu-north-1` only after confirming the
  target function name.
- Generate a new Questline credential in the provider console. Do not paste it
  into a ticket, terminal transcript, or pull request.
- Confirm the Lambda execution role can read the intended Secrets Manager
  secret.

## Cutover

1. Create or rotate `pdao/agent-exchange/questline` in Secrets Manager with a
   JSON field named `MAGICBLOCK_QUESTLINE_API_KEY` (or `QUESTLINE_API_KEY`).
2. Update the Lambda environment through the AWS console or a merge-safe
   configuration tool:
   - set `MAGICBLOCK_QUESTLINE_SECRET_ID` to the secret name or ARN;
   - set `MAGICBLOCK_QUESTLINE_REQUIRE_SECRET_MANAGER=true`;
   - remove the legacy `MAGICBLOCK_QUESTLINE_API_KEY` environment variable;
   - preserve every unrelated existing environment variable.
3. Confirm the function can read the secret without printing its value.
4. Run the local Questline tests and the live-surface verification.
5. Run the wallet commerce gate in `challenge-only` mode first. The default
   production mode must remain blocked until independently verified settlement
   evidence exists.

## Rollback

Disable Questline Push, restore the previous provider credential only through
Secrets Manager, and do not reintroduce a plaintext Lambda environment value.
Record the rollback reason and rotate the compromised credential afterward.

## Evidence

Acceptable evidence includes secret metadata, IAM access success, redacted
health output, test results, and live endpoint status. Never record the secret,
Bearer header, or provider token in evidence.
