/**
 * Example 3: write data store entries.
 * API key permissions: universe-datastores.objects:create and universe-datastores.objects:update
 */
import { RobloxOpenCloud } from "@roblox-open-cloud/sdk";

const roblox = RobloxOpenCloud.fromEnv();
const universeId = process.env.ROBLOX_UNIVERSE_ID!;
const dataStoreId = "PlayerProfiles";

// Create or replace. Partial updates are not supported: omitted users/attributes are cleared.
const saved = await roblox.dataStores.updateEntry({
  universeId,
  dataStoreId,
  entryId: "player_456",
  value: { coins: 100, level: 3 },
  users: [456], // sent as "users/456"
  attributes: { schemaVersion: 1 },
  allowMissing: true,
});
console.log("Saved revision", saved.revisionId);

// Optimistic concurrency: send the etag you read so the write fails if the entry changed.
await roblox.dataStores.updateEntry({
  universeId,
  dataStoreId,
  entryId: "player_456",
  value: { coins: 150, level: 3 },
  users: [456],
  attributes: { schemaVersion: 1 },
  ...(saved.etag !== undefined && { etag: saved.etag }),
});

// Atomic integer increment. Not idempotent, so never auto-retried after timeouts or 5xx.
const visits = await roblox.dataStores.incrementEntry({
  universeId,
  dataStoreId: "GlobalStats",
  entryId: "visits",
  amount: 1,
});
console.log("Visits:", visits.value);
