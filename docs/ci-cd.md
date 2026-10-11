# Using the SDK in CI/CD

[`examples/09-ci-publish-place.ts`](../examples/09-ci-publish-place.ts) publishes a place file and
then restarts outdated servers. Below is a GitHub Actions workflow that runs it.

## API key for CI

Create a dedicated key for the pipeline:

- **Permissions:** Place publishing (`universe-places:write`), plus `universe:write` if you restart
  servers.
- **Restrict by experience:** only the experience being deployed.
- **IP restrictions:** GitHub-hosted runners don't have fixed IPs. Use self-hosted runners with a
  known egress IP if you need an allowlist.
- **Expiration:** set one, and rotate the secret before it expires. Unused keys expire after 60 days.

Store it as an encrypted repository or environment secret (`ROBLOX_OPEN_CLOUD_API_KEY`). Protect
the deploy environment with required reviewers if production publishes need approval.

## Workflow

```yaml
name: Deploy place

on:
  workflow_dispatch:
  push:
    tags: ["v*"]

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production # holds the secret; add required reviewers here
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      # Build your place file here (for example with Rojo) so that it exists at PLACE_FILE.
      - run: node scripts/deploy.ts # a copy of examples/09-ci-publish-place.ts
        env:
          ROBLOX_OPEN_CLOUD_API_KEY: ${{ secrets.ROBLOX_OPEN_CLOUD_API_KEY }}
          ROBLOX_UNIVERSE_ID: ${{ vars.ROBLOX_UNIVERSE_ID }}
          ROBLOX_PLACE_ID: ${{ vars.ROBLOX_PLACE_ID }}
          PLACE_FILE: build/game.rbxl
```

Notes:

- The game repository must list the SDK as a dependency so `npm ci` installs it. Node 22.18+ runs
  the `.ts` script directly; on older versions use `npx tsx`.
- The script exits non-zero on failure, so the job fails. Errors are printed with `error.toJSON()`,
  which never includes the key.
- `publishVersion` is not idempotent. The SDK retries it only after HTTP 429. If a run fails after a
  timeout, check the place's version history before rerunning.
- The place publishing limit is 30 requests per minute per API key owner, shared with every other key
  owned by the same user or group.
