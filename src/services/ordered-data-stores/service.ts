import { ConfigurationError } from "../../errors/errors.js";
import type { ListOptions, Paginator } from "../../pagination/paginator.js";
import type { HttpClient } from "../../transport/http-client.js";
import { path } from "../../transport/path.js";
import type { RequestOptions } from "../../transport/types.js";
import type { RobloxId } from "../../types/common.js";
import { requireId, requireString } from "../../utils/guards.js";
import { API_KEY_ONLY, paginateV2, requestObject, requestVoid } from "../shared.js";
import type {
  CreateOrderedEntryParams,
  DeleteOrderedEntryParams,
  GetOrderedEntryParams,
  IncrementOrderedEntryParams,
  ListOrderedEntriesParams,
  OrderedDataStoreEntry,
  UpdateOrderedEntryParams,
} from "./types.js";

/**
 * Ordered data stores via Open Cloud v2
 * (`/cloud/v2/universes/{universe_id}/ordered-data-stores/...`).
 *
 * API keys only. Scopes: `universe.ordered-data-store.scope.entry:read` for
 * reads, `universe.ordered-data-store.scope.entry:write` for writes.
 */
export class OrderedDataStoresService {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Lists entries, optionally sorted and range-filtered. Page size: default 10, maximum 100. */
  listEntries(
    params: ListOrderedEntriesParams,
    options?: ListOptions,
  ): Paginator<OrderedDataStoreEntry> {
    return paginateV2<OrderedDataStoreEntry>(
      this.#http,
      {
        method: "GET",
        path: entriesPath(params),
        query: { orderBy: params.orderBy, filter: params.filter },
        auth: API_KEY_ONLY,
      },
      "orderedDataStoreEntries",
      params.pageSize,
      options,
    );
  }

  /** Creates an entry. Fails with `ValidationError` (HTTP 400) if it exists. */
  async createEntry(
    params: CreateOrderedEntryParams,
    options?: RequestOptions,
  ): Promise<OrderedDataStoreEntry> {
    const entryId = requireString(params.entryId, "entryId");
    return requestObject<OrderedDataStoreEntry>(
      this.#http,
      {
        method: "POST",
        path: entriesPath(params),
        query: { id: entryId },
        body: { value: requireNumber(params.value, "value") },
        auth: API_KEY_ONLY,
      },
      options,
    );
  }

  async getEntry(
    params: GetOrderedEntryParams,
    options?: RequestOptions,
  ): Promise<OrderedDataStoreEntry> {
    return requestObject<OrderedDataStoreEntry>(
      this.#http,
      { method: "GET", path: entryPath(params), auth: API_KEY_ONLY },
      options,
    );
  }

  /** Sets an entry's value. Idempotent, so it is retried on transient failures. */
  async updateEntry(
    params: UpdateOrderedEntryParams,
    options?: RequestOptions,
  ): Promise<OrderedDataStoreEntry> {
    return requestObject<OrderedDataStoreEntry>(
      this.#http,
      {
        method: "PATCH",
        path: entryPath(params),
        query: { allowMissing: params.allowMissing },
        body: { value: requireNumber(params.value, "value") },
        idempotent: true,
        auth: API_KEY_ONLY,
      },
      options,
    );
  }

  /** Deletes an entry. Throws `NotFoundError` if it does not exist. */
  async deleteEntry(params: DeleteOrderedEntryParams, options?: RequestOptions): Promise<void> {
    return requestVoid(
      this.#http,
      { method: "DELETE", path: entryPath(params), auth: API_KEY_ONLY },
      options,
    );
  }

  /** Adds an integer `amount`, creating the entry if missing. Not idempotent. */
  async incrementEntry(
    params: IncrementOrderedEntryParams,
    options?: RequestOptions,
  ): Promise<OrderedDataStoreEntry> {
    if (!Number.isSafeInteger(params.amount)) {
      throw new ConfigurationError("amount must be a safe integer");
    }
    return requestObject<OrderedDataStoreEntry>(
      this.#http,
      {
        method: "POST",
        path: `${entryPath(params)}:increment`,
        body: { amount: params.amount },
        auth: API_KEY_ONLY,
      },
      options,
    );
  }
}

function entriesPath(params: {
  universeId: RobloxId;
  orderedDataStoreId: string;
  scope?: string;
}): string {
  const universeId = requireId(params.universeId, "universeId");
  const store = requireString(params.orderedDataStoreId, "orderedDataStoreId");
  const scope = requireString(params.scope ?? "global", "scope");
  return path`/cloud/v2/universes/${universeId}/ordered-data-stores/${store}/scopes/${scope}/entries`;
}

function entryPath(params: {
  universeId: RobloxId;
  orderedDataStoreId: string;
  scope?: string;
  entryId: string;
}): string {
  const entryId = requireString(params.entryId, "entryId");
  return `${entriesPath(params)}${path`/${entryId}`}`;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ConfigurationError(`${name} must be a finite number`);
  }
  return value;
}
