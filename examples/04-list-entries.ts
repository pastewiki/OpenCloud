/**
 * Example 4: list entries with pagination.
 * API key permissions: universe-datastores.objects:list, universe-datastores.control:list
 */
import { RobloxOpenCloud } from "@roblox-open-cloud/sdk";

const roblox = RobloxOpenCloud.fromEnv();
const universeId = process.env.ROBLOX_UNIVERSE_ID!;

// Item by item. Pages are fetched lazily as you iterate; `break` stops further requests.
for await (const entry of roblox.dataStores.listEntries(
  { universeId, dataStoreId: "PlayerProfiles", pageSize: 100, filter: 'id.startsWith("player_")' },
  { maxItems: 500 },
)) {
  console.log(entry.id); // list results include only `path` and `id`
}

// Page by page, e.g. to checkpoint progress and resume later with `pageToken`.
const stores = roblox.dataStores.listDataStores({ universeId, pageSize: 50 });
for await (const page of stores.byPage()) {
  console.log(`${page.items.length} stores; next token: ${page.nextPageToken ?? "(end)"}`);
}

// A single page.
const first = await roblox.dataStores
  .listEntries({ universeId, dataStoreId: "PlayerProfiles" })
  .getPage();
console.log(first.items.length, "entries on the first page");
