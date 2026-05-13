import type {
  ActionResult,
  ActionMode,
  FarmTileState,
  GoldBalanceState,
  GridPoint,
  InventoryState,
  PlayerActionState,
  PlayerAppearance,
  TileItemState,
  TradeOfferState,
  VisiblePlayerState,
} from "./types";

export type Unsubscribe = () => void;

export type GameReadAdapter = {
  subscribePlayerActionState: (
    listener: (state: PlayerActionState) => void
  ) => Unsubscribe;
  subscribePlayerAppearance: (
    listener: (appearance: PlayerAppearance) => void
  ) => Unsubscribe;
  subscribeVisiblePlayers: (
    listener: (players: VisiblePlayerState[]) => void
  ) => Unsubscribe;
  subscribeInventory: (
    listener: (inventory: InventoryState) => void
  ) => Unsubscribe;
  subscribeGoldBalance: (
    listener: (balance: GoldBalanceState) => void
  ) => Unsubscribe;
  subscribeTradeOffers: (
    listener: (offers: TradeOfferState[]) => void
  ) => Unsubscribe;
  subscribeFarmTiles: (
    listener: (tiles: FarmTileState[]) => void
  ) => Unsubscribe;
  subscribeTileItems: (
    listener: (items: TileItemState[]) => void
  ) => Unsubscribe;
};

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

export type SelectedPlayerSummary = {
  mint: string;
  owner: string;
  color: string;
};

export type GameSessionAdapter = {
  boot: () => Promise<void>;
  hasSelectedPlayer: () => boolean;
  prepareSelectedPlayer: () => Promise<void>;
  subscribePlayerSelection: (
    listener: (player: SelectedPlayerSummary | null) => void
  ) => Unsubscribe;
};

export type GameClient = Partial<GameReadAdapter> &
  Partial<GameWriteAdapter> & {
    movePlayer: GameWriteAdapter["movePlayer"];
  };

export type GameBackend = {
  read: GameReadAdapter;
  write: GameWriteAdapter;
  session: GameSessionAdapter;
  client: GameClient;
  dispose: () => void;
};

export const createGameClient = (
  read: GameReadAdapter,
  write: GameWriteAdapter
): GameClient => ({
  movePlayer: (point) => write.movePlayer(point),
  sleepPlayer: () => write.sleepPlayer(),
  performAction: (mode, point, selectedItemId, selectedQuantity) =>
    write.performAction(mode, point, selectedItemId, selectedQuantity),
  createTradeOffer: (args) => write.createTradeOffer(args),
  acceptTradeOffer: (offer) => write.acceptTradeOffer(offer),
  cancelTradeOffer: (offer) => write.cancelTradeOffer(offer),
  finalizeTradeOffer: (offer) => write.finalizeTradeOffer(offer),
  subscribePlayerActionState: (listener) =>
    read.subscribePlayerActionState(listener),
  subscribePlayerAppearance: (listener) =>
    read.subscribePlayerAppearance(listener),
  subscribeVisiblePlayers: (listener) => read.subscribeVisiblePlayers(listener),
  subscribeInventory: (listener) => read.subscribeInventory(listener),
  subscribeGoldBalance: (listener) => read.subscribeGoldBalance(listener),
  subscribeTradeOffers: (listener) => read.subscribeTradeOffers(listener),
  subscribeFarmTiles: (listener) => read.subscribeFarmTiles(listener),
  subscribeTileItems: (listener) => read.subscribeTileItems(listener),
});
