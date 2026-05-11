import uniswapDirtAtlasUrl from "./autotiles/uniswap-dirt/autotile-blob-7x7.png?url";
import uniswapDirtCenterUrl from "./autotiles/uniswap-dirt/center-variants-4x4.png?url";
import uniswapForestFloorAtlasUrl from "./autotiles/uniswap-forest-floor/autotile-blob-7x7.png?url";
import uniswapForestFloorCenterUrl from "./autotiles/uniswap-forest-floor/center-variants-4x4.png?url";
import uniswapGrassAtlasUrl from "./autotiles/uniswap-grass/autotile-blob-7x7.png?url";
import uniswapGrassCenterUrl from "./autotiles/uniswap-grass/center-variants-4x4.png?url";
import uniswapPlainAtlasUrl from "./autotiles/uniswap-plain/autotile-blob-7x7.png?url";
import uniswapPlainCenterUrl from "./autotiles/uniswap-plain/center-variants-4x4.png?url";
import uniswapStoneAtlasUrl from "./autotiles/uniswap-stone/autotile-blob-7x7.png?url";
import uniswapStoneCenterUrl from "./autotiles/uniswap-stone/center-variants-4x4.png?url";
import uniswapWaterAtlasUrl from "./autotiles/uniswap-water/autotile-blob-7x7.png?url";
import uniswapWaterCenterUrl from "./autotiles/uniswap-water/center-variants-4x4.png?url";
import applewoodSpriteUrl from "./object-sprites/applewood/applewood-sprite-sheet.png?url";
import cityCloveSpriteUrl from "./object-sprites/city-clover/city-clover-sprite-sheet.png?url";
import routeberrySpriteUrl from "./object-sprites/routeberry/routeberry-sprite-sheet.png?url";
import stonepineSpriteUrl from "./object-sprites/stonepine/stonepine-sprite-sheet.png?url";
import sungrainSpriteUrl from "./object-sprites/sungrain/sungrain-sprite-sheet.png?url";
import playerSpriteUrl from "./object-sprites/player/player-sprite-sheet.png?url";

export type BuiltInTerrainVisualAssetId =
  | "uniswap-dirt"
  | "uniswap-forest-floor"
  | "uniswap-grass"
  | "uniswap-plain"
  | "uniswap-stone"
  | "uniswap-water";

export type TerrainVisualAssetId = BuiltInTerrainVisualAssetId | string;

export type TerrainVisualAsset = {
  id: TerrainVisualAssetId;
  atlasUrl: string;
  centerVariantsUrl: string;
  label?: string;
  generated?: boolean;
};

export const TERRAIN_VISUAL_ASSETS: Record<
  BuiltInTerrainVisualAssetId,
  TerrainVisualAsset
> = {
  "uniswap-dirt": {
    id: "uniswap-dirt",
    atlasUrl: uniswapDirtAtlasUrl,
    centerVariantsUrl: uniswapDirtCenterUrl,
  },
  "uniswap-forest-floor": {
    id: "uniswap-forest-floor",
    atlasUrl: uniswapForestFloorAtlasUrl,
    centerVariantsUrl: uniswapForestFloorCenterUrl,
  },
  "uniswap-grass": {
    id: "uniswap-grass",
    atlasUrl: uniswapGrassAtlasUrl,
    centerVariantsUrl: uniswapGrassCenterUrl,
  },
  "uniswap-plain": {
    id: "uniswap-plain",
    atlasUrl: uniswapPlainAtlasUrl,
    centerVariantsUrl: uniswapPlainCenterUrl,
  },
  "uniswap-stone": {
    id: "uniswap-stone",
    atlasUrl: uniswapStoneAtlasUrl,
    centerVariantsUrl: uniswapStoneCenterUrl,
  },
  "uniswap-water": {
    id: "uniswap-water",
    atlasUrl: uniswapWaterAtlasUrl,
    centerVariantsUrl: uniswapWaterCenterUrl,
  },
};

export const terrainAtlasKey = (assetId: TerrainVisualAssetId) =>
  `terrain-atlas-${assetId}`;

export const terrainCenterVariantsKey = (assetId: TerrainVisualAssetId) =>
  `terrain-center-variants-${assetId}`;

export const BUILT_IN_TERRAIN_VISUAL_ASSET_IDS = Object.keys(
  TERRAIN_VISUAL_ASSETS
) as BuiltInTerrainVisualAssetId[];

export type ObjectSpriteAssetId =
  | "applewood"
  | "city-clover"
  | "player"
  | "routeberry"
  | "stonepine"
  | "sungrain";

export type ObjectSpriteAsset = {
  id: ObjectSpriteAssetId;
  imageUrl: string;
  frameSize: number;
  rows: number;
  columns: number;
};

export const OBJECT_SPRITE_ASSETS: Record<
  ObjectSpriteAssetId,
  ObjectSpriteAsset
> = {
  applewood: {
    id: "applewood",
    imageUrl: applewoodSpriteUrl,
    frameSize: 256,
    rows: 4,
    columns: 4,
  },
  "city-clover": {
    id: "city-clover",
    imageUrl: cityCloveSpriteUrl,
    frameSize: 128,
    rows: 4,
    columns: 4,
  },
  player: {
    id: "player",
    imageUrl: playerSpriteUrl,
    frameSize: 256,
    rows: 4,
    columns: 4,
  },
  routeberry: {
    id: "routeberry",
    imageUrl: routeberrySpriteUrl,
    frameSize: 128,
    rows: 4,
    columns: 4,
  },
  stonepine: {
    id: "stonepine",
    imageUrl: stonepineSpriteUrl,
    frameSize: 256,
    rows: 4,
    columns: 4,
  },
  sungrain: {
    id: "sungrain",
    imageUrl: sungrainSpriteUrl,
    frameSize: 128,
    rows: 4,
    columns: 4,
  },
};

export const objectSpriteKey = (assetId: ObjectSpriteAssetId) =>
  `object-sprite-${assetId}`;
