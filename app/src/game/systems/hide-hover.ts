import { Components, type RectComponent } from "../components/index";
import type { World } from "../ecs";

export const hideHover = (world: World) => {
  for (const entity of world.view(
    Components.hoverCursor,
    Components.rectangle
  )) {
    world
      .requireComponent<RectComponent>(entity, Components.rectangle)
      .object.setVisible(false);
  }
};
