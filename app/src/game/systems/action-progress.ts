import { Components } from "../components/index";
import type { World } from "../ecs";
import type { ActionProgressElements } from "../resources";
import type { ActiveActionState } from "../types";
import type { createPantheonHud } from "../pantheon-hud";
import type { ActionProgressIcon } from "../hud/action-progress";

const formatActionLabel = (action: ActiveActionState) => {
  if (action.kind === "move") {
    return "Moving";
  }

  if (action.kind === "sleep") {
    return "Sleeping";
  }

  return "Acting";
};

const getActionProgressIcon = (
  action: ActiveActionState
): ActionProgressIcon => {
  if (action.kind === "sleep") {
    return "sleep";
  }

  switch (action.action) {
    case 3:
      return "till";
    case 4:
      return "water";
    case 5:
      return "plant";
    case 6:
      return "harvest";
    case 7:
      return "chop";
    case 8:
      return "grab";
    case 9:
      return "drop";
    default:
      return action.kind === "move" ? "move" : "grab";
  }
};

export const actionProgressSystem = (world: World) => {
  const elements = world.getResource<ActionProgressElements>("actionProgress");
  const player = world.findEntity(Components.player);

  if (!elements?.root || !player) {
    return;
  }

  const action = world.requireComponent<ActiveActionState>(
    player,
    Components.activeAction
  );
  const now = Date.now() / 1000;
  const duration = Math.max(0, action.endsAt - action.startedAt);
  const remaining = Math.max(0, action.endsAt - now);

  if (action.kind === "idle" || remaining <= 0 || duration <= 0) {
    world
      .getResource<ReturnType<typeof createPantheonHud>>("pantheonHud")
      ?.setActionProgress({
        visible: false,
        label: "",
        remainingSeconds: 0,
        progress: 0,
      });
    elements.root.hidden = true;

    if (elements.fill) {
      elements.fill.style.width = "0%";
    }

    return;
  }

  const progress = Math.min(
    1,
    Math.max(0, (now - action.startedAt) / duration)
  );

  elements.root.hidden = false;
  world
    .getResource<ReturnType<typeof createPantheonHud>>("pantheonHud")
    ?.setActionProgress({
      visible: true,
      label: formatActionLabel(action),
      remainingSeconds: remaining,
      progress,
      action: getActionProgressIcon(action),
    });

  if (elements.label) {
    elements.label.textContent = formatActionLabel(action);
  }

  if (elements.time) {
    elements.time.textContent = `${Math.ceil(remaining)}s`;
  }

  if (elements.fill) {
    elements.fill.style.width = `${Math.round(progress * 100)}%`;
  }
};
