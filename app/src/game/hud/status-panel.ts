import Phaser from "phaser";
import { UI_ASSETS } from "../../assets/ui-assets";
import type { HudSnapshot } from "../../client/hud";
import { makeHudText, short } from "./text";

export const createStatusPanel = (scene: Phaser.Scene) => {
  const container = scene.add.container(16, 16).setScrollFactor(0);
  const bg = scene.add
    .image(0, 0, UI_ASSETS.toastCardPanel.key)
    .setOrigin(0)
    .setDisplaySize(420, 124)
    .setAlpha(0.96);
  const titleText = makeHudText(
    scene,
    26,
    18,
    "Open Wilds",
    20,
    "#f6efd7",
    180
  );
  const walletText = makeHudText(
    scene,
    26,
    50,
    "Wallet: creating...",
    12,
    "#dce8e2",
    360
  );
  const networkText = makeHudText(
    scene,
    26,
    72,
    "Network: preparing...",
    12,
    "#dce8e2",
    360
  );
  const programText = makeHudText(
    scene,
    26,
    94,
    "Programs: checking...",
    12,
    "#dce8e2",
    360
  );

  container.add([bg, titleText, walletText, networkText, programText]);

  return {
    container,
    update(snapshot: HudSnapshot) {
      walletText.setText(
        `${short(snapshot.walletAddress)} · ${snapshot.walletBalance}`
      );
      networkText.setText(snapshot.networkStatus);
      programText.setText(snapshot.programStatus);
    },
  };
};
