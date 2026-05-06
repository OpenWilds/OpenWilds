import { actionProgressSystem } from "./action-progress";
import { actionTransitionSystem } from "./action-transition";
import { hoverSystem } from "./hover";
import { movementSystem } from "./movement";
import { positionLabelSystem } from "./position-label";
import { renderPositionSystem } from "./render-position";

export const gridSystems = [
  actionProgressSystem,
  actionTransitionSystem,
  hoverSystem,
  movementSystem,
  renderPositionSystem,
  positionLabelSystem,
];
