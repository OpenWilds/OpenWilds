/**
 * Test-only in-memory backend.
 *
 * Implements the same read/write/session ports as real backends without a
 * network. Contract tests use this adapter to verify stream semantics and
 * command behavior independent of MagicBlock, Convex, or MUD.
 */
import {
  createGameBackend,
  type GameBackend,
  type GameReadAdapter,
  type GameSessionAdapter,
  type GameWriteAdapter,
} from "../ports";
import { GameStateStore, type GameStateSnapshot } from "../state-store";
import type {
  ActionMode,
  FarmTileState,
  GridPoint,
  PlayerActionState,
  TileItemState,
  TradeOfferState,
  WorldTileActionMode,
} from "../types";

/** Optional seed data for deterministic adapter tests. */
export type InMemoryGameState = Partial<GameStateSnapshot>;

/** In-memory implementation of all game ports for tests and fake composition. */
export class InMemoryGameAdapter
  implements GameReadAdapter, GameWriteAdapter, GameSessionAdapter
{
  readonly stateStore: GameStateStore;
  readonly playerActionState$: GameReadAdapter["playerActionState$"];
  readonly playerAppearance$: GameReadAdapter["playerAppearance$"];
  readonly visiblePlayers$: GameReadAdapter["visiblePlayers$"];
  readonly inventory$: GameReadAdapter["inventory$"];
  readonly goldBalance$: GameReadAdapter["goldBalance$"];
  readonly tradeOffers$: GameReadAdapter["tradeOffers$"];
  readonly farmTiles$: GameReadAdapter["farmTiles$"];
  readonly tileItems$: GameReadAdapter["tileItems$"];
  readonly selectedPlayer$: GameSessionAdapter["selectedPlayer$"];

  private selected = true;

  /** Creates a deterministic in-memory backend seeded through GameStateStore. */
  constructor(seed: InMemoryGameState = {}) {
    this.stateStore = new GameStateStore(seed);
    this.playerActionState$ = this.stateStore.playerActionState$;
    this.playerAppearance$ = this.stateStore.playerAppearance$;
    this.visiblePlayers$ = this.stateStore.visiblePlayers$;
    this.inventory$ = this.stateStore.inventory$;
    this.goldBalance$ = this.stateStore.goldBalance$;
    this.tradeOffers$ = this.stateStore.tradeOffers$;
    this.farmTiles$ = this.stateStore.farmTiles$;
    this.tileItems$ = this.stateStore.tileItems$;
    this.selectedPlayer$ = this.stateStore.selectedPlayer$;
  }

  /** Emits the currently selected fake player. */
  async boot() {
    this.emitSelection();
  }

  /** Returns whether the fake player is selected. */
  hasSelectedPlayer() {
    return this.selected;
  }

  /** Selects the fake player and publishes selection state. */
  async prepareSelectedPlayer() {
    this.selected = true;
    this.emitSelection();
  }

  /** Moves the fake player, reduces energy, and emits player state. */
  async movePlayer(point: GridPoint) {
    const current = this.stateStore.snapshot.playerActionState;
    const player: PlayerActionState = {
      ...current,
      position: { ...point },
      energy: {
        ...current.energy,
        current: Math.max(0, current.energy.current - 1),
      },
      activeAction: {
        action: 1,
        kind: "move",
        startedAt: 1,
        endsAt: 2,
      },
    };
    this.stateStore.setPlayerActionState(player);
    return player;
  }

  /** Restores fake player energy and emits player state. */
  async sleepPlayer() {
    const current = this.stateStore.snapshot.playerActionState;
    const player: PlayerActionState = {
      ...current,
      energy: {
        ...current.energy,
        current: current.energy.max,
      },
      activeAction: {
        action: 2,
        kind: "sleep",
        startedAt: 2,
        endsAt: 3,
      },
    };
    this.stateStore.setPlayerActionState(player);
    return player;
  }

  /** Applies fake tile/item actions and emits affected read streams. */
  async performAction(
    mode: ActionMode,
    point: GridPoint,
    selectedItemId?: number | null,
    selectedQuantity?: number | null
  ) {
    if (mode === "move") {
      const player = await this.movePlayer(point);
      return { player };
    }

    const current = this.stateStore.snapshot.playerActionState;
    const player: PlayerActionState = {
      ...current,
      position: { ...point },
      activeAction: {
        action: 3,
        kind: "farm",
        startedAt: 3,
        endsAt: 4,
      },
    };
    this.stateStore.setPlayerActionState(player);

    if (mode === "grab") {
      const items = this.stateStore.snapshot.tileItems.filter(
        (item) => item.x !== point.x || item.y !== point.y
      );
      this.stateStore.setTileItems(items);
      return { player, item: null };
    }

    if (mode === "drop") {
      const item: TileItemState = {
        ...point,
        itemId: selectedItemId ?? 1,
        quantity: selectedQuantity ?? 1,
      };
      const items = [
        ...this.stateStore.snapshot.tileItems.filter(
          (entry) => entry.x !== point.x || entry.y !== point.y
        ),
        item,
      ];
      this.stateStore.setTileItems(items);
      return { player, item };
    }

    const tile = this.upsertFarmTile(mode, point);
    return { player, tile };
  }

  /** Adds a fake outgoing trade offer. */
  async createTradeOffer(args: {
    sellerMint: string;
    itemId: number;
    itemQuantity: number;
    goldAmount: number;
  }) {
    const currentTrades = this.stateStore.snapshot.tradeOffers;
    const offerId = String(currentTrades.length + 1);
    const offer: TradeOfferState = {
      offer: `offer-${offerId}`,
      direction: "outgoing",
      offerId,
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
    };
    this.stateStore.setTradeOffers([offer, ...currentTrades]);
  }

  /** Marks a fake trade offer as accepted. */
  async acceptTradeOffer(offer: string) {
    this.updateTradeStatus(offer, "accepted");
  }

  /** Removes a fake trade offer. */
  async cancelTradeOffer(offer: string) {
    this.stateStore.setTradeOffers(
      this.stateStore.snapshot.tradeOffers.filter(
        (trade) => trade.offer !== offer
      )
    );
  }

  /** Marks a fake trade offer as finalized. */
  async finalizeTradeOffer(offer: string) {
    this.updateTradeStatus(offer, "finalized");
  }

  /** Completes all state streams owned by this adapter. */
  dispose() {
    this.stateStore.dispose();
  }

  private selection() {
    return this.selected
      ? { mint: "memory-player", owner: "memory-owner", color: "rose" }
      : null;
  }

  private emitSelection() {
    this.stateStore.setSelectedPlayer(this.selection());
  }

  private upsertFarmTile(
    mode: WorldTileActionMode,
    point: GridPoint
  ): FarmTileState {
    const currentTiles = this.stateStore.snapshot.farmTiles;
    const existing =
      currentTiles.find((tile) => tile.x === point.x && tile.y === point.y) ??
      null;
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

    this.stateStore.setFarmTiles([
      ...currentTiles.filter(
        (entry) => entry.x !== point.x || entry.y !== point.y
      ),
      tile,
    ]);
    return tile;
  }

  private updateTradeStatus(offer: string, status: TradeOfferState["status"]) {
    this.stateStore.setTradeOffers(
      this.stateStore.snapshot.tradeOffers.map((trade) =>
        trade.offer === offer ? { ...trade, status } : trade
      )
    );
  }
}

/** Creates a complete in-memory backend for contract tests. */
export const createInMemoryGameBackend = (
  seed?: InMemoryGameState
): GameBackend => {
  const adapter = new InMemoryGameAdapter(seed);

  return createGameBackend({
    read: adapter,
    write: adapter,
    session: adapter,
    state: adapter.stateStore,
    dispose: () => adapter.dispose(),
  });
};
