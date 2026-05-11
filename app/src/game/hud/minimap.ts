import Phaser from "phaser";
import { UI_ASSETS } from "../../assets/ui-assets";
import { GRID_SIZE } from "../grid-constants";
import { getTerrainType, getTileTerrainDefinition } from "../terrain";
import type { GridPoint, VisiblePlayerState } from "../types";
import { makeHudText } from "./text";

export const createMinimap = (scene: Phaser.Scene) => {
  const container = scene.add.container(18, 176).setScrollFactor(0);
  const mapX = 42;
  const mapY = 41;
  const mapSize = 168;
  const cellSize = mapSize / GRID_SIZE;
  const terrainLayer = scene.add.graphics();
  const overlayLayer = scene.add.graphics();
  const playerMarker = scene.add
    .image(0, 0, UI_ASSETS.playerMarker.key)
    .setDisplaySize(23, 31)
    .setVisible(false);
  const frame = scene.add
    .image(0, 0, UI_ASSETS.minimapFrame.key)
    .setOrigin(0)
    .setDisplaySize(252, 248);
  const label = makeHudText(scene, 64, 214, "20x20 Wilds", 12, "#f6efd7", 124);
  let localPosition: GridPoint | null = null;
  let players: VisiblePlayerState[] = [];

  label.setAlign("center");
  drawStatic();
  container.add([terrainLayer, overlayLayer, playerMarker, frame, label]);

  return {
    container,
    setLocalPosition(position: GridPoint) {
      localPosition = position;
      renderOverlay();
    },
    setVisiblePlayers(nextPlayers: VisiblePlayerState[]) {
      players = nextPlayers;
      renderOverlay();
    },
  };

  function drawStatic() {
    terrainLayer.clear();
    terrainLayer.fillStyle(0x0d151a, 0.96);
    terrainLayer.fillRoundedRect(
      mapX - 5,
      mapY - 5,
      mapSize + 10,
      mapSize + 10,
      8
    );

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const terrain = getTerrainType(
          getTileTerrainDefinition({ x, y }).terrainTypeId
        );

        terrainLayer.fillStyle(
          getMinimapTerrainColor(terrain.visualAssetId),
          0.98
        );
        terrainLayer.fillRect(
          mapX + x * cellSize,
          mapY + y * cellSize,
          Math.ceil(cellSize),
          Math.ceil(cellSize)
        );
      }
    }
  }

  function renderOverlay() {
    overlayLayer.clear();

    players
      .filter((player) => !player.isActive)
      .forEach((player) => {
        const point = gridToMinimap(player.state.position);

        overlayLayer.fillStyle(0x7bd7ff, 0.92);
        overlayLayer.fillCircle(point.x, point.y, 3.5);
        overlayLayer.lineStyle(1, 0x10191f, 0.85);
        overlayLayer.strokeCircle(point.x, point.y, 3.5);
      });

    if (!localPosition) {
      playerMarker.setVisible(false);
      return;
    }

    const point = gridToMinimap(localPosition);

    playerMarker.setVisible(true).setPosition(point.x, point.y - 8);
  }

  function gridToMinimap(position: GridPoint) {
    return {
      x: mapX + (position.x + 0.5) * cellSize,
      y: mapY + (position.y + 0.5) * cellSize,
    };
  }
};

function getMinimapTerrainColor(assetId: string) {
  switch (assetId) {
    case "uniswap-water":
      return 0x51b9d6;
    case "uniswap-stone":
      return 0xaeb4bd;
    case "uniswap-forest-floor":
      return 0x487a4d;
    case "uniswap-dirt":
      return 0xb98757;
    case "uniswap-grass":
      return 0x8fbe67;
    case "uniswap-plain":
    default:
      return 0xc8df86;
  }
}
