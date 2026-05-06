export type GridPoint = {
  x: number;
  y: number;
};

export type GameClient = {
  movePlayer: (point: GridPoint) => Promise<GridPoint | null>;
};

