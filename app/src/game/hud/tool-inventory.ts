import Phaser from "phaser";
import { UI_ASSETS, UI_ICONS } from "../../assets/ui-assets";
import type { FarmActionMode, InventoryState } from "../types";
import { compactItemLabel, makeHudText } from "./text";
import { tools } from "./types";

type ToolSlot = {
  mode: FarmActionMode;
  container: Phaser.GameObjects.Container;
  selected: Phaser.GameObjects.Image;
};

type InventorySlot = {
  itemId: number | null;
  container: Phaser.GameObjects.Container;
  selected: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
};

export const createToolInventory = (
  scene: Phaser.Scene,
  args: {
    onModeChange: (mode: FarmActionMode) => void;
    onItemSelect: (itemId: number | null) => void;
    onQuantityChange: (quantity: number) => void;
  }
) => {
  const width = 860;
  const height = 120;
  const container = scene.add.container(0, 0).setScrollFactor(0);
  const bg = scene.add
    .image(0, 0, UI_ASSETS.inventoryPanel.key)
    .setOrigin(0)
    .setDisplaySize(width, height);
  const toolSlots: ToolSlot[] = tools.map((tool, index) => {
    const x = 22 + index * 82;
    const slot = scene.add.container(x, 17);
    const slotBg = scene.add
      .image(0, 0, UI_ASSETS.inventorySlot.key)
      .setOrigin(0);
    const selected = scene.add
      .image(0, 0, UI_ASSETS.inventorySlotSelected.key)
      .setOrigin(0)
      .setVisible(tool.mode === "move");
    const icon = scene.add
      .image(33, 28, UI_ICONS[tool.icon].key)
      .setDisplaySize(34, 34);
    const shortcut = makeHudText(scene, 8, 6, tool.shortcut, 10, "#10191f", 18);
    const label = makeHudText(scene, 5, 66, tool.label, 10, "#f6efd7", 58);

    label.setAlign("center");
    slot.add([slotBg, selected, icon, shortcut, label]);
    slot
      .setSize(68, 84)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 68, 84),
        Phaser.Geom.Rectangle.Contains
      )
      .on("pointerdown", () => selectMode(tool.mode));
    return { mode: tool.mode, container: slot, selected };
  });
  const inventoryLabel = makeHudText(
    scene,
    698,
    16,
    "Inventory",
    12,
    "#f1d38b",
    130
  );
  const inventorySlots: InventorySlot[] = Array.from(
    { length: 4 },
    (_, index) => {
      const slot = scene.add.container(692 + index * 38, 42);
      const slotBg = scene.add
        .image(0, 0, UI_ASSETS.inventorySlot.key)
        .setOrigin(0)
        .setDisplaySize(34, 34);
      const selected = scene.add
        .image(0, 0, UI_ASSETS.inventorySlotSelected.key)
        .setOrigin(0)
        .setDisplaySize(34, 34)
        .setVisible(false);
      const icon = scene.add
        .image(17, 15, UI_ICONS.forage.key)
        .setDisplaySize(22, 22)
        .setVisible(false);
      const count = makeHudText(scene, 13, 20, "", 9, "#f6efd7", 20);
      const label = makeHudText(scene, -6, 38, "", 8, "#dce8e2", 46);

      label.setAlign("center");
      slot.add([slotBg, selected, icon, count, label]);
      slot
        .setSize(34, 58)
        .setInteractive(
          new Phaser.Geom.Rectangle(0, 0, 34, 58),
          Phaser.Geom.Rectangle.Contains
        )
        .on("pointerdown", () => {
          const itemId = inventorySlots[index].itemId;

          if (itemId === null) {
            return;
          }

          selectedItemId = selectedItemId === itemId ? null : itemId;
          selectedQuantity = 1;
          args.onItemSelect(selectedItemId);
          args.onQuantityChange(selectedQuantity);
          syncInventorySelection();
        });

      return { itemId: null, container: slot, selected, icon, label, count };
    }
  );
  let selectedItemId: number | null = null;
  let selectedQuantity = 1;
  let inventory: InventoryState = { slots: [] };

  container.add([
    bg,
    ...toolSlots.map((slot) => slot.container),
    inventoryLabel,
    ...inventorySlots.map((slot) => slot.container),
  ]);

  const keyboard = scene.input.keyboard;
  if (keyboard) {
    tools.forEach((tool, index) => {
      keyboard.on(`keydown-${index + 1}`, () => selectMode(tool.mode));
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
    setSelectedQuantity(quantity: number) {
      selectedQuantity = Math.max(1, quantity);
      args.onQuantityChange(selectedQuantity);
    },
    updateInventory(nextInventory: InventoryState) {
      inventory = nextInventory;
      renderInventory();
    },
  };

  function selectMode(mode: FarmActionMode) {
    toolSlots.forEach((slot) => slot.selected.setVisible(slot.mode === mode));
    args.onModeChange(mode);
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
    });
    syncInventorySelection();
  }

  function syncInventorySelection() {
    inventorySlots.forEach((slot) =>
      slot.selected.setVisible(
        slot.itemId !== null && slot.itemId === selectedItemId
      )
    );
  }
};
