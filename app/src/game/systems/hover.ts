import { Components, type RectComponent } from "../components/index";
import type { World } from "../ecs";
import { gridToWorld } from "../grid-math";
import type { GridInput } from "../resources";

export const hoverSystem = (world: World) => {
  const input = world.requireResource<GridInput>("input");

  for (const entity of world.view(
    Components.hoverCursor,
    Components.rectangle
  )) {
    const rectangle = world.requireComponent<RectComponent>(
      entity,
      Components.rectangle
    );

    if (!input.hoverPoint) {
      rectangle.object.setVisible(false);
      continue;
    }

    const point = gridToWorld(input.hoverPoint);
    rectangle.object
      .setPosition(point.x + rectangle.offsetX, point.y + rectangle.offsetY)
      .setVisible(true);
  }
};
