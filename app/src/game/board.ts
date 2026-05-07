import Phaser from "phaser";
import {
  CELL_SIZE,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Y,
  GRID_PIXELS,
  GRID_SIZE,
} from "./grid-constants";
import { getTerrainType, getTileTerrainDefinition } from "./terrain";

export const createBoard = (scene: Phaser.Scene) => {
  const board = scene.add.graphics();

  board.fillStyle(0xffffff, 1);
  board.fillRoundedRect(
    GRID_ORIGIN_X - 10,
    GRID_ORIGIN_Y - 10,
    GRID_PIXELS + 20,
    GRID_PIXELS + 20,
    8
  );

  board.fillStyle(0xd9eadc, 1);
  board.fillRect(GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_PIXELS, GRID_PIXELS);

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const terrain = getTerrainType(
        getTileTerrainDefinition({ x, y }).terrainTypeId
      );
      const alpha = (x + y) % 2 === 0 ? 1 : 0.88;
      board.fillStyle(terrain.color, alpha);
      board.fillRect(
        GRID_ORIGIN_X + x * CELL_SIZE,
        GRID_ORIGIN_Y + y * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE
      );
    }
  }

  board.lineStyle(1, 0x91aa96, 0.72);

  for (let index = 0; index <= GRID_SIZE; index += 1) {
    const lineOffset = index * CELL_SIZE;
    board.lineBetween(
      GRID_ORIGIN_X + lineOffset,
      GRID_ORIGIN_Y,
      GRID_ORIGIN_X + lineOffset,
      GRID_ORIGIN_Y + GRID_PIXELS
    );
    board.lineBetween(
      GRID_ORIGIN_X,
      GRID_ORIGIN_Y + lineOffset,
      GRID_ORIGIN_X + GRID_PIXELS,
      GRID_ORIGIN_Y + lineOffset
    );
  }
};
