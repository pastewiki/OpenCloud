import type { HttpClient } from "../../transport/http-client.js";
import { path } from "../../transport/path.js";
import type { RequestOptions } from "../../transport/types.js";
import type { RobloxId } from "../../types/common.js";
import { requireId, requireString } from "../../utils/guards.js";
import { API_KEY_OR_OAUTH, requestObject } from "../shared.js";
import type { Asset, AssetOperation, AssetVersion, GetAssetParams } from "./types.js";

/**
 * Read-only Assets API v1 operations (all **Beta**). API key or OAuth 2.0;
 * scope `asset:read`.
 *
 * Asset creation and updates (multipart uploads) are not implemented yet; see
 * the README roadmap.
 */
export class AssetsService {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Gets asset metadata. Limit: 120 requests/minute. */
  async get(params: GetAssetParams, options?: RequestOptions): Promise<Asset> {
    const assetId = requireId(params.assetId, "assetId");
    const readMask = params.readMask?.map((f) => requireString(f, "readMask[]")).join(",");
    return requestObject<Asset>(
      this.#http,
      {
        method: "GET",
        path: path`/assets/v1/assets/${assetId}`,
        query: { readMask: readMask === "" ? undefined : readMask },
        auth: API_KEY_OR_OAUTH,
      },
      options,
    );
  }

  /** Gets one version of an asset. Limit: 100 requests/minute. */
  async getVersion(
    params: { assetId: RobloxId; versionNumber: number | string },
    options?: RequestOptions,
  ): Promise<AssetVersion> {
    const assetId = requireId(params.assetId, "assetId");
    const version = requireId(params.versionNumber, "versionNumber");
    return requestObject<AssetVersion>(
      this.#http,
      {
        method: "GET",
        path: path`/assets/v1/assets/${assetId}/versions/${version}`,
        auth: API_KEY_OR_OAUTH,
      },
      options,
    );
  }

  /**
   * Gets the status of an asset create/update operation. Poll with backoff
   * until `done` is true. Limit: 300 requests/minute.
   */
  async getOperation(
    params: { operationId: string },
    options?: RequestOptions,
  ): Promise<AssetOperation> {
    const operationId = requireString(params.operationId, "operationId");
    return requestObject<AssetOperation>(
      this.#http,
      {
        method: "GET",
        path: path`/assets/v1/operations/${operationId}`,
        auth: API_KEY_OR_OAUTH,
      },
      options,
    );
  }
}
