import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  PLACE_FILE_SIZE_LIMIT,
  ResponseValidationError,
} from "../../src/index.js";
import { bodyOf, empty, json, mockFetch, target, testClient } from "../helpers.js";

const U = "/cloud/v2/universes/123";

describe("dataStores", () => {
  it("getEntry builds the documented paths", async () => {
    const { fetch, calls } = mockFetch(
      json({ path: "p", id: "k", value: { coins: 5 } }),
      json({ path: "p", id: "k" }),
      json({ path: "p", id: "k" }),
      json({ path: "p", id: "k" }),
      json({ path: "p", id: "k" }),
    );
    const ds = testClient(fetch).dataStores;
    const base = { universeId: "123", dataStoreId: "Profiles" };

    const entry = await ds.getEntry<{ coins: number }>({ ...base, entryId: "player_1" });
    expect(entry.value?.coins).toBe(5);
    await ds.getEntry({ ...base, entryId: "player_1", scope: "global" });
    await ds.getEntry({ ...base, entryId: "player_1", revisionId: "08DC.0000000001.08DC.01" });
    await ds.getEntry({ ...base, entryId: "player_1", asOf: new Date("2024-12-02T06:00:00Z") });
    await ds.getEntry({ ...base, entryId: "my@entry" });

    expect(calls.map(target)).toEqual([
      `${U}/data-stores/Profiles/entries/player_1`,
      `${U}/data-stores/Profiles/scopes/global/entries/player_1`,
      `${U}/data-stores/Profiles/entries/player_1@08DC.0000000001.08DC.01`,
      `${U}/data-stores/Profiles/entries/player_1@latest:2024-12-02T06:00:00.000Z`,
      `${U}/data-stores/Profiles/entries/my@entry@latest`,
    ]);
  });

  it("getEntry validates arguments", async () => {
    const ds = testClient(mockFetch().fetch).dataStores;
    const base = { universeId: 1, dataStoreId: "s", entryId: "k" };
    await expect(
      ds.getEntry({ ...base, revisionId: "r", asOf: "2024-01-01T00:00:00Z" }),
    ).rejects.toThrow(/either/);
    await expect(ds.getEntry({ ...base, asOf: "yesterday" })).rejects.toThrow(/RFC 3339/);
    await expect(ds.getEntry({ ...base, universeId: "abc" })).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await expect(ds.getEntry({ ...base, entryId: "" })).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("createEntry sends id as a query param and value/users/attributes in the body", async () => {
    const { fetch, calls } = mockFetch(json({ path: "p", id: "k" }));
    await testClient(fetch).dataStores.createEntry({
      universeId: 123,
      dataStoreId: "Profiles",
      entryId: "player_1",
      value: { coins: 0 },
      users: [456, "users/789"],
      attributes: { schema: 2 },
    });
    expect(calls[0]?.method).toBe("POST");
    expect(target(calls[0])).toBe(`${U}/data-stores/Profiles/entries?id=player_1`);
    expect(bodyOf(calls[0])).toEqual({
      value: { coins: 0 },
      users: ["users/456", "users/789"],
      attributes: { schema: 2 },
    });
  });

  it("updateEntry sends PATCH with allowMissing and etag", async () => {
    const { fetch, calls } = mockFetch(json({ path: "p", id: "k" }));
    await testClient(fetch).dataStores.updateEntry({
      universeId: 123,
      dataStoreId: "Profiles",
      entryId: "player_1",
      value: null,
      allowMissing: true,
      etag: "e1",
    });
    expect(calls[0]?.method).toBe("PATCH");
    expect(target(calls[0])).toBe(`${U}/data-stores/Profiles/entries/player_1?allowMissing=true`);
    expect(bodyOf(calls[0])).toEqual({ value: null, etag: "e1" });
  });

  it("requires a value on writes", async () => {
    const ds = testClient(mockFetch().fetch).dataStores;
    await expect(
      ds.updateEntry({ universeId: 1, dataStoreId: "s", entryId: "k", value: undefined as never }),
    ).rejects.toThrow(/value is required/);
  });

  it("deleteEntry handles an empty 200 response", async () => {
    const { fetch, calls } = mockFetch(empty(200));
    await expect(
      testClient(fetch).dataStores.deleteEntry({
        universeId: 123,
        dataStoreId: "Profiles",
        entryId: "k",
      }),
    ).resolves.toBeUndefined();
    expect(calls[0]?.method).toBe("DELETE");
    expect(target(calls[0])).toBe(`${U}/data-stores/Profiles/entries/k`);
  });

  it("incrementEntry uses the :increment custom method", async () => {
    const { fetch, calls } = mockFetch(json({ path: "p", id: "k", value: 11 }));
    const result = await testClient(fetch).dataStores.incrementEntry({
      universeId: 123,
      dataStoreId: "Stats",
      entryId: "visits",
      amount: 1,
    });
    expect(result.value).toBe(11);
    expect(target(calls[0])).toBe(`${U}/data-stores/Stats/entries/visits:increment`);
    expect(bodyOf(calls[0])).toEqual({ amount: 1 });
    await expect(
      testClient(fetch).dataStores.incrementEntry({
        universeId: 1,
        dataStoreId: "s",
        entryId: "k",
        amount: 1.5,
      }),
    ).rejects.toThrow(/integer/);
  });

  it("listEntryRevisions uses :listRevisions", async () => {
    const { fetch, calls } = mockFetch(json({ dataStoreEntries: [{ path: "p@r", id: "k@r" }] }));
    const revs = await testClient(fetch)
      .dataStores.listEntryRevisions({
        universeId: 123,
        dataStoreId: "s",
        entryId: "k",
        pageSize: 5,
      })
      .toArray();
    expect(revs).toHaveLength(1);
    expect(target(calls[0])).toBe(`${U}/data-stores/s/entries/k:listRevisions?maxPageSize=5`);
  });

  it("supports store-level operations", async () => {
    const { fetch, calls } = mockFetch(
      json({ dataStores: [{ path: "x", id: "a" }] }),
      json({ path: "x", id: "a", state: "DELETED" }),
      json({ path: "x", id: "a", state: "ACTIVE" }),
      json({ newSnapshotTaken: true, latestSnapshotTime: "2026-01-01T00:00:00Z" }),
    );
    const ds = testClient(fetch).dataStores;
    await ds.listDataStores({ universeId: 123, showDeleted: true }).getPage();
    await ds.deleteDataStore({ universeId: 123, dataStoreId: "a" });
    await ds.undeleteDataStore({ universeId: 123, dataStoreId: "a" });
    const snap = await ds.snapshotDataStores({ universeId: 123 });
    expect(snap.newSnapshotTaken).toBe(true);
    expect(calls.map((c) => `${c.method} ${target(c)}`)).toEqual([
      `GET ${U}/data-stores?showDeleted=true`,
      `DELETE ${U}/data-stores/a`,
      `POST ${U}/data-stores/a:undelete`,
      `POST ${U}/data-stores:snapshot`,
    ]);
  });
});

describe("orderedDataStores", () => {
  it("defaults to the global scope and builds documented paths", async () => {
    const { fetch, calls } = mockFetch(
      json({ orderedDataStoreEntries: [{ path: "p", id: "a", value: 10 }] }),
      json({ path: "p", id: "a", value: 5 }),
      json({ path: "p", id: "a", value: 6 }),
      json({ path: "p", id: "a", value: 7 }),
      empty(200),
      json({ path: "p", id: "a", value: 1 }),
    );
    const ods = testClient(fetch).orderedDataStores;
    const base = { universeId: 123, orderedDataStoreId: "Leaderboard" };
    await ods.listEntries({ ...base, orderBy: "value desc", filter: "entry >= 10" }).getPage();
    await ods.createEntry({ ...base, entryId: "a", value: 5 });
    await ods.updateEntry({ ...base, entryId: "a", value: 6, allowMissing: true });
    await ods.incrementEntry({ ...base, entryId: "a", amount: 1 });
    await ods.deleteEntry({ ...base, entryId: "a" });
    await ods.getEntry({ ...base, scope: "season-2", entryId: "a" });

    const p = `${U}/ordered-data-stores/Leaderboard/scopes/global/entries`;
    expect(calls.map((c) => `${c.method} ${target(c)}`)).toEqual([
      `GET ${p}?orderBy=value+desc&filter=entry+%3E%3D+10`,
      `POST ${p}?id=a`,
      `PATCH ${p}/a?allowMissing=true`,
      `POST ${p}/a:increment`,
      `DELETE ${p}/a`,
      `GET ${U}/ordered-data-stores/Leaderboard/scopes/season-2/entries/a`,
    ]);
    expect(bodyOf(calls[1])).toEqual({ value: 5 });
  });
});

describe("messaging", () => {
  it("publishes through the v2 publishMessage endpoint", async () => {
    const { fetch, calls } = mockFetch(empty(200));
    await testClient(fetch).messaging.publish({
      universeId: 123,
      topic: "announcements",
      message: JSON.stringify({ text: "hi" }),
    });
    expect(calls[0]?.method).toBe("POST");
    expect(target(calls[0])).toBe(`${U}:publishMessage`);
    expect(bodyOf(calls[0])).toEqual({ topic: "announcements", message: '{"text":"hi"}' });
  });

  it("rejects non-string messages", async () => {
    await expect(
      testClient(mockFetch().fetch).messaging.publish({
        universeId: 1,
        topic: "t",
        message: { a: 1 } as unknown as string,
      }),
    ).rejects.toThrow(/JSON.stringify/);
  });
});

describe("universes", () => {
  it("derives updateMask from the update keys", async () => {
    const { fetch, calls } = mockFetch(json({ path: "universes/123", voiceChatEnabled: true }));
    await testClient(fetch).universes.update({
      universeId: 123,
      update: { voiceChatEnabled: true, desktopEnabled: false },
    });
    expect(calls[0]?.method).toBe("PATCH");
    expect(target(calls[0])).toBe(`${U}?updateMask=voiceChatEnabled%2CdesktopEnabled`);
    expect(bodyOf(calls[0])).toEqual({ voiceChatEnabled: true, desktopEnabled: false });
  });

  it("rejects empty updates", async () => {
    await expect(
      testClient(mockFetch().fetch).universes.update({ universeId: 1, update: {} }),
    ).rejects.toThrow(/at least one field/);
  });

  it("restarts servers with validated options", async () => {
    const { fetch, calls } = mockFetch(json({}));
    await testClient(fetch).universes.restartServers({
      universeId: 123,
      placeIds: ["111", 222],
      closeAllVersions: true,
      bleedOffServers: true,
      bleedOffDurationMinutes: 10,
    });
    expect(target(calls[0])).toBe(`${U}:restartServers`);
    expect(bodyOf(calls[0])).toEqual({
      placeIds: [111, 222],
      closeAllVersions: true,
      bleedOffServers: true,
      bleedOffDurationMinutes: 10,
    });
    await expect(
      testClient(fetch).universes.restartServers({ universeId: 1, bleedOffDurationMinutes: 61 }),
    ).rejects.toThrow(/1 to 60/);
    await expect(
      testClient(fetch).universes.restartServers({
        universeId: 1,
        placeIds: ["99999999999999999999"],
      }),
    ).rejects.toThrow(/MAX_SAFE_INTEGER/);
  });

  it("accepts bigint and large string IDs in paths", async () => {
    const { fetch, calls } = mockFetch(json({ path: "x" }), json({ path: "x" }));
    await testClient(fetch).universes.get({ universeId: 9007199254740993n });
    await testClient(fetch).universes.get({ universeId: "9007199254740993" });
    expect(calls.map(target)).toEqual([
      "/cloud/v2/universes/9007199254740993",
      "/cloud/v2/universes/9007199254740993",
    ]);
  });
});

describe("places", () => {
  it("gets and updates a place", async () => {
    const { fetch, calls } = mockFetch(json({ path: "p" }), json({ path: "p", serverSize: 20 }));
    const places = testClient(fetch).places;
    await places.get({ universeId: 123, placeId: 456 });
    await places.update({ universeId: 123, placeId: 456, update: { serverSize: 20 } });
    expect(calls.map((c) => `${c.method} ${target(c)}`)).toEqual([
      `GET ${U}/places/456`,
      `PATCH ${U}/places/456?updateMask=serverSize`,
    ]);
  });

  it("publishes a place file with the documented content type", async () => {
    const { fetch, calls } = mockFetch(
      new Response('{"versionNumber":7}', {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    const file = new Uint8Array([1, 2, 3]);
    const result = await testClient(fetch).places.publishVersion({
      universeId: 123,
      placeId: 456,
      file,
      format: "rbxl",
      versionType: "Published",
    });
    expect(result).toEqual({ versionNumber: 7 });
    expect(target(calls[0])).toBe("/universes/v1/123/places/456/versions?versionType=Published");
    expect(calls[0]?.headers.get("content-type")).toBe("application/octet-stream");
    expect(calls[0]?.body).toBe(file);
  });

  it("uses application/xml for rbxlx", async () => {
    const { fetch, calls } = mockFetch(new Response('{"versionNumber":1}'));
    await testClient(fetch).places.publishVersion({
      universeId: 1,
      placeId: 2,
      file: new Blob(["<roblox/>"]),
      format: "rbxlx",
      versionType: "Saved",
    });
    expect(calls[0]?.headers.get("content-type")).toBe("application/xml");
  });

  it("validates place files before uploading", async () => {
    const places = testClient(mockFetch().fetch).places;
    const base = { universeId: 1, placeId: 2, format: "rbxl", versionType: "Saved" } as const;
    await expect(places.publishVersion({ ...base, file: new Uint8Array(0) })).rejects.toThrow(
      /empty/,
    );
    await expect(
      places.publishVersion({ ...base, file: new Uint8Array(PLACE_FILE_SIZE_LIMIT + 1) }),
    ).rejects.toThrow(/limit/);
    await expect(
      places.publishVersion({ ...base, file: new Uint8Array(1), format: "zip" as never }),
    ).rejects.toThrow(/format/);
  });

  it("rejects an unexpected publish response", async () => {
    const { fetch } = mockFetch(new Response("ok"));
    await expect(
      testClient(fetch).places.publishVersion({
        universeId: 1,
        placeId: 2,
        file: new Uint8Array(1),
        format: "rbxl",
        versionType: "Saved",
      }),
    ).rejects.toBeInstanceOf(ResponseValidationError);
  });
});

describe("users, groups, assets", () => {
  it("calls the documented user endpoints", async () => {
    const { fetch, calls } = mockFetch(
      json({ path: "users/1", id: "1", name: "builderman" }),
      json({ inventoryItems: [{ path: "users/1/inventory-items/x" }], nextPageToken: "" }),
    );
    const client = testClient(fetch);
    const user = await client.users.get({ userId: 1 });
    expect(user.name).toBe("builderman");
    await client.users.listInventoryItems({ userId: 1, filter: "badges=true" }).toArray();
    expect(calls.map(target)).toEqual([
      "/cloud/v2/users/1",
      "/cloud/v2/users/1/inventory-items?filter=badges%3Dtrue",
    ]);
  });

  it("calls the documented group endpoints", async () => {
    const { fetch, calls } = mockFetch(
      json({ path: "groups/7" }),
      json({ groupMemberships: [] }),
      json({ groupRoles: [] }),
      json({ path: "groups/7/roles/9" }),
      json({ groupMemberships: [] }),
    );
    const groups = testClient(fetch).groups;
    await groups.get({ groupId: 7 });
    await groups.listMemberships({ groupId: 7, filter: "user == 'users/1'" }).getPage();
    await groups.listRoles({ groupId: 7, pageSize: 20 }).getPage();
    await groups.getRole({ groupId: 7, roleId: 9 });
    await groups.listMemberships({ groupId: "-", filter: "user in ['users/1']" }).getPage();
    expect(calls.map(target)).toEqual([
      "/cloud/v2/groups/7",
      "/cloud/v2/groups/7/memberships?filter=user+%3D%3D+%27users%2F1%27",
      "/cloud/v2/groups/7/roles?maxPageSize=20",
      "/cloud/v2/groups/7/roles/9",
      "/cloud/v2/groups/-/memberships?filter=user+in+%5B%27users%2F1%27%5D",
    ]);
  });

  it("calls the documented asset endpoints", async () => {
    const { fetch, calls } = mockFetch(
      json({ assetId: 1, displayName: "Sword" }),
      json({ path: "assets/1/versions/2", published: true }),
      json({ path: "operations/abc", done: true, response: { assetId: 1 } }),
    );
    const assets = testClient(fetch).assets;
    await assets.get({ assetId: 1, readMask: ["description", "displayName"] });
    await assets.getVersion({ assetId: 1, versionNumber: 2 });
    const op = await assets.getOperation({ operationId: "abc" });
    expect(op.done).toBe(true);
    expect(calls.map(target)).toEqual([
      "/assets/v1/assets/1?readMask=description%2CdisplayName",
      "/assets/v1/assets/1/versions/2",
      "/assets/v1/operations/abc",
    ]);
  });
});
