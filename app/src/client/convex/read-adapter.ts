/**
 * Convex read adapter for shared runtime game state.
 *
 * The adapter watches one Convex read-model query and mirrors every snapshot
 * into the backend-neutral `GameStateStore`. It can be composed with any write
 * adapter, including MagicBlock writes or future Convex-only writes.
 */
import { ConvexClient } from "convex/browser";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Subscription } from "rxjs";
import type { GameReadAdapter } from "../../game/ports";
import type { GameStateStore } from "../../game/state-store";
import type {
  FarmTileState,
  GoldBalanceState,
  InventoryState,
  PlayerActionState,
  PlayerAppearance,
  TileItemState,
  TradeOfferState,
  VisiblePlayerState,
} from "../../game/types";

declare const __OPEN_WILDS_CONVEX_URL__: string | undefined;

export type ConvexGameReadModel = {
  playerActionState: PlayerActionState;
  playerAppearance: PlayerAppearance;
  visiblePlayers: VisiblePlayerState[];
  inventory: InventoryState;
  goldBalance: GoldBalanceState;
  tradeOffers: TradeOfferState[];
  farmTiles: FarmTileState[];
  tileItems: TileItemState[];
};

type GetWorldReadModelArgs = {
  worldKey: string;
  playerKey: string | null;
};

type ConvexUnsubscribe =
  | (() => void)
  | {
      unsubscribe: () => void;
    };

export type ConvexGameReadQueryClient = {
  onUpdate<Query extends FunctionReference<"query">>(
    query: Query,
    args: Query["_args"],
    callback: (result: Query["_returnType"]) => unknown,
    onError?: (error: Error) => unknown
  ): ConvexUnsubscribe;
  close?: () => Promise<void> | void;
};

export type ConvexReadAdapterArgs = {
  worldKey: string;
  state: GameStateStore;
  client: ConvexGameReadQueryClient;
  closeClientOnDispose?: boolean;
  onError?: (error: Error) => void;
};

export type CreateConvexReadAdapterArgs = {
  worldKey: string;
  state: GameStateStore;
  convexUrl?: string;
  client?: ConvexGameReadQueryClient;
  onError?: (error: Error) => void;
};

const refs = {
  getWorldReadModel: makeFunctionReference<
    "query",
    GetWorldReadModelArgs,
    ConvexGameReadModel
  >("gameState:getWorldReadModel"),
};

/** Exposes Convex shared game state through the backend-neutral read port. */
export class ConvexReadAdapter implements GameReadAdapter {
  readonly playerActionState$: GameReadAdapter["playerActionState$"];
  readonly playerAppearance$: GameReadAdapter["playerAppearance$"];
  readonly visiblePlayers$: GameReadAdapter["visiblePlayers$"];
  readonly inventory$: GameReadAdapter["inventory$"];
  readonly goldBalance$: GameReadAdapter["goldBalance$"];
  readonly tradeOffers$: GameReadAdapter["tradeOffers$"];
  readonly farmTiles$: GameReadAdapter["farmTiles$"];
  readonly tileItems$: GameReadAdapter["tileItems$"];

  private readonly selectedPlayerSubscription: Subscription;
  private activePlayerKey: string | null | undefined;
  private unsubscribeQuery: (() => void) | null = null;

  constructor(private readonly args: ConvexReadAdapterArgs) {
    this.playerActionState$ = args.state.playerActionState$;
    this.playerAppearance$ = args.state.playerAppearance$;
    this.visiblePlayers$ = args.state.visiblePlayers$;
    this.inventory$ = args.state.inventory$;
    this.goldBalance$ = args.state.goldBalance$;
    this.tradeOffers$ = args.state.tradeOffers$;
    this.farmTiles$ = args.state.farmTiles$;
    this.tileItems$ = args.state.tileItems$;

    this.selectedPlayerSubscription = args.state.selectedPlayer$.subscribe(
      (player) => this.watchPlayer(player?.mint ?? null)
    );
  }

  /** Stops Convex watches and optionally closes the owned Convex client. */
  dispose() {
    this.selectedPlayerSubscription.unsubscribe();
    this.unsubscribeQuery?.();
    this.unsubscribeQuery = null;

    if (this.args.closeClientOnDispose) {
      void this.args.client.close?.();
    }
  }

  private watchPlayer(playerKey: string | null) {
    if (playerKey === this.activePlayerKey) {
      return;
    }

    this.activePlayerKey = playerKey;
    this.unsubscribeQuery?.();
    this.unsubscribeQuery = normalizeUnsubscribe(
      this.args.client.onUpdate(
        refs.getWorldReadModel,
        {
          worldKey: this.args.worldKey,
          playerKey,
        },
        (snapshot) => this.applySnapshot(snapshot),
        (error) => this.args.onError?.(error)
      )
    );
  }

  private applySnapshot(snapshot: ConvexGameReadModel) {
    this.args.state.setPlayerActionState(snapshot.playerActionState);
    this.args.state.setPlayerAppearance(snapshot.playerAppearance);
    this.args.state.setVisiblePlayers(snapshot.visiblePlayers);
    this.args.state.setInventory(snapshot.inventory);
    this.args.state.setGoldBalance(snapshot.goldBalance);
    this.args.state.setTradeOffers(snapshot.tradeOffers);
    this.args.state.setFarmTiles(snapshot.farmTiles);
    this.args.state.setTileItems(snapshot.tileItems);
  }
}

/** Creates a Convex-backed read adapter using the configured Vite Convex URL. */
export const createConvexReadAdapter = ({
  worldKey,
  state,
  convexUrl = getConfiguredConvexUrl(),
  client,
  onError,
}: CreateConvexReadAdapterArgs) => {
  const readClient = client ?? createConvexClient(convexUrl);

  return new ConvexReadAdapter({
    worldKey,
    state,
    client: readClient,
    closeClientOnDispose: !client,
    onError,
  });
};

const createConvexClient = (convexUrl: string): ConvexClient => {
  if (!convexUrl) {
    throw new Error(
      "Set VITE_CONVEX_URL in .env.local to use Convex game reads."
    );
  }

  return new ConvexClient(convexUrl);
};

const getConfiguredConvexUrl = () =>
  typeof __OPEN_WILDS_CONVEX_URL__ === "string"
    ? __OPEN_WILDS_CONVEX_URL__
    : "";

const normalizeUnsubscribe = (unsubscribe: ConvexUnsubscribe) =>
  typeof unsubscribe === "function"
    ? unsubscribe
    : () => unsubscribe.unsubscribe();
