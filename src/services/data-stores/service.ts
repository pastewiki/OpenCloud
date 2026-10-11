import { ConfigurationError } from "../../errors/errors.js";
import type { ListOptions } from "../../pagination/paginator.js";
import type { Paginator } from "../../pagination/paginator.js";
import type { HttpClient } from "../../transport/http-client.js";
import { path } from "../../transport/path.js";
import type { RequestOptions } from "../../transport/types.js";
import type { JsonValue, RobloxId } from "../../types/common.js";
import { requireId, requireString } from "../../utils/guards.js";
import { API_KEY_ONLY, paginateV2, requestObject, requestVoid } from "../shared.js";
import type {
  CreateEntryParams,
  DataStore,
  DataStoreEntry,
  DataStoreParams,
  DeleteEntryParams,
  GetEntryParams,
  IncrementEntryParams,
  ListDataStoresParams,
  ListEntriesParams,
  ListEntryRevisionsParams,
  SnapshotDataStoresResult,
  UpdateEntryParams,
} from "./types.js";

/** RFC 3339 characters only, so the timestamp can be placed in the path verbatim. */
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Standard data stores via Open Cloud v2
 * (`/cloud/v2/universes/{universe_id}/data-stores/...`).
 *
 * All data store endpoints accept API keys only (not OAuth 2.0). Required API
 * key permissions are listed per method. Data store requests are subject to
 * additional throttling: https://create.roblox.com/docs/cloud/guides/data-stores/throttling
 */
export class DataStoresService {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Lists data stores in an experience. Scope: `universe-datastores.control:list`.
   *
   * Page size: default 10, maximum 100.
   */
  listDataStores(params: ListDataStoresParams, options?: ListOptions): Paginator<DataStore> {
    const universeId = requireId(params.universeId, "universeId");
    return paginateV2<DataStore>(
      this.#http,
      {
        method: "GET",
        path: path`/cloud/v2/universes/${universeId}/data-stores`,
        query: { filter: params.filter, showDeleted: params.showDeleted },
        auth: API_KEY_ONLY,
      },
      "dataStores",
      params.pageSize,
      options,
    );
  }

