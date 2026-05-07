import Phaser from "phaser";
import {
  describeFarmRules,
  drawFarmPlaceholder,
  FARM_TYPES,
  FarmKind,
} from "./farm";

const PANEL_X = 700;
const PANEL_Y = 84;
const PANEL_WIDTH = 212;
const ROW_HEIGHT = 112;

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
    .text(PANEL_X + 14, PANEL_Y + 40, "Placeholder crop and tree rules", {
      color: "#4b6259",
      fontFamily: "Inter, sans-serif",
      fontSize: "11px",
    })
    .setDepth(5);

  FARM_TYPES.forEach((farm, index) => {
    const rowY = PANEL_Y + 68 + index * ROW_HEIGHT;
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
  });
};
