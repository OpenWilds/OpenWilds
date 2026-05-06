import { Components, type RenderState } from "../components/index";
import type { World } from "../ecs";
import type {
  ActionTransitionState,
  ActiveActionState,
  EnergyState,
  GridPoint,
  PlayerActionState,
} from "../types";

const interpolate = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const copyActiveAction = (
  target: ActiveActionState,
  source: ActiveActionState
) => {
  target.action = source.action;
  target.kind = source.kind;
  target.startedAt = source.startedAt;
  target.endsAt = source.endsAt;
};

const copyConfirmedState = (
  world: World,
  player: number,
  state: PlayerActionState
) => {
  const position = world.requireComponent<GridPoint>(
    player,
    Components.position
  );
  const energy = world.requireComponent<EnergyState>(player, Components.energy);
  const renderState = world.requireComponent<RenderState>(
    player,
    Components.renderState
  );

  position.x = state.position.x;
  position.y = state.position.y;
  energy.current = state.energy.current;
  energy.max = state.energy.max;
  renderState.dirty = true;
  renderState.animate = true;
};

export const beginActionTransition = (
  world: World,
  player: number,
  state: PlayerActionState
) => {
  const now = Date.now() / 1000;
  const activeAction = world.requireComponent<ActiveActionState>(
    player,
    Components.activeAction
  );
  const transition = world.requireComponent<ActionTransitionState>(
    player,
    Components.actionTransition
  );

  copyActiveAction(activeAction, state.activeAction);

  if (state.activeAction.endsAt <= now || state.activeAction.kind === "idle") {
    transition.active = false;
    copyConfirmedState(world, player, state);
    return;
  }

  const position = world.requireComponent<GridPoint>(
    player,
    Components.position
  );
  const energy = world.requireComponent<EnergyState>(player, Components.energy);

  transition.active = true;
  transition.fromPosition = { ...position };
  transition.toPosition = { ...state.position };
  transition.fromEnergy = { ...energy };
  transition.toEnergy = { ...state.energy };
  transition.startedAt = state.activeAction.startedAt;
  transition.endsAt = state.activeAction.endsAt;
};

export const actionTransitionSystem = (world: World) => {
  const now = Date.now() / 1000;

  for (const player of world.view(
    Components.player,
    Components.actionTransition,
    Components.position,
    Components.energy,
    Components.renderState
  )) {
    const transition = world.requireComponent<ActionTransitionState>(
      player,
      Components.actionTransition
    );

    if (!transition.active) {
      continue;
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
    const duration = Math.max(0, transition.endsAt - transition.startedAt);
    const progress =
      duration === 0
        ? 1
        : Math.min(1, Math.max(0, (now - transition.startedAt) / duration));

    position.x = interpolate(
      transition.fromPosition.x,
      transition.toPosition.x,
      progress
    );
    position.y = interpolate(
      transition.fromPosition.y,
      transition.toPosition.y,
      progress
    );
    energy.current = Math.round(
      interpolate(
        transition.fromEnergy.current,
        transition.toEnergy.current,
        progress
      )
    );
    energy.max = transition.toEnergy.max;
    renderState.dirty = true;
    renderState.animate = false;

    if (progress >= 1) {
      position.x = transition.toPosition.x;
      position.y = transition.toPosition.y;
      energy.current = transition.toEnergy.current;
      energy.max = transition.toEnergy.max;
      activeAction.kind = "idle";
      activeAction.action = 0;
      activeAction.startedAt = 0;
      activeAction.endsAt = 0;
      transition.active = false;
    }
  }
};
