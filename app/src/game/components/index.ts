import Phaser from "phaser";

export const Components = {
  activeAction: "activeAction",
  actionTransition: "actionTransition",
  hoverCursor: "hoverCursor",
  energy: "energy",
  player: "player",
  remotePlayer: "remotePlayer",
  position: "position",
  rectangle: "rectangle",
  renderState: "renderState",
} as const;

export type RectComponent = {
  object: Phaser.GameObjects.Rectangle;
  offsetX: number;
  offsetY: number;
};

export type RenderState = {
  dirty: boolean;
  animate: boolean;
};
