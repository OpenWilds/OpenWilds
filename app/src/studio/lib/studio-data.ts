import { makeFunctionReference } from "convex/server";

import type { StudioSourceTexture } from "../convex/convex-studio";
import type {
  StudioMapRecord,
  StudioObjectSpriteRecord,
  StudioPlantSpriteRecord,
  StudioPendingWorkspaceInvite,
  StudioTerrainAssetRecord,
  StudioTerrainTextureRecord,
  StudioWorkspaceInvite,
  StudioWorkspaceMember,
  StudioWorkspaceSummary,
  ObjectSpriteStatus,
  PlantSpriteStatus,
  StudioRoute,
  StudioRouteId,
  TerrainPromptMetadata,
  TerrainStatus,
  TextureStatus,
  WorkspaceRole,
} from "./studio-types";

type WorkspaceArg = {
  workspaceId: string;
};

export const ROUTES: Record<StudioRouteId, StudioRoute> = {
  dashboard: {
    icon: "OV",
    id: "dashboard",
    kicker: "World Building",
    title: "Overview",
  },
  textures: {
    icon: "TX",
    id: "textures",
    kicker: "Asset Pipeline",
    title: "Texture Studio",
  },
  map: {
    icon: "WS",
    id: "map",
    kicker: "World Building",
    title: "World Studio",
  },
  plants: {
    icon: "PL",
    id: "plants",
    kicker: "Asset Pipeline",
    title: "Plant Studio",
  },
  objects: {
    icon: "OB",
    id: "objects",
    kicker: "Asset Pipeline",
    title: "Object Studio",
  },
  assets: {
    icon: "AS",
    id: "assets",
    kicker: "Library",
    title: "Asset Library",
  },
};

export const DEFAULT_FORM: TerrainPromptMetadata = {
  label: "Moonlit Moss",
  terrainId: "moonlit-moss",
  material: "moonlit moss meadow",
  texturePrompt:
    "soft dark green moss with tiny blue-white flower specks and pale dew highlights",
  stylePrompt:
    "cozy hand-painted 2D game terrain, top-down, readable at small tile size, no logos, no text",
};

export const DEFAULT_STUDIO_HELP =
  "Drag to paint. Right/middle drag or two-finger swipe pans. Pinch zooms.";
export const LAYERED_STUDIO_HELP =
  "Paint replaces terrain inside the active numeric layer. Erase clears that layer at the tile. Different layers stack.";

export const refs = {
  listTerrainTextures: makeFunctionReference<
    "query",
    WorkspaceArg & { status?: TextureStatus },
    StudioTerrainTextureRecord[]
  >("studio:listTerrainTextures"),
  listTerrainAssets: makeFunctionReference<
    "query",
    WorkspaceArg & { status?: TerrainStatus },
    StudioTerrainAssetRecord[]
  >("studio:listTerrainAssets"),
  listMaps: makeFunctionReference<"query", WorkspaceArg, StudioMapRecord[]>(
    "studio:listMaps"
  ),
  listPlantSprites: makeFunctionReference<
    "query",
    WorkspaceArg & { status?: PlantSpriteStatus },
    StudioPlantSpriteRecord[]
  >("studio:listPlantSprites"),
  listObjectSprites: makeFunctionReference<
    "query",
    WorkspaceArg & { status?: ObjectSpriteStatus },
    StudioObjectSpriteRecord[]
  >("studio:listObjectSprites"),
  listMyWorkspaces: makeFunctionReference<
    "query",
    {},
    StudioWorkspaceSummary[]
  >("workspaces:listMyWorkspaces"),
  createWorkspace: makeFunctionReference<
    "mutation",
    { name: string },
    StudioWorkspaceSummary
  >("workspaces:createWorkspace"),
  listMembers: makeFunctionReference<
    "query",
    WorkspaceArg,
    StudioWorkspaceMember[]
  >("workspaces:listMembers"),
  listWorkspaceInvites: makeFunctionReference<
    "query",
    WorkspaceArg,
    StudioWorkspaceInvite[]
  >("workspaces:listWorkspaceInvites"),
  listMyInvites: makeFunctionReference<
    "query",
    {},
    StudioPendingWorkspaceInvite[]
  >("workspaces:listMyInvites"),
  createInvite: makeFunctionReference<
    "mutation",
    WorkspaceArg & { email: string; role: WorkspaceRole },
    StudioWorkspaceInvite
  >("workspaces:createInvite"),
  acceptInvite: makeFunctionReference<
    "mutation",
    { token: string },
    { workspace: StudioWorkspaceSummary | null; role: WorkspaceRole }
  >("workspaces:acceptInvite"),
  declineInvite: makeFunctionReference<"mutation", { token: string }, string>(
    "workspaces:declineInvite"
  ),
  revokeInvite: makeFunctionReference<
    "mutation",
    WorkspaceArg & { inviteId: string },
    string
  >("workspaces:revokeInvite"),
  updateMemberRole: makeFunctionReference<
    "mutation",
    WorkspaceArg & { userId: string; role: WorkspaceRole },
    string
  >("workspaces:updateMemberRole"),
  removeMember: makeFunctionReference<
    "mutation",
    WorkspaceArg & { userId: string },
    string
  >("workspaces:removeMember"),
};

export function textureRecordToSourceTexture(
  record: StudioTerrainTextureRecord
): StudioSourceTexture {
  return {
    textureId: record._id,
    workspaceId: record.workspaceId,
    terrainId: record.terrainId,
    label: record.label,
    material: record.material,
    texturePrompt: record.texturePrompt,
    stylePrompt: record.stylePrompt,
    url: record.url,
    contentType: record.contentType,
    size: record.size,
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

export const getSwatchClass = (terrainId: string) => {
  if (terrainId.startsWith("uniswap-")) {
    return `studio-swatch--${terrainId.replace("uniswap-", "")}`;
  }

  return "studio-swatch--generated";
};
