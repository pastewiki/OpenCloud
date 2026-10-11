/**
 * Example 1: create a client.
 *
 * Run (after `npm run build`, with ROBLOX_OPEN_CLOUD_API_KEY and ROBLOX_UNIVERSE_ID set):
 *   node examples/01-create-client.ts        # Node 22.18+ runs TypeScript directly
 *   npx tsx examples/01-create-client.ts     # Node 20
 */
import { RobloxOpenCloud } from "@roblox-open-cloud/sdk";

// Option A: read ROBLOX_OPEN_CLOUD_API_KEY from the environment.
const roblox = RobloxOpenCloud.fromEnv({
  timeoutMs: 15_000,
  retry: { maxAttempts: 4 },
  userAgent: "sdk-examples/1.0",
});

// Option B: pass the key explicitly. Load it from a secret store; never hard-code it.
// const roblox = new RobloxOpenCloud({ apiKey: process.env.ROBLOX_OPEN_CLOUD_API_KEY! });

const universeId = process.env.ROBLOX_UNIVERSE_ID;
if (!universeId) throw new Error("Set ROBLOX_UNIVERSE_ID");

const universe = await roblox.universes.get({ universeId });
console.log(`Universe ${universe.path}: ${universe.displayName ?? "(no name)"}`);
