import Phaser from "phaser";
import { UI_ASSETS, UI_ICONS } from "../../assets/ui-assets";

const buttonSize = 104;
const iconSize = 78;

export const createAgentModeButton = (
  scene: Phaser.Scene,
  onToggle: () => void
) => {
  const container = scene.add.container(0, 0).setScrollFactor(0);
  const background = scene.add
    .image(buttonSize / 2, buttonSize / 2, UI_ASSETS.inventorySlot.key)
    .setDisplaySize(buttonSize, buttonSize)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  const hover = scene.add
    .image(buttonSize / 2, buttonSize / 2, UI_ASSETS.inventorySlotHover.key)
    .setDisplaySize(buttonSize, buttonSize)
    .setOrigin(0.5)
    .setAlpha(0.74)
    .setVisible(false);
  const activeHalo = scene.add
    .circle(buttonSize / 2, buttonSize / 2, 41, 0x35d6dc, 0.22)
    .setStrokeStyle(2, 0x8ff7ec, 0.58)
    .setVisible(false);
  const activeCore = scene.add
    .circle(buttonSize / 2, buttonSize / 2, 32, 0x143b59, 0.38)
    .setStrokeStyle(1, 0xf4d78e, 0.52)
    .setVisible(false);
  const icon = scene.add
    .image(buttonSize / 2, buttonSize / 2, UI_ICONS.agent.key)
    .setDisplaySize(iconSize, iconSize)
    .setOrigin(0.5);

  container.add([background, activeHalo, activeCore, hover, icon]);
  container.setSize(buttonSize, buttonSize);
  background.on(
    "pointerdown",
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      event.stopPropagation();
      onToggle();
    }
  );

  return {
    container,
    width: buttonSize,
    height: buttonSize,
    containsPoint(x: number, y: number) {
      return x >= 0 && x <= buttonSize && y >= 0 && y <= buttonSize;
    },
    handlePointerMove(x: number, y: number) {
      hover.setVisible(this.containsPoint(x, y));
    },
    clearPointerHover() {
      hover.setVisible(false);
    },
    handlePointerDown(x: number, y: number) {
      if (!this.containsPoint(x, y)) {
        return false;
      }

      onToggle();
      return true;
    },
    setActive(active: boolean) {
      activeHalo.setVisible(active);
      activeCore.setVisible(active);
      background.setTint(active ? 0xbaf8e6 : 0xffffff);
      icon.setTint(active ? 0xd9fff7 : 0xffffff);
    },
  };
};
