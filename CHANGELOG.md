# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - unreleased (not published)

### Added

- `RobloxOpenCloud` client with API key (`x-api-key`) and OAuth 2.0 bearer authentication,
  environment-variable fallback, config validation, and a browser guard.
- Shared transport: per-attempt timeouts, `AbortSignal` support, bounded retries with
  exponential backoff, full jitter, and `Retry-After`, idempotency-aware retry decisions,
  rate-limit header parsing, redacted observability hooks.
- Typed error hierarchy mapped from HTTP status codes and documented Roblox error bodies.
- Lazy `Paginator` with `maxItems`/`maxPages`, resumable tokens, and repeated-token detection.
- Services: `dataStores` (v2), `orderedDataStores` (v2), `messaging` (v2 `publishMessage`),
  `universes` (get, update, restartServers), `places` (get, update, publishVersion),
  `users` (get, listInventoryItems), `groups` (get, listMemberships, listRoles, getRole),
  and `assets` (get, getVersion, getOperation).
- Endpoint coverage matrix generated from the official OpenAPI description.
