import Phaser from "phaser";
import "./polyfills";
import { getHudElements, HudController } from "./client/hud";
import { createConvexGameBackend } from "./client/convex/backend";
import { createMagicBlockGameBackend } from "./client/magicblock/backend";
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
  const backend =
    import.meta.env.VITE_GAME_BACKEND === "convex"
      ? createConvexGameBackend(hud)
      : createMagicBlockGameBackend(hud);
  const gameRoot = document.getElementById("game");
  const playerGate = document.getElementById("player-gate");
  const startGameButton = document.getElementById(
    "start-game-button"
  ) as HTMLButtonElement | null;
  let gameStarted = false;

  const startGame = async () => {
    if (gameStarted || !backend.session.hasSelectedPlayer()) {
      return;
    }

    if (startGameButton) {
      startGameButton.disabled = true;
      startGameButton.textContent = "Preparing...";
    }

    try {
      await backend.session.prepareSelectedPlayer();
      gameStarted = true;
      playerGate?.setAttribute("hidden", "");
      gameRoot?.removeAttribute("hidden");

      new Phaser.Game({
        type: Phaser.AUTO,
        parent: "game",
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: "#10191f",
        scene: createGridScene(backend.client, hud),
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      });
    } finally {
      if (startGameButton && !gameStarted) {
        startGameButton.disabled = !backend.session.hasSelectedPlayer();
        startGameButton.textContent = backend.session.hasSelectedPlayer()
          ? "Start Game"
          : "Mint Player First";
      }
    }
  };

  const playerSelectionSubscription = backend.session.selectedPlayer$.subscribe(
    (player) => {
      if (!startGameButton || gameStarted) {
        return;
      }

      startGameButton.disabled = !player;
      startGameButton.textContent = player ? "Start Game" : "Mint Player First";
    }
  );

  startGameButton?.addEventListener("click", () => {
    void startGame();
  });

  window.addEventListener(
    "beforeunload",
    () => {
      playerSelectionSubscription.unsubscribe();
      backend.dispose();
    },
    {
      once: true,
    }
  );

  void backend.session.boot();
}
