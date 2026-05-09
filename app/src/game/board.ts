import Phaser from "phaser";
import {
  TERRAIN_VISUAL_ASSETS,
  terrainAtlasKey,
  terrainCenterVariantsKey,
  type TerrainVisualAssetId,
} from "../assets/visual-assets";
import { cellKey, renderAutotileLayer } from "./autotile";
import {
  CELL_SIZE,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Y,
  GRID_PIXELS,
  GRID_SIZE,
} from "./grid-constants";
import { getTerrainType, getTileTerrainDefinition } from "./terrain";

export const createBoard = (scene: Phaser.Scene) => {
  const board = scene.add.graphics().setDepth(-30);
  const terrainLayers = createTerrainLayers();

  board.fillStyle(0xffffff, 1);
  board.fillRoundedRect(
    GRID_ORIGIN_X - 10,
    GRID_ORIGIN_Y - 10,
    GRID_PIXELS + 20,
    GRID_PIXELS + 20,
    8
  );

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      terrainLayers["uniswap-plain"].cells.add(cellKey(x, y));
      const terrain = getTerrainType(
        getTileTerrainDefinition({ x, y }).terrainTypeId
      );

      terrainLayers[terrain.visualAssetId].cells.add(cellKey(x, y));
    }
  }

  Object.values(terrainLayers).forEach((layer, index) => {
    const asset = TERRAIN_VISUAL_ASSETS[layer.assetId];
    const container = scene.add
      .container(GRID_ORIGIN_X, GRID_ORIGIN_Y)
      .setDepth(-20 + index);

    renderAutotileLayer(
      scene,
      container,
      layer,
      terrainAtlasKey(asset.id),
      terrainCenterVariantsKey(asset.id),
      CELL_SIZE,
      GRID_SIZE,
      GRID_SIZE
    );
  });

  board.lineStyle(1, 0xffffff, 0.18);
  board.strokeRect(GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_PIXELS, GRID_PIXELS);
};

const createTerrainLayers = () => {
  const layerIds: TerrainVisualAssetId[] = [
    "uniswap-plain",
    "uniswap-grass",
    "uniswap-forest-floor",
    "uniswap-stone",
    "uniswap-water",
    "uniswap-dirt",
  ];

  return layerIds.reduce(
    (layers, assetId) => ({
      ...layers,
      [assetId]: { assetId, cells: new Set<string>() },
    }),
    {} as Record<
      TerrainVisualAssetId,
      { assetId: TerrainVisualAssetId; cells: Set<string> }
    >
  );
};
