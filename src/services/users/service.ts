import type { ListOptions, Paginator } from "../../pagination/paginator.js";
import type { HttpClient } from "../../transport/http-client.js";
import { path } from "../../transport/path.js";
import type { RequestOptions } from "../../transport/types.js";
import type { RobloxId } from "../../types/common.js";
import { requireId } from "../../utils/guards.js";
import { API_KEY_OR_OAUTH, paginateV2, requestObject } from "../shared.js";
import type { InventoryItem, ListInventoryItemsParams, User } from "./types.js";

/** User endpoints via Open Cloud v2. API key or OAuth 2.0. */
export class UsersService {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Gets a user's basic information. Optional scopes `user.advanced:read` and
   * `user.social:read` add identity-verification and social-profile fields.
   * Limit: 1000 requests/minute per API key owner.
   */
  async get(params: { userId: RobloxId }, options?: RequestOptions): Promise<User> {
    const userId = requireId(params.userId, "userId");
    return requestObject<User>(
      this.#http,
      { method: "GET", path: path`/cloud/v2/users/${userId}`, auth: API_KEY_OR_OAUTH },
      options,
    );
  }

  /**
   * Lists items in a user's inventory. Results depend on the user's inventory
   * privacy setting; `user.inventory-item:read` is needed for private
   * inventories. **Beta** endpoint. Limit: 100 requests/minute per API key owner.
   */
  listInventoryItems(
    params: ListInventoryItemsParams,
    options?: ListOptions,
  ): Paginator<InventoryItem> {
    const userId = requireId(params.userId, "userId");
    return paginateV2<InventoryItem>(
      this.#http,
      {
        method: "GET",
        path: path`/cloud/v2/users/${userId}/inventory-items`,
        query: { filter: params.filter },
        auth: API_KEY_OR_OAUTH,
      },
      "inventoryItems",
      params.pageSize,
      options,
    );
  }
}
