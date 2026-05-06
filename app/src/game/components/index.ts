import Phaser from "phaser";

export const Components = {
  activeAction: "activeAction",
  hoverCursor: "hoverCursor",
  energy: "energy",
  player: "player",
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
