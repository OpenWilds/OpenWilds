import Phaser from "phaser";
import { UI_ASSETS, UI_ICONS } from "../../assets/ui-assets";

const trackWidth = 341;
const trackHeight = 63;
const fillFullWidth = 322;
const fillHeight = 42;
const iconFrameWidth = 136;
const iconFrameHeight = 112;
const iconCenterX = -184;
const iconCenterY = 0;
const trackLeftX = iconCenterX + iconFrameWidth * 0.5 - 6;
const trackCenterX = trackLeftX + trackWidth * 0.5;
const fillX = trackLeftX + (trackWidth - fillFullWidth) * 0.5;
const fillY = -fillHeight * 0.5;
const visualLeft = iconCenterX - iconFrameWidth * 0.5;
const visualRight = trackLeftX + trackWidth;
const visualTop = -iconFrameHeight * 0.5;

export const createActionProgressHud = (scene: Phaser.Scene) => {
  const container = scene.add.container(0, 0);
  const track = scene.add
    .image(trackCenterX, 0, UI_ASSETS.actionProgressBarTrack.key)
    .setOrigin(0.5)
    .setDisplaySize(trackWidth, trackHeight);
  const fill = scene.add
    .nineslice(
      fillX,
      fillY,
      UI_ASSETS.actionProgressBarFiller.key,
      undefined,
      fillFullWidth,
      fillHeight,
      19,
      19
    )
    .setOrigin(0);
  const iconFrame = scene.add
    .image(iconCenterX, iconCenterY, UI_ASSETS.actionProgressIconContainer.key)
    .setOrigin(0.5)
    .setDisplaySize(iconFrameWidth, iconFrameHeight);
  const icon = scene.add
    .image(iconCenterX, iconCenterY + 1, UI_ICONS.hands.key)
    .setOrigin(0.5)
    .setDisplaySize(62, 62);

  container.add([track, fill, iconFrame, icon]);
  container.setVisible(false);

  return {
    container,
    width: visualRight - visualLeft,
    height: iconFrameHeight,
    visualLeft,
    visualTop,
    setProgress(args: {
      visible: boolean;
      label: string;
      remainingSeconds: number;
      progress: number;
    }) {
      container.setVisible(args.visible);
      if (!args.visible) {
        fill.setVisible(false);
        fill.setSize(0, fillHeight);
        return;
      }

      const fillWidth = fillFullWidth * Math.min(1, Math.max(0, args.progress));

      fill.setVisible(fillWidth > 0);
      fill.setSize(fillWidth, fillHeight);
    },
  };
};
