import type { JsonValue, PageSizeParam, RobloxId, Timestamp } from "../../types/common.js";

/** Lifecycle state of a data store or entry. */
export type DataStoreState = "STATE_UNSPECIFIED" | "ACTIVE" | "DELETED";

/** `DataStore` resource (Open Cloud v2). */
export interface DataStore {
  /** e.g. `universes/123/data-stores/my-store` */
  path: string;
  /** The data store's name. */
  id: string;
  createTime?: Timestamp;
  /** Set when the data store is scheduled for permanent deletion. */
  expireTime?: Timestamp;
  state?: DataStoreState;
}

/**
 * `DataStoreEntry` resource (Open Cloud v2).
 *
 * List operations return partial entries: `listEntries` populates only `path`
 * and `id`; `listEntryRevisions` also populates `createTime`,
 * `revisionCreateTime`, `revisionId`, `etag`, and `state`.
 */
export interface DataStoreEntry<V = JsonValue> {
  path: string;
  /** Entry key. For revisions it carries an `@<revisionId>` suffix. */
  id: string;
  createTime?: Timestamp;
  revisionId?: string;
  revisionCreateTime?: Timestamp;
  state?: DataStoreState;
  /** Server-computed checksum; send it on update to detect concurrent changes. */
  etag?: string;
  /**
   * The stored value. Non-finite Luau numbers are returned as tagged objects,
   * e.g. `{ "m": null, "t": "numeric", "v": "inf" }`.
   */
  value?: V;
  /** User resource paths (`users/{id}`) associated with the entry. */
  users?: string[];
  /** Arbitrary metadata attributes. */
  attributes?: Record<string, JsonValue>;
}

interface UniverseParam {
  universeId: RobloxId;
}

interface DataStoreParam extends UniverseParam {
  /** The data store's name (the `data_store_id` path parameter). */
  dataStoreId: string;
}

interface ScopeParam {
  /**
   * Optional scope. When omitted, the unscoped resource path is used. Pass
   * `"-"` to `listEntries` to list entries from all scopes.
   */
  scope?: string;
}

interface EntryParam extends DataStoreParam, ScopeParam {
  /** The entry key (`entry_id`). */
  entryId: string;
}

export interface ListDataStoresParams extends UniverseParam, PageSizeParam {
  /** CEL filter; only `id.startsWith("...")` is documented. */
  filter?: string;
  /** Include data stores scheduled for deletion. */
  showDeleted?: boolean;
}

export type DataStoreParams = DataStoreParam;

export interface SnapshotDataStoresResult {
  newSnapshotTaken?: boolean;
  latestSnapshotTime?: Timestamp;
}

export interface ListEntriesParams extends DataStoreParam, ScopeParam, PageSizeParam {
  /** CEL filter; only `id.startsWith("...")` is documented. */
  filter?: string;
  /** Include entries marked for deletion. */
  showDeleted?: boolean;
}

export interface GetEntryParams extends EntryParam {
  /** Read a specific revision (from `listEntryRevisions`). */
  revisionId?: string;
  /**
   * Read the revision that was current at this time (`@latest:<timestamp>`).
   * Must be after the Unix epoch and at most ten minutes in the future.
   */
  asOf?: Date | Timestamp;
}

export interface CreateEntryParams<V = JsonValue> extends EntryParam {
  value: V;
  /** User IDs or `users/{id}` paths to associate with the entry. */
  users?: readonly RobloxId[];
  attributes?: Record<string, JsonValue>;
}

export interface UpdateEntryParams<V = JsonValue> extends CreateEntryParams<V> {
  /**
   * Create the entry if it does not exist (`allowMissing`).
   */
  allowMissing?: boolean;
  /** `etag` from a previous read, sent in the request body. */
  etag?: string;
}

export type DeleteEntryParams = EntryParam;

export interface IncrementEntryParams extends EntryParam {
  /** Integer amount to add. Both the stored value and `amount` must be integers. */
  amount: number;
  users?: readonly RobloxId[];
  attributes?: Record<string, JsonValue>;
}

export interface ListEntryRevisionsParams extends EntryParam, PageSizeParam {
  /**
   * CEL filter on `revision_create_time` using `>=`, `<=`, `&&`, e.g.
   * `revision_create_time >= 2024-01-01T00:00:00Z`.
   */
  filter?: string;
}
