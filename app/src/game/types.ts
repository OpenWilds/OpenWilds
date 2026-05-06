export type GridPoint = {
  x: number;
  y: number;
};

export type EnergyState = {
  current: number;
  max: number;
};

export type PlayerActionState = {
  position: GridPoint;
  energy: EnergyState;
};

export type GameClient = {
  movePlayer: (point: GridPoint) => Promise<PlayerActionState | null>;
  subscribePlayerActionState?: (
    listener: (state: PlayerActionState) => void
  ) => () => void;
};