  /**
   * Schedules a data store for permanent deletion in 30 days.
   * Scope: `universe-datastores.control:delete`. **Beta** endpoint.
   */
  async deleteDataStore(params: DataStoreParams, options?: RequestOptions): Promise<DataStore> {
    return requestObject<DataStore>(
      this.#http,
      { method: "DELETE", path: this.#storePath(params), auth: API_KEY_ONLY },
      options,
    );
  }

  /**
   * Cancels a scheduled data store deletion.
   * Scope: `universe-datastores.control:delete`. **Beta** endpoint.
   */
  async undeleteDataStore(params: DataStoreParams, options?: RequestOptions): Promise<DataStore> {
    return requestObject<DataStore>(
      this.#http,
      {
        method: "POST",
        path: `${this.#storePath(params)}:undelete`,
        body: {},
        auth: API_KEY_ONLY,
      },
      options,
    );
  }

  /**
   * Takes a snapshot of all data stores in the experience. At most one snapshot
   * per UTC day is taken; later calls that day are no-ops.
   * Scope: `universe-datastores.control:snapshot`. Limit: 60 requests/minute per key owner.
   */
  async snapshotDataStores(
    params: { universeId: RobloxId },
    options?: RequestOptions,
  ): Promise<SnapshotDataStoresResult> {
    const universeId = requireId(params.universeId, "universeId");
    return requestObject<SnapshotDataStoresResult>(
      this.#http,
      {
        method: "POST",
        path: path`/cloud/v2/universes/${universeId}/data-stores:snapshot`,
        body: {},
        // Documented as a no-op when repeated within the same UTC day.
        idempotent: true,
        auth: API_KEY_ONLY,
      },
      options,
    );
  }

  /**
   * Lists entry keys. Only `path` and `id` are populated; call {@link getEntry}
   * for values. Pass `scope: "-"` to list across all scopes.
   * Scope: `universe-datastores.objects:list`. Page size: default 10, maximum 256.
   */
  listEntries(params: ListEntriesParams, options?: ListOptions): Paginator<DataStoreEntry> {
    return paginateV2<DataStoreEntry>(
      this.#http,
      {
        method: "GET",
        path: this.#entriesPath(params),
        query: { filter: params.filter, showDeleted: params.showDeleted },
        auth: API_KEY_ONLY,
      },
      "dataStoreEntries",
      params.pageSize,
      options,
    );
  }

  /**
   * Reads an entry, optionally at a specific revision or point in time.
   * Scope: `universe-datastores.objects:read`.
   *
   * If `entryId` contains `@` and no revision is requested, the SDK appends
   * `@latest` as the docs require, so the key is not misread as a revision.
   */
  async getEntry<V = JsonValue>(
    params: GetEntryParams,
    options?: RequestOptions,
  ): Promise<DataStoreEntry<V>> {
    const entryId = requireString(params.entryId, "entryId");
    if (params.revisionId !== undefined && params.asOf !== undefined) {
      throw new ConfigurationError("Pass either revisionId or asOf, not both");
    }
    let segment = encodeEntryId(entryId);
    if (params.revisionId !== undefined) {
      segment += `@${encodeURIComponent(requireString(params.revisionId, "revisionId"))}`;
    } else if (params.asOf !== undefined) {
      segment += `@latest:${formatTimestamp(params.asOf)}`;
    } else if (entryId.includes("@")) {
      segment += "@latest";
    }
    return requestObject<DataStoreEntry<V>>(
      this.#http,
      { method: "GET", path: `${this.#entriesPath(params)}/${segment}`, auth: API_KEY_ONLY },
      options,
    );
  }

  /**
   * Creates an entry. Fails with a `ValidationError` (HTTP 400) if it exists.
   * Scope: `universe-datastores.objects:create`.
   *
   * Not retried after timeouts or 5xx responses, since the entry may already
   * have been created.
   */
  async createEntry<V = JsonValue>(
    params: CreateEntryParams<V>,
    options?: RequestOptions,
  ): Promise<DataStoreEntry<V>> {
    const entryId = requireString(params.entryId, "entryId");
    return requestObject<DataStoreEntry<V>>(
      this.#http,
      {
        method: "POST",
        path: this.#entriesPath(params),
        query: { id: entryId },
        body: entryBody(params),
        auth: API_KEY_ONLY,
      },
      options,
    );
  }

  /**
   * Replaces an entry's value, users, and attributes. Partial updates are not
   * supported: omitted `users`/`attributes` are cleared.
   * Scope: `universe-datastores.objects:update` (and `:create` with `allowMissing`).
   *
   * Treated as idempotent (safe to retry) unless `etag` is set, because a
   * retried conditional write could fail after the first attempt succeeded.
   */
  async updateEntry<V = JsonValue>(
    params: UpdateEntryParams<V>,
    options?: RequestOptions,
  ): Promise<DataStoreEntry<V>> {
    const entryId = requireString(params.entryId, "entryId");
    const body: Record<string, unknown> = entryBody(params);
    if (params.etag !== undefined) body.etag = params.etag;
    return requestObject<DataStoreEntry<V>>(
      this.#http,
      {
        method: "PATCH",
        path: `${this.#entriesPath(params)}/${encodeEntryId(entryId)}`,
        query: { allowMissing: params.allowMissing },
        body,
        idempotent: params.etag === undefined,
        auth: API_KEY_ONLY,
      },
      options,
    );
  }

  /**
   * Marks an entry as deleted; it is permanently removed after 30 days.
   * Throws `NotFoundError` if the entry does not exist.
   * Scope: `universe-datastores.objects:delete`.
   */
  async deleteEntry(params: DeleteEntryParams, options?: RequestOptions): Promise<void> {
    const entryId = requireString(params.entryId, "entryId");
    return requestVoid(
      this.#http,
      {
        method: "DELETE",
        path: `${this.#entriesPath(params)}/${encodeEntryId(entryId)}`,
        auth: API_KEY_ONLY,
      },
      options,
    );
  }

  /**
   * Atomically adds `amount` to an integer entry, creating it if missing.
   * Scopes: `universe-datastores.objects:create` and `universe-datastores.objects:update`.
   *
   * Not idempotent: retried only after HTTP 429 (configurable), never after
   * timeouts or 5xx responses.
   */
  async incrementEntry(
    params: IncrementEntryParams,
    options?: RequestOptions,
  ): Promise<DataStoreEntry<number>> {
    const entryId = requireString(params.entryId, "entryId");
    if (!Number.isSafeInteger(params.amount)) {
      throw new ConfigurationError("amount must be a safe integer");
    }
    const body: Record<string, unknown> = { amount: params.amount };
    if (params.users !== undefined) body.users = params.users.map(toUserPath);
    if (params.attributes !== undefined) body.attributes = params.attributes;
    return requestObject<DataStoreEntry<number>>(
      this.#http,
      {
        method: "POST",
        path: `${this.#entriesPath(params)}/${encodeEntryId(entryId)}:increment`,
        body,
        auth: API_KEY_ONLY,
      },
      options,
    );
  }

  /**
   * Lists an entry's revisions (partial entries; see {@link DataStoreEntry}).
   * Scope: `universe-datastores.versions:list`. Page size: default 10, maximum 100.
   */
  listEntryRevisions(
    params: ListEntryRevisionsParams,
    options?: ListOptions,
  ): Paginator<DataStoreEntry> {
    const entryId = requireString(params.entryId, "entryId");
    return paginateV2<DataStoreEntry>(
      this.#http,
      {
        method: "GET",
        path: `${this.#entriesPath(params)}/${encodeEntryId(entryId)}:listRevisions`,
        query: { filter: params.filter },
        auth: API_KEY_ONLY,
      },
      "dataStoreEntries",
      params.pageSize,
      options,
    );
  }

  #storePath(params: { universeId: RobloxId; dataStoreId: string }): string {
    const universeId = requireId(params.universeId, "universeId");
    const dataStoreId = requireString(params.dataStoreId, "dataStoreId");
    return path`/cloud/v2/universes/${universeId}/data-stores/${dataStoreId}`;
  }

