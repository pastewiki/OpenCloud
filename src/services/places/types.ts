import type { RobloxId, Timestamp } from "../../types/common.js";

/** `Place` resource (Open Cloud v2). */
export interface Place {
  /** e.g. `universes/123/places/456` */
  path: string;
  createTime?: Timestamp;
  updateTime?: Timestamp;
  displayName?: string;
  description?: string;
  /** Maximum players per server. */
  serverSize?: number;
  /** Whether this is the universe's root place. */
  root?: boolean;
  universeRuntimeCreation?: boolean;
  templatePlace?: string;
}

/** Writable `Place` fields accepted by `places.update`. */
export type PlaceUpdate = Partial<Pick<Place, "displayName" | "description" | "serverSize">>;

export interface PlaceParams {
  universeId: RobloxId;
  placeId: RobloxId;
}

export interface UpdatePlaceParams extends PlaceParams {
  /** Fields to change. Only the keys present here are sent and updated. */
  update: PlaceUpdate;
  /** Explicit `updateMask`. By default it is derived from the keys of `update`. */
  updateMask?: string;
}

export interface PublishPlaceParams extends PlaceParams {
  /** Place file contents. Maximum 10 MiB (10 485 760 bytes). */
  file: Uint8Array | ArrayBuffer | Blob;
  /** `rbxl` (binary, sent as `application/octet-stream`) or `rbxlx` (XML, `application/xml`). */
  format: "rbxl" | "rbxlx";
  /** `Saved` saves without publishing; `Published` saves and publishes. */
  versionType: "Saved" | "Published";
}

export interface PublishPlaceResult {
  versionNumber: number;
}
