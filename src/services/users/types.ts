import type { PageSizeParam, RobloxId, Timestamp } from "../../types/common.js";

export type SocialNetworkVisibility =
  | "SOCIAL_NETWORK_VISIBILITY_UNSPECIFIED"
  | "NO_ONE"
  | "FRIENDS"
  | "FRIENDS_AND_FOLLOWING"
  | "FRIENDS_FOLLOWING_AND_FOLLOWERS"
  | "EVERYONE";

export interface SocialNetworkProfiles {
  facebook?: string | null;
  twitter?: string | null;
  youtube?: string | null;
  twitch?: string | null;
  guilded?: string | null;
  visibility?: SocialNetworkVisibility;
}

/** `User` resource (Open Cloud v2). Many fields are nullable per the reference. */
export interface User {
  path?: string | null;
  createTime?: Timestamp | null;
  id?: string | null;
  name?: string | null;
  displayName?: string | null;
  about?: string | null;
  locale?: string | null;
  premium?: boolean;
  /** Only returned with the `user.advanced:read` scope. */
  idVerified?: boolean | null;
  /** Only returned with the `user.social:read` scope. */
  socialNetworkProfiles?: SocialNetworkProfiles;
}

export interface InventoryItem {
  path?: string;
  assetDetails?: {
    assetId?: string;
    /** e.g. `HAT`, `MODEL`, `CLASSIC_SHIRT`. See the API reference for the full enum. */
    inventoryItemAssetType?: string;
    instanceId?: string;
    collectibleDetails?: {
      itemId?: string;
      instanceId?: string;
      instanceState?: "COLLECTIBLE_ITEM_INSTANCE_STATE_UNSPECIFIED" | "AVAILABLE" | "HOLD";
      /** int64 in the reference; JSON encoders may emit it as a string or a number. */
      serialNumber?: number | string;
    };
  };
  badgeDetails?: { badgeId?: string };
  gamePassDetails?: { gamePassId?: string };
  privateServerDetails?: { privateServerId?: string };
  addTime?: Timestamp | null;
}

export interface ListInventoryItemsParams extends PageSizeParam {
  userId: RobloxId;
  /**
   * Semicolon-separated filter, e.g. `"badges=true;gamePasses=true"` or
   * `"assetIds=123,456"`. See https://create.roblox.com/docs/cloud/reference/patterns#list-inventory-items
   */
  filter?: string;
}
