import Phaser from "phaser";
import { UI_ASSETS } from "../../assets/ui-assets";
import { getGameTime, getGameTimeLighting } from "../game-time";
import { makeHudText, makeSystemButton } from "./text";

const clockScale = 0.44;
const clockWidth = 560;
const clockPanelY = 258;
const clockPanelHeight = 150;
const clockHeight = clockPanelY + clockPanelHeight;
const artworkDiameter = 394;
const artworkPanelUnderlap = 18;
const frameWidth = 480;
const frameHeight = 334;
const frameX = (clockWidth - frameWidth) / 2;
const artworkCenterX = clockWidth / 2;
const artworkCenterY = clockPanelY;
const labelInset = 68;
const buttonWidth = 52;
const buttonGap = 8;
const buttonRowWidth = buttonWidth * 3 + buttonGap * 2;
const buttonRowTop = clockHeight * clockScale + 6;
const playerPanelTop = buttonRowTop + 62;
const playerPanelHeight = 40;

export const createTopRightStatus = (
  scene: Phaser.Scene,
  onSettingsClick: () => void
) => {
  const width = Math.max(clockWidth * clockScale, buttonRowWidth);
  const height = playerPanelTop + playerPanelHeight;
  const shade = scene.add
    .rectangle(0, 0, 1, 1, 0x07142a, 0)
    .setOrigin(0)
    .setVisible(false)
    .setScrollFactor(0);
  const container = scene.add.container(0, 0).setScrollFactor(0);
  const clock = scene.add.container(0, 0).setScale(clockScale);
  const clockX = (width - clockWidth * clockScale) / 2 / clockScale;
  const buttonsX = (width - buttonRowWidth) / 2;
  const artworkClipHeight = clockPanelY + artworkPanelUnderlap;
  const artworkTextureKey = `ui-datetime-artwork-clipped-${Date.now()}`;
  const artworkTexture = scene.textures.createCanvas(
    artworkTextureKey,
    clockWidth,
    artworkClipHeight
  );
  const artwork = scene.add
    .image(0, 0, artworkTextureKey)
    .setOrigin(0);
  const frame = scene.add
    .image(frameX, 0, UI_ASSETS.dateTimeHalfcircleFrame.key)
    .setDisplaySize(frameWidth, frameHeight)
    .setOrigin(0);
  const panel = scene.add
    .image(
      clockWidth / 2,
      clockPanelY + clockPanelHeight / 2,
      UI_ASSETS.dateTimePanel.key
    )
    .setDisplaySize(clockWidth, clockPanelHeight)
    .setOrigin(0.5);
  const label = scene.add
    .text(
      labelInset,
      clockPanelY + clockPanelHeight / 2 + 1,
      "",
      {
        align: "center",
        color: "#3b2414",
        fixedWidth: clockWidth - labelInset * 2,
        fontFamily: "Trebuchet MS, Verdana, system-ui, sans-serif",
        fontSize: "30px",
        fontStyle: "700",
        shadow: {
          color: "#f7e7c3",
          fill: true,
          offsetX: 0,
          offsetY: 2,
        },
        stroke: "#f8e8c2",
        strokeThickness: 3,
      }
    )
    .setOrigin(0, 0.5)
    .setScrollFactor(0);
  const buttons = scene.add.container(buttonsX, buttonRowTop);
  const playerBg = scene.add
    .image(
      width / 2,
      playerPanelTop + playerPanelHeight / 2,
      UI_ASSETS.toastCardPanel.key
    )
    .setDisplaySize(width, playerPanelHeight)
    .setAlpha(0.94);
  const playerText = makeHudText(
    scene,
    0,
    playerPanelTop + 10,
    "Player: 10, 10",
    12,
    "#f1d38b",
    width
  );

  clock.setPosition(clockX, 0);
  clock.add([artwork, frame, panel, label]);
  buttons.add([
    makeSystemButton(scene, 0, "settings", onSettingsClick),
    makeSystemButton(scene, buttonWidth + buttonGap, "map", () => undefined),
    makeSystemButton(
      scene,
      (buttonWidth + buttonGap) * 2,
      "journal",
      () => undefined
    ),
  ]);
  playerText.setAlign("center");
  container.add([clock, buttons, playerBg, playerText]);

  const syncTime = () => {
    const time = getGameTime();
    const lighting = getGameTimeLighting(time);
    const timeText = `${time.hour.toString().padStart(2, "0")}:${time.minute
      .toString()
      .padStart(2, "0")}`;

    label.setText(`Day ${time.day}  |  ${timeText}  |  ${lighting.phase}`);
    renderArtwork(time.normalizedDayTime * Math.PI * 2);
    shade
      .setFillStyle(lighting.color, lighting.alpha)
      .setVisible(lighting.alpha > 0);
  };

  const renderArtwork = (rotation: number) => {
    if (!artworkTexture) {
      return;
    }

    const source = scene.textures
      .get(UI_ASSETS.dateTimeArtwork.key)
      .getSourceImage() as CanvasImageSource;
    const context = artworkTexture.getContext();

    context.clearRect(0, 0, clockWidth, artworkClipHeight);
    context.save();
    context.translate(artworkCenterX, artworkCenterY);
    context.rotate(rotation);
    context.drawImage(
      source,
      -artworkDiameter / 2,
      -artworkDiameter / 2,
      artworkDiameter,
      artworkDiameter
    );
    context.restore();
    artworkTexture.refresh();
  };

  syncTime();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.textures.remove(artworkTextureKey);
  });

  return {
    shade,
    container,
    width,
    height,
    setTime(_text: string) {
      syncTime();
    },
    setPlayerStatus(text: string) {
      playerText.setText(text);
    },
    resize(args: {
      screenWidth: number;
      screenHeight: number;
    }) {
      shade
        .setPosition(0, 0)
        .setDisplaySize(args.screenWidth, args.screenHeight);
    },
  };
};
