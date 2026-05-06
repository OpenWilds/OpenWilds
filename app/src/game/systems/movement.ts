import { Components, type RenderState } from "../components/index";
import type { World } from "../ecs";
import type { GridInput, MoveState } from "../resources";
import type { EnergyState, GameClient, GridPoint } from "../types";
import { hideHover } from "./hide-hover";

export const movementSystem = (world: World) => {
  const input = world.requireResource<GridInput>("input");
  const move = world.requireResource<MoveState>("move");
  const target = input.requestedMove;
  input.requestedMove = null;

  if (!target || move.pending) {
    return;
  }

  const player = world.findEntity(Components.player);

  if (!player) {
    return;
  }

  move.pending = true;
  hideHover(world);

  void world
    .requireResource<GameClient>("client")
    .movePlayer(target)
    .then((confirmedState) => {
      if (!confirmedState) {
        return;
      }

      const position = world.requireComponent<GridPoint>(
        player,
        Components.position
      );
      const energy = world.requireComponent<EnergyState>(
        player,
        Components.energy
      );
      const renderState = world.requireComponent<RenderState>(
        player,
        Components.renderState
      );

      position.x = confirmedState.position.x;
      position.y = confirmedState.position.y;
      energy.current = confirmedState.energy.current;
      energy.max = confirmedState.energy.max;
      renderState.dirty = true;
      renderState.animate = true;
    })
    .finally(() => {
      move.pending = false;
    });
};
