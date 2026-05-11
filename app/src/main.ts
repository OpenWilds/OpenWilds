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
  const gameRoot = document.getElementById("game");
  const playerGate = document.getElementById("player-gate");
  const startGameButton = document.getElementById(
    "start-game-button"
  ) as HTMLButtonElement | null;
  let gameStarted = false;

  const startGame = async () => {
    if (gameStarted || !localnetClient.hasSelectedPlayer()) {
      return;
    }

    if (startGameButton) {
      startGameButton.disabled = true;
      startGameButton.textContent = "Preparing...";
    }

    try {
      await localnetClient.prepareSelectedPlayer();
      gameStarted = true;
      playerGate?.setAttribute("hidden", "");
      gameRoot?.removeAttribute("hidden");

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
    } finally {
      if (startGameButton && !gameStarted) {
        startGameButton.disabled = !localnetClient.hasSelectedPlayer();
        startGameButton.textContent = localnetClient.hasSelectedPlayer()
          ? "Start Game"
          : "Mint Player First";
      }
    }
  };

  localnetClient.subscribePlayerSelection((player) => {
    if (!startGameButton || gameStarted) {
      return;
    }

    startGameButton.disabled = !player;
    startGameButton.textContent = player ? "Start Game" : "Mint Player First";
  });

  startGameButton?.addEventListener("click", () => {
    void startGame();
  });

  void localnetClient.boot();
}
