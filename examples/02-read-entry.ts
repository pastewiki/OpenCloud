/**
 * Example 2: read a data store entry.
 * API key permission: universe-datastores.objects:read
 */
import { NotFoundError, RobloxOpenCloud } from "roblox-open-cloud-sdk";

interface PlayerProfile {
  coins: number;
  level: number;
}

const roblox = RobloxOpenCloud.fromEnv();
const universeId = process.env.ROBLOX_UNIVERSE_ID!;

try {
  const entry = await roblox.dataStores.getEntry<PlayerProfile>({
    universeId,
    dataStoreId: "PlayerProfiles",
    entryId: "player_456",
  });
  // TypeScript generics do not validate data at runtime; check what you rely on.
  const coins = typeof entry.value?.coins === "number" ? entry.value.coins : 0;
  console.log(`player_456 has ${coins} coins (revision ${entry.revisionId ?? "?"})`);

  // Read the value as it was at a point in time.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const old = await roblox.dataStores.getEntry<PlayerProfile>({
    universeId,
    dataStoreId: "PlayerProfiles",
    entryId: "player_456",
    asOf: yesterday,
  });
  console.log("Value 24h ago:", old.value);
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log("Entry does not exist");
  } else {
    throw error;
  }
}
