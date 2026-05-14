import Phaser from "phaser";
import { UI_ASSETS } from "../../assets/ui-assets";
import type { EnergyState } from "../types";
import { hudFontFamily } from "./text";

const barWidth = 368;
const barHeight = 71;
const iconWidth = 96;
const iconHeight = 97;
const fillSliceLeft = 36;
const fillSliceRight = 37;
const fillWidthEpsilon = 0.25;
const fillIncreaseTransitionMs = 260;
const fillDecreaseTransitionMs = 180;
const fillPulseMs = 180;

export const createEnergyPanel = (scene: Phaser.Scene) => {
  const barX = Math.round(iconWidth * 0.5);
  const barY = Math.round((iconHeight - barHeight) * 0.5);
  const visualWidth = barX + barWidth;
  const visualHeight = iconHeight;
  const container = scene.add.container(0, 0).setScrollFactor(0);
  const background = scene.add
    .image(barX, barY, UI_ASSETS.energyBarBar.key)
    .setOrigin(0);
  const fill = scene.add
    .nineslice(
      barX,
      barY,
      UI_ASSETS.energyBarFiller.key,
      undefined,
      barWidth,
      barHeight,
      fillSliceLeft,
      fillSliceRight
    )
    .setOrigin(0);
  const icon = scene.add
    .image(iconWidth * 0.5, iconHeight * 0.5, UI_ASSETS.energyBarIcon.key)
    .setDisplaySize(iconWidth, iconHeight)
    .setOrigin(0.5);
  const value = scene.add
    .text(barX + barWidth * 0.5, barY + barHeight * 0.5 - 1, "", {
      align: "center",
      color: "#fffbed",
      fixedWidth: 180,
      fontFamily: hudFontFamily,
      fontSize: "22px",
      fontStyle: "800",
      shadow: {
        color: "#261806",
        blur: 2,
        fill: true,
        offsetX: 1,
        offsetY: 2,
      },
      stroke: "#4b3214",
      strokeThickness: 4,
    })
    .setOrigin(0.5);
  let displayedFillWidth: number | undefined;
  let fillTransitionStartWidth = 0;
  let fillTransitionTargetWidth = 0;
  let fillTransitionElapsed = 0;
  let fillTransitionDuration = 0;
  let fillPulseElapsed = 0;

  container.add([background, fill, value, icon]);

  return {
    container,
    width: visualWidth,
    height: visualHeight,
    update(energy: EnergyState, deltaMs: number) {
      const ratio = clampRatio(
        energy.max === 0 ? 0 : energy.current / energy.max
      );
      const targetFillWidth = Math.max(0, barWidth * ratio);

      updateFillTransition(targetFillWidth, deltaMs);
      value.setText(
        `${Math.round(energy.current)} / ${Math.round(energy.max)}`
      );
      container.setVisible(true);
    },
  };

  function updateFillTransition(targetFillWidth: number, deltaMs: number) {
    if (displayedFillWidth === undefined) {
      displayedFillWidth = targetFillWidth;
      fillTransitionStartWidth = targetFillWidth;
      fillTransitionTargetWidth = targetFillWidth;
      applyFillWidth(targetFillWidth);
      return;
    }

    if (
      Math.abs(targetFillWidth - fillTransitionTargetWidth) > fillWidthEpsilon
    ) {
      fillTransitionStartWidth = displayedFillWidth;
      fillTransitionTargetWidth = targetFillWidth;
      fillTransitionElapsed = 0;
      fillTransitionDuration =
        targetFillWidth > displayedFillWidth
          ? fillIncreaseTransitionMs
          : fillDecreaseTransitionMs;
      fillPulseElapsed = fillPulseMs;
    }

    if (fillTransitionElapsed < fillTransitionDuration) {
      fillTransitionElapsed = Math.min(
        fillTransitionDuration,
        fillTransitionElapsed + deltaMs
      );

      const progress =
        fillTransitionDuration === 0
          ? 1
          : fillTransitionElapsed / fillTransitionDuration;
      displayedFillWidth = lerp(
        fillTransitionStartWidth,
        fillTransitionTargetWidth,
        easeOutCubic(progress)
      );
    } else {
      displayedFillWidth = fillTransitionTargetWidth;
    }

    applyFillWidth(displayedFillWidth);
    updateFillPulse(deltaMs);
  }

  function applyFillWidth(fillWidth: number) {
    fill.setVisible(fillWidth > 0);
    fill.setSize(fillWidth, barHeight);
  }

  function updateFillPulse(deltaMs: number) {
    if (fillPulseElapsed <= 0) {
      fill.clearTint();
      fill.setAlpha(1);
      return;
    }

    fillPulseElapsed = Math.max(0, fillPulseElapsed - deltaMs);

    const progress = 1 - fillPulseElapsed / fillPulseMs;
    const pulse = Math.sin(progress * Math.PI);

    fill.setTint(0xffffd2);
    fill.setAlpha(1 - pulse * 0.12);
  }
};

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}
