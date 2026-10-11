import type { RobloxId, Timestamp } from "../../types/common.js";

export interface SocialLink {
  title?: string;
  uri?: string;
}

export type UniverseVisibility = "VISIBILITY_UNSPECIFIED" | "PUBLIC" | "PRIVATE";

export type UniverseAgeRating =
  | "AGE_RATING_UNSPECIFIED"
  | "AGE_RATING_ALL"
  | "AGE_RATING_9_PLUS"
  | "AGE_RATING_13_PLUS"
  | "AGE_RATING_17_PLUS";

/** `Universe` resource (Open Cloud v2). Fields may be absent in responses. */
export interface Universe {
  /** e.g. `universes/123` */
  path: string;
  createTime?: Timestamp;
  updateTime?: Timestamp;
  displayName?: string;
  description?: string;
  /** Owning user path (`users/{id}`) when user-owned. */
  user?: string;
  /** Owning group path (`groups/{id}`) when group-owned. */
  group?: string;
  visibility?: UniverseVisibility;
  facebookSocialLink?: SocialLink;
  twitterSocialLink?: SocialLink;
  youtubeSocialLink?: SocialLink;
  twitchSocialLink?: SocialLink;
  discordSocialLink?: SocialLink;
  robloxGroupSocialLink?: SocialLink;
  guildedSocialLink?: SocialLink;
  voiceChatEnabled?: boolean;
  ageRating?: UniverseAgeRating;
  privateServerPriceRobux?: number;
  desktopEnabled?: boolean;
  mobileEnabled?: boolean;
  tabletEnabled?: boolean;
  consoleEnabled?: boolean;
  vrEnabled?: boolean;
  /** Root place path (`universes/{id}/places/{id}`). */
  rootPlace?: string;
  templateRootPlace?: string;
}

/**
 * Writable `Universe` fields accepted by `universes.update`. Fields marked
 * read-only in the API reference are excluded.
 */
export type UniverseUpdate = Partial<
  Pick<
    Universe,
    | "facebookSocialLink"
    | "twitterSocialLink"
    | "youtubeSocialLink"
    | "twitchSocialLink"
    | "discordSocialLink"
    | "robloxGroupSocialLink"
    | "guildedSocialLink"
    | "voiceChatEnabled"
    | "privateServerPriceRobux"
    | "desktopEnabled"
    | "mobileEnabled"
    | "tabletEnabled"
    | "consoleEnabled"
    | "vrEnabled"
  >
>;

export interface UpdateUniverseParams {
  universeId: RobloxId;
  /** Fields to change. Only the keys present here are sent and updated. */
  update: UniverseUpdate;
  /**
   * Explicit `updateMask`. By default it is derived from the keys of `update`.
   */
  updateMask?: string;
}

export interface RestartServersParams {
  universeId: RobloxId;
  /** Places to restart. If omitted, all active places in the universe. */
  placeIds?: readonly RobloxId[];
  /**
   * If true, restart servers running old and new versions. If false (default),
   * restart only if a new version has been published.
   */
  closeAllVersions?: boolean;
  /** Stop matchmaking but keep servers up for `bleedOffDurationMinutes`. */
  bleedOffServers?: boolean;
  /** 1–60 minutes; used when `bleedOffServers` is true. */
  bleedOffDurationMinutes?: number;
}
