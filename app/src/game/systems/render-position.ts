import Phaser from "phaser";
import {
  Components,
  type PlayerSpriteComponent,
  type RectComponent,
  type RenderState,
} from "../components/index";
import type { World } from "../ecs";
import { gridToWorld } from "../grid-math";
import type { ActiveActionState, GridPoint } from "../types";

const idleFrameMs = 420;
const movingFrameMs = 180;
const playerSheetColumns = 4;
const actionPoseColumn = 3;

const getPlayerSpecialPoseFrame = (
  facing: PlayerSpriteComponent["facing"],
  pose: "action" | "sleep"
): number => {
  // Matches Pantheon's special pose mapping on the fixed 4x4 sheet.
  const row =
    pose === "sleep" ? 3 : facing === "down" ? 0 : facing === "side" ? 1 : 2;

  return row * playerSheetColumns + actionPoseColumn;
};

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
    Components.actionTransition,
    Components.activeAction
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
    const now = Date.now() / 1000;
    const activeAction = world.requireComponent<ActiveActionState>(
      entity,
      Components.activeAction
    );
    const position = world.getComponent<GridPoint>(entity, Components.position);
    const sleeping = activeAction.kind === "sleep" && activeAction.endsAt > now;
    const actionPose =
      spriteState.actionPose &&
      spriteState.actionPose.endsAt > now &&
      position
        ? spriteState.actionPose
        : null;

    if (spriteState.actionPose && !actionPose) {
      spriteState.actionPose = undefined;
    }

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
    } else if (actionPose && position) {
      const dx = actionPose.target.x - position.x;
      const dy = actionPose.target.y - position.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        spriteState.facing = "side";
        spriteState.flipX = dx < 0;
      } else if (Math.abs(dy) > 0) {
        spriteState.facing = dy < 0 ? "up" : "down";
        spriteState.flipX = false;
      }
    }

    spriteState.elapsedMs += deltaMs;

    const acting = (Boolean(actionPose) || sleeping) && !moving;
    const frameMs = moving ? movingFrameMs : idleFrameMs;
    const step = Math.floor(spriteState.elapsedMs / frameMs);
    const column =
      spriteState.facing === "down" ? 0 : spriteState.facing === "side" ? 1 : 2;
    const row =
      moving && spriteState.facing === "side"
        ? [0, 2, 3][step % 3]
        : moving
        ? step % 2 === 0
          ? 2
          : 3
        : step % 2;

    spriteState.sprite
      .setFrame(
        acting
          ? getPlayerSpecialPoseFrame(
              spriteState.facing,
              sleeping ? "sleep" : "action"
            )
          : row * 4 + column
      )
      .setFlipX(spriteState.flipX)
      .setDisplaySize(spriteState.displaySize, spriteState.displaySize);
    spriteState.shadow.setAlpha(moving || acting ? 0.3 : 0.22);
  }
};
