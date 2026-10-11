import type { PageSizeParam, RobloxId, Timestamp } from "../../types/common.js";

/** `Group` resource (Open Cloud v2). */
export interface Group {
  /** e.g. `groups/123` */
  path: string;
  createTime?: Timestamp;
  updateTime?: Timestamp;
  id?: string;
  displayName?: string;
  description?: string;
  /** Owner user path (`users/{id}`). */
  owner?: string;
  memberCount?: number;
  publicEntryAllowed?: boolean;
  locked?: boolean;
  verified?: boolean;
}

/** `GroupMembership` resource (Open Cloud v2). */
export interface GroupMembership {
  /** e.g. `groups/123/memberships/456` */
  path: string;
  createTime?: Timestamp;
  updateTime?: Timestamp;
  /** Member user path (`users/{id}`). */
  user?: string;
  /** Highest-ranked role path. Prefer `roles` for the full set. */
  role?: string;
  /** All assigned role paths. */
  roles?: string[];
}

/** Role permissions, visible depending on the caller's access and scopes. */
export interface GroupRolePermissions {
  viewWallPosts?: boolean;
  createWallPosts?: boolean;
  deleteWallPosts?: boolean;
  viewGroupShout?: boolean;
  createGroupShout?: boolean;
  changeRank?: boolean;
  acceptRequests?: boolean;
  exileMembers?: boolean;
  manageRelationships?: boolean;
  viewAuditLog?: boolean;
  spendGroupFunds?: boolean;
  advertiseGroup?: boolean;
  createAvatarItems?: boolean;
  manageAvatarItems?: boolean;
  manageGroupUniverses?: boolean;
  viewUniverseAnalytics?: boolean;
  createApiKeys?: boolean;
  manageApiKeys?: boolean;
  banMembers?: boolean;
  viewForums?: boolean;
  manageCategories?: boolean;
  createPosts?: boolean;
  lockPosts?: boolean;
  pinPosts?: boolean;
  removePosts?: boolean;
  createComments?: boolean;
  removeComments?: boolean;
  manageBlockedWords?: boolean;
  viewBlockedWords?: boolean;
  bypassSlowMode?: boolean;
}

/** `GroupRole` resource (Open Cloud v2). */
export interface GroupRole {
  /** e.g. `groups/123/roles/456` */
  path: string;
  createTime?: Timestamp;
  updateTime?: Timestamp;
  id?: string;
  displayName?: string;
  description?: string;
  rank?: number;
  memberCount?: number;
  permissions?: GroupRolePermissions;
}

export interface ListGroupMembershipsParams extends PageSizeParam {
  /** Group ID, or the wildcard `"-"` to query across groups (requires a `user in [...]` filter). */
  groupId: RobloxId;
  /**
   * CEL filter, e.g. `user == 'users/156'` or `role == 'groups/123/roles/456'`.
   * See https://create.roblox.com/docs/cloud/reference/patterns#list-group-memberships
   */
  filter?: string;
}

export interface ListGroupRolesParams extends PageSizeParam {
  groupId: RobloxId;
}
