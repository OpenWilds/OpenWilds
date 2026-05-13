import { Components } from "../components/index";
import type { World } from "../ecs";
import type { GameClient } from "../ports";
import type { GridInput, MoveState } from "../resources";
import type { ActiveActionState } from "../types";
import { beginActionTransition } from "./action-transition";
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

  const activeAction = world.requireComponent<ActiveActionState>(
    player,
    Components.activeAction
  );

  if (activeAction.endsAt > Date.now() / 1000) {
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

      beginActionTransition(world, player, confirmedState);
    })
    .finally(() => {
      move.pending = false;
    });
};
