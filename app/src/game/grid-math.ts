import Phaser from "phaser";
import {
  CELL_SIZE,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Y,
  GRID_SIZE,
} from "./grid-constants";
import type { GridPoint } from "./types";

export const gridToWorld = (point: GridPoint) => ({
  x: GRID_ORIGIN_X + point.x * CELL_SIZE,
  y: GRID_ORIGIN_Y + point.y * CELL_SIZE,
});

export const pointerToGrid = (
  pointer: Phaser.Input.Pointer
): GridPoint | null => {
  const worldX = pointer.worldX ?? pointer.x;
  const worldY = pointer.worldY ?? pointer.y;
  const x = Math.floor((worldX - GRID_ORIGIN_X) / CELL_SIZE);
  const y = Math.floor((worldY - GRID_ORIGIN_Y) / CELL_SIZE);

  if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
    return null;
  }

  return { x, y };
};
