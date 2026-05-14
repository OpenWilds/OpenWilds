import { ConvexClient } from "convex/browser";
import type { HudController } from "../hud";
import { createGameBackend, type GameBackend } from "../../game/ports";
import { GameStateStore } from "../../game/state-store";
import type { PlayerAppearance } from "../../game/types";
import { createConvexReadAdapter } from "./read-adapter";
import { ConvexSessionAdapter } from "./session-adapter";
import { ConvexWriteAdapter } from "./write-adapter";

declare const __OPEN_WILDS_CONVEX_URL__: string | undefined;

const DEFAULT_PLAYER_APPEARANCE: PlayerAppearance = {
  color: "#f4a7b9",
  fill: 0xf4a7b9,
  spriteAssetId: "player",
  stroke: 0x1f2933,
};

export const createConvexGameBackend = (hud?: HudController): GameBackend => {
  const convexUrl = getConfiguredConvexUrl();
  const worldKey = import.meta.env.VITE_CONVEX_WORLD_KEY ?? "dev-world";
  const playerKey = import.meta.env.VITE_CONVEX_PLAYER_KEY ?? "dev-player";
  const owner = import.meta.env.VITE_CONVEX_PLAYER_OWNER ?? "convex-dev-owner";
  const state = new GameStateStore();
  const client = new ConvexClient(convexUrl);
  const onError = (error: Error) => {
    hud?.setProgramStatus(error.message);
  };

  hud?.setNetworkStatus("Convex local runtime");
  hud?.setProgramStatus(`Convex world ${worldKey}`);

  const read = createConvexReadAdapter({
    worldKey,
    state,
    client,
    onError,
  });
  const write = new ConvexWriteAdapter({
    worldKey,
    playerKey,
    client,
    onError,
  });
  const session = new ConvexSessionAdapter({
    worldKey,
    playerKey,
    owner,
    appearance: DEFAULT_PLAYER_APPEARANCE,
    state,
    client,
    onError,
  });

  return createGameBackend({
    read,
    write,
    session,
    state,
    dispose: () => {
      read.dispose();
      write.dispose();
      state.dispose();
      void client.close();
    },
  });
};

const getConfiguredConvexUrl = () => {
  const convexUrl =
    typeof __OPEN_WILDS_CONVEX_URL__ === "string"
      ? __OPEN_WILDS_CONVEX_URL__
      : "";

  if (!convexUrl) {
    throw new Error(
      "Set VITE_CONVEX_URL in .env.local to use the Convex game backend."
    );
  }

  return convexUrl;
};
