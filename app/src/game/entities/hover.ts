import Phaser from "phaser";
import { Components, type RectComponent } from "../components/index";
import type { World } from "../ecs";
import { CELL_SIZE } from "../grid-constants";

export const createHoverEntity = (world: World, scene: Phaser.Scene) => {
  const entity = world.createEntity();
  const rectangle = scene.add.graphics().setVisible(false);

  rectangle.lineStyle(3, 0xf1d38b, 0.95);
  rectangle.fillStyle(0xf0c85a, 0.12);
  rectangle.strokeRoundedRect(8, 8, CELL_SIZE - 16, CELL_SIZE - 16, 18);
  rectangle.fillRoundedRect(8, 8, CELL_SIZE - 16, CELL_SIZE - 16, 18);

  world.addComponent(entity, Components.hoverCursor, true);
  world.addComponent<RectComponent>(entity, Components.rectangle, {
    object: rectangle,
    offsetX: 0,
    offsetY: 0,
  });

  return entity;
};
