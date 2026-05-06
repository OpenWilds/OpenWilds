import Phaser from "phaser";
import "./polyfills";
import { getHudElements } from "./client/hud";
import { LocalnetClient } from "./client/localnet-client";
import {
  createGridScene,
  GAME_HEIGHT,
  GAME_WIDTH,
} from "./game/grid-scene";
import "./styles.css";

const localnetClient = new LocalnetClient(getHudElements());

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#f6f2e8",
  scene: createGridScene(localnetClient),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

void localnetClient.boot();

