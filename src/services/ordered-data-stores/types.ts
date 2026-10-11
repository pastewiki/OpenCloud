import type { PageSizeParam, RobloxId } from "../../types/common.js";

/** `OrderedDataStoreEntry` resource (Open Cloud v2). */
export interface OrderedDataStoreEntry {
  path: string;
  id: string;
  /** Numeric value used for ordering. */
  value?: number;
}

interface StoreParam {
  universeId: RobloxId;
  /** The ordered data store's name. */
  orderedDataStoreId: string;
  /**
   * Scope name. Defaults to `"global"`, the default scope used by the
   * DataStoreService engine API.
   */
  scope?: string;
}

interface EntryParam extends StoreParam {
  entryId: string;
}

export interface ListOrderedEntriesParams extends StoreParam, PageSizeParam {
  /**
   * Sort order, e.g. `"value"` (ascending) or `"value desc"`.
   * See the API reference for supported fields.
   */
  orderBy?: string;
  /** Range filter using `<=` and `>=` on `entry`, e.g. `"entry >= 10 && entry <= 50"`. */
  filter?: string;
}

export interface CreateOrderedEntryParams extends EntryParam {
  value: number;
}

export interface UpdateOrderedEntryParams extends EntryParam {
  value: number;
  /** Create the entry if it does not exist. */
  allowMissing?: boolean;
}

export type GetOrderedEntryParams = EntryParam;
export type DeleteOrderedEntryParams = EntryParam;

export interface IncrementOrderedEntryParams extends EntryParam {
  /** Integer amount to add. */
  amount: number;
}
