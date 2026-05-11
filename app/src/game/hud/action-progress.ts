import Phaser from "phaser";
import { UI_ASSETS } from "../../assets/ui-assets";
import { makeHudText } from "./text";

export const createActionProgressHud = (scene: Phaser.Scene) => {
  const container = scene.add.container(0, 0).setScrollFactor(0);
  const icon = scene.add
    .image(0, 0, UI_ASSETS.actionProgressIconContainer.key)
    .setDisplaySize(74, 60);
  const track = scene.add
    .image(66, 10, UI_ASSETS.actionProgressBarTrack.key)
    .setOrigin(0)
    .setDisplaySize(260, 48);
  const fill = scene.add
    .image(78, 22, UI_ASSETS.actionProgressBarFiller.key)
    .setOrigin(0, 0.5)
    .setDisplaySize(0, 18);
  const label = makeHudText(scene, 82, 12, "Acting", 12, "#10191f", 190);
  const time = makeHudText(scene, 246, 12, "0s", 12, "#10191f", 56);

  container.add([icon, track, fill, label, time]);
  container.setVisible(false);

  return {
    container,
    width: 326,
    height: 60,
    setProgress(args: {
      visible: boolean;
      label: string;
      remainingSeconds: number;
      progress: number;
    }) {
      container.setVisible(args.visible);
      if (!args.visible) {
        fill.setDisplaySize(0, 18);
        return;
      }

      label.setText(args.label);
      time.setText(`${Math.ceil(args.remainingSeconds)}s`);
      fill.setDisplaySize(232 * Math.min(1, Math.max(0, args.progress)), 18);
    },
  };
};
