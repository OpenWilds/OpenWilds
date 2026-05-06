import Phaser from "phaser";
import type { GameClient, GridPoint } from "./types";

export type GridInput = {
  hoverPoint: GridPoint | null;
  requestedMove: GridPoint | null;
};

export type MoveState = {
  pending: boolean;
};

export type GridResources = {
  client: GameClient;
  input: GridInput;
  move: MoveState;
  positionLabel: HTMLElement | null;
  scene: Phaser.Scene;
};

export const installGridResources = (
  world: {
    setResource: <T>(name: string, value: T) => T;
  },
  scene: Phaser.Scene,
  client: GameClient
) => {
  world.setResource<GridResources["scene"]>("scene", scene);
  world.setResource<GridResources["client"]>("client", client);
  world.setResource<GridResources["input"]>("input", {
    hoverPoint: null,
    requestedMove: null,
  });
  world.setResource<GridResources["move"]>("move", {
    pending: false,
  });
  world.setResource<GridResources["positionLabel"]>(
    "positionLabel",
    document.getElementById("player-position")
  );
};

