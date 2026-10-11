import { ConfigurationError, ResponseValidationError } from "../../errors/errors.js";
import type { HttpClient } from "../../transport/http-client.js";
import { path } from "../../transport/path.js";
import type { RequestOptions } from "../../transport/types.js";
import { isRecord, requireId } from "../../utils/guards.js";
import { API_KEY_ONLY, API_KEY_OR_OAUTH, fieldMaskFrom, requestObject } from "../shared.js";
import type {
  Place,
  PlaceParams,
  PublishPlaceParams,
  PublishPlaceResult,
  UpdatePlaceParams,
} from "./types.js";

/** `x-roblox-size-limit` of the place publishing operation. */
export const PLACE_FILE_SIZE_LIMIT = 10_485_760;

const CONTENT_TYPES = { rbxl: "application/octet-stream", rbxlx: "application/xml" } as const;
const VERSION_TYPES = ["Saved", "Published"] as const;

/**
 * Place management. `get`/`update` use Open Cloud v2 (API key or OAuth 2.0);
 * `publishVersion` uses the v1 place publishing endpoint (API key only).
 */
export class PlacesService {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Gets a place. Limit: 100 requests/minute. */
  async get(params: PlaceParams, options?: RequestOptions): Promise<Place> {
    return requestObject<Place>(
      this.#http,
      { method: "GET", path: placePath(params), auth: API_KEY_OR_OAUTH },
      options,
    );
  }

  /**
   * Updates the given fields. Scope: `universe.place:write`.
   * Throws `ConflictError` (HTTP 409) if the place is open in an active Team Create session.
   */
  async update(params: UpdatePlaceParams, options?: RequestOptions): Promise<Place> {
    const updateMask = params.updateMask ?? fieldMaskFrom(params.update);
    if (updateMask === "") throw new ConfigurationError("update must contain at least one field");
    return requestObject<Place>(
      this.#http,
      {
        method: "PATCH",
        path: placePath(params),
        query: { updateMask },
        body: params.update,
        idempotent: true,
        auth: API_KEY_OR_OAUTH,
      },
      options,
    );
  }

  /**
   * Uploads a place file as a new version (`POST /universes/v1/{universeId}/places/{placeId}/versions`).
   *
   * Scope: `universe-places:write`. API key only. Limit: 30 requests/minute.
   * **Beta** endpoint. Not idempotent: retried only after HTTP 429.
   */
  async publishVersion(
    params: PublishPlaceParams,
    options?: RequestOptions,
  ): Promise<PublishPlaceResult> {
    const universeId = requireId(params.universeId, "universeId");
    const placeId = requireId(params.placeId, "placeId");
    const contentType = CONTENT_TYPES[params.format] as string | undefined;
    if (contentType === undefined) throw new ConfigurationError('format must be "rbxl" or "rbxlx"');
    // Runtime check for JavaScript callers; TypeScript already narrows the type.
    if (!(VERSION_TYPES as readonly string[]).includes(params.versionType)) {
      throw new ConfigurationError('versionType must be "Saved" or "Published"');
    }
    const size = byteLength(params.file);
    if (size === 0) throw new ConfigurationError("file is empty");
    if (size > PLACE_FILE_SIZE_LIMIT) {
      throw new ConfigurationError(
        `file is ${size} bytes; the documented limit is ${PLACE_FILE_SIZE_LIMIT} bytes`,
      );
    }

    const res = await this.#http.request<string>(
      {
        method: "POST",
        path: path`/universes/v1/${universeId}/places/${placeId}/versions`,
        query: { versionType: params.versionType },
        body: { kind: "raw", data: params.file, contentType },
        auth: API_KEY_ONLY,
        // The reference documents a text/plain response containing JSON.
        responseType: "text",
      },
      options,
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.data);
    } catch {
      throw new ResponseValidationError("Place publish response was not JSON", res.data);
    }
    if (!isRecord(parsed) || typeof parsed.versionNumber !== "number") {
      throw new ResponseValidationError("Place publish response is missing versionNumber", parsed);
    }
    return { versionNumber: parsed.versionNumber };
  }
}

function placePath(params: PlaceParams): string {
  const universeId = requireId(params.universeId, "universeId");
  const placeId = requireId(params.placeId, "placeId");
  return path`/cloud/v2/universes/${universeId}/places/${placeId}`;
}

function byteLength(file: Uint8Array | ArrayBuffer | Blob): number {
  if (file instanceof Uint8Array || file instanceof ArrayBuffer) return file.byteLength;
  if (typeof Blob !== "undefined" && file instanceof Blob) return file.size;
  throw new ConfigurationError("file must be a Uint8Array, ArrayBuffer, or Blob");
}
