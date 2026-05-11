import Phaser from "phaser";
import { UI_ASSETS, UI_ICONS } from "../../assets/ui-assets";
import { getFarmItemLabel } from "../farm";

export const hudFontFamily = "Inter, system-ui, sans-serif";

export function makeHudText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color: string,
  width: number
) {
  return scene.add
    .text(x, y, text, {
      color,
      fixedWidth: width,
      fontFamily: hudFontFamily,
      fontSize: `${fontSize}px`,
      fontStyle: "700",
      shadow: {
        color: "#071018",
        blur: 4,
        fill: true,
        offsetX: 1,
        offsetY: 1,
      },
      wordWrap: { width },
    })
    .setScrollFactor(0);
}

export function makeSystemButton(
  scene: Phaser.Scene,
  x: number,
  id: "settings" | "map" | "journal" | "agent",
  onClick: () => void,
  active = false
) {
  const container = scene.add.container(x, 0);
  const asset =
    id === "settings"
      ? active
        ? UI_ASSETS.settingsActive
        : UI_ASSETS.settingsInactive
      : id === "map"
      ? active
        ? UI_ASSETS.mapActive
        : UI_ASSETS.mapInactive
      : id === "journal"
      ? active
        ? UI_ASSETS.journalActive
        : UI_ASSETS.journalInactive
      : active
      ? UI_ASSETS.settingsActive
      : UI_ASSETS.settingsInactive;
  const icon =
    id === "settings"
      ? UI_ICONS.settings
      : id === "map"
      ? UI_ICONS.forage
      : id === "agent"
      ? UI_ICONS.agent
      : UI_ICONS.hands;
  const bg = scene.add
    .image(0, 0, asset.key)
    .setOrigin(0)
    .setDisplaySize(52, 56);
  const image = scene.add.image(26, 26, icon.key).setDisplaySize(28, 28);

  container.add([bg, image]);
  container
    .setSize(52, 56)
    .setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 52, 56),
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
        onClick();
      }
    );

  return Object.assign(container, {
    setActiveState(nextActive: boolean) {
      const nextAsset =
        id === "settings"
          ? nextActive
            ? UI_ASSETS.settingsActive
            : UI_ASSETS.settingsInactive
          : id === "map"
          ? nextActive
            ? UI_ASSETS.mapActive
            : UI_ASSETS.mapInactive
          : id === "journal"
          ? nextActive
            ? UI_ASSETS.journalActive
            : UI_ASSETS.journalInactive
          : nextActive
          ? UI_ASSETS.settingsActive
          : UI_ASSETS.settingsInactive;

      bg.setTexture(nextAsset.key);
    },
  });
}

export function short(value: string) {
  if (!value || value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function compactItemLabel(itemId: number) {
  return getFarmItemLabel(itemId)
    .replace(" Seed", "")
    .replace("Wild ", "")
    .replace(" Fiber", "");
}
