import Phaser from "phaser";

export type RenderableObject = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.Components.Visible &
  Phaser.GameObjects.Components.Alpha &
  Phaser.GameObjects.Components.Depth;

export const Components = {
  activeAction: "activeAction",
  actionTransition: "actionTransition",
  hoverCursor: "hoverCursor",
  energy: "energy",
  player: "player",
  playerSprite: "playerSprite",
  remotePlayer: "remotePlayer",
  position: "position",
  rectangle: "rectangle",
  renderState: "renderState",
} as const;

export type RectComponent = {
  object: RenderableObject;
  offsetX: number;
  offsetY: number;
};

export type PlayerSpriteComponent = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  facing: "down" | "up" | "side";
  flipX: boolean;
  elapsedMs: number;
};

export type RenderState = {
  dirty: boolean;
  animate: boolean;
};
