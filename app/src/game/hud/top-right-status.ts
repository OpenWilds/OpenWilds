import Phaser from "phaser";
import { UI_ASSETS } from "../../assets/ui-assets";
import { makeHudText, makeSystemButton } from "./text";

export const createTopRightStatus = (
  scene: Phaser.Scene,
  onSettingsClick: () => void
) => {
  const width = 230;
  const container = scene.add.container(0, 0).setScrollFactor(0);
  const buttons = scene.add.container(width - 168, 0).setScrollFactor(0);
  const timeBg = scene.add
    .image(width / 2, 64, UI_ASSETS.dateTimePanel.key)
    .setDisplaySize(width, 54);
  const timeText = makeHudText(
    scene,
    10,
    54,
    "Day 1 · 00:00",
    16,
    "#f6efd7",
    width - 20
  );
  const playerBg = scene.add
    .image(width / 2, 111, UI_ASSETS.toastCardPanel.key)
    .setDisplaySize(width, 40)
    .setAlpha(0.94);
  const playerText = makeHudText(
    scene,
    10,
    101,
    "Player: 10, 10",
    12,
    "#f1d38b",
    width - 20
  );

  buttons.add([
    makeSystemButton(scene, 0, "settings", onSettingsClick),
    makeSystemButton(scene, 58, "map", () => undefined),
    makeSystemButton(scene, 116, "journal", () => undefined),
  ]);
  timeText.setAlign("center");
  playerText.setAlign("center");
  container.add([buttons, timeBg, timeText, playerBg, playerText]);

  return {
    container,
    width,
    height: 132,
    setTime(text: string) {
      timeText.setText(text);
    },
    setPlayerStatus(text: string) {
      playerText.setText(text);
    },
  };
};
