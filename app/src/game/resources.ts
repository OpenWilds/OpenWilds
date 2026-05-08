import Phaser from "phaser";
import type { FarmActionMode, GameClient, GridPoint } from "./types";

export type GridInput = {
  hoverPoint: GridPoint | null;
  requestedMove: GridPoint | null;
  requestedFarmAction: GridPoint | null;
  farmActionMode: FarmActionMode;
  selectedItemId: number | null;
  selectedQuantity: number;
};

export type MoveState = {
  pending: boolean;
};

export type ActionProgressElements = {
  root: HTMLElement | null;
  label: HTMLElement | null;
  time: HTMLElement | null;
  fill: HTMLElement | null;
};

export type GridResources = {
  actionProgress: ActionProgressElements;
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
    requestedFarmAction: null,
    farmActionMode: "move",
    selectedItemId: null,
    selectedQuantity: 1,
  });
  world.setResource<GridResources["move"]>("move", {
    pending: false,
  });
  world.setResource<GridResources["actionProgress"]>("actionProgress", {
    root: document.getElementById("action-progress"),
    label: document.getElementById("action-progress-label"),
    time: document.getElementById("action-progress-time"),
    fill: document.getElementById("action-progress-fill"),
  });
  world.setResource<GridResources["positionLabel"]>(
    "positionLabel",
    document.getElementById("player-position")
  );
};
