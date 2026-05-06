import { Components } from "../components";
import type { World } from "../ecs";
import type { GridPoint } from "../types";

export const positionLabelSystem = (world: World) => {
  const label = world.getResource<HTMLElement | null>("positionLabel");
  const player = world.findEntity(Components.player);

  if (!label || !player) {
    return;
  }

  const position = world.requireComponent<GridPoint>(player, Components.position);
  label.textContent = `Player: ${position.x}, ${position.y}`;
};

