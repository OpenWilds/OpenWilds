export type GridPoint = {
  x: number;
  y: number;
};

export type EnergyState = {
  current: number;
  max: number;
};

export type ActiveActionKind = "idle" | "move" | "sleep" | "unknown";

export type ActiveActionState = {
  action: number;
  kind: ActiveActionKind;
  startedAt: number;
  endsAt: number;
};

export type PlayerActionState = {
  position: GridPoint;
  energy: EnergyState;
  activeAction: ActiveActionState;
};

export type ActionTransitionState = {
  active: boolean;
  fromPosition: GridPoint;
  toPosition: GridPoint;
  fromEnergy: EnergyState;
  toEnergy: EnergyState;
  startedAt: number;
  endsAt: number;
};

export type GameClient = {
  movePlayer: (point: GridPoint) => Promise<PlayerActionState | null>;
  subscribePlayerActionState?: (
    listener: (state: PlayerActionState) => void
  ) => () => void;
};
