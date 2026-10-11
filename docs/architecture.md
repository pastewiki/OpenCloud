# Architecture

## Goals and constraints

- Correctness over breadth: only endpoints verified against the official OpenAPI description.
- No runtime dependencies. Node 20.3+ ships `fetch`, `AbortController`, `Headers`, and `Blob`.
- Server-side only, with defensive handling of secrets.
- Small public surface that can grow service by service without breaking existing code.

## Layout

```
src/
  index.ts            public exports (the only supported import path)
  client.ts           RobloxOpenCloud: wires services to one HttpClient
  config.ts           config resolution and validation, env fallback, browser guard
  version.ts
  auth/               AuthProvider interface, ApiKeyAuth (x-api-key), OAuth2BearerAuth
  transport/          HttpClient (timeouts, retries, error mapping), path encoding, types
  errors/             error hierarchy and Roblox error-body parsing
  retry/              retry policy (decision and delay) and abortable sleep
  rate-limit/         x-ratelimit-* and Retry-After parsing
  pagination/         Paginator (lazy async iterator over pageToken/nextPageToken)
  services/<name>/    one folder per API area: service.ts + types.ts + index.ts
  types/              shared types (RobloxId, JsonValue, ...)
  utils/              runtime guards, redaction
```

`services/*` never call `fetch` directly. They build an `HttpRequest` (method, encoded path,
query, body, accepted auth kinds, idempotency) and hand it to `HttpClient`. All cross-cutting
behavior lives in one place, and endpoint-specific behavior stays in its service.

## Request lifecycle

1. The service validates arguments. Methods are `async`, so a validation failure is a rejected
   promise, never a synchronous throw. A lint rule (`promise-function-async`) enforces this.
2. `HttpClient.request` checks that the endpoint accepts the configured credential kind, resolves
   per-call retry and timeout options, and builds the URL.
3. Each attempt:
   - creates an `AbortController` linked to the caller's signal and a timeout timer;
   - applies auth headers;
   - emits `onRequest` with redacted headers;
   - calls `fetch` and reads the body inside the timeout window;
   - parses rate-limit headers and emits `onResponse`.
4. A non-2xx response becomes a typed `ApiError` subclass (status-based), built from the parsed
   Roblox error body. Secrets are scrubbed, and non-JSON bodies are truncated.
5. On failure, `shouldRetry` decides based on error type, idempotency, attempt count, and
   `Retry-After` vs `maxRetryAfterMs`. `computeRetryDelay` picks the wait, and `sleep` waits,
   cancellable by the signal.
6. A 2xx body is JSON-parsed (empty means `undefined`), then shallow-validated by the service
   (object shape, list arrays, `nextPageToken`).

## Key decisions and trade-offs

| Decision                                             | Why                                                                                                                                                  | Trade-off                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand-written services, not full codegen              | Lets each method add docs, validation, idempotency flags, and ergonomic params (`scope?`, `asOf`, update masks derived from keys).                   | Types can drift from the spec. `scripts/generate-coverage.mjs` cross-checks implemented paths against `openapi.json`. Codegen of types is on the roadmap. |
| Idempotency per request, not per HTTP method         | `PATCH updateEntry` is a full replace (safe to retry); `POST :snapshot` is a documented no-op when repeated; `increment` and `publish` are not safe. | Each new endpoint must make a deliberate choice. The default follows the HTTP method.                                                                     |
| Retry non-idempotent requests after 429 by default   | A 429 normally means the request was rejected before execution, and throttling is the most common transient failure.                                 | Roblox doesn't state this explicitly. One flag disables it.                                                                                               |
| Status-based error classes                           | Stable and predictable. Roblox's error bodies come in several shapes across v1, v2, and the gateway.                                                 | Some 403s mean "no credential". The original message is preserved.                                                                                        |
| Shallow runtime validation                           | Catches API drift on structure without a validation dependency or per-field cost.                                                                    | Field-level types are trusted, not verified. Documented.                                                                                                  |
| `Paginator` object instead of plain `AsyncGenerator` | Supports `for await` iteration, plus `byPage()`, `getPage()`, `toArray()`, and limits, while staying lazy.                                           | Slightly larger surface than a generator.                                                                                                                 |
| ESM-only, no bundling                                | Node 20+ target, tree-shakable, simple build (`tsc`).                                                                                                | CommonJS users need `import()`.                                                                                                                           |
| Auth kinds declared per request                      | API keys and OAuth tokens are not interchangeable. Failing before sending gives a clear error instead of an opaque 401 or 403.                       | The per-endpoint list must be copied from the spec.                                                                                                       |

## Extending

To add an endpoint:

1. Find it in `openapi.json` and record its method, path, parameters, request and response schemas,
   `security`, `x-roblox-scopes`, `x-roblox-stability`, and `x-roblox-rate-limits`.
2. Add types to `services/<area>/types.ts`. Mark read-only fields optional in responses and leave
   them out of request types.
3. Add the method to `services/<area>/service.ts`. Encode path segments with the `path` tag, set
   `auth`, and set `idempotent` explicitly when it differs from the HTTP-method default. Use
   `paginateV2` for `pageToken` lists.
4. Add unit tests for the exact request (method, URL, body, headers) and response parsing.
5. Register it in `IMPLEMENTED` in `scripts/generate-coverage.mjs` and regenerate `docs/coverage.md`.
