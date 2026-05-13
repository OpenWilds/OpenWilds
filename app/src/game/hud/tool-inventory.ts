import Phaser from "phaser";
import { UI_ASSETS, UI_ICONS } from "../../assets/ui-assets";
import {
  getItemSpriteFrame,
  getObjectSpriteFrameTexture,
} from "../object-sprite-frames";
import type { TileActionMode, EquippedTool, InventoryState } from "../types";
import { compactItemLabel, makeHudText } from "./text";
import { contextActions, tools } from "./types";

type ToolSlot = {
  tool: EquippedTool;
  x: number;
  y: number;
  background: Phaser.GameObjects.Image;
  hover: Phaser.GameObjects.Image;
  selected: Phaser.GameObjects.Image;
};

type InventorySlot = {
  itemId: number | null;
  x: number;
  y: number;
  background: Phaser.GameObjects.Image;
  hover: Phaser.GameObjects.Image;
  selected: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  hovered: boolean;
};

type ActionSlot = {
  action: TileActionMode;
  x: number;
  y: number;
  width: number;
  height: number;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Image;
  selection: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  shortcut: Phaser.GameObjects.Text;
  hovered: boolean;
  pressed: boolean;
};

type SleepSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  hovered: boolean;
  pressed: boolean;
};

const panelWidth = 770;
const panelHeight = 132;
const actionHeight = 54;
const slotSize = 84;
const slotGap = 18;
const panelPadding = 18;
const dividerWidth = 16;
const dividerHeight = 98;
const inventorySlotCount = 4;
const inventoryIconSize = 120;
const inventoryIconHoverSize = 130;
const actionButtonWidth = 138;
const actionButtonHeight = 50;
const actionButtonGap = 12;
const sleepButtonWidth = 132;
const actionHoverScale = 1.035;
const actionPressScale = 0.965;

function makeShortcutText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string
) {
  return scene.add
    .text(x, y, text, {
      align: "right",
      color: "#3d2011",
      fixedWidth: 24,
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: "25px",
      fontStyle: "700",
      shadow: {
        color: "#ead2a2",
        blur: 1,
        fill: true,
        offsetX: 0,
        offsetY: 1,
      },
    })
    .setOrigin(1, 0.5)
    .setScrollFactor(0);
}

function makeActionLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string
) {
  return scene.add
    .text(x, y, text, {
      color: "#f6efd7",
      fixedWidth: 68,
      fontFamily: "Trebuchet MS, Chalkboard SE, Comic Sans MS, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      shadow: {
        color: "#3d2011",
        blur: 2,
        fill: true,
        offsetX: 0,
        offsetY: 1,
      },
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0);
}

function makeActionShortcut(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string
) {
  return scene.add
    .text(x, y, text, {
      align: "center",
      color: "#f6efd7",
      fixedWidth: 20,
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: "18px",
      fontStyle: "700",
      shadow: {
        color: "#3d2011",
        blur: 1,
        fill: true,
        offsetX: 0,
        offsetY: 1,
      },
    })
    .setOrigin(0.5)
    .setScrollFactor(0);
}

