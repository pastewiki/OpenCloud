import { resolveConfig, type RobloxOpenCloudConfig } from "./config.js";
import { AssetsService } from "./services/assets/service.js";
import { DataStoresService } from "./services/data-stores/service.js";
import { GroupsService } from "./services/groups/service.js";
import { MessagingService } from "./services/messaging/service.js";
import { OrderedDataStoresService } from "./services/ordered-data-stores/service.js";
import { PlacesService } from "./services/places/service.js";
import { UniversesService } from "./services/universes/service.js";
import { UsersService } from "./services/users/service.js";
import { HttpClient } from "./transport/http-client.js";

/**
 * Entry point for the Roblox Open Cloud SDK.
 *
 * ```ts
 * const roblox = new RobloxOpenCloud({ apiKey: process.env.ROBLOX_OPEN_CLOUD_API_KEY! });
 * const entry = await roblox.dataStores.getEntry({
 *   universeId: "123456",
 *   dataStoreId: "PlayerProfiles",
 *   entryId: "player_456",
 * });
 * ```
 *
 * For trusted server-side environments only. Never expose credentials to
 * browsers, Roblox client scripts, or public repositories.
 */
export class RobloxOpenCloud {
  /** Standard data stores (Open Cloud v2). API keys only. */
  readonly dataStores: DataStoresService;
  /** Ordered data stores (Open Cloud v2). API keys only. */
  readonly orderedDataStores: OrderedDataStoresService;
  /** Cross-server messaging (MessagingService). */
  readonly messaging: MessagingService;
  /** Universe (experience) settings and server restarts. */
  readonly universes: UniversesService;
  /** Place settings and place file publishing. */
  readonly places: PlacesService;
  /** User profiles and inventories. */
  readonly users: UsersService;
  /** Groups, memberships, and roles (read-only). */
  readonly groups: GroupsService;
  /** Asset metadata and operations (read-only). */
  readonly assets: AssetsService;

  /** The shared transport, for advanced use and custom service extensions. */
  readonly http: HttpClient;

  constructor(config: RobloxOpenCloudConfig = {}) {
    this.http = new HttpClient(resolveConfig(config));
    this.dataStores = new DataStoresService(this.http);
    this.orderedDataStores = new OrderedDataStoresService(this.http);
    this.messaging = new MessagingService(this.http);
    this.universes = new UniversesService(this.http);
    this.places = new PlacesService(this.http);
    this.users = new UsersService(this.http);
    this.groups = new GroupsService(this.http);
    this.assets = new AssetsService(this.http);
  }

  /** Creates a client using `ROBLOX_OPEN_CLOUD_API_KEY` plus any other options. */
  static fromEnv(
    config: Omit<RobloxOpenCloudConfig, "apiKey" | "accessToken" | "auth"> = {},
  ): RobloxOpenCloud {
    return new RobloxOpenCloud(config);
  }

  /** Keeps credentials out of `console.log` output. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `RobloxOpenCloud { auth: ${this.http.authKind} [REDACTED] }`;
  }

  toJSON(): Record<string, string> {
    return { auth: this.http.authKind };
  }
}
