import type { ListOptions, Paginator } from "../../pagination/paginator.js";
import type { HttpClient } from "../../transport/http-client.js";
import { path } from "../../transport/path.js";
import type { RequestOptions } from "../../transport/types.js";
import type { RobloxId } from "../../types/common.js";
import { requireId } from "../../utils/guards.js";
import { API_KEY_OR_OAUTH, paginateV2, requestObject } from "../shared.js";
import type {
  Group,
  GroupMembership,
  GroupRole,
  ListGroupMembershipsParams,
  ListGroupRolesParams,
} from "./types.js";

/**
 * Read-only group endpoints via Open Cloud v2 (all **Beta**). API key or OAuth 2.0.
 * Limits per API key owner: 150/minute for `get`, 300/minute for list/role calls.
 */
export class GroupsService {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Gets a group. */
  async get(params: { groupId: RobloxId }, options?: RequestOptions): Promise<Group> {
    const groupId = requireId(params.groupId, "groupId");
    return requestObject<Group>(
      this.#http,
      { method: "GET", path: path`/cloud/v2/groups/${groupId}`, auth: API_KEY_OR_OAUTH },
      options,
    );
  }

  /** Lists group members. Page size: default 10, maximum 100. */
  listMemberships(
    params: ListGroupMembershipsParams,
    options?: ListOptions,
  ): Paginator<GroupMembership> {
    const groupId = params.groupId === "-" ? "-" : requireId(params.groupId, "groupId");
    return paginateV2<GroupMembership>(
      this.#http,
      {
        method: "GET",
        path: path`/cloud/v2/groups/${groupId}/memberships`,
        query: { filter: params.filter },
        auth: API_KEY_OR_OAUTH,
      },
      "groupMemberships",
      params.pageSize,
      options,
    );
  }

  /**
   * Lists roles. Permissions of non-guest roles require the `group:read` scope.
   * Page size: default 10, maximum 20.
   */
  listRoles(params: ListGroupRolesParams, options?: ListOptions): Paginator<GroupRole> {
    const groupId = requireId(params.groupId, "groupId");
    return paginateV2<GroupRole>(
      this.#http,
      { method: "GET", path: path`/cloud/v2/groups/${groupId}/roles`, auth: API_KEY_OR_OAUTH },
      "groupRoles",
      params.pageSize,
      options,
    );
  }

  /** Gets a role. Permissions of non-guest roles require the `group:read` scope. */
  async getRole(
    params: { groupId: RobloxId; roleId: RobloxId },
    options?: RequestOptions,
  ): Promise<GroupRole> {
    const groupId = requireId(params.groupId, "groupId");
    const roleId = requireId(params.roleId, "roleId");
    return requestObject<GroupRole>(
      this.#http,
      {
        method: "GET",
        path: path`/cloud/v2/groups/${groupId}/roles/${roleId}`,
        auth: API_KEY_OR_OAUTH,
      },
      options,
    );
  }
}
