# Contributing

## Setup

```bash
npm ci
npm run check   # format:check, lint, typecheck, test, build
```

Useful scripts: `npm test`, `npm run test:watch`, `npm run test:coverage`, `npm run format`,
and `node scripts/smoke-test.mjs` (after `npm run build`), which installs the packed tarball into
a clean project.

## Ground rules

- **Never invent API details.** Every endpoint, parameter, field, scope, and limit must come from
  the official reference (https://create.roblox.com/docs/cloud/reference) or `openapi.json`. Link
  the source in your PR. If something is ambiguous, document it as a limitation; don't guess.
- **No live calls in unit tests.** Use the `mockFetch` helper in `test/helpers.ts`.
- **No secrets** in code, tests, fixtures, or logs. Test keys must be obviously fake.
- **Errors are never swallowed.** Hook failures surface as process warnings.
- **Retries stay bounded** and respect idempotency (see `docs/architecture.md`).
- Keep dependencies at zero for runtime and minimal for development.

## Adding an endpoint

Follow "Extending" in [docs/architecture.md](docs/architecture.md), then regenerate the coverage
matrix:

```bash
curl -sSL -o /tmp/openapi.json https://create.roblox.com/docs/cloud/openapi.json
node scripts/generate-coverage.mjs /tmp/openapi.json > docs/coverage.md
```

The generator fails if an `IMPLEMENTED` path no longer exists in the spec, so run it periodically
to detect upstream changes.

## Commits and releases

- Update `CHANGELOG.md` under "Unreleased".
- Follow Semantic Versioning (see README). Keep `src/version.ts` in sync with `package.json`.
