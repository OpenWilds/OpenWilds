import { Components, type RenderState } from "../components";
import type { World } from "../ecs";
import type { GridInput, MoveState } from "../resources";
import type { GameClient, GridPoint } from "../types";
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
    .then((confirmedPoint) => {
      if (!confirmedPoint) {
        return;
      }

      const position = world.requireComponent<GridPoint>(
        player,
        Components.position
      );
      const renderState = world.requireComponent<RenderState>(
        player,
        Components.renderState
      );

      position.x = confirmedPoint.x;
      position.y = confirmedPoint.y;
      renderState.dirty = true;
      renderState.animate = true;
    })
    .finally(() => {
      move.pending = false;
    });
};

