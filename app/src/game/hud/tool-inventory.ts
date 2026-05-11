import Phaser from "phaser";
import { UI_ASSETS, UI_ICONS } from "../../assets/ui-assets";
import type { ContextAction, EquippedTool, InventoryState } from "../types";
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
  action: ContextAction;
  x: number;
  y: number;
  width: number;
  height: number;
  container: Phaser.GameObjects.Container;
  selected: Phaser.GameObjects.Image;
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

export const createToolInventory = (
  scene: Phaser.Scene,
  args: {
    onToolChange: (tool: EquippedTool) => void;
    onContextActionChange: (action: ContextAction | null) => void;
    onItemSelect: (itemId: number | null) => void;
    onQuantityChange: (quantity: number) => void;
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
  const actionRoot = scene.add.container(360, panelHeight + 2);
  const toolSlots: ToolSlot[] = [];
  const inventorySlots: InventorySlot[] = [];
  const actionSlots: ActionSlot[] = [];
  let selectedTool: EquippedTool = "hand";
  let selectedContextAction: ContextAction | null = null;
  let availableActions: ContextAction[] = [];
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
    getSelectedContextAction() {
      return selectedContextAction;
    },
    setSelectedQuantity(quantity: number) {
      selectedQuantity = Math.max(1, quantity);
      args.onQuantityChange(selectedQuantity);
    },
    setAvailableActions(actions: ContextAction[]) {
      availableActions = actions;
      if (
        selectedContextAction !== null &&
        !availableActions.includes(selectedContextAction)
      ) {
        selectedContextAction = null;
      }

      if (selectedContextAction === null) {
        selectedContextAction = availableActions[0] ?? null;
      }

      args.onContextActionChange(selectedContextAction);
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
        selectedContextAction = actionSlot.action;
        args.onContextActionChange(actionSlot.action);
        syncActionSelection();
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
        .setDisplaySize(42, 42)
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
    selectedContextAction = null;
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
      const x = index * 110;
      const slot = scene.add.container(x, 0);
      const bg = scene.add
        .image(49, 22, UI_ASSETS.actionButtonBg.key)
        .setDisplaySize(98, 44)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const selected = scene.add
        .image(49, 22, UI_ASSETS.inventorySlotSelected.key)
        .setDisplaySize(98, 44)
        .setOrigin(0.5)
        .setAlpha(0.72)
        .setVisible(action === selectedContextAction);
      const icon = scene.add
        .image(23, 22, UI_ICONS[definition.icon].key)
        .setDisplaySize(26, 26);
      const label = makeHudText(
        scene,
        42,
        15,
        definition.label,
        10,
        "#f6efd7",
        50
      );

      bg.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData
        ) => {
          event.stopPropagation();
          selectedContextAction = action;
          args.onContextActionChange(action);
          syncActionSelection();
        }
      );
      slot.add([bg, selected, icon, label]);
      actionRoot.add(slot);
      actionSlots.push({
        action,
        x: actionRoot.x + x,
        y: actionRoot.y,
        width: 98,
        height: 44,
        container: slot,
        selected,
      });
    });
  }

  function updateManualHover(x: number, y: number) {
    inventorySlots.forEach((slot) => {
      slot.hovered = isPointInSlot(x, y, slot);
      syncInventorySlotHover(slot);
    });
  }

  function containsLocalPoint(x: number, y: number) {
    return x >= 0 && x <= width && y >= 0 && y <= height;
  }

  function isPointInSlot(
    x: number,
    y: number,
    slot: { x: number; y: number }
  ) {
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
    slot.icon.setDisplaySize(active ? 46 : 42, active ? 46 : 42);
    slot.label.setColor(active ? "#fff4c7" : "#dce8e2");
    slot.count.setColor(active ? "#fff4c7" : "#f6efd7");
  }

  function syncActionSelection() {
    actionSlots.forEach((slot) =>
      slot.selected.setVisible(slot.action === selectedContextAction)
    );
  }
};
