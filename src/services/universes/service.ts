import { ConfigurationError } from "../../errors/errors.js";
import type { HttpClient } from "../../transport/http-client.js";
import { path } from "../../transport/path.js";
import type { RequestOptions } from "../../transport/types.js";
import type { RobloxId } from "../../types/common.js";
import { requireId } from "../../utils/guards.js";
import { API_KEY_OR_OAUTH, fieldMaskFrom, requestObject, requestVoid } from "../shared.js";
import type { RestartServersParams, Universe, UpdateUniverseParams } from "./types.js";

/**
 * Universe (experience) management via Open Cloud v2. API key or OAuth 2.0.
 * Limits: 100 requests/minute for get/update, 30/minute for restartServers.
 */
export class UniversesService {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Gets a universe. No specific scope is listed for this operation. */
  async get(params: { universeId: RobloxId }, options?: RequestOptions): Promise<Universe> {
    const universeId = requireId(params.universeId, "universeId");
    return requestObject<Universe>(
      this.#http,
      { method: "GET", path: path`/cloud/v2/universes/${universeId}`, auth: API_KEY_OR_OAUTH },
      options,
    );
  }

  /**
   * Updates the given fields. Scope: `universe:write`.
   * Roblox guarantees the response includes all updated fields; it may include more.
   */
  async update(params: UpdateUniverseParams, options?: RequestOptions): Promise<Partial<Universe>> {
    const universeId = requireId(params.universeId, "universeId");
    const updateMask = params.updateMask ?? fieldMaskFrom(params.update);
    if (updateMask === "") throw new ConfigurationError("update must contain at least one field");
    return requestObject<Partial<Universe>>(
      this.#http,
      {
        method: "PATCH",
        path: path`/cloud/v2/universes/${universeId}`,
        query: { updateMask },
        body: params.update,
        idempotent: true,
        auth: API_KEY_OR_OAUTH,
      },
      options,
    );
  }

  /**
   * Restarts active servers, e.g. to roll out a new place version.
   * Scope: `universe:write`. Not idempotent (each call triggers restarts).
   */
  async restartServers(params: RestartServersParams, options?: RequestOptions): Promise<void> {
    const universeId = requireId(params.universeId, "universeId");
    const body: Record<string, unknown> = {};
    if (params.placeIds !== undefined) {
      body.placeIds = params.placeIds.map((id) => toJsonInt64(id, "placeIds[]"));
    }
    if (params.closeAllVersions !== undefined) body.closeAllVersions = params.closeAllVersions;
    if (params.bleedOffServers !== undefined) body.bleedOffServers = params.bleedOffServers;
    if (params.bleedOffDurationMinutes !== undefined) {
      const minutes = params.bleedOffDurationMinutes;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
        throw new ConfigurationError("bleedOffDurationMinutes must be an integer from 1 to 60");
      }
      body.bleedOffDurationMinutes = minutes;
    }
    return requestVoid(
      this.#http,
      {
        method: "POST",
        path: path`/cloud/v2/universes/${universeId}:restartServers`,
        body,
        auth: API_KEY_OR_OAUTH,
      },
      options,
    );
  }
}

/** int64 fields sent as JSON numbers must fit in a double without loss. */
function toJsonInt64(id: RobloxId, name: string): number {
  const n = Number(requireId(id, name));
  if (!Number.isSafeInteger(n)) {
    throw new ConfigurationError(
      `${name} exceeds Number.MAX_SAFE_INTEGER and cannot be sent as JSON`,
    );
  }
  return n;
}
