import { Components } from "../components/index";
import type { World } from "../ecs";
import type { EnergyState, GridPoint } from "../types";

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

  label.textContent = `Player: ${position.x}, ${position.y} | Energy: ${energy.current}/${energy.max}`;
};
