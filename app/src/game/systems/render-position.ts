import Phaser from "phaser";
import {
  Components,
  type RectComponent,
  type RenderState,
} from "../components/index";
import type { World } from "../ecs";
import { gridToWorld } from "../grid-math";
import type { GridPoint } from "../types";

export const renderPositionSystem = (world: World) => {
  for (const entity of world.view(
    Components.position,
    Components.rectangle,
    Components.renderState
  )) {
    const renderState = world.requireComponent<RenderState>(
      entity,
      Components.renderState
    );

    if (!renderState.dirty) {
      continue;
    }

    const position = world.requireComponent<GridPoint>(
      entity,
      Components.position
    );
    const rectangle = world.requireComponent<RectComponent>(
      entity,
      Components.rectangle
    );
    const scene = world.requireResource<Phaser.Scene>("scene");
    const point = gridToWorld(position);
    const x = point.x + rectangle.offsetX;
    const y = point.y + rectangle.offsetY;

    if (!renderState.animate) {
      rectangle.object.setPosition(x, y);
    } else {
      scene.tweens.killTweensOf(rectangle.object);
      scene.tweens.add({
        targets: rectangle.object,
        x,
        y,
        duration: 180,
        ease: "Quad.easeOut",
      });
    }

    renderState.dirty = false;
    renderState.animate = false;
  }
};