export const createToolInventory = (
  scene: Phaser.Scene,
  args: {
    onToolChange: (tool: EquippedTool) => void;
    onTileActionModeChange: (action: TileActionMode | null) => void;
    onItemSelect: (itemId: number | null) => void;
    onQuantityChange: (quantity: number) => void;
    onSleep: () => void;
  }
) => {
  const width = panelWidth;
  const height = panelHeight + actionHeight;
  const container = scene.add.container(0, 0).setScrollFactor(0);
  const panel = scene.add
    .image(width / 2, panelHeight / 2, UI_ASSETS.inventoryPanel.key)
    .setDisplaySize(width, panelHeight)
    .setOrigin(0.5);
  const divider = scene.add
    .image(0, panelHeight / 2, UI_ASSETS.inventoryDivider.key)
    .setDisplaySize(dividerWidth, dividerHeight)
    .setOrigin(0.5);
  const actionLabel = makeHudText(
    scene,
    18,
    panelHeight + 11,
    "Actions",
    12,
    "#f1d38b",
    88
  );
  const actionHint = makeHudText(
    scene,
    108,
    panelHeight + 12,
    "Click non-action tiles to move",
    11,
    "#dce8e2",
    250
  );
  const actionRoot = scene.add.container(panelPadding, panelHeight + 2);
  const toolSlots: ToolSlot[] = [];
  const inventorySlots: InventorySlot[] = [];
  const actionSlots: ActionSlot[] = [];
  let sleepSlot: SleepSlot | null = null;
  let selectedTool: EquippedTool = "hand";
  let selectedTileActionMode: TileActionMode | null = null;
  let availableActions: TileActionMode[] = [];
  let selectedItemId: number | null = null;
  let selectedQuantity = 1;
  let inventory: InventoryState = { slots: [] };

  container.add([panel, divider, actionLabel, actionHint, actionRoot]);
  buildSlots();
  syncToolSelection();

  const keyboard = scene.input.keyboard;
  if (keyboard) {
    tools.forEach((tool, index) => {
      keyboard.on(`keydown-${index + 1}`, () => selectTool(tool.tool));
    });
    for (let index = 0; index < 6; index += 1) {
      keyboard.on(`keydown-${index + 4}`, () => {
        const action = availableActions[index];

        if (action) {
          selectTileActionMode(action);
        }
      });
    }
  }

  return {
    container,
    width,
    height,
    getSelectedItemId() {
      return selectedItemId;
    },
    getSelectedQuantity() {
      return selectedQuantity;
    },
    getSelectedTool() {
      return selectedTool;
    },
    getSelectedTileActionMode() {
      return selectedTileActionMode;
    },
    setSelectedQuantity(quantity: number) {
      selectedQuantity = Math.max(1, quantity);
      args.onQuantityChange(selectedQuantity);
    },
    setAvailableActions(actions: TileActionMode[]) {
      availableActions = actions;
      if (
        selectedTileActionMode !== null &&
        !availableActions.includes(selectedTileActionMode)
      ) {
        selectedTileActionMode = null;
      }

      if (selectedTileActionMode === null) {
        selectedTileActionMode = availableActions[0] ?? null;
      }

      args.onTileActionModeChange(selectedTileActionMode);
      renderActions();
    },
    updateInventory(nextInventory: InventoryState) {
      inventory = nextInventory;
      renderInventory();
    },
    containsPoint(x: number, y: number) {
      return containsLocalPoint(x, y);
    },
    setPointerPosition(x: number, y: number) {
      updateManualHover(x, y);
    },
    clearPointerHover() {
      inventorySlots.forEach((slot) => {
        slot.hovered = false;
        syncInventorySlotHover(slot);
      });
      actionSlots.forEach((slot) => setActionHovered(slot, false));
      setSleepHovered(false);
    },
    handlePointerDown(x: number, y: number) {
      const toolSlot = toolSlots.find((slot) => isPointInSlot(x, y, slot));

      if (toolSlot) {
        selectTool(toolSlot.tool);
        return true;
      }

      const inventoryIndex = inventorySlots.findIndex((slot) =>
        isPointInSlot(x, y, slot)
      );

      if (inventoryIndex >= 0) {
        selectInventorySlot(inventoryIndex);
        return true;
      }

      const actionSlot = actionSlots.find(
        (slot) =>
          x >= slot.x &&
          x <= slot.x + slot.width &&
          y >= slot.y &&
          y <= slot.y + slot.height
      );

      if (actionSlot) {
        actionSlot.pressed = true;
        tweenActionSlot(actionSlot, actionPressScale, 70, "Quad.easeOut");
        selectTileActionMode(actionSlot.action);
        scene.time.delayedCall(90, () => {
          actionSlot.pressed = false;
          tweenActionSlot(
            actionSlot,
            actionSlot.hovered ? actionHoverScale : 1,
            130,
            "Back.easeOut"
          );
        });
        return true;
      }

      if (
        sleepSlot &&
        x >= sleepSlot.x &&
        x <= sleepSlot.x + sleepSlot.width &&
        y >= sleepSlot.y &&
        y <= sleepSlot.y + sleepSlot.height
      ) {
        pressSleepSlot();
        return true;
      }

      return containsLocalPoint(x, y);
    },
  };

  function buildSlots() {
    const totalSlotCount = tools.length + inventorySlotCount;
    const contentWidth =
      panelPadding * 2 +
      totalSlotCount * slotSize +
      Math.max(0, totalSlotCount - 1) * slotGap +
      dividerWidth;
    let cursorX = (width - contentWidth) / 2 + panelPadding;
    const centerY = panelHeight / 2;

    tools.forEach((tool) => {
      const slotCenterX = cursorX + slotSize / 2;
      const slot = createSlot(slotCenterX, centerY);
      const icon = scene.add
        .image(slotCenterX, centerY + 5, UI_ICONS[tool.icon].key)
        .setDisplaySize(48, 48)
        .setOrigin(0.5);
      const shortcut = makeShortcutText(
        scene,
        slotCenterX + 40,
        centerY - 44,
        tool.shortcut
      );
      const label = makeHudText(
        scene,
        slotCenterX - 38,
        centerY + 36,
        tool.label,
        11,
        "#f6efd7",
        76
      ).setAlign("center");

      slot.background.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData
        ) => {
          event.stopPropagation();
          selectTool(tool.tool);
        }
      );
      slot.background.on("pointerover", () => slot.hover.setVisible(true));
      slot.background.on("pointerout", () => slot.hover.setVisible(false));
      container.add([
        slot.background,
        slot.hover,
        slot.selected,
        icon,
        shortcut,
        label,
      ]);
      toolSlots.push({ tool: tool.tool, x: slotCenterX, y: centerY, ...slot });
      cursorX += slotSize + slotGap;
    });

    cursorX -= slotGap / 2;
    divider.setPosition(cursorX + dividerWidth / 2, centerY);
    cursorX += dividerWidth + slotGap / 2;

    for (let index = 0; index < inventorySlotCount; index += 1) {
      const slotCenterX = cursorX + slotSize / 2;
      const slot = createSlot(slotCenterX, centerY);
      const icon = scene.add
        .image(slotCenterX, centerY + 5, UI_ICONS.forage.key)
        .setDisplaySize(inventoryIconSize, inventoryIconSize)
        .setOrigin(0.5)
        .setVisible(false);
      const count = makeHudText(
        scene,
        slotCenterX + 12,
        centerY + 22,
        "",
        12,
        "#f6efd7",
        26
      );
      const label = makeHudText(
        scene,
        slotCenterX - 40,
        centerY + 44,
        "",
        9,
        "#dce8e2",
        80
      ).setAlign("center");
      const inventorySlot: InventorySlot = {
        itemId: null,
        x: slotCenterX,
        y: centerY,
        ...slot,
        icon,
        label,
        count,
        hovered: false,
      };

      slot.background.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData
        ) => {
          event.stopPropagation();
          selectInventorySlot(index);
        }
      );
      slot.background.on("pointerover", () =>
        setInventorySlotHovered(index, true)
      );
      slot.background.on("pointerout", () =>
        setInventorySlotHovered(index, false)
      );
      container.add([
        slot.background,
        slot.hover,
        slot.selected,
        icon,
        count,
        label,
      ]);
      inventorySlots.push(inventorySlot);
      cursorX += slotSize + slotGap;
    }

    sleepSlot = createSleepSlot();
  }

  function createSlot(x: number, y: number) {
    const background = scene.add
      .image(x, y, UI_ASSETS.inventorySlot.key)
      .setDisplaySize(slotSize, slotSize)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const hover = scene.add
      .image(x, y, UI_ASSETS.inventorySlotHover.key)
      .setDisplaySize(slotSize, slotSize)
      .setOrigin(0.5)
      .setAlpha(0.66)
      .setVisible(false);
    const selected = scene.add
      .image(x, y, UI_ASSETS.inventorySlotSelected.key)
      .setDisplaySize(slotSize, slotSize)
      .setOrigin(0.5)
      .setVisible(false);

    return { background, hover, selected };
  }

  function selectTool(tool: EquippedTool) {
    selectedTool = tool;
    selectedTileActionMode = null;
    syncToolSelection();
    args.onToolChange(tool);
  }

  function selectInventorySlot(index: number) {
    const itemId = inventorySlots[index].itemId;

    if (itemId === null) {
      return;
    }

    selectedItemId = selectedItemId === itemId ? null : itemId;
    selectedQuantity = 1;
    args.onItemSelect(selectedItemId);
    args.onQuantityChange(selectedQuantity);
    syncInventorySelection();
  }

  function renderInventory() {
    const visibleSlots = inventory.slots.slice(0, inventorySlots.length);

    if (
      selectedItemId !== null &&
      !inventory.slots.some((slot) => slot.itemId === selectedItemId)
    ) {
      selectedItemId = null;
      args.onItemSelect(null);
    }

    inventorySlots.forEach((slot, index) => {
      const item = visibleSlots[index];

      slot.itemId = item?.itemId ?? null;
      slot.icon.setVisible(Boolean(item));
      slot.count.setText(item && item.quantity > 1 ? `${item.quantity}` : "");
      slot.label.setText(item ? compactItemLabel(item.itemId) : "");
      if (item) {
        const frame = getItemSpriteFrame(item.itemId);
        const frameTexture = getObjectSpriteFrameTexture(
          scene,
          frame.assetId,
          frame.frame
        );

        slot.icon.setTexture(frameTexture.key);
      }
      if (!item) {
        slot.hovered = false;
      }
      syncInventorySlotHover(slot);
    });
    syncInventorySelection();
  }

  function renderActions() {
    actionSlots.forEach((slot) => slot.container.destroy(true));
    actionSlots.length = 0;
    actionHint.setVisible(availableActions.length === 0);

    availableActions.forEach((action, index) => {
      const definition = contextActions[action];
      const x = index * (actionButtonWidth + actionButtonGap);
      const slot = scene.add.container(x, 0);
      const bg = scene.add
        .image(
          actionButtonWidth / 2,
          actionButtonHeight / 2,
          UI_ASSETS.actionButtonBg.key
        )
        .setDisplaySize(actionButtonWidth, actionButtonHeight)
        .setOrigin(0.5)
        .setAlpha(0.98)
        .setInteractive({ useHandCursor: true });
      const selection = scene.add
        .rectangle(
          actionButtonWidth / 2,
          actionButtonHeight / 2,
          actionButtonWidth - 10,
          actionButtonHeight - 10,
          0xf1d38b,
          0.14
        )
        .setStrokeStyle(2, 0xf1d38b, 0.9)
        .setOrigin(0.5)
        .setVisible(action === selectedTileActionMode);
      const icon = scene.add
        .image(28, actionButtonHeight / 2, UI_ICONS[definition.icon].key)
        .setDisplaySize(30, 30)
        .setOrigin(0.5);
      const label = makeActionLabel(
        scene,
        52,
        actionButtonHeight / 2 - 1,
        definition.label
      );
      const shortcut = makeActionShortcut(
        scene,
        actionButtonWidth - 18,
        actionButtonHeight / 2 - 1,
        `${index + 4}`
      );
      const actionSlot: ActionSlot = {
        action,
        x: actionRoot.x + x,
        y: actionRoot.y,
        width: actionButtonWidth,
        height: actionButtonHeight,
        container: slot,
        background: bg,
        selection,
        icon,
        label,
        shortcut,
        hovered: false,
        pressed: false,
      };

      bg.on("pointerover", () => setActionHovered(actionSlot, true));
      bg.on("pointerout", () => {
        actionSlot.pressed = false;
        setActionHovered(actionSlot, false);
      });
      bg.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData
        ) => {
          event.stopPropagation();
          actionSlot.pressed = true;
          tweenActionSlot(actionSlot, actionPressScale, 70, "Quad.easeOut");
          selectTileActionMode(action);
        }
      );
      bg.on("pointerup", () => {
        actionSlot.pressed = false;
        tweenActionSlot(
          actionSlot,
          actionSlot.hovered ? actionHoverScale : 1,
          160,
          "Back.easeOut"
        );
      });
      bg.on("pointerupoutside", () => {
        actionSlot.pressed = false;
        setActionHovered(actionSlot, false);
      });
      slot.add([bg, selection, icon, label, shortcut]);
      actionRoot.add(slot);
      actionSlots.push(actionSlot);
    });
    syncActionSelection();
  }

  function createSleepSlot(): SleepSlot {
    const x = width - panelPadding - sleepButtonWidth;
    const y = actionRoot.y;
    const slot = scene.add.container(x, y);
    const bg = scene.add
      .image(
        sleepButtonWidth / 2,
        actionButtonHeight / 2,
        UI_ASSETS.actionButtonBg.key
      )
      .setDisplaySize(sleepButtonWidth, actionButtonHeight)
      .setOrigin(0.5)
      .setAlpha(0.98)
      .setInteractive({ useHandCursor: true });
    const icon = scene.add
      .image(28, actionButtonHeight / 2, UI_ICONS.sleep.key)
      .setDisplaySize(30, 30)
      .setOrigin(0.5);
    const label = makeActionLabel(
      scene,
      52,
      actionButtonHeight / 2 - 1,
      "Sleep"
    );
    const sleep: SleepSlot = {
      x,
      y,
      width: sleepButtonWidth,
      height: actionButtonHeight,
      container: slot,
      background: bg,
      icon,
      label,
      hovered: false,
      pressed: false,
    };

    bg.on("pointerover", () => setSleepHovered(true));
    bg.on("pointerout", () => {
      sleep.pressed = false;
      setSleepHovered(false);
    });
    bg.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        pressSleepSlot();
      }
    );
    bg.on("pointerup", () => {
      sleep.pressed = false;
      tweenSleepSlot(sleep.hovered ? actionHoverScale : 1, 160, "Back.easeOut");
    });
    bg.on("pointerupoutside", () => {
      sleep.pressed = false;
      setSleepHovered(false);
    });

    slot.add([bg, icon, label]);
    container.add(slot);
    syncSleepSlot();

    return sleep;
  }

  function updateManualHover(x: number, y: number) {
    inventorySlots.forEach((slot) => {
      slot.hovered = isPointInSlot(x, y, slot);
      syncInventorySlotHover(slot);
    });
    actionSlots.forEach((slot) => {
      const hovered =
        x >= slot.x &&
        x <= slot.x + slot.width &&
        y >= slot.y &&
        y <= slot.y + slot.height;

      if (slot.hovered !== hovered) {
        setActionHovered(slot, hovered);
      }
    });

    if (sleepSlot) {
      const hovered =
        x >= sleepSlot.x &&
        x <= sleepSlot.x + sleepSlot.width &&
        y >= sleepSlot.y &&
        y <= sleepSlot.y + sleepSlot.height;

      if (sleepSlot.hovered !== hovered) {
        setSleepHovered(hovered);
      }
    }
  }

  function containsLocalPoint(x: number, y: number) {
    return x >= 0 && x <= width && y >= 0 && y <= height;
  }

  function isPointInSlot(x: number, y: number, slot: { x: number; y: number }) {
    return (
      x >= slot.x - slotSize / 2 &&
      x <= slot.x + slotSize / 2 &&
      y >= slot.y - slotSize / 2 &&
      y <= slot.y + slotSize / 2
    );
  }

  function syncToolSelection() {
    toolSlots.forEach((slot) =>
      slot.selected.setVisible(slot.tool === selectedTool)
    );
  }

  function syncInventorySelection() {
    inventorySlots.forEach((slot) =>
      slot.selected.setVisible(
        slot.itemId !== null && slot.itemId === selectedItemId
      )
    );
  }

  function setInventorySlotHovered(index: number, hovered: boolean) {
    const slot = inventorySlots[index];

    if (!slot) {
      return;
    }

    slot.hovered = hovered;
    syncInventorySlotHover(slot);
  }

  function syncInventorySlotHover(slot: InventorySlot) {
    const active = slot.hovered && slot.itemId !== null;

    slot.hover.setVisible(active);
    slot.background.setTint(active ? 0xfff1b8 : 0xffffff);
    slot.icon.setDisplaySize(
      active ? inventoryIconHoverSize : inventoryIconSize,
      active ? inventoryIconHoverSize : inventoryIconSize
    );
    slot.label.setColor(active ? "#fff4c7" : "#dce8e2");
    slot.count.setColor(active ? "#fff4c7" : "#f6efd7");
  }

  function syncActionSelection() {
    actionSlots.forEach((slot) => {
      const selected = slot.action === selectedTileActionMode;
      const highlighted = selected || slot.hovered;

      slot.selection.setVisible(selected);
      slot.background.setTint(
        selected ? 0xfff1b8 : slot.hovered ? 0xfff7d3 : 0xffffff
      );
      slot.label.setColor(selected ? "#3d2011" : "#f6efd7");
      slot.shortcut.setColor(highlighted ? "#3d2011" : "#f6efd7");
      slot.icon.setAlpha(highlighted ? 1 : 0.9);
    });
  }

  function selectTileActionMode(action: TileActionMode) {
    selectedTileActionMode = action;
    args.onTileActionModeChange(action);
    syncActionSelection();
  }

  function setActionHovered(slot: ActionSlot, hovered: boolean) {
    slot.hovered = hovered;
    if (!slot.pressed) {
      tweenActionSlot(
        slot,
        hovered ? actionHoverScale : 1,
        90,
        "Cubic.easeOut"
      );
    }
    syncActionSelection();
  }

  function tweenActionSlot(
    slot: ActionSlot,
    scale: number,
    duration: number,
    ease: string
  ) {
    scene.tweens.add({
      duration,
      ease,
      scale,
      targets: slot.container,
    });
  }

  function pressSleepSlot() {
    if (!sleepSlot) {
      return;
    }

    sleepSlot.pressed = true;
    tweenSleepSlot(actionPressScale, 70, "Quad.easeOut");
    args.onSleep();
    scene.time.delayedCall(90, () => {
      if (!sleepSlot) {
        return;
      }

      sleepSlot.pressed = false;
      tweenSleepSlot(
        sleepSlot.hovered ? actionHoverScale : 1,
        130,
        "Back.easeOut"
      );
    });
  }

  function setSleepHovered(hovered: boolean) {
    if (!sleepSlot) {
      return;
    }

    sleepSlot.hovered = hovered;
    if (!sleepSlot.pressed) {
      tweenSleepSlot(hovered ? actionHoverScale : 1, 90, "Cubic.easeOut");
    }
    syncSleepSlot();
  }

  function syncSleepSlot() {
    if (!sleepSlot) {
      return;
    }

    sleepSlot.background.setTint(sleepSlot.hovered ? 0xfff7d3 : 0xffffff);
    sleepSlot.label.setColor(sleepSlot.hovered ? "#3d2011" : "#f6efd7");
    sleepSlot.icon.setAlpha(sleepSlot.hovered ? 1 : 0.9);
  }

  function tweenSleepSlot(scale: number, duration: number, ease: string) {
    if (!sleepSlot) {
      return;
    }

    scene.tweens.add({
      duration,
      ease,
      scale,
      targets: sleepSlot.container,
    });
  }
};
