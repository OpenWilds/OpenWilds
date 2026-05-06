import { Components, type RenderState } from "../components/index";
import type { World } from "../ecs";
import type { GridInput, MoveState } from "../resources";
import type {
  ActiveActionState,
  EnergyState,
  GameClient,
  GridPoint,
} from "../types";
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

      const position = world.requireComponent<GridPoint>(
        player,
        Components.position
      );
      const energy = world.requireComponent<EnergyState>(
        player,
        Components.energy
      );
      const activeAction = world.requireComponent<ActiveActionState>(
        player,
        Components.activeAction
      );
      const renderState = world.requireComponent<RenderState>(
        player,
        Components.renderState
      );

      position.x = confirmedState.position.x;
      position.y = confirmedState.position.y;
      energy.current = confirmedState.energy.current;
      energy.max = confirmedState.energy.max;
      activeAction.action = confirmedState.activeAction.action;
      activeAction.kind = confirmedState.activeAction.kind;
      activeAction.startedAt = confirmedState.activeAction.startedAt;
      activeAction.endsAt = confirmedState.activeAction.endsAt;
      renderState.dirty = true;
      renderState.animate = true;
    })
    .finally(() => {
      move.pending = false;
    });
};
