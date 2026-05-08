import Phaser from "phaser";
import {
  describeFarmRules,
  drawFarmPlaceholder,
  FARM_TYPES,
  FarmKind,
  getFarmItemLabel,
} from "./farm";
import type { InventorySlotState, InventoryState } from "./types";
import type { FarmActionMode } from "./types";

const PANEL_X = 700;
const PANEL_Y = 84;
const PANEL_WIDTH = 212;
const GRID_TOOLBAR_X = 34;
const INVENTORY_Y = PANEL_Y + 58;
const INVENTORY_HEIGHT = 262;
const CATALOG_Y = INVENTORY_Y + INVENTORY_HEIGHT + 12;
const ROW_HEIGHT = 68;
const INVENTORY_ROW_HEIGHT = 12;
const VISIBLE_INVENTORY_ROWS = 16;
const TOOLBAR_Y = 12;
const TOOL_BUTTONS: Array<{ mode: FarmActionMode; label: string }> = [
  { mode: "move", label: "Move" },
  { mode: "till", label: "Hoe" },
  { mode: "water", label: "Water" },
  { mode: "plant", label: "Plant" },
  { mode: "harvest", label: "Harvest" },
  { mode: "chop", label: "Axe" },
  { mode: "grab", label: "Grab" },
  { mode: "drop", label: "Drop" },
];

type InventoryRow = {
  itemId: number;
  background: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
};

