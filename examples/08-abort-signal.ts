/**
 * Example 8: cancel requests with AbortSignal.
 */
import { AbortError, RobloxOpenCloud, TimeoutError } from "@roblox-open-cloud/sdk";

const roblox = RobloxOpenCloud.fromEnv();
const universeId = process.env.ROBLOX_UNIVERSE_ID!;

// Cancel a long listing after 2 seconds. This also cancels pending retry delays.
const controller = new AbortController();
setTimeout(() => {
  controller.abort();
}, 2_000);

let count = 0;
try {
  for await (const _entry of roblox.dataStores.listEntries(
    { universeId, dataStoreId: "PlayerProfiles" },
    { signal: controller.signal },
  )) {
    count++;
  }
  console.log(`Listed all ${count} entries`);
} catch (error) {
  if (!(error instanceof AbortError)) throw error;
  console.log(`Stopped after ${count} entries`);
}

// Per-attempt timeout, distinct from cancellation.
try {
  await roblox.universes.get({ universeId }, { timeoutMs: 1_000 });
} catch (error) {
  if (error instanceof TimeoutError) console.log(`Timed out after ${error.timeoutMs} ms`);
  else throw error;
}

// An overall deadline across all retries, using the built-in AbortSignal.timeout.
await roblox.universes.get({ universeId }, { signal: AbortSignal.timeout(10_000) });
