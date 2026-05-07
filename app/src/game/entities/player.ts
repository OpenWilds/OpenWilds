import Phaser from "phaser";
import {
  Components,
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

export const createPlayerEntity = (
  world: World,
  scene: Phaser.Scene,
  position: GridPoint,
  appearance: Pick<PlayerAppearance, "fill" | "stroke"> = {
    fill: 0xe24a55,
    stroke: 0x84242b,
  },
  isLocalPlayer = true
) => {
  const entity = world.createEntity();
  const rectangle = scene.add
    .rectangle(0, 0, CELL_SIZE - 8, CELL_SIZE - 8, appearance.fill)
    .setStrokeStyle(3, appearance.stroke)
    .setOrigin(0);

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
