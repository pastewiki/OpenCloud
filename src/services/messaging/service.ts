import type { HttpClient } from "../../transport/http-client.js";
import { path } from "../../transport/path.js";
import type { RequestOptions } from "../../transport/types.js";
import type { RobloxId } from "../../types/common.js";
import { requireId, requireString } from "../../utils/guards.js";
import { ConfigurationError } from "../../errors/errors.js";
import { API_KEY_OR_OAUTH, requestVoid } from "../shared.js";

export interface PublishMessageParams {
  universeId: RobloxId;
  /** Topic that live servers subscribe to with `MessagingService:SubscribeAsync`. */
  topic: string;
  /**
   * Message payload. To send structured data, `JSON.stringify` it and decode
   * it in Luau with `HttpService:JSONDecode`.
   */
  message: string;
}

/**
 * Cross-server messaging (MessagingService) via Open Cloud v2.
 *
 * Uses `POST /cloud/v2/universes/{universe_id}:publishMessage`, which Roblox
 * lists as the recommended alternative to the legacy
 * `/messaging-service/v1/.../topics/{topic}` endpoint.
 */
export class MessagingService {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Publishes a message to the experience's live servers.
   *
   * Scope: `universe-messaging-service:publish`. API key or OAuth 2.0.
   * Additional limits: https://create.roblox.com/docs/cloud/guides/usage-messaging#limits
   *
   * Not idempotent: a retry could deliver the message twice, so it is only
   * retried after HTTP 429 (configurable via `retry.retryNonIdempotentOnRateLimit`).
   */
  async publish(params: PublishMessageParams, options?: RequestOptions): Promise<void> {
    const universeId = requireId(params.universeId, "universeId");
    const topic = requireString(params.topic, "topic");
    if (typeof params.message !== "string") {
      throw new ConfigurationError("message must be a string; JSON.stringify structured data");
    }
    return requestVoid(
      this.#http,
      {
        method: "POST",
        path: path`/cloud/v2/universes/${universeId}:publishMessage`,
        body: { topic, message: params.message },
        auth: API_KEY_OR_OAUTH,
      },
      options,
    );
  }
}
