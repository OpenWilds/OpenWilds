import Phaser from "phaser";
import { Components, type RectComponent, type RenderState } from "../components";
import type { World } from "../ecs";
import { CELL_SIZE } from "../grid-constants";
import type { GridPoint } from "../types";

export const createPlayerEntity = (
  world: World,
  scene: Phaser.Scene,
  position: GridPoint
) => {
  const entity = world.createEntity();
  const rectangle = scene.add
    .rectangle(0, 0, CELL_SIZE - 8, CELL_SIZE - 8, 0xe24a55)
    .setStrokeStyle(3, 0x84242b)
    .setOrigin(0);

  world.addComponent(entity, Components.player, true);
  world.addComponent<GridPoint>(entity, Components.position, position);
  world.addComponent<RectComponent>(entity, Components.rectangle, {
    object: rectangle,
    offsetX: 4,
    offsetY: 4,
  });
  world.addComponent<RenderState>(entity, Components.renderState, {
    dirty: true,
    animate: false,
  });

  return entity;
};

