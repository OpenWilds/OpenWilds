/**
 * Backend-neutral game ports.
 *
 * The game layer depends on these interfaces instead of depending on Solana,
 * Convex, MUD, or any other runtime directly. Reads and session state are
 * streams; writes are commands. That split lets us compose mixed backends, such
 * as Convex reads with MagicBlock writes, without changing Phaser callers.
 */
import type { Observable } from "rxjs";
import type { GameStateStore } from "./state-store";
import type {
  ActionResult,
  ActionMode,
  FarmTileState,
  GoldBalanceState,
  GridPoint,
  InventoryState,
  PlayerActionState,
  PlayerAppearance,
  SelectedPlayerSummary,
  TileItemState,
  TradeOfferState,
  VisiblePlayerState,
} from "./types";

/** Streams the read model consumed by Phaser and HUD UI. */
export type GameReadAdapter = {
  playerActionState$: Observable<PlayerActionState>;
  playerAppearance$: Observable<PlayerAppearance>;
  visiblePlayers$: Observable<VisiblePlayerState[]>;
  inventory$: Observable<InventoryState>;
  goldBalance$: Observable<GoldBalanceState>;
  tradeOffers$: Observable<TradeOfferState[]>;
  farmTiles$: Observable<FarmTileState[]>;
  tileItems$: Observable<TileItemState[]>;
};

/** Executes game commands and returns the same domain results Phaser expects. */
export type GameWriteAdapter = {
  movePlayer: (point: GridPoint) => Promise<PlayerActionState | null>;
  sleepPlayer: () => Promise<PlayerActionState | null>;
  performAction: (
    mode: ActionMode,
    point: GridPoint,
    selectedItemId?: number | null,
    selectedQuantity?: number | null
  ) => Promise<ActionResult | null>;
  createTradeOffer: (args: {
    sellerMint: string;
    itemId: number;
    itemQuantity: number;
    goldAmount: number;
  }) => Promise<void>;
  acceptTradeOffer: (offer: string) => Promise<void>;
  cancelTradeOffer: (offer: string) => Promise<void>;
  finalizeTradeOffer: (offer: string) => Promise<void>;
};

/** Owns boot and selected-player lifecycle independently from reads/writes. */
export type GameSessionAdapter = {
  selectedPlayer$: Observable<SelectedPlayerSummary | null>;
  boot: () => Promise<void>;
  hasSelectedPlayer: () => boolean;
  prepareSelectedPlayer: () => Promise<void>;
};

/** Phaser-facing facade: read streams plus write commands. */
export type GameClient = GameReadAdapter & GameWriteAdapter;

/** Minimal status surface for adapters that need to report backend progress. */
export type GameStatusSink = {
  setStatus?: (message: string) => void;
  setBusy?: (key: string, busy: boolean) => void;
};

/** Fully composed backend instance used by application boot code. */
export type GameBackend = {
  read: GameReadAdapter;
  write: GameWriteAdapter;
  session: GameSessionAdapter;
  client: GameClient;
  state?: GameStateStore;
  status?: GameStatusSink;
  dispose: () => void;
};

/** Inputs for composing a backend from independent read/write/session pieces. */
export type CreateGameBackendArgs = {
  read: GameReadAdapter;
  write: GameWriteAdapter;
  session: GameSessionAdapter;
  state?: GameStateStore;
  status?: GameStatusSink;
  dispose?: () => void;
};

/** Builds the narrow facade consumed by Phaser from independent ports. */
export const createGameClient = (
  read: GameReadAdapter,
  write: GameWriteAdapter
): GameClient => ({
  playerActionState$: read.playerActionState$,
  playerAppearance$: read.playerAppearance$,
  visiblePlayers$: read.visiblePlayers$,
  inventory$: read.inventory$,
  goldBalance$: read.goldBalance$,
  tradeOffers$: read.tradeOffers$,
  farmTiles$: read.farmTiles$,
  tileItems$: read.tileItems$,
  movePlayer: (point) => write.movePlayer(point),
  sleepPlayer: () => write.sleepPlayer(),
  performAction: (mode, point, selectedItemId, selectedQuantity) =>
    write.performAction(mode, point, selectedItemId, selectedQuantity),
  createTradeOffer: (args) => write.createTradeOffer(args),
  acceptTradeOffer: (offer) => write.acceptTradeOffer(offer),
  cancelTradeOffer: (offer) => write.cancelTradeOffer(offer),
  finalizeTradeOffer: (offer) => write.finalizeTradeOffer(offer),
});

/**
 * Composes read, write, and session adapters into one backend.
 *
 * This is the cross-backend composition point: callers can pass adapters from
 * the same runtime or mix them across runtimes as long as they satisfy the
 * domain ports.
 */
export const createGameBackend = ({
  read,
  write,
  session,
  state,
  status,
  dispose,
}: CreateGameBackendArgs): GameBackend => ({
  read,
  write,
  session,
  state,
  status,
  client: createGameClient(read, write),
  dispose: dispose ?? (() => undefined),
});
