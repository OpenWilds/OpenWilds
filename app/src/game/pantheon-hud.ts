import Phaser from "phaser";
import type { HudController } from "../client/hud";
import { createActionProgressHud } from "./hud/action-progress";
import { createEnergyPanel } from "./hud/energy-panel";
import { createMinimap } from "./hud/minimap";
import { createStatusPanel } from "./hud/status-panel";
import { createToolInventory } from "./hud/tool-inventory";
import { createTopRightStatus } from "./hud/top-right-status";
import { createTradePanel } from "./hud/trade-panel";
import type { PantheonHudOptions } from "./hud/types";
import type {
  ContextAction,
  EnergyState,
  GridPoint,
  InventoryState,
  VisiblePlayerState,
} from "./types";

export const createPantheonHud = (
  scene: Phaser.Scene,
  hud: HudController,
  options: PantheonHudOptions
) => {
  const hudEdgeInset = 16;
  const root = scene.add.container(0, 0).setDepth(10000).setScrollFactor(0);
  const statusPanel = createStatusPanel(scene);
  const energyPanel = createEnergyPanel(scene);
  const minimap = createMinimap(scene);
  const topRight = createTopRightStatus(scene, toggleSettingsPanel);
  const toolInventory = createToolInventory(scene, {
    onToolChange: options.onToolChange,
    onContextActionChange: options.onContextActionChange,
    onItemSelect: options.onItemSelect,
    onQuantityChange: options.onQuantityChange,
  });
  const actionProgress = createActionProgressHud(scene);
  const tradePanel = createTradePanel(scene, {
    callbacks: options.trade,
    getSelectedItemId: () => toolInventory.getSelectedItemId(),
    getSelectedQuantity: () => toolInventory.getSelectedQuantity(),
  });
  let localPosition: GridPoint | null = null;
  let visiblePlayers: VisiblePlayerState[] = [];

  root.add([
    energyPanel.container,
    statusPanel.container,
    minimap.container,
    topRight.container,
    toolInventory.container,
    actionProgress.container,
  ]);

  tradePanel.container.setVisible(false);

  const unsubscribe = hud.subscribe((snapshot) => {
    statusPanel.update(snapshot);
    topRight.setTime(snapshot.gameTimeStatus);
  });
  const closeSettingsButton = document.getElementById("settings-close-button");
  const closeSettingsPanel = () => {
    const panel = document.getElementById("solana-settings-panel");

    if (panel) {
      panel.hidden = true;
    }
  };

  closeSettingsButton?.addEventListener("click", closeSettingsPanel);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
    closeSettingsButton?.removeEventListener("click", closeSettingsPanel)
  );
  scene.scale.on("resize", layout);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
    scene.scale.off("resize", layout)
  );
  layout();

  return {
    updateInventory(inventory: InventoryState) {
      toolInventory.updateInventory(inventory);
    },
    updateGoldBalance: tradePanel.updateGoldBalance,
    updateLocalPosition(position: GridPoint) {
      localPosition = position;
      tradePanel.updateLocalPosition(position);
      minimap.setLocalPosition(position);
    },
    updateVisiblePlayers(players: VisiblePlayerState[]) {
      visiblePlayers = players;
      tradePanel.updateVisiblePlayers(players);
      minimap.setVisiblePlayers(players);
    },
    updateTradeOffers: tradePanel.updateTradeOffers,
    selectSeller: tradePanel.selectSeller,
    syncSelectedQuantity(quantity: number) {
      toolInventory.setSelectedQuantity(quantity);
    },
    setAvailableActions(actions: ContextAction[]) {
      toolInventory.setAvailableActions(actions);
    },
    getSelectedContextAction() {
      return toolInventory.getSelectedContextAction();
    },
    handlePointerMove(pointer: Phaser.Input.Pointer) {
      const point = getToolInventoryLocalPoint(pointer);

      if (point && toolInventory.containsPoint(point.x, point.y)) {
        toolInventory.setPointerPosition(point.x, point.y);
      } else {
        toolInventory.clearPointerHover();
      }
    },
    handlePointerDown(pointer: Phaser.Input.Pointer) {
      const point = getToolInventoryLocalPoint(pointer);

      return Boolean(
        point &&
          toolInventory.containsPoint(point.x, point.y) &&
          toolInventory.handlePointerDown(point.x, point.y)
      );
    },
    blocksPointer(pointer: Phaser.Input.Pointer) {
      const point = getToolInventoryLocalPoint(pointer);

      return Boolean(point && toolInventory.containsPoint(point.x, point.y));
    },
    updateEnergy(energy: EnergyState, deltaMs: number) {
      energyPanel.update(energy, deltaMs);
    },
    setPlayerStatus(text: string) {
      topRight.setPlayerStatus(text);
    },
    setPlayerPosition(position: GridPoint) {
      localPosition = position;
      minimap.setLocalPosition(position);
      if (visiblePlayers.length > 0) {
        minimap.setVisiblePlayers(visiblePlayers);
      }
    },
    setActionProgress: actionProgress.setProgress,
  };

  function layout() {
    syncRootToScreenSpace();

    const width = scene.scale.width;
    const height = scene.scale.height;
    const energyScale = Math.min(
      1,
      Math.max(0.68, (width - hudEdgeInset * 2) / energyPanel.width)
    );

    energyPanel.container.setPosition(14, 12).setScale(energyScale);
    statusPanel.container.setPosition(
      16,
      12 + energyPanel.height * energyScale + 10
    );

    topRight.container.setPosition(
      Math.max(12, width - topRight.width - 18),
      18
    );
    minimap.container.setPosition(
      Math.max(
        12,
        width - minimap.width - hudEdgeInset + minimap.visualPaddingRight
      ),
      Math.max(
        12,
        height - minimap.height - hudEdgeInset + minimap.visualPaddingBottom
      )
    );
    toolInventory.container.setPosition(
      Math.max(12, (width - toolInventory.width) / 2),
      height - toolInventory.height - 16
    );
    actionProgress.container.setPosition(
      Math.max(18, (width - actionProgress.width) / 2) -
        actionProgress.visualLeft,
      height -
        toolInventory.height -
        actionProgress.height -
        8 -
        actionProgress.visualTop
    );
    tradePanel.container.setPosition(18, height - tradePanel.height - 22);
  }

  function syncRootToScreenSpace() {
    const camera = scene.cameras.main;
    const zoom = camera.zoom || 1;
    const inverseZoom = 1 / zoom;
    const centerX = camera.width / 2;
    const centerY = camera.height / 2;

    root.setScale(inverseZoom);
    root.setPosition(
      centerX - centerX * inverseZoom,
      centerY - centerY * inverseZoom
    );
  }

  function getToolInventoryLocalPoint(pointer: Phaser.Input.Pointer) {
    const scaleX = root.scaleX || 1;
    const scaleY = root.scaleY || 1;
    const rootLocalX = (pointer.x - root.x) / scaleX;
    const rootLocalY = (pointer.y - root.y) / scaleY;

    return {
      x: rootLocalX - toolInventory.container.x,
      y: rootLocalY - toolInventory.container.y,
    };
  }

  function toggleSettingsPanel() {
    const panel = document.getElementById("solana-settings-panel");

    if (panel) {
      panel.hidden = !panel.hidden;
    }
  }
};
