// Generates docs/coverage.md from Roblox's official OpenAPI description.
//
//   curl -sSL -o openapi.json https://create.roblox.com/docs/cloud/openapi.json
//   node scripts/generate-coverage.mjs openapi.json > docs/coverage.md
//
// Every operation under the in-scope path prefixes is listed, implemented or not.
// IMPLEMENTED maps "METHOD path" (exactly as in the spec) to the SDK method.
import { readFileSync } from "node:fs";

const IN_SCOPE = [
  ["Data stores (v2)", "/cloud/v2/universes/{universe_id}/data-stores"],
  ["Ordered data stores (v2)", "/cloud/v2/universes/{universe_id}/ordered-data-stores"],
  ["Data stores (v1, legacy)", "/datastores/v1/"],
  ["Ordered data stores (v1, legacy)", "/ordered-data-stores/v1/"],
  ["Messaging (v1, legacy)", "/messaging-service/v1/"],
  ["Memory stores (v2)", "/cloud/v2/universes/{universe_id}/memory-store"],
  ["Places (v2)", "/cloud/v2/universes/{universe_id}/places"],
  ["Universes (v2)", "/cloud/v2/universes/"],
  ["Place publishing (v1)", "/universes/v1/"],
  ["Place version history (v1)", "/place-version-history-api/v1/"],
  ["Server management (v1)", "/server-management/v1/"],
  ["Users (v2)", "/cloud/v2/users/"],
  ["Groups (v2)", "/cloud/v2/groups/"],
  ["Assets (v1)", "/assets/v1/"],
  ["Asset permissions (v1)", "/asset-permissions-api/v1/"],
  ["Other Open Cloud v2", "/cloud/v2/"],
];

const DS = "/cloud/v2/universes/{universe_id}/data-stores";
const SC = `${DS}/{data_store_id}/scopes/{scope_id}`;
const ODS =
  "/cloud/v2/universes/{universe_id}/ordered-data-stores/{ordered_data_store_id}/scopes/{scope_id}/entries";
const IMPLEMENTED = {
  [`GET ${DS}`]: "dataStores.listDataStores",
  [`DELETE ${DS}/{data_store_id}`]: "dataStores.deleteDataStore",
  [`POST ${DS}/{data_store_id}:undelete`]: "dataStores.undeleteDataStore",
  [`POST ${DS}:snapshot`]: "dataStores.snapshotDataStores",
  [`GET ${DS}/{data_store_id}/entries`]: "dataStores.listEntries",
  [`POST ${DS}/{data_store_id}/entries`]: "dataStores.createEntry",
  [`GET ${DS}/{data_store_id}/entries/{entry_id}`]: "dataStores.getEntry",
  [`PATCH ${DS}/{data_store_id}/entries/{entry_id}`]: "dataStores.updateEntry",
  [`DELETE ${DS}/{data_store_id}/entries/{entry_id}`]: "dataStores.deleteEntry",
  [`POST ${DS}/{data_store_id}/entries/{entry_id}:increment`]: "dataStores.incrementEntry",
  [`GET ${DS}/{data_store_id}/entries/{entry_id}:listRevisions`]: "dataStores.listEntryRevisions",
  [`GET ${SC}/entries`]: "dataStores.listEntries ({ scope })",
  [`POST ${SC}/entries`]: "dataStores.createEntry ({ scope })",
  [`GET ${SC}/entries/{entry_id}`]: "dataStores.getEntry ({ scope })",
  [`PATCH ${SC}/entries/{entry_id}`]: "dataStores.updateEntry ({ scope })",
  [`DELETE ${SC}/entries/{entry_id}`]: "dataStores.deleteEntry ({ scope })",
  [`POST ${SC}/entries/{entry_id}:increment`]: "dataStores.incrementEntry ({ scope })",
  [`GET ${SC}/entries/{entry_id}:listRevisions`]: "dataStores.listEntryRevisions ({ scope })",
  [`GET ${ODS}`]: "orderedDataStores.listEntries",
  [`POST ${ODS}`]: "orderedDataStores.createEntry",
  [`GET ${ODS}/{entry_id}`]: "orderedDataStores.getEntry",
  [`PATCH ${ODS}/{entry_id}`]: "orderedDataStores.updateEntry",
  [`DELETE ${ODS}/{entry_id}`]: "orderedDataStores.deleteEntry",
  [`POST ${ODS}/{entry_id}:increment`]: "orderedDataStores.incrementEntry",
  "POST /cloud/v2/universes/{universe_id}:publishMessage": "messaging.publish",
  "GET /cloud/v2/universes/{universe_id}": "universes.get",
  "PATCH /cloud/v2/universes/{universe_id}": "universes.update",
  "POST /cloud/v2/universes/{universe_id}:restartServers": "universes.restartServers",
  "GET /cloud/v2/universes/{universe_id}/places/{place_id}": "places.get",
  "PATCH /cloud/v2/universes/{universe_id}/places/{place_id}": "places.update",
  "POST /universes/v1/{universeId}/places/{placeId}/versions": "places.publishVersion",
  "GET /cloud/v2/users/{user_id}": "users.get",
  "GET /cloud/v2/users/{user_id}/inventory-items": "users.listInventoryItems",
  "GET /cloud/v2/groups/{group_id}": "groups.get",
  "GET /cloud/v2/groups/{group_id}/memberships": "groups.listMemberships",
  "GET /cloud/v2/groups/{group_id}/roles": "groups.listRoles",
  "GET /cloud/v2/groups/{group_id}/roles/{role_id}": "groups.getRole",
  "GET /assets/v1/assets/{assetId}": "assets.get",
  "GET /assets/v1/assets/{assetId}/versions/{versionNumber}": "assets.getVersion",
  "GET /assets/v1/operations/{operationId}": "assets.getOperation",
};

