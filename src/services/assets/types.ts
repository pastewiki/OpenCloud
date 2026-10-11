import type { RobloxId, Timestamp } from "../../types/common.js";

export type AssetPrivacy = "default" | "restricted" | "openUse";

export interface AssetCreator {
  /** int64; JSON may carry it as a number or string. */
  userId?: number | string;
  groupId?: number | string;
}

export interface CreationContext {
  assetPrivacy?: AssetPrivacy;
  creator?: AssetCreator;
  expectedPrice?: number | string;
}

export interface ModerationResult {
  /** e.g. `Reviewing`, `Approved`, `Rejected` (not enumerated in the reference). */
  moderationState?: string;
}

/** `Asset` resource (Assets API v1). */
export interface Asset {
  /** e.g. `Decal`, `Audio`, `Model`. The reference does not enumerate values. */
  assetType?: string;
  /** int64; JSON may carry it as a number or string. */
  assetId?: number | string;
  creationContext?: CreationContext;
  description?: string;
  displayName?: string;
  /** e.g. `assets/123` */
  path?: string;
  revisionId?: string;
  revisionCreateTime?: Timestamp;
  moderationResult?: ModerationResult;
  icon?: string;
  previews?: { asset?: string; altText?: string }[];
  state?: "Unspecified" | "Active" | "Archived";
  socialLink?: { title?: string; uri?: string };
}

/** `AssetVersion` resource (Assets API v1). */
export interface AssetVersion {
  /** e.g. `assets/123/versions/4` */
  path?: string;
  creationContext?: CreationContext;
  moderationResult?: ModerationResult;
  published?: boolean;
}

/** Long-running operation returned by asset create/update. */
export interface AssetOperation {
  /** e.g. `operations/{operationId}` */
  path?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  /** Populated once `done` is true and the operation succeeded. */
  response?: Asset;
}

export interface GetAssetParams {
  assetId: RobloxId;
  /**
   * Extra metadata fields to include (`readMask`), e.g.
   * `["description", "displayName", "previews"]`.
   */
  readMask?: readonly string[];
}
