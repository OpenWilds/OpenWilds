import Phaser from "phaser";
import {
  Components,
  type PlayerSpriteComponent,
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

    if (world.getComponent(entity, Components.playerSprite)) {
      rectangle.object.setDepth(80 + y * 0.01);
    }

    renderState.dirty = false;
    renderState.animate = false;
  }
};

export const playerSpriteAnimationSystem = (world: World, deltaMs: number) => {
  for (const entity of world.view(
    Components.playerSprite,
    Components.actionTransition
  )) {
    const spriteState = world.requireComponent<PlayerSpriteComponent>(
      entity,
      Components.playerSprite
    );
    const transition = world.requireComponent<{
      active: boolean;
      fromPosition: { x: number; y: number };
      toPosition: { x: number; y: number };
    }>(entity, Components.actionTransition);
    const moving =
      transition.active &&
      (Math.abs(transition.toPosition.x - transition.fromPosition.x) > 0.01 ||
        Math.abs(transition.toPosition.y - transition.fromPosition.y) > 0.01);

    if (moving) {
      const dx = transition.toPosition.x - transition.fromPosition.x;
      const dy = transition.toPosition.y - transition.fromPosition.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        spriteState.facing = "side";
        spriteState.flipX = dx < 0;
      } else {
        spriteState.facing = dy < 0 ? "up" : "down";
        spriteState.flipX = false;
      }
    }

    spriteState.elapsedMs += deltaMs;

    const step = Math.floor(spriteState.elapsedMs / 180);
    const row = moving ? (step % 2 === 0 ? 2 : 3) : step % 2;
    const column =
      spriteState.facing === "down" ? 0 : spriteState.facing === "side" ? 1 : 2;

    spriteState.sprite
      .setFrame(row * 4 + column)
      .setFlipX(spriteState.flipX)
      .setScale(1);
    spriteState.shadow.setAlpha(moving ? 0.3 : 0.22);
  }
};
