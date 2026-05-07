import Phaser from "phaser";
import {
  describeFarmRules,
  drawFarmPlaceholder,
  FARM_TYPES,
  FarmKind,
  getFarmItemLabel,
} from "./farm";
import type { InventorySlotState, InventoryState } from "./types";

const PANEL_X = 700;
const PANEL_Y = 84;
const PANEL_WIDTH = 212;
const INVENTORY_Y = PANEL_Y + 58;
const INVENTORY_HEIGHT = 94;
const CATALOG_Y = INVENTORY_Y + INVENTORY_HEIGHT + 12;
const ROW_HEIGHT = 92;
const INVENTORY_ROW_HEIGHT = 15;

type InventoryRow = {
  itemId: number;
  background: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
};

export const createFarmCatalog = (scene: Phaser.Scene) => {
  const panel = scene.add.graphics();

  panel.fillStyle(0xf7f1e5, 1);
  panel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, 640, 8);
  panel.lineStyle(1, 0xc7d8c4, 1);
  panel.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, 640, 8);

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
    .text(PANEL_X + 22, INVENTORY_Y + INVENTORY_HEIGHT - 20, "Selected: none", {
      color: "#17211e",
      fixedWidth: PANEL_WIDTH - 44,
      fontFamily: "Inter, sans-serif",
      fontSize: "10px",
      fontStyle: "700",
      wordWrap: { width: PANEL_WIDTH - 44 },
    })
    .setDepth(5);

  const inventoryTexts = new Map<number, Phaser.GameObjects.Text>();
  const inventoryRows: InventoryRow[] = [];
  let selectedItemId: number | null = null;

  const destroyInventoryRows = () => {
    for (const row of inventoryRows) {
      row.background.destroy();
      row.label.destroy();
    }

    inventoryRows.length = 0;
  };

  const refreshSelectedItem = () => {
    selectedItemText.setText(
      selectedItemId
        ? `Selected: ${getFarmItemLabel(selectedItemId)}`
        : "Selected: none"
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

  const createInventoryRow = (slot: InventorySlotState, index: number) => {
    const rowY = INVENTORY_Y + 31 + index * (INVENTORY_ROW_HEIGHT + 2);
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
          fontSize: "10px",
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
          selectedItemId =
            selectedItemId === slot.itemId ? null : slot.itemId;
          refreshSelectedItem();
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
        refreshSelectedItem();
      }
    );

    inventoryRows.push({ itemId: slot.itemId, background, label });
  };

  FARM_TYPES.forEach((farm, index) => {
    const rowY = CATALOG_Y + index * ROW_HEIGHT;
    const row = scene.add.graphics();

    row.fillStyle(farm.kind === FarmKind.tree ? 0xe7f1df : 0xf3ead6, 1);
    row.fillRoundedRect(PANEL_X + 10, rowY, PANEL_WIDTH - 20, ROW_HEIGHT - 10, 7);
    row.lineStyle(1, 0xd3c9b3, 0.8);
    row.strokeRoundedRect(PANEL_X + 10, rowY, PANEL_WIDTH - 20, ROW_HEIGHT - 10, 7);

    drawFarmPlaceholder(scene, farm, PANEL_X + 36, rowY + 47, 0.82);

    scene.add
      .text(PANEL_X + 66, rowY + 14, farm.label, {
        color: "#17211e",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "700",
      })
      .setDepth(5);

    scene.add
      .text(PANEL_X + 66, rowY + 34, describeFarmRules(farm), {
        color: "#344a42",
        fixedWidth: 122,
        fontFamily: "Inter, sans-serif",
        fontSize: "10px",
        lineSpacing: 2,
        wordWrap: { width: 122 },
      })
      .setDepth(5);

    const inventoryText = scene.add
      .text(PANEL_X + 66, rowY + 70, "Have: waiting", {
        color: "#17211e",
        fixedWidth: 122,
        fontFamily: "Inter, sans-serif",
        fontSize: "10px",
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
      const visibleSlots = inventory.slots.slice(0, 4);

      if (
        selectedItemId !== null &&
        !inventory.slots.some((slot) => slot.itemId === selectedItemId)
      ) {
        selectedItemId = null;
      }

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
  };
};
