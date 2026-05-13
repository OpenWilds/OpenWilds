import {
  createGameClient,
  type GameBackend,
  type GameReadAdapter,
  type GameSessionAdapter,
  type GameWriteAdapter,
  type Unsubscribe,
} from "../ports";
import type {
  ActionMode,
  ActiveActionState,
  FarmTileState,
  GoldBalanceState,
  GridPoint,
  InventoryState,
  PlayerActionState,
  PlayerAppearance,
  TileItemState,
  TradeOfferState,
  VisiblePlayerState,
  WorldTileActionMode,
} from "../types";

type Listener<T> = (value: T) => void;

type InMemoryGameState = {
  player: PlayerActionState;
  appearance: PlayerAppearance;
  visiblePlayers: VisiblePlayerState[];
  inventory: InventoryState;
  gold: GoldBalanceState;
  trades: TradeOfferState[];
  farmTiles: FarmTileState[];
  tileItems: TileItemState[];
};

const idleAction = (): ActiveActionState => ({
  action: 0,
  kind: "idle",
  startedAt: 0,
  endsAt: 0,
});

const defaultState = (): InMemoryGameState => ({
  player: {
    position: { x: 0, y: 0 },
    energy: { current: 10, max: 10 },
    activeAction: idleAction(),
  },
  appearance: {
    color: "#f4a7b9",
    fill: 0xf4a7b9,
    spriteAssetId: "player",
    stroke: 0x1f2933,
  },
  visiblePlayers: [],
  inventory: { slots: [] },
  gold: { amount: 0n },
  trades: [],
  farmTiles: [],
  tileItems: [],
});