  #entriesPath(params: { universeId: RobloxId; dataStoreId: string; scope?: string }): string {
    const base = this.#storePath(params);
    if (params.scope === undefined) return `${base}/entries`;
    const scope = requireString(params.scope, "scope");
    return `${base}${path`/scopes/${scope}`}/entries`;
  }
}

/**
 * Encodes an entry key as a path segment, keeping `@` literal so the
 * documented `key@revision` / `key@latest` syntax reaches the server intact.
 */
function encodeEntryId(entryId: string): string {
  return encodeURIComponent(entryId).replace(/%40/g, "@");
}

function formatTimestamp(value: Date | string): string {
  const text = value instanceof Date ? value.toISOString() : value;
  if (value instanceof Date && Number.isNaN(value.getTime())) {
    throw new ConfigurationError("asOf is an invalid Date");
  }
  if (!RFC3339.test(text)) {
    throw new ConfigurationError("asOf must be a Date or an RFC 3339 timestamp");
  }
  return text;
}

function toUserPath(user: RobloxId): string {
  if (typeof user === "string" && user.startsWith("users/")) {
    return `users/${requireId(user.slice("users/".length), "users[]")}`;
  }
  return `users/${requireId(user, "users[]")}`;
}

function entryBody(params: {
  value: unknown;
  users?: readonly RobloxId[];
  attributes?: Record<string, JsonValue>;
}): Record<string, unknown> {
  if (params.value === undefined) {
    throw new ConfigurationError("value is required (use null to store an explicit null)");
  }
  const body: Record<string, unknown> = { value: params.value };
  if (params.users !== undefined) body.users = params.users.map(toUserPath);
  if (params.attributes !== undefined) body.attributes = params.attributes;
  return body;
}
