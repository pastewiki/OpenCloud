/**
 * Example 9: publish a place from a CI/CD pipeline, then restart outdated servers.
 *
 * Required environment (CI secrets and variables, never committed):
 *   ROBLOX_OPEN_CLOUD_API_KEY  key with universe-places:write and universe:write
 *   ROBLOX_UNIVERSE_ID, ROBLOX_PLACE_ID
 *   PLACE_FILE                 path to the built .rbxl or .rbxlx file
 *
 * docs/ci-cd.md has a GitHub Actions workflow that runs this script.
 */
import { readFile } from "node:fs/promises";
import { ApiError, RobloxOpenCloud } from "roblox-open-cloud-sdk";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(2);
  }
  return value;
}

const universeId = requireEnv("ROBLOX_UNIVERSE_ID");
const placeId = requireEnv("ROBLOX_PLACE_ID");
const placeFile = requireEnv("PLACE_FILE");

const roblox = RobloxOpenCloud.fromEnv({ userAgent: "ci-deploy/1.0" });

try {
  const file = await readFile(placeFile);
  const { versionNumber } = await roblox.places.publishVersion({
    universeId,
    placeId,
    file,
    format: placeFile.endsWith(".rbxlx") ? "rbxlx" : "rbxl",
    versionType: "Published",
  });
  console.log(`Published place ${placeId} as version ${versionNumber}`);

  // Restart only servers on older versions, letting players migrate over 10 minutes.
  await roblox.universes.restartServers({
    universeId,
    placeIds: [placeId],
    bleedOffServers: true,
    bleedOffDurationMinutes: 10,
  });
  console.log("Requested a restart of outdated servers");
} catch (error) {
  // Print safe diagnostics only (errors never contain the key). A non-zero exit fails the job.
  if (error instanceof ApiError) console.error("Deploy failed:", error.toJSON());
  else console.error("Deploy failed:", error);
  process.exit(1);
}
