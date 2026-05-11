import Phaser from "phaser";
import type { HudController } from "../client/hud";
import { createActionProgressHud } from "./hud/action-progress";
import { createAgentModeButton } from "./hud/agent-mode-button";
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
  const agentModeButton = createAgentModeButton(scene, toggleAgentMode);
  const toolInventory = createToolInventory(scene, {
    onToolChange: options.onToolChange,
    onContextActionChange: options.onContextActionChange,
    onItemSelect: options.onItemSelect,
    onQuantityChange: options.onQuantityChange,
    onSleep: options.onSleep,
  });
  const actionProgress = createActionProgressHud(scene);
  const tradePanel = createTradePanel(scene, {
    callbacks: options.trade,
  });
  let localPosition: GridPoint | null = null;
  let visiblePlayers: VisiblePlayerState[] = [];

  root.add([
    topRight.shade,
    energyPanel.container,
    statusPanel.container,
    minimap.container,
    topRight.container,
    toolInventory.container,
    actionProgress.container,
    agentModeButton.container,
    tradePanel.container,
  ]);

  const unsubscribe = hud.subscribe((snapshot) => {
    statusPanel.update(snapshot);
    topRight.setTime(snapshot.gameTimeStatus);
    agentModeButton.setActive(snapshot.agentActive);
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
      const agentPoint = getAgentModeButtonLocalPoint(pointer);

      if (
        agentPoint &&
        agentModeButton.containsPoint(agentPoint.x, agentPoint.y)
      ) {
        agentModeButton.handlePointerMove(agentPoint.x, agentPoint.y);
      } else {
        agentModeButton.clearPointerHover();
      }

      const point = getContainerLocalPoint(pointer, toolInventory.container);

      if (point && toolInventory.containsPoint(point.x, point.y)) {
        toolInventory.setPointerPosition(point.x, point.y);
      } else {
        toolInventory.clearPointerHover();
      }
    },
    handlePointerDown(pointer: Phaser.Input.Pointer) {
      const agentPoint = getAgentModeButtonLocalPoint(pointer);

      if (
        agentPoint &&
        agentModeButton.containsPoint(agentPoint.x, agentPoint.y)
      ) {
        return agentModeButton.handlePointerDown(agentPoint.x, agentPoint.y);
      }

      const topRightPoint = getContainerLocalPoint(pointer, topRight.container);

      if (
        topRightPoint &&
        topRight.containsPoint(topRightPoint.x, topRightPoint.y)
      ) {
        return topRight.handlePointerDown(topRightPoint.x, topRightPoint.y);
      }

      const inventoryPoint = getContainerLocalPoint(
        pointer,
        toolInventory.container
      );

      if (
        inventoryPoint &&
        toolInventory.containsPoint(inventoryPoint.x, inventoryPoint.y)
      ) {
        return toolInventory.handlePointerDown(
          inventoryPoint.x,
          inventoryPoint.y
        );
      }

      if (tradePanel.container.visible) {
        const tradePoint = getTradePanelLocalPoint(pointer);

        if (!tradePoint) {
          return true;
        }

        return tradePanel.handlePointerDown(tradePoint.x, tradePoint.y);
      }

      return false;
    },
    blocksPointer(pointer: Phaser.Input.Pointer) {
      const agentPoint = getAgentModeButtonLocalPoint(pointer);

      if (
        agentPoint &&
        agentModeButton.containsPoint(agentPoint.x, agentPoint.y)
      ) {
        return true;
      }

      const topRightPoint = getContainerLocalPoint(pointer, topRight.container);

      if (
        topRightPoint &&
        topRight.containsPoint(topRightPoint.x, topRightPoint.y)
      ) {
        return true;
      }

      const inventoryPoint = getContainerLocalPoint(
        pointer,
        toolInventory.container
      );

      if (
        inventoryPoint &&
        toolInventory.containsPoint(inventoryPoint.x, inventoryPoint.y)
      ) {
        return true;
      }

      const tradePoint = getTradePanelLocalPoint(pointer);

      return Boolean(
        tradePanel.container.visible &&
          tradePoint &&
          tradePanel.containsPoint(tradePoint.x, tradePoint.y)
      );
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
    topRight.resize({
      screenWidth: width,
      screenHeight: height,
    });
    const inventoryX = Math.max(12, (width - toolInventory.width) / 2);
    const inventoryY = height - toolInventory.height - 16;

    toolInventory.container.setPosition(inventoryX, inventoryY);
    agentModeButton.container.setPosition(
      hudEdgeInset,
      height - agentModeButton.height - hudEdgeInset
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
    const tradeScale = Math.min(
      1,
      Math.max(
        0.58,
        Math.min(
          (width - hudEdgeInset * 2) / tradePanel.width,
          (height - hudEdgeInset * 2) / tradePanel.height
        )
      )
    );
    tradePanel.container
      .setScale(tradeScale)
      .setPosition(
        Math.max(12, (width - tradePanel.width * tradeScale) / 2),
        Math.max(12, (height - tradePanel.height * tradeScale) / 2)
      );
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

  function getContainerLocalPoint(
    pointer: Phaser.Input.Pointer,
    container: Phaser.GameObjects.Container
  ) {
    const scaleX = root.scaleX || 1;
    const scaleY = root.scaleY || 1;
    const rootLocalX = (pointer.x - root.x) / scaleX;
    const rootLocalY = (pointer.y - root.y) / scaleY;

    return {
      x: (rootLocalX - container.x) / (container.scaleX || 1),
      y: (rootLocalY - container.y) / (container.scaleY || 1),
    };
  }

  function getTradePanelLocalPoint(pointer: Phaser.Input.Pointer) {
    const rootPoint = getContainerLocalPoint(pointer, tradePanel.container);

    if (tradePanel.containsPoint(rootPoint.x, rootPoint.y)) {
      return rootPoint;
    }

    const directPoint = {
      x:
        (pointer.x - tradePanel.container.x) /
        (tradePanel.container.scaleX || 1),
      y:
        (pointer.y - tradePanel.container.y) /
        (tradePanel.container.scaleY || 1),
    };

    if (tradePanel.containsPoint(directPoint.x, directPoint.y)) {
      return directPoint;
    }

    const worldPoint = {
      x:
        ((pointer.worldX ?? pointer.x) - tradePanel.container.x) /
        (tradePanel.container.scaleX || 1),
      y:
        ((pointer.worldY ?? pointer.y) - tradePanel.container.y) /
        (tradePanel.container.scaleY || 1),
    };

    return tradePanel.containsPoint(worldPoint.x, worldPoint.y)
      ? worldPoint
      : null;
  }

  function getAgentModeButtonLocalPoint(pointer: Phaser.Input.Pointer) {
    const rootPoint = getContainerLocalPoint(
      pointer,
      agentModeButton.container
    );

    if (agentModeButton.containsPoint(rootPoint.x, rootPoint.y)) {
      return rootPoint;
    }

    const directPoint = {
      x:
        (pointer.x - agentModeButton.container.x) /
        (agentModeButton.container.scaleX || 1),
      y:
        (pointer.y - agentModeButton.container.y) /
        (agentModeButton.container.scaleY || 1),
    };

    return agentModeButton.containsPoint(directPoint.x, directPoint.y)
      ? directPoint
      : null;
  }

  function toggleSettingsPanel() {
    const panel = document.getElementById("solana-settings-panel");

    if (panel) {
      panel.hidden = !panel.hidden;
    }
  }

  function toggleAgentMode() {
    const toggle = document.getElementById(
      "agent-mode-toggle"
    ) as HTMLInputElement | null;

    if (!toggle || toggle.disabled) {
      return;
    }

    toggle.click();
  }
};