export const createFarmCatalog = (
  scene: Phaser.Scene,
  onModeChange?: (mode: FarmActionMode) => void,
  onItemSelect?: (itemId: number | null) => void,
  onQuantityChange?: (quantity: number) => void
) => {
  const panel = scene.add.graphics();

  panel.fillStyle(0xf7f1e5, 1);
  panel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, 670, 8);
  panel.lineStyle(1, 0xc7d8c4, 1);
  panel.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, 670, 8);

  scene.add
    .text(PANEL_X + 14, PANEL_Y + 14, "Farm Catalog", {
      color: "#17211e",
      fontFamily: "Inter, sans-serif",
      fontSize: "18px",
      fontStyle: "700",
    })
    .setDepth(5);

  scene.add
    .text(PANEL_X + 14, PANEL_Y + 40, "Seeds, harvests, and tree rules", {
      color: "#4b6259",
      fontFamily: "Inter, sans-serif",
      fontSize: "11px",
    })
    .setDepth(5);

  const inventoryPanel = scene.add.graphics();
  inventoryPanel.fillStyle(0xe7f1df, 1);
  inventoryPanel.fillRoundedRect(
    PANEL_X + 10,
    INVENTORY_Y,
    PANEL_WIDTH - 20,
    INVENTORY_HEIGHT,
    7
  );
  inventoryPanel.lineStyle(1, 0xb8cdb4, 0.9);
  inventoryPanel.strokeRoundedRect(
    PANEL_X + 10,
    INVENTORY_Y,
    PANEL_WIDTH - 20,
    INVENTORY_HEIGHT,
    7
  );

  scene.add
    .text(PANEL_X + 22, INVENTORY_Y + 10, "Player Inventory", {
      color: "#17211e",
      fontFamily: "Inter, sans-serif",
      fontSize: "13px",
      fontStyle: "700",
    })
    .setDepth(5);

  const inventorySummaryText = scene.add
    .text(PANEL_X + 22, INVENTORY_Y + 31, "Waiting for player inventory...", {
      color: "#344a42",
      fixedWidth: PANEL_WIDTH - 44,
      fontFamily: "Inter, sans-serif",
      fontSize: "10px",
      lineSpacing: 2,
      wordWrap: { width: PANEL_WIDTH - 44 },
    })
    .setDepth(5);
  const selectedItemText = scene.add
    .text(PANEL_X + 22, INVENTORY_Y + INVENTORY_HEIGHT - 18, "Selected: none", {
      color: "#17211e",
      fixedWidth: PANEL_WIDTH - 44,
      fontFamily: "Inter, sans-serif",
      fontSize: "9px",
      fontStyle: "700",
      wordWrap: { width: PANEL_WIDTH - 44 },
    })
    .setDepth(5);
  const dropQuantityText = scene.add
    .text(PANEL_X + 120, INVENTORY_Y + 10, "Drop x1", {
      color: "#17211e",
      fixedWidth: 58,
      fontFamily: "Inter, sans-serif",
      fontSize: "9px",
      fontStyle: "700",
      align: "center",
    })
    .setDepth(6);

  const inventoryTexts = new Map<number, Phaser.GameObjects.Text>();
  const inventoryRows: InventoryRow[] = [];
  const toolButtons: Array<{
    mode: FarmActionMode;
    background: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
  }> = [];
  let selectedMode: FarmActionMode = "move";
  let selectedItemId: number | null = null;
  let selectedItemQuantity = 0;
  let selectedDropQuantity = 1;
  let hiddenInventoryRows = 0;

  const destroyInventoryRows = () => {
    for (const row of inventoryRows) {
      row.background.destroy();
      row.label.destroy();
    }

    inventoryRows.length = 0;
  };

  const refreshSelectedItem = () => {
    selectedDropQuantity = Math.max(
      1,
      Math.min(selectedDropQuantity, Math.max(1, selectedItemQuantity))
    );
    dropQuantityText.setText(`Drop x${selectedDropQuantity}`);
    onQuantityChange?.(selectedDropQuantity);
    selectedItemText.setText(
      selectedItemId
        ? `Selected: ${getFarmItemLabel(selectedItemId)}${
            hiddenInventoryRows ? ` · +${hiddenInventoryRows}` : ""
          }`
        : `Selected: none${
            hiddenInventoryRows ? ` · +${hiddenInventoryRows}` : ""
          }`
    );

    for (const row of inventoryRows) {
      row.background.clear();
      row.background.fillStyle(
        row.itemId === selectedItemId ? 0xffe0a3 : 0xf7f1e5,
        1
      );
      row.background.fillRoundedRect(
        PANEL_X + 18,
        row.label.y - 2,
        PANEL_WIDTH - 36,
        INVENTORY_ROW_HEIGHT,
        5
      );
      row.background.lineStyle(
        1,
        row.itemId === selectedItemId ? 0xa26924 : 0xd3c9b3,
        0.95
      );
      row.background.strokeRoundedRect(
        PANEL_X + 18,
        row.label.y - 2,
        PANEL_WIDTH - 36,
        INVENTORY_ROW_HEIGHT,
        5
      );
    }
  };

  const changeDropQuantity = (delta: number) => {
    selectedDropQuantity = Math.max(
      1,
      Math.min(selectedDropQuantity + delta, Math.max(1, selectedItemQuantity))
    );
    refreshSelectedItem();
  };

  const refreshToolButtons = () => {
    for (const button of toolButtons) {
      button.background.clear();
      button.background.fillStyle(
        button.mode === selectedMode ? 0xffe0a3 : 0xf7f1e5,
        1
      );
      button.background.fillRoundedRect(
        button.label.x - 7,
        TOOLBAR_Y,
        64,
        25,
        7
      );
      button.background.lineStyle(
        1,
        button.mode === selectedMode ? 0xa26924 : 0xc7d8c4,
        1
      );
      button.background.strokeRoundedRect(
        button.label.x - 7,
        TOOLBAR_Y,
        64,
        25,
        7
      );
    }
  };

  TOOL_BUTTONS.forEach((tool, index) => {
    const x = GRID_TOOLBAR_X + index * 72;
    const background = scene.add.graphics().setDepth(8);
    const label = scene.add
      .text(x, TOOLBAR_Y + 6, tool.label, {
        color: "#17211e",
        fixedWidth: 50,
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "700",
        align: "center",
      })
      .setDepth(9);

    background
      .setInteractive(
        new Phaser.Geom.Rectangle(x - 7, TOOLBAR_Y, 64, 25),
        Phaser.Geom.Rectangle.Contains
      )
      .on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData
        ) => {
          event.stopPropagation();
          selectedMode = tool.mode;
          refreshToolButtons();
          onModeChange?.(selectedMode);
        }
      );

    toolButtons.push({ mode: tool.mode, background, label });
  });
  refreshToolButtons();

  [
    { label: "-", delta: -1, x: PANEL_X + 180 },
    { label: "+", delta: 1, x: PANEL_X + 196 },
  ].forEach((control) => {
    const background = scene.add.graphics().setDepth(8);
    const label = scene.add
      .text(control.x, INVENTORY_Y + 9, control.label, {
        color: "#17211e",
        fixedWidth: 12,
        fontFamily: "Inter, sans-serif",
        fontSize: "10px",
        fontStyle: "700",
        align: "center",
      })
      .setDepth(9);

    background.fillStyle(0xf7f1e5, 1);
    background.fillRoundedRect(control.x - 2, INVENTORY_Y + 8, 14, 14, 4);
    background.lineStyle(1, 0xc7d8c4, 1);
    background.strokeRoundedRect(control.x - 2, INVENTORY_Y + 8, 14, 14, 4);
    background
      .setInteractive(
        new Phaser.Geom.Rectangle(control.x - 2, INVENTORY_Y + 8, 14, 14),
        Phaser.Geom.Rectangle.Contains
      )
      .on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData
        ) => {
          event.stopPropagation();
          changeDropQuantity(control.delta);
        }
      );
    label.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        changeDropQuantity(control.delta);
      }
    );
  });

  const createInventoryRow = (slot: InventorySlotState, index: number) => {
    const rowY = INVENTORY_Y + 31 + index * (INVENTORY_ROW_HEIGHT + 1);
    const background = scene.add.graphics().setDepth(5);
    const label = scene.add
      .text(
        PANEL_X + 26,
        rowY,
        `${getFarmItemLabel(slot.itemId)} x${slot.quantity}`,
        {
          color: "#17211e",
          fixedWidth: PANEL_WIDTH - 52,
          fontFamily: "Inter, sans-serif",
          fontSize: "9px",
          fontStyle: "700",
          wordWrap: { width: PANEL_WIDTH - 52 },
        }
      )
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    background
      .setInteractive(
        new Phaser.Geom.Rectangle(
          PANEL_X + 18,
          rowY - 2,
          PANEL_WIDTH - 36,
          INVENTORY_ROW_HEIGHT
        ),
        Phaser.Geom.Rectangle.Contains
      )
      .on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData
        ) => {
          event.stopPropagation();
          selectedItemId = selectedItemId === slot.itemId ? null : slot.itemId;
          selectedItemQuantity =
            selectedItemId === slot.itemId ? slot.quantity : 0;
          refreshSelectedItem();
          onItemSelect?.(selectedItemId);
        }
      );
    label.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        selectedItemId = selectedItemId === slot.itemId ? null : slot.itemId;
        selectedItemQuantity =
          selectedItemId === slot.itemId ? slot.quantity : 0;
        refreshSelectedItem();
        onItemSelect?.(selectedItemId);
      }
    );

    inventoryRows.push({ itemId: slot.itemId, background, label });
  };

  FARM_TYPES.forEach((farm, index) => {
    const rowY = CATALOG_Y + index * ROW_HEIGHT;
    const row = scene.add.graphics();

    row.fillStyle(farm.kind === FarmKind.tree ? 0xe7f1df : 0xf3ead6, 1);
    row.fillRoundedRect(
      PANEL_X + 10,
      rowY,
      PANEL_WIDTH - 20,
      ROW_HEIGHT - 10,
      7
    );
    row.lineStyle(1, 0xd3c9b3, 0.8);
    row.strokeRoundedRect(
      PANEL_X + 10,
      rowY,
      PANEL_WIDTH - 20,
      ROW_HEIGHT - 10,
      7
    );

    drawFarmPlaceholder(scene, farm, PANEL_X + 36, rowY + 36, 0.68);

    scene.add
      .text(PANEL_X + 66, rowY + 8, farm.label, {
        color: "#17211e",
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        fontStyle: "700",
      })
      .setDepth(5);

    scene.add
      .text(PANEL_X + 66, rowY + 25, describeFarmRules(farm), {
        color: "#344a42",
        fixedWidth: 122,
        fontFamily: "Inter, sans-serif",
        fontSize: "9px",
        lineSpacing: 1,
        wordWrap: { width: 122 },
      })
      .setDepth(5);

    const inventoryText = scene.add
      .text(PANEL_X + 66, rowY + 51, "Have: waiting", {
        color: "#17211e",
        fixedWidth: 122,
        fontFamily: "Inter, sans-serif",
        fontSize: "8px",
        fontStyle: "700",
        wordWrap: { width: 122 },
      })
      .setDepth(5);

    inventoryTexts.set(farm.farmTypeId, inventoryText);
  });

  return {
    updateInventory(inventory: InventoryState) {
      const quantities = new Map(
        inventory.slots.map((slot) => [slot.itemId, slot.quantity])
      );
      const visibleSlots = inventory.slots.slice(0, VISIBLE_INVENTORY_ROWS);
      hiddenInventoryRows = Math.max(
        0,
        inventory.slots.length - visibleSlots.length
      );

      if (
        selectedItemId !== null &&
        !inventory.slots.some((slot) => slot.itemId === selectedItemId)
      ) {
        selectedItemId = null;
        selectedItemQuantity = 0;
        onItemSelect?.(selectedItemId);
      }

      selectedItemQuantity =
        inventory.slots.find((slot) => slot.itemId === selectedItemId)
          ?.quantity ?? 0;

      destroyInventoryRows();
      inventorySummaryText.setVisible(inventory.slots.length === 0);
      inventorySummaryText.setText(inventory.slots.length === 0 ? "Empty" : "");

      visibleSlots.forEach(createInventoryRow);
      refreshSelectedItem();

      for (const farm of FARM_TYPES) {
        const text = inventoryTexts.get(farm.farmTypeId);

        if (!text) {
          continue;
        }

        const entries = [
          `${getFarmItemLabel(farm.seedItemId)} x${
            quantities.get(farm.seedItemId) ?? 0
          }`,
        ];

        if (farm.harvestItemId !== 0) {
          entries.push(
            `${getFarmItemLabel(farm.harvestItemId)} x${
              quantities.get(farm.harvestItemId) ?? 0
            }`
          );
        }

        if (farm.chopItemId !== 0) {
          entries.push(
            `${getFarmItemLabel(farm.chopItemId)} x${
              quantities.get(farm.chopItemId) ?? 0
            }`
          );
        }

        text.setText(`Have: ${entries.join(" · ")}`);
      }
    },
    getSelectedItemId() {
      return selectedItemId;
    },
    getSelectedMode() {
      return selectedMode;
    },
  };
};
