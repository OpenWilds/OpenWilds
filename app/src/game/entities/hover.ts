import Phaser from "phaser";
import { Components, type RectComponent } from "../components/index";
import type { World } from "../ecs";
import { CELL_SIZE } from "../grid-constants";

export const createHoverEntity = (world: World, scene: Phaser.Scene) => {
  const entity = world.createEntity();
  const rectangle = scene.add
    .rectangle(0, 0, CELL_SIZE - 3, CELL_SIZE - 3, 0x7cc9aa, 0.2)
    .setStrokeStyle(2, 0x2f806a, 0.45)
    .setOrigin(0)
    .setVisible(false);

  world.addComponent(entity, Components.hoverCursor, true);
  world.addComponent<RectComponent>(entity, Components.rectangle, {
    object: rectangle,
    offsetX: 1.5,
    offsetY: 1.5,
  });

  return entity;
};
