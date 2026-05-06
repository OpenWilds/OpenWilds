import { hoverSystem } from "./hover";
import { movementSystem } from "./movement";
import { positionLabelSystem } from "./position-label";
import { renderPositionSystem } from "./render-position";

export const gridSystems = [
  hoverSystem,
  movementSystem,
  renderPositionSystem,
  positionLabelSystem,
];
