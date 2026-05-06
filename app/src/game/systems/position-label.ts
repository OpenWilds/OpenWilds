import { Components } from "../components/index";
import type { World } from "../ecs";
import type { ActiveActionState, EnergyState, GridPoint } from "../types";

const formatPosition = (value: number) =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1);

export const positionLabelSystem = (world: World) => {
  const label = world.getResource<HTMLElement | null>("positionLabel");
  const player = world.findEntity(Components.player);

  if (!label || !player) {
    return;
  }

  const position = world.requireComponent<GridPoint>(
    player,
    Components.position
  );
  const energy = world.requireComponent<EnergyState>(player, Components.energy);
  const activeAction = world.requireComponent<ActiveActionState>(
    player,
    Components.activeAction
  );
  const actionText =
    activeAction.endsAt > Date.now() / 1000
      ? ` | ${activeAction.kind} ${Math.ceil(
          activeAction.endsAt - Date.now() / 1000
        )}s`
      : "";

  label.textContent = `Player: ${formatPosition(position.x)}, ${formatPosition(
    position.y
  )} | Energy: ${energy.current}/${energy.max}${actionText}`;
};
