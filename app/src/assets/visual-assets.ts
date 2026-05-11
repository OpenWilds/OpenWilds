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
import player2SpriteUrl from "./object-sprites/player2/player2-sprite-sheet.png?url";
import player3SpriteUrl from "./object-sprites/player3/player3-sprite-sheet.png?url";
import player4SpriteUrl from "./object-sprites/player4/player4-sprite-sheet.png?url";
import player5SpriteUrl from "./object-sprites/player5/player5-sprite-sheet.png?url";

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
  | "player2"
  | "player3"
  | "player4"
  | "player5"
  | "routeberry"
  | "stonepine"
  | "sungrain";

export type PlayerSpriteAssetId = Extract<
  ObjectSpriteAssetId,
  "player" | "player2" | "player3" | "player4" | "player5"
>;

export const PLAYER_SPRITE_SHEET_URLS: Record<PlayerSpriteAssetId, string> = {
  player: playerSpriteUrl,
  player2: player2SpriteUrl,
  player3: player3SpriteUrl,
  player4: player4SpriteUrl,
  player5: player5SpriteUrl,
};

export const getPlayerSpriteSheetUrl = (assetId: PlayerSpriteAssetId) =>
  PLAYER_SPRITE_SHEET_URLS[assetId];

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
  player2: {
    id: "player2",
    imageUrl: player2SpriteUrl,
    frameSize: 256,
    rows: 4,
    columns: 4,
  },
  player3: {
    id: "player3",
    imageUrl: player3SpriteUrl,
    frameSize: 256,
    rows: 4,
    columns: 4,
  },
  player4: {
    id: "player4",
    imageUrl: player4SpriteUrl,
    frameSize: 256,
    rows: 4,
    columns: 4,
  },
  player5: {
    id: "player5",
    imageUrl: player5SpriteUrl,
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
