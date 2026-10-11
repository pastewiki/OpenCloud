# OpenCloud

`roblox-open-cloud-sdk` is a typed TypeScript SDK for the [Roblox Open Cloud API](https://create.roblox.com/docs/cloud), for
Node.js backends, automation scripts, CI/CD pipelines, and developer tools.

> **Unofficial.** This project is not affiliated with or endorsed by Roblox.

- One client with a consistent, autocompleting interface across services
- Centralized auth (API key or OAuth 2.0 bearer token) with secret redaction
- Automatic retries with exponential backoff, jitter, and `Retry-After` support, with
  idempotency-aware defaults
- Typed error hierarchy with status, Roblox error code, retryability, and rate-limit details
- Lazy, cancellable async iterators for paginated endpoints
- Timeouts and `AbortSignal` cancellation everywhere
- No runtime dependencies (uses the built-in `fetch`)

Every implemented endpoint was checked against Roblox's official
[OpenAPI description](https://create.roblox.com/docs/cloud/reference/openapi) and reference docs.
The [coverage matrix](docs/coverage.md) lists every in-scope operation, implemented or not.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Security](#security)
- [API coverage](#api-coverage)
- [Configuration](#configuration)
- [Error handling](#error-handling)
- [Retries and rate limits](#retries-and-rate-limits)
- [Pagination](#pagination)
- [Cancellation and timeouts](#cancellation-and-timeouts)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Versioning](#versioning)
- [License](#license)

## Requirements

- Node.js **20.3 or newer** (CI tests Node 20, 22, and 24). Node 20 reached end of life in April 2026,
  so new projects should use 22 or 24.
- ESM. The package is ESM-only (`"type": "module"`). From CommonJS, use `await import(...)`.
- A trusted server-side environment (see [Security](#security)).

## Installation

```bash
npm install roblox-open-cloud-sdk
```

To build from source instead:

```bash
git clone https://github.com/pastewiki/OpenCloud.git
cd OpenCloud
npm ci
npm run build
```

## Quick start

```ts
import { RobloxOpenCloud } from "roblox-open-cloud-sdk";

// Reads ROBLOX_OPEN_CLOUD_API_KEY from the environment.
const roblox = RobloxOpenCloud.fromEnv();

const entry = await roblox.dataStores.getEntry<{ coins: number }>({
  universeId: "123456",
  dataStoreId: "PlayerProfiles", // the data store's name
  entryId: "player_456", // the entry key
});
console.log(entry.value?.coins);

for await (const item of roblox.dataStores.listEntries({
  universeId: "123456",
  dataStoreId: "PlayerProfiles",
})) {
  console.log(item.id);
}
```

IDs accept `string`, `number`, or `bigint`. Roblox IDs are 64-bit, so use strings or bigints for values
above `Number.MAX_SAFE_INTEGER`.

## Authentication

Open Cloud supports two credential types. They are **not interchangeable**: each endpoint documents
which it accepts, and several, including every data store endpoint, accept API keys only. The SDK
checks this before sending a request and throws a `ConfigurationError` on a mismatch.

### API keys

Create a key in [Creator Dashboard](https://create.roblox.com/dashboard/credentials) with only the
permissions you need ([guide](https://create.roblox.com/docs/cloud/auth/api-keys)). The SDK sends it
only in the documented `x-api-key` header.

```ts
// Explicit (load the value from your secret manager, never from source code):
const roblox = new RobloxOpenCloud({ apiKey: process.env.ROBLOX_OPEN_CLOUD_API_KEY! });

// Or let the SDK read ROBLOX_OPEN_CLOUD_API_KEY:
const roblox2 = RobloxOpenCloud.fromEnv();
```

Configuration is validated in the constructor: missing keys, keys with stray whitespace or newlines,
and conflicting credential options fail immediately.

### OAuth 2.0

For apps acting on behalf of Roblox users, pass an access token (or a function returning a current
one) obtained through your own
[OAuth 2.0 implementation](https://create.roblox.com/docs/cloud/auth/oauth2-overview). The SDK sends
`Authorization: Bearer <token>`. It does **not** run the authorization-code flow or refresh tokens.

```ts
const roblox = new RobloxOpenCloud({
  accessToken: async () => tokenStore.getFreshAccessToken(userId), // your code
});
```

### Required permissions

Each method's doc comment lists the scope from the API reference (for example
`universe-datastores.objects:read`), and the [coverage matrix](docs/coverage.md) lists them all. Apply
least privilege:

- Use a separate key per application or pipeline.
- Grant only the operations the application calls.
- Restrict the key to specific experiences, and add an IP allowlist for servers with fixed egress IPs.
- Set an expiration and rotate keys. Roblox auto-expires keys unused for 60 days.
- For group-owned experiences, Roblox recommends a dedicated account holding only the needed group role.

## Security

Open Cloud API keys are equivalent to passwords for your experiences.

- **Server-side only.** Never put credentials in browser bundles, mobile apps, Roblox client scripts
  (`LocalScript`), or anything a player can download. The SDK refuses to construct in a browser-like
  environment unless you set `dangerouslyAllowBrowser: true`. Only do that for trusted internal tools.
- **Never commit keys.** Use environment variables injected by your secret manager or CI secrets.
  `.env` files are git-ignored; `.env.example` holds placeholders only.
- **What the SDK does:**
  - Keys travel only in request headers, never in URLs.
  - Credential headers are replaced with `[REDACTED]` before reaching logging hooks.
  - Error messages and bodies are scrubbed of the configured key, in case a proxy echoes it.
  - `console.log(client)` and `JSON.stringify(client)` do not reveal credentials; keys are stored in
    private class fields.
- **What you must do:** keep your own logging from dumping raw `fetch` requests, and don't pass the
  key to anything else.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## API coverage

Summary (the full per-endpoint table with scopes, stability, and rate limits is in
[docs/coverage.md](docs/coverage.md)):

| Service             | Methods                                                                                                                                                                                          | API                 | Auth             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ---------------- |
| `dataStores`        | `listDataStores`, `deleteDataStore`_, `undeleteDataStore`_, `snapshotDataStores`, `listEntries`, `getEntry`, `createEntry`, `updateEntry`, `deleteEntry`, `incrementEntry`, `listEntryRevisions` | Open Cloud v2       | API key          |
| `orderedDataStores` | `listEntries`, `getEntry`, `createEntry`, `updateEntry`, `deleteEntry`, `incrementEntry`                                                                                                         | Open Cloud v2       | API key          |
| `messaging`         | `publish`                                                                                                                                                                                        | Open Cloud v2       | API key or OAuth |
| `universes`         | `get`, `update`, `restartServers`                                                                                                                                                                | Open Cloud v2       | API key or OAuth |
| `places`            | `get`, `update`, `publishVersion`*                                                                                                                                                               | v2; publish uses v1 | publish: API key |
| `users`             | `get`, `listInventoryItems`*                                                                                                                                                                     | Open Cloud v2       | API key or OAuth |
| `groups`            | `get`_, `listMemberships`_, `listRoles`_, `getRole`_                                                                                                                                             | Open Cloud v2       | API key or OAuth |
| `assets`            | `get`_, `getVersion`_, `getOperation`*                                                                                                                                                           | Assets v1           | API key or OAuth |

\* Roblox marks these endpoints **Beta**. They may change without notice.

In-scope operations are implemented for 40 of 121. Not yet implemented: memory stores, user
restrictions, secrets, Luau execution, instances, group writes, asset creation/upload, server
management, place version history, and legacy v1 data stores (v2 replaces them). See the
[roadmap](#roadmap).

Every implemented endpoint is covered by unit tests against mocked HTTP. Live calls are covered only
by the optional [integration tests](test/integration/README.md), which exercise a subset (universe
get, data store list and entry lifecycle). The maintainers have not run those against a live
experience for this release.

## Configuration

```ts
new RobloxOpenCloud({
  apiKey, // or accessToken, or auth (custom AuthProvider)
  baseUrl: "https://apis.roblox.com", // e.g. an egress proxy
  timeoutMs: 30_000, // per attempt
  retry: {
    maxAttempts: 3, // total attempts, 1–10 (hard cap)
    baseDelayMs: 500,
    maxDelayMs: 20_000,
    maxRetryAfterMs: 60_000, // give up instead of sleeping longer than this
    retryNonIdempotentOnRateLimit: true,
  },
  fetch: customFetch, // any fetch-compatible function (proxies, tests)
  userAgent: "my-tool/1.0", // appended to the SDK's user agent
  hooks: { onRequest, onResponse, onRetry }, // redacted observability events
  dangerouslyAllowBrowser: false,
});
```

Every method also accepts per-call options: `{ signal, timeoutMs, retry }`. List methods additionally
accept `{ maxItems, maxPages, pageToken }`.

| Environment variable        | Purpose                                  |
| --------------------------- | ---------------------------------------- |
| `ROBLOX_OPEN_CLOUD_API_KEY` | API key used when no credential is given |

## Error handling

All errors extend `RobloxOpenCloudError` and expose `retryable`. These classes are SDK abstractions
mapped from HTTP status codes and Roblox's [documented error bodies](https://create.roblox.com/docs/cloud/reference/errors).
Roblox does not return errors under these names.

| Class                     | When                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ValidationError`         | HTTP 400 (for example `INVALID_ARGUMENT`, or an entry that already exists on create)                                 |
| `AuthenticationError`     | HTTP 401                                                                                                             |
| `PermissionError`         | HTTP 403 (missing permission, experience or IP not allowed; some endpoints also use 403 when no credential was sent) |
| `NotFoundError`           | HTTP 404                                                                                                             |
| `ConflictError`           | HTTP 409 (for example a place open in Team Create)                                                                   |
| `RateLimitError`          | HTTP 429                                                                                                             |
| `ApiError`                | Any other non-2xx status (base class of the above)                                                                   |
| `TimeoutError`            | An attempt exceeded `timeoutMs`                                                                                      |
| `AbortError`              | Your `AbortSignal` fired                                                                                             |
| `NetworkError`            | `fetch` failed before a response (DNS, TLS, connection reset)                                                        |
| `ResponseValidationError` | A 2xx response did not have the expected structure                                                                   |
| `PaginationError`         | The API repeated a page token                                                                                        |
| `ConfigurationError`      | Invalid configuration or arguments, detected before any request                                                      |

`ApiError` instances carry `status`, `code` (for example `"PERMISSION_DENIED"`, or `0` for gateway
errors), `message`, `details`, `requestId`, `retryAfterMs`, `rateLimit`, `method`, `path`, and the
parsed `body`. `toJSON()` returns a log-safe summary.

```ts
import { ApiError, NotFoundError, PermissionError } from "roblox-open-cloud-sdk";

try {
  await roblox.dataStores.getEntry({ universeId, dataStoreId: "Profiles", entryId: "p1" });
} catch (error) {
  if (error instanceof NotFoundError) {
    // the entry doesn't exist
  } else if (error instanceof PermissionError) {
    console.error(error.message); // includes Roblox's explanation
  } else if (error instanceof ApiError) {
    logger.error(error.toJSON());
  } else {
    throw error;
  }
}
```

Unknown statuses, including 5xx, stay as a plain `ApiError`. They are never forced into a more
specific class.

## Retries and rate limits

Roblox enforces per-endpoint limits ([rate limits](https://create.roblox.com/docs/cloud/reference/rate-limits)).
API-key limits are shared across **all keys of the same owner**. Data stores have additional
[per-experience throttling](https://create.roblox.com/docs/cloud/guides/data-stores/throttling).
The documented per-endpoint limits are listed in the [coverage matrix](docs/coverage.md).

The SDK's retry policy:

1. **Which failures:** HTTP 429, 500, 502, 503, 504, timeouts, and network errors. Never 4xx
   validation, auth, or not-found errors, and never your own aborts.
2. **Which requests:**
   - Idempotent requests are retried on all of the failures above. These are `GET`/`DELETE`, the
     full-replacement updates `updateEntry` (without `etag`) and `universes.update`/`places.update`,
     and `snapshotDataStores`, which Roblox documents as a no-op when repeated the same day.
   - Non-idempotent requests (`createEntry`, `incrementEntry`, `messaging.publish`,
     `restartServers`, `publishVersion`, `updateEntry` with `etag`) are retried **only after HTTP
     429**. A throttled request is treated as not executed, but Roblox doesn't explicitly guarantee
     this, so set `retryNonIdempotentOnRateLimit: false` if a duplicate would be harmful. These
     requests are never retried after timeouts, network errors, or 5xx, since the server may have
     applied them.
3. **How long:** `Retry-After` is honored when present, as Roblox recommends. Otherwise the SDK uses
   exponential backoff with full jitter: `random() × min(maxDelayMs, baseDelayMs × 2^(attempt−1))`.
   If `Retry-After` exceeds `maxRetryAfterMs`, the SDK throws `RateLimitError` instead of waiting.
4. **Bounded:** `maxAttempts` (default 3) is capped at 10, so retries can never loop forever.
   Pending delays are cancelled by `AbortSignal`.

Rate-limit headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`) are parsed
into `error.rateLimit` and the `onResponse` hook, so you can slow down proactively. The SDK doesn't
throttle client-side; limits depend on the endpoint and the key owner's total traffic.

## Pagination

List methods return a lazy `Paginator`. Nothing is fetched until you iterate, and pages are requested
one at a time:

```ts
const entries = roblox.dataStores.listEntries(
  { universeId, dataStoreId: "Profiles", pageSize: 100 },
  { maxItems: 1_000, signal },
);

for await (const entry of entries) {
  /* item by item */
}
for await (const page of entries.byPage()) {
  /* page.items, page.nextPageToken */
}
const firstPage = await entries.getPage();
const all = await entries.toArray(); // bounded by maxItems/maxPages
```

Each page request gets the normal retry and rate-limit handling. If the API ever returns a page token
it already returned, the paginator throws `PaginationError` rather than looping. To resume later,
store `page.nextPageToken` and pass it as `pageToken`. Per Roblox's rules, other parameters must stay
the same across pages.

`pageSize` maps to `maxPageSize`. Each endpoint has its own default and maximum, noted in the method
docs; for example, data store entries default to 10 with a maximum of 256.

## Cancellation and timeouts

- `timeoutMs` applies **per attempt** and covers reading the response body.
- `signal` cancels the whole operation, including retry delays and pagination, and throws `AbortError`.
  For an overall deadline, use `AbortSignal.timeout(ms)`.

```ts
await roblox.universes.get(
  { universeId },
  { signal: AbortSignal.timeout(10_000), timeoutMs: 3_000 },
);
```

## Examples

Runnable scripts are in [`examples/`](examples). Build first (`npm run build`), set
`ROBLOX_OPEN_CLOUD_API_KEY` and `ROBLOX_UNIVERSE_ID`, then run with `node examples/<file>.ts` on Node
22.18+, or with `npx tsx examples/<file>.ts`.

| #   | File                                                        | Shows                                              |
| --- | ----------------------------------------------------------- | -------------------------------------------------- |
| 1   | [01-create-client.ts](examples/01-create-client.ts)         | Creating a client                                  |
| 2   | [02-read-entry.ts](examples/02-read-entry.ts)               | Reading an entry (current and point-in-time)       |
| 3   | [03-write-entry.ts](examples/03-write-entry.ts)             | Writing, conditional writes, increments            |
| 4   | [04-list-entries.ts](examples/04-list-entries.ts)           | Pagination                                         |
| 5   | [05-publish-message.ts](examples/05-publish-message.ts)     | Publishing a message                               |
| 6   | [06-rate-limits.ts](examples/06-rate-limits.ts)             | Handling rate limits                               |
| 7   | [07-permission-errors.ts](examples/07-permission-errors.ts) | Handling permission errors                         |
| 8   | [08-abort-signal.ts](examples/08-abort-signal.ts)           | AbortSignal and timeouts                           |
| 9   | [09-ci-publish-place.ts](examples/09-ci-publish-place.ts)   | CI/CD place publishing ([workflow](docs/ci-cd.md)) |

The examples are type-checked and linted in CI. They haven't been run against a live experience.

## Troubleshooting

| Symptom                                                                                                                     | Likely cause and fix                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AuthenticationError` (401) with "Invalid API Key"                                                                          | The key is wrong, expired, or was revoked. Re-copy or regenerate it.                                                                                   |
| `AuthenticationError` with "Missing API Key Header", or `PermissionError` (403) with "Invalid authentication data provided" | No credential reached Roblox (observed responses for a missing key). A proxy may have stripped `x-api-key`, or a custom `auth` provider didn't set it. |
| `PermissionError` on a specific endpoint                                                                                    | The key lacks that API's operation (scope), the experience isn't in the key's allowed list, or the IP allowlist excludes this machine.                 |
| `ConfigurationError: ... does not accept oauth2 credentials`                                                                | The endpoint is API-key only (for example data stores). Use an API key client for it.                                                                  |
| `ValidationError` on `createEntry`                                                                                          | The entry already exists. Use `updateEntry` with `allowMissing: true` to upsert.                                                                       |
| `ConflictError` on `places.update`                                                                                          | The place is open in an active Team Create session.                                                                                                    |
| Frequent `RateLimitError`                                                                                                   | Other keys from the same owner share the limit. Lower concurrency, raise `retry.maxAttempts`, and watch `rateLimit.remaining` in `onResponse`.         |
| An entry key containing `@` reads the wrong data                                                                            | `getEntry` appends `@latest` automatically. For writes, see [Known limitations](#known-limitations).                                                   |
| `ResponseValidationError`                                                                                                   | Roblox returned an unexpected shape, which may be an API change. Please open an issue with `error.body`, with secrets removed.                         |
| `ERR_REQUIRE_ESM`                                                                                                           | The package is ESM-only. Use `import`, or `await import()` from CommonJS.                                                                              |

## Known limitations

- **Partial coverage.** 40 of 121 in-scope operations are implemented ([matrix](docs/coverage.md)).
  Memory stores, user restrictions, secrets, Luau execution, instances, group writes, asset uploads,
  server management, and place version history are not implemented yet.
- **Legacy v1 data store APIs are not wrapped.** The v2 data store API covers the same operations.
  Legacy v1 messaging is skipped because Roblox recommends v2 `publishMessage`.
- **Runtime validation is shallow.** The SDK checks that responses are objects and that list fields
  are arrays, but it does not validate every field. TypeScript response types (including the generic
  `V` on `getEntry<V>`) are compile-time assertions only.
- **Request IDs are best-effort.** Roblox doesn't document a request-ID header, and none appeared in
  responses observed during development. `requestId` is populated from common header names or from
  `extensions.traceId` in v1 validation errors, so it is often `undefined`.
- **Retrying non-idempotent calls after 429** assumes throttled requests were not executed. Roblox
  doesn't state this explicitly; disable it with `retryNonIdempotentOnRateLimit: false`.
- **Entry keys containing `@` on writes.** `getEntry` follows the documented `@latest` rule. For
  `updateEntry`/`deleteEntry`/`incrementEntry`, Roblox's docs don't say how an `@` in the key is
  interpreted, so avoid `@` in keys you write through Open Cloud.
- **`etag` on updates** is sent in the request body as documented, but the reference doesn't specify
  the failure status for a stale etag.
- **No client-side throttling.** The SDK reacts to 429s; it doesn't predict them.
- **OAuth 2.0** support is limited to sending a bearer token you supply. There is no authorization
  flow or token refresh.
- **Integration tests haven't been run against live Roblox** for this release. Unit tests cover the
  request and response contracts as documented.

## Roadmap

Prioritized by usefulness and API stability:

1. Run the integration suite against a live test experience and record the results; add integration
   coverage for messaging, universes, and places.
2. **Memory stores** (sorted maps, queues, flush): stable v2 endpoints with high demand.
3. **User restrictions** (bans): list, get, update, and logs.
4. **Luau execution** sessions and tasks, for CI-driven tests in experiences.
5. **Asset uploads** (`assets.create`/`update` with multipart, operation polling helper) and asset versions
   once the reference's list response is clarified.
6. A generic **long-running operation** helper (polling with backoff, cancellable).
7. **Group writes** (join requests, membership role changes) and forum reads.
8. **Secrets store**, place **instances**, **server management**, and **place version history**.
9. Optional opt-in client-side rate limiting based on `x-ratelimit-*` headers.
10. Generate request and response types from the OpenAPI description, so they can't drift from the spec
    (the coverage generator already reads it).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). In short:

```bash
npm ci
npm run check   # format check, lint, typecheck, unit tests, build
```

New endpoints must:

- Cite the official reference, using exact paths, parameters, and scopes from `openapi.json`.
- Include unit tests for request construction and response parsing.
- Be added to `IMPLEMENTED` in `scripts/generate-coverage.mjs`, with `docs/coverage.md` regenerated.

## Versioning

This project follows [Semantic Versioning](https://semver.org/). While the version is `0.x`, minor
releases may contain breaking changes, which are always listed in [CHANGELOG.md](CHANGELOG.md). From
`1.0.0` on, breaking changes to the public API (exports from the package root) happen only in major
versions. Changes Roblox makes to Beta endpoints may force changes in the matching SDK methods; such
changes are called out in the changelog.

## License

[MIT](LICENSE)
