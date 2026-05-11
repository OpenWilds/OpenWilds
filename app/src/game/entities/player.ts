import Phaser from "phaser";
import { objectSpriteKey } from "../../assets/visual-assets";
import {
  Components,
  type PlayerSpriteComponent,
  type RectComponent,
  type RenderState,
} from "../components/index";
import type { World } from "../ecs";
import { CELL_SIZE } from "../grid-constants";
import type {
  ActionTransitionState,
  ActiveActionState,
  EnergyState,
  GridPoint,
  PlayerAppearance,
} from "../types";

const playerDisplaySize = 174;
const playerVisualFootOffsetY = 28;

export const createPlayerEntity = (
  world: World,
  scene: Phaser.Scene,
  position: GridPoint,
  appearance: Pick<PlayerAppearance, "fill" | "spriteAssetId" | "stroke"> = {
    fill: 0xe24a55,
    spriteAssetId: "player",
    stroke: 0x84242b,
  },
  isLocalPlayer = true
) => {
  const entity = world.createEntity();
  const container = scene.add.container(0, 0);
  const shadow = scene.add
    .ellipse(0, 0, 99.4, 31.1, 0x071018, 0.24)
    .setStrokeStyle(2, appearance.stroke, isLocalPlayer ? 0.5 : 0.25);
  const sprite = scene.add
    .sprite(
      0,
      playerVisualFootOffsetY,
      objectSpriteKey(appearance.spriteAssetId),
      0
    )
    .setOrigin(0.5, 1)
    .setDisplaySize(playerDisplaySize, playerDisplaySize);

  if (!isLocalPlayer) {
    sprite.setAlpha(0.78);
  }

  container.add([shadow, sprite]);
  container.setSize(142.8, 161.5);
  container.setDepth(100);

  world.addComponent(
    entity,
    isLocalPlayer ? Components.player : Components.remotePlayer,
    true
  );
  world.addComponent<GridPoint>(entity, Components.position, position);
  world.addComponent<EnergyState>(entity, Components.energy, {
    current: 100,
    max: 100,
  });
  world.addComponent<ActiveActionState>(entity, Components.activeAction, {
    action: 0,
    kind: "idle",
    startedAt: 0,
    endsAt: 0,
  });
  world.addComponent<ActionTransitionState>(
    entity,
    Components.actionTransition,
    {
      active: false,
      fromPosition: { ...position },
      toPosition: { ...position },
      fromEnergy: { current: 100, max: 100 },
      toEnergy: { current: 100, max: 100 },
      startedAt: 0,
      endsAt: 0,
    }
  );
  world.addComponent<RectComponent>(entity, Components.rectangle, {
    object: container,
    offsetX: CELL_SIZE / 2,
    offsetY: CELL_SIZE / 2,
  });
  world.addComponent<PlayerSpriteComponent>(entity, Components.playerSprite, {
    assetId: appearance.spriteAssetId,
    sprite,
    shadow,
    displaySize: playerDisplaySize,
    facing: "down",
    flipX: false,
    elapsedMs: 0,
  });
  world.addComponent<RenderState>(entity, Components.renderState, {
    dirty: true,
    animate: false,
  });

  return entity;
};
