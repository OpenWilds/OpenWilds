import { GRID_SIZE } from "./grid-constants";
import type { GridPoint } from "./types";

export const TerrainFeature = {
  farmable: 1 << 0,
  minable: 1 << 1,
  forageable: 1 << 2,
  blocksMovement: 1 << 3,
} as const;

export const ItemId = {
  none: 0,
  grassFiber: 1,
  berry: 2,
  stone: 3,
  reed: 4,
} as const;

export const TerrainTypeId = {
  meadow: 1,
  forest: 2,
  stone: 3,
  water: 4,
} as const;

export type TerrainTypeDefinition = {
  terrainTypeId: number;
  label: string;
  color: number;
  featureFlags: number;
  primaryDropItemId: number;
  secondaryDropItemId: number;
  dropRateBps: number;
};

export type TileTerrainDefinition = GridPoint & {
  terrainTypeId: number;
};

export const TERRAIN_TYPES: TerrainTypeDefinition[] = [
  {
    terrainTypeId: TerrainTypeId.meadow,
    label: "Meadow",
    color: 0xe2f0c2,
    featureFlags: TerrainFeature.farmable | TerrainFeature.forageable,
    primaryDropItemId: ItemId.grassFiber,
    secondaryDropItemId: ItemId.berry,
    dropRateBps: 6500,
  },
  {
    terrainTypeId: TerrainTypeId.forest,
    label: "Forest",
    color: 0xaed4a0,
    featureFlags: TerrainFeature.forageable,
    primaryDropItemId: ItemId.berry,
    secondaryDropItemId: ItemId.grassFiber,
    dropRateBps: 5000,
  },
  {
    terrainTypeId: TerrainTypeId.stone,
    label: "Stone",
    color: 0xb9bec6,
    featureFlags: TerrainFeature.minable,
    primaryDropItemId: ItemId.stone,
    secondaryDropItemId: ItemId.none,
    dropRateBps: 8000,
  },
  {
    terrainTypeId: TerrainTypeId.water,
    label: "Water",
    color: 0x8ecae6,
    featureFlags: TerrainFeature.blocksMovement,
    primaryDropItemId: ItemId.reed,
    secondaryDropItemId: ItemId.none,
    dropRateBps: 2500,
  },
];

export const getTerrainType = (terrainTypeId: number) =>
  TERRAIN_TYPES.find((terrain) => terrain.terrainTypeId === terrainTypeId) ??
  TERRAIN_TYPES[0];

export const getTileTerrainDefinition = ({
  x,
  y,
}: GridPoint): TileTerrainDefinition => {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
    throw new Error(
      `Tile ${x}, ${y} is outside the ${GRID_SIZE}x${GRID_SIZE} board.`
    );
  }

  const terrainTypeId =
    x <= 1 || y <= 1
      ? TerrainTypeId.water
      : x > 14 && y < 7
      ? TerrainTypeId.stone
      : x > 4 && x < 10 && y > 3 && y < 12
      ? TerrainTypeId.forest
      : TerrainTypeId.meadow;

  return { x, y, terrainTypeId };
};

export const createWorldTerrainDefinition = () => {
  const tiles: TileTerrainDefinition[] = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      tiles.push(getTileTerrainDefinition({ x, y }));
    }
  }

  return tiles;
};
