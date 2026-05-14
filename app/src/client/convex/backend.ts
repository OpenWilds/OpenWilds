import { ConvexClient } from "convex/browser";
import type { ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import type { HudController } from "../hud";
import { createGameBackend, type GameBackend } from "../../game/ports";
import { GameStateStore } from "../../game/state-store";
import type { PlayerAppearance } from "../../game/types";
import { createConvexReadAdapter } from "./read-adapter";
import { ConvexSessionAdapter } from "./session-adapter";
import { ConvexWriteAdapter } from "./write-adapter";
import type { ConvexGameReadQueryClient } from "./read-adapter";
import type { ConvexGameMutationClient } from "./write-adapter";

declare const __OPEN_WILDS_CONVEX_URL__: string | undefined;

type ConvexReactWatchClient = ConvexGameMutationClient & {
  watchQuery<Query extends FunctionReference<"query">>(
    query: Query,
    args: Query["_args"]
  ): {
    localQueryResult(): Query["_returnType"] | undefined;
    onUpdate(callback: () => void): () => void;
  };
  close?: () => Promise<void> | void;
};

type SharedConvexClient = ConvexClient | ConvexReactWatchClient;

export type ConvexGameAuthUser = {
  userId: string;
  email?: string | null;
};

export type CreateConvexGameBackendOptions = {
  authUser?: ConvexGameAuthUser;
  client?: ConvexReactClient;
};

const DEFAULT_PLAYER_APPEARANCE: PlayerAppearance = {
  color: "#f4a7b9",
  fill: 0xf4a7b9,
  spriteAssetId: "player",
  stroke: 0x1f2933,
};

export const createConvexGameBackend = (
  hud?: HudController,
  options: CreateConvexGameBackendOptions = {}
): GameBackend => {
  const convexUrl = getConfiguredConvexUrl();
  const worldKey = import.meta.env.VITE_CONVEX_WORLD_KEY ?? "dev-world";
  const playerKey =
    import.meta.env.VITE_CONVEX_PLAYER_KEY ??
    (options.authUser ? `auth:${options.authUser.userId}` : "dev-player");
  const owner =
    options.authUser?.userId ??
    import.meta.env.VITE_CONVEX_PLAYER_OWNER ??
    "convex-dev-owner";
  const state = new GameStateStore();
  const client: SharedConvexClient =
    options.client ?? new ConvexClient(convexUrl);
  const ownsClient = !options.client;
  const onError = (error: Error) => {
    hud?.setProgramStatus(error.message);
  };

  hud?.setNetworkStatus("Convex local runtime");
  hud?.setProgramStatus(`Convex world ${worldKey}`);

  const read = createConvexReadAdapter({
    worldKey,
    state,
    client: toReadQueryClient(client),
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
      if (ownsClient) {
        void client.close?.();
      }
    },
  });
};

const toReadQueryClient = (
  client: SharedConvexClient
): ConvexGameReadQueryClient => {
  if ("onUpdate" in client) {
    return client;
  }

  return {
    onUpdate(query, args, callback, onError) {
      const watch = client.watchQuery(query, args);
      const emit = () => {
        try {
          const result = watch.localQueryResult();

          if (result !== undefined) {
            callback(result);
          }
        } catch (error) {
          onError?.(toError(error));
        }
      };
      const unsubscribe = watch.onUpdate(emit);

      emit();

      return unsubscribe;
    },
    close: () => client.close?.(),
  };
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

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));
