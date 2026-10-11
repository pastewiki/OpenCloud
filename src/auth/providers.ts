import { ConfigurationError } from "../errors/errors.js";

/**
 * Which credential type an auth provider supplies. The OpenAPI description
 * lists, per operation, whether `roblox-api-key` and/or `roblox-oauth2` are
 * accepted; services pass that list so mismatches fail before any request.
 */
export type AuthKind = "apiKey" | "oauth2";

export interface AuthProvider {
  readonly kind: AuthKind;
  /** Adds credential headers to an outgoing request. */
  apply(headers: Headers, signal?: AbortSignal): Promise<void>;
  /** Secret strings to scrub from any diagnostic text. */
  secrets(): readonly string[];
}

/**
 * API-key authentication. Sends the key in the `x-api-key` header, the only
 * mechanism documented for Open Cloud API keys
 * (https://create.roblox.com/docs/cloud/auth/api-keys).
 */
export class ApiKeyAuth implements AuthProvider {
  readonly kind = "apiKey" as const;
  readonly #apiKey: string;

  constructor(apiKey: string) {
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new ConfigurationError("apiKey must be a non-empty string");
    }
    if (apiKey !== apiKey.trim() || /[\r\n]/.test(apiKey)) {
      throw new ConfigurationError(
        "apiKey contains leading/trailing whitespace or line breaks; check how it was loaded",
      );
    }
    this.#apiKey = apiKey;
  }

  async apply(headers: Headers): Promise<void> {
    headers.set("x-api-key", this.#apiKey);
  }

  secrets(): readonly string[] {
    return [this.#apiKey];
  }

  /** Prevents the key from appearing in `console.log`/`util.inspect` output. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "ApiKeyAuth { apiKey: [REDACTED] }";
  }

  toJSON(): Record<string, string> {
    return { kind: this.kind, apiKey: "[REDACTED]" };
  }
}

/** Returns a current OAuth 2.0 access token. Called before every request. */
export type AccessTokenSupplier = (signal?: AbortSignal) => string | Promise<string>;

/**
 * OAuth 2.0 bearer-token authentication (`Authorization: Bearer <token>`).
 *
 * This provider does not perform the OAuth authorization-code flow or token
 * refresh; supply a function that returns a valid access token from your own
 * OAuth implementation (see https://create.roblox.com/docs/cloud/auth/oauth2-overview).
 *
 * OAuth tokens and API keys are not interchangeable: several endpoints (for
 * example all data store endpoints) accept API keys only. The SDK rejects such
 * calls up front with a {@link ConfigurationError}.
 */
export class OAuth2BearerAuth implements AuthProvider {
  readonly kind = "oauth2" as const;
  readonly #getToken: AccessTokenSupplier;
  #lastToken: string | undefined;

  constructor(getToken: AccessTokenSupplier | string) {
    if (typeof getToken === "string") {
      const token = getToken;
      if (token.trim() === "") throw new ConfigurationError("accessToken must be non-empty");
      this.#getToken = () => token;
    } else if (typeof getToken === "function") {
      this.#getToken = getToken;
    } else {
      throw new ConfigurationError("accessToken must be a string or a function returning one");
    }
  }

  async apply(headers: Headers, signal?: AbortSignal): Promise<void> {
    const token = await this.#getToken(signal);
    if (typeof token !== "string" || token.trim() === "") {
      throw new ConfigurationError("The OAuth 2.0 access token supplier returned an empty token");
    }
    this.#lastToken = token;
    headers.set("authorization", `Bearer ${token}`);
  }

  secrets(): readonly string[] {
    return this.#lastToken === undefined ? [] : [this.#lastToken];
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "OAuth2BearerAuth { accessToken: [REDACTED] }";
  }

  toJSON(): Record<string, string> {
    return { kind: this.kind, accessToken: "[REDACTED]" };
  }
}