/** Endpoints intentionally not implemented, with the reason. */
const NOTES = {
  "POST /messaging-service/v1/universes/{universeId}/topics/{topic}":
    "Superseded: Roblox lists v2 publishMessage as the recommended alternative",
  "GET /assets/v1/assets/{assetId}/versions":
    "Deferred: the reference's response schema (bare array) conflicts with its pagination parameters",
};

const specPath = process.argv[2];
if (!specPath) {
  console.error("usage: node scripts/generate-coverage.mjs <openapi.json>");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const rows = new Map(IN_SCOPE.map(([name]) => [name, []]));
const used = new Set();
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    const category = IN_SCOPE.find(([, prefix]) => path.startsWith(prefix))?.[0];
    if (!category) continue;
    const security = (op.security ?? []).flatMap((s) => Object.keys(s));
    if (!security.includes("roblox-api-key") && !security.includes("roblox-oauth2")) continue;
    const key = `${method.toUpperCase()} ${path}`;
    used.add(key);
    const auth = [
      security.includes("roblox-api-key") && "API key",
      security.includes("roblox-oauth2") && "OAuth 2.0",
    ]
      .filter(Boolean)
      .join(", ");
    const scopes = [...new Set((op["x-roblox-scopes"] ?? []).map((s) => s.name))]
      .map((name) => `\`${name}\``)
      .join(" ");
    const params = (op.parameters ?? []).map((p) => p.name ?? "");
    const paginated = params.includes("pageToken") || params.includes("cursor") ? "yes" : "";
    const rl = op["x-roblox-rate-limits"]?.perApiKeyOwner;
    const rate = rl ? `${rl.maxInPeriod}/${String(rl.period).toLowerCase()}` : "";
    const sdk = IMPLEMENTED[key];
    const status = sdk ? `✅ \`${sdk}\`` : NOTES[key] ? `➖ ${NOTES[key]}` : "⬜ not implemented";
    rows
      .get(category)
      .push(
        `| ${method.toUpperCase()} | \`${path}\` | ${op["x-roblox-stability"] ?? ""} | ${auth} | ${scopes} | ${paginated} | ${rate} | ${status} |`,
      );
  }
}

const missing = Object.keys(IMPLEMENTED).filter((k) => !used.has(k));
if (missing.length > 0) {
  console.error(`IMPLEMENTED entries not found in the spec:\n${missing.join("\n")}`);
  process.exit(1);
}

const implemented = Object.keys(IMPLEMENTED).length;
const total = [...rows.values()].reduce((n, r) => n + r.length, 0);
const out = [
  "# Endpoint coverage matrix",
  "",
  `Generated by \`scripts/generate-coverage.mjs\` from the official OpenAPI description`,
  `(https://create.roblox.com/docs/cloud/openapi.json, spec \`info.version\` ${spec.info.version}).`,
  "",
  `**${implemented} of ${total}** in-scope operations are implemented. Only operations that accept`,
  "API keys or OAuth 2.0 are listed; cookie-only legacy endpoints are out of scope.",
  "",
  "Columns: stability (`x-roblox-stability`), accepted credentials, documented scopes",
  "(`x-roblox-scopes`; empty means none listed), whether the operation takes a page token, and the",
  "documented per-API-key-owner rate limit (`x-roblox-rate-limits`). Data store operations have",
  "additional throttling limits described in the Roblox data store guides.",
  "",
  "Legend: ✅ implemented and unit-tested · ➖ intentionally skipped (reason given) · ⬜ not implemented",
  "",
];
for (const [name, list] of rows) {
  if (list.length === 0) continue;
  out.push(
    `## ${name}`,
    "",
    "| Method | Path | Stability | Auth | Scopes | Paged | Rate limit | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...list.sort(),
    "",
  );
}
process.stdout.write(out.join("\n"));