export class InMemoryGameAdapter
  implements GameReadAdapter, GameWriteAdapter, GameSessionAdapter
{
  private state: InMemoryGameState;
  private selected = true;
  private readonly listeners = {
    player: new Set<Listener<PlayerActionState>>(),
    appearance: new Set<Listener<PlayerAppearance>>(),
    visiblePlayers: new Set<Listener<VisiblePlayerState[]>>(),
    inventory: new Set<Listener<InventoryState>>(),
    gold: new Set<Listener<GoldBalanceState>>(),
    trades: new Set<Listener<TradeOfferState[]>>(),
    farmTiles: new Set<Listener<FarmTileState[]>>(),
    tileItems: new Set<Listener<TileItemState[]>>(),
    selection: new Set<
      Listener<{ mint: string; owner: string; color: string } | null>
    >(),
  };

  constructor(seed: Partial<InMemoryGameState> = {}) {
    this.state = {
      ...defaultState(),
      ...seed,
    };
  }

  async boot() {
    this.emitSelection();
  }

  hasSelectedPlayer() {
    return this.selected;
  }

  async prepareSelectedPlayer() {
    this.selected = true;
    this.emitSelection();
  }

  subscribePlayerSelection: GameSessionAdapter["subscribePlayerSelection"] = (
    listener
  ) => this.subscribe(this.listeners.selection, listener, this.selection());

  subscribePlayerActionState: GameReadAdapter["subscribePlayerActionState"] = (
    listener
  ) => this.subscribe(this.listeners.player, listener, this.state.player);

  subscribePlayerAppearance: GameReadAdapter["subscribePlayerAppearance"] = (
    listener
  ) =>
    this.subscribe(this.listeners.appearance, listener, this.state.appearance);

  subscribeVisiblePlayers: GameReadAdapter["subscribeVisiblePlayers"] = (
    listener
  ) =>
    this.subscribe(
      this.listeners.visiblePlayers,
      listener,
      this.state.visiblePlayers
    );

  subscribeInventory: GameReadAdapter["subscribeInventory"] = (listener) =>
    this.subscribe(this.listeners.inventory, listener, this.state.inventory);

  subscribeGoldBalance: GameReadAdapter["subscribeGoldBalance"] = (listener) =>
    this.subscribe(this.listeners.gold, listener, this.state.gold);

  subscribeTradeOffers: GameReadAdapter["subscribeTradeOffers"] = (listener) =>
    this.subscribe(this.listeners.trades, listener, this.state.trades);

  subscribeFarmTiles: GameReadAdapter["subscribeFarmTiles"] = (listener) =>
    this.subscribe(this.listeners.farmTiles, listener, this.state.farmTiles);

  subscribeTileItems: GameReadAdapter["subscribeTileItems"] = (listener) =>
    this.subscribe(this.listeners.tileItems, listener, this.state.tileItems);

  async movePlayer(point: GridPoint) {
    this.state.player = {
      ...this.state.player,
      position: { ...point },
      energy: {
        ...this.state.player.energy,
        current: Math.max(0, this.state.player.energy.current - 1),
      },
      activeAction: {
        action: 1,
        kind: "move",
        startedAt: 1,
        endsAt: 2,
      },
    };
    this.emit(this.listeners.player, this.state.player);
    return this.state.player;
  }

  async sleepPlayer() {
    this.state.player = {
      ...this.state.player,
      energy: {
        ...this.state.player.energy,
        current: this.state.player.energy.max,
      },
      activeAction: {
        action: 2,
        kind: "sleep",
        startedAt: 2,
        endsAt: 3,
      },
    };
    this.emit(this.listeners.player, this.state.player);
    return this.state.player;
  }

  async performAction(
    mode: ActionMode,
    point: GridPoint,
    selectedItemId?: number | null,
    selectedQuantity?: number | null
  ) {
    if (mode === "move") {
      return {
        player: await this.movePlayer(point),
      };
    }

    this.state.player = {
      ...this.state.player,
      position: { ...point },
      activeAction: {
        action: 3,
        kind: "farm",
        startedAt: 3,
        endsAt: 4,
      },
    };
    this.emit(this.listeners.player, this.state.player);

    if (mode === "grab") {
      this.state.tileItems = this.state.tileItems.filter(
        (item) => item.x !== point.x || item.y !== point.y
      );
      this.emit(this.listeners.tileItems, this.state.tileItems);
      return { player: this.state.player, item: null };
    }

    if (mode === "drop") {
      const item = {
        ...point,
        itemId: selectedItemId ?? 1,
        quantity: selectedQuantity ?? 1,
      };
      this.state.tileItems = [
        ...this.state.tileItems.filter(
          (entry) => entry.x !== point.x || entry.y !== point.y
        ),
        item,
      ];
      this.emit(this.listeners.tileItems, this.state.tileItems);
      return { player: this.state.player, item };
    }

    const tile = this.upsertFarmTile(mode, point);
    this.emit(this.listeners.farmTiles, this.state.farmTiles);
    return { player: this.state.player, tile };
  }

  async createTradeOffer(args: {
    sellerMint: string;
    itemId: number;
    itemQuantity: number;
    goldAmount: number;
  }) {
    this.state.trades = [
      {
        offer: `offer-${this.state.trades.length + 1}`,
        direction: "outgoing",
        offerId: String(this.state.trades.length + 1),
        buyer: "buyer",
        seller: "seller",
        buyerPlayerMint: "buyer-player",
        sellerPlayerMint: args.sellerMint,
        buyerEntity: "buyer-entity",
        sellerEntity: "seller-entity",
        itemId: args.itemId,
        itemQuantity: args.itemQuantity,
        goldAmount: BigInt(args.goldAmount),
        expiresAt: 0,
        status: "open",
      },
      ...this.state.trades,
    ];
    this.emit(this.listeners.trades, this.state.trades);
  }

  async acceptTradeOffer(offer: string) {
    this.updateTradeStatus(offer, "accepted");
  }

  async cancelTradeOffer(offer: string) {
    this.state.trades = this.state.trades.filter(
      (trade) => trade.offer !== offer
    );
    this.emit(this.listeners.trades, this.state.trades);
  }

  async finalizeTradeOffer(offer: string) {
    this.updateTradeStatus(offer, "finalized");
  }

  dispose() {
    Object.values(this.listeners).forEach((listeners) => listeners.clear());
  }

  private subscribe<T>(
    listeners: Set<Listener<T>>,
    listener: Listener<T>,
    initial: T
  ): Unsubscribe {
    listeners.add(listener);
    listener(initial);
    return () => listeners.delete(listener);
  }

  private emit<T>(listeners: Set<Listener<T>>, value: T) {
    for (const listener of listeners) {
      listener(value);
    }
  }

  private selection() {
    return this.selected
      ? { mint: "memory-player", owner: "memory-owner", color: "rose" }
      : null;
  }

  private emitSelection() {
    this.emit(this.listeners.selection, this.selection());
  }

  private upsertFarmTile(
    mode: WorldTileActionMode,
    point: GridPoint
  ): FarmTileState {
    const existing =
      this.state.farmTiles.find(
        (tile) => tile.x === point.x && tile.y === point.y
      ) ?? null;
    const tile: FarmTileState = {
      x: point.x,
      y: point.y,
      soilState:
        mode === "till" || existing?.soilState === "tilled"
          ? "tilled"
          : "untilled",
      farmTypeId: mode === "plant" ? 1 : existing?.farmTypeId ?? 0,
      plantedAt: mode === "plant" ? 1 : existing?.plantedAt ?? 0,
      growthSeconds: mode === "plant" ? 60 : existing?.growthSeconds ?? 0,
      growthUpdatedAt: mode === "plant" ? 1 : existing?.growthUpdatedAt ?? 0,
      wateredUntil: mode === "water" ? 120 : existing?.wateredUntil ?? 0,
      lastHarvestedAt: mode === "harvest" ? 2 : existing?.lastHarvestedAt ?? 0,
      harvestCount:
        mode === "harvest"
          ? (existing?.harvestCount ?? 0) + 1
          : existing?.harvestCount ?? 0,
    };

    this.state.farmTiles = [
      ...this.state.farmTiles.filter(
        (entry) => entry.x !== point.x || entry.y !== point.y
      ),
      tile,
    ];
    return tile;
  }

  private updateTradeStatus(offer: string, status: TradeOfferState["status"]) {
    this.state.trades = this.state.trades.map((trade) =>
      trade.offer === offer ? { ...trade, status } : trade
    );
    this.emit(this.listeners.trades, this.state.trades);
  }
}

export const createInMemoryGameBackend = (
  seed?: Partial<InMemoryGameState>
): GameBackend => {
  const adapter = new InMemoryGameAdapter(seed);

  return {
    read: adapter,
    write: adapter,
    session: adapter,
    client: createGameClient(adapter, adapter),
    dispose: () => adapter.dispose(),
  };
};
