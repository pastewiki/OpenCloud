/**
 * Optional integration tests against the real Roblox Open Cloud API.
 *
 * Skipped unless ROBLOX_INTEGRATION=1. Write tests additionally require
 * ROBLOX_INTEGRATION_WRITE=1 and only touch keys prefixed `sdk-it-` in
 * ROBLOX_TEST_DATA_STORE (default `sdk-integration-tests`). Use a dedicated test
 * experience and a key restricted to it. See test/integration/README.md.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NotFoundError, RobloxOpenCloud } from "../../src/index.js";

const enabled = process.env.ROBLOX_INTEGRATION === "1";
const writesEnabled = enabled && process.env.ROBLOX_INTEGRATION_WRITE === "1";
const universeId = process.env.ROBLOX_UNIVERSE_ID ?? "";
const dataStoreId = process.env.ROBLOX_TEST_DATA_STORE ?? "sdk-integration-tests";

describe.skipIf(!enabled)("Open Cloud (read-only)", () => {
  const roblox = enabled ? RobloxOpenCloud.fromEnv() : (undefined as never);

  it("gets the universe", async () => {
    const universe = await roblox.universes.get({ universeId });
    expect(universe.path).toBe(`universes/${universeId}`);
  });

  it("lists one page of data stores", async () => {
    const page = await roblox.dataStores.listDataStores({ universeId, pageSize: 5 }).getPage();
    expect(Array.isArray(page.items)).toBe(true);
  });
});

describe.skipIf(!writesEnabled)("Open Cloud (writes to the test data store)", () => {
  const roblox = writesEnabled ? RobloxOpenCloud.fromEnv() : (undefined as never);
  const entryId = `sdk-it-${randomUUID()}`;
  const base = { universeId, dataStoreId, entryId };

  it("creates, reads, increments, lists revisions, and deletes an entry", async () => {
    try {
      await roblox.dataStores.createEntry({ ...base, value: 1, attributes: { test: true } });
      const read = await roblox.dataStores.getEntry<number>(base);
      expect(read.value).toBe(1);
      expect(read.attributes).toEqual({ test: true });

      const incremented = await roblox.dataStores.incrementEntry({ ...base, amount: 2 });
      expect(incremented.value).toBe(3);

      const revisions = await roblox.dataStores
        .listEntryRevisions(base, { maxItems: 10 })
        .toArray();
      expect(revisions.length).toBeGreaterThanOrEqual(1);
    } finally {
      // Soft delete (permanently removed by Roblox after 30 days).
      await roblox.dataStores.deleteEntry(base).catch((error: unknown) => {
        if (!(error instanceof NotFoundError)) throw error;
      });
    }
  });
});
