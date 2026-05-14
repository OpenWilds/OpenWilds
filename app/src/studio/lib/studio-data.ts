import { makeFunctionReference } from "convex/server";

import type { StudioSourceTexture } from "../convex/convex-studio";
import type {
  StudioMapRecord,
  StudioObjectSpriteRecord,
  StudioPlantSpriteRecord,
  StudioTerrainAssetRecord,
  StudioTerrainTextureRecord,
  ObjectSpriteStatus,
  PlantSpriteStatus,
  StudioRoute,
  StudioRouteId,
  TerrainPromptMetadata,
  TerrainStatus,
  TextureStatus,
} from "./studio-types";

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
    { status?: TextureStatus },
    StudioTerrainTextureRecord[]
  >("studio:listTerrainTextures"),
  listTerrainAssets: makeFunctionReference<
    "query",
    { status?: TerrainStatus },
    StudioTerrainAssetRecord[]
  >("studio:listTerrainAssets"),
  listMaps: makeFunctionReference<"query", {}, StudioMapRecord[]>(
    "studio:listMaps"
  ),
  listPlantSprites: makeFunctionReference<
    "query",
    { status?: PlantSpriteStatus },
    StudioPlantSpriteRecord[]
  >("studio:listPlantSprites"),
  listObjectSprites: makeFunctionReference<
    "query",
    { status?: ObjectSpriteStatus },
    StudioObjectSpriteRecord[]
  >("studio:listObjectSprites"),
};

export function textureRecordToSourceTexture(
  record: StudioTerrainTextureRecord
): StudioSourceTexture {
  return {
    textureId: record._id,
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
