import Phaser from "phaser";
import "./polyfills";
import { getHudElements, HudController } from "./client/hud";
import { LocalnetClient } from "./client/localnet-client";
import { createGridScene, GAME_HEIGHT, GAME_WIDTH } from "./game/grid-scene";
import { bootStudio } from "./studio/app/studio-react";
import "./styles.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root is missing.");
}

if (window.location.pathname.replace(/\/$/, "").startsWith("/studio")) {
  bootStudio(app);
} else {
  const hud = new HudController(getHudElements());
  const localnetClient = new LocalnetClient(hud);

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#10191f",
    scene: createGridScene(localnetClient, hud),
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });

  void localnetClient.boot();
}
