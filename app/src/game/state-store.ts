/**
 * Shared backend-neutral game state store.
 *
 * Adapters push domain snapshots into this store, and UI/game code consumes the
 * exposed RxJS streams. Keeping this cache outside a concrete backend prevents
 * every future adapter from reimplementing listener sets, initial emission
 * behavior, and duplicate-emission filtering.
 */
import { BehaviorSubject, distinctUntilChanged, type Observable } from "rxjs";
import type {
  ActiveActionState,
  FarmTileState,
  GoldBalanceState,
  InventoryState,
  PlayerActionState,
  PlayerAppearance,
  SelectedPlayerSummary,
  TileItemState,
  TradeOfferState,
  VisiblePlayerState,
} from "./types";

/** Complete cached read/session model for a game backend instance. */
export type GameStateSnapshot = {
  playerActionState: PlayerActionState;
  playerAppearance: PlayerAppearance;
  visiblePlayers: VisiblePlayerState[];
  inventory: InventoryState;
  goldBalance: GoldBalanceState;
  tradeOffers: TradeOfferState[];
  farmTiles: FarmTileState[];
  tileItems: TileItemState[];
  selectedPlayer: SelectedPlayerSummary | null;
};

const idleAction = (): ActiveActionState => ({
  action: 0,
  kind: "idle",
  startedAt: 0,
  endsAt: 0,
});

/** Creates the domain defaults used before a backend has emitted real data. */
export const createDefaultGameStateSnapshot = (): GameStateSnapshot => ({
  playerActionState: {
    position: { x: 0, y: 0 },
    energy: { current: 10, max: 10 },
    activeAction: idleAction(),
  },
  playerAppearance: {
    color: "#f4a7b9",
    fill: 0xf4a7b9,
    spriteAssetId: "player",
    stroke: 0x1f2933,
  },
  visiblePlayers: [],
  inventory: { slots: [] },
  goldBalance: { amount: 0n },
  tradeOffers: [],
  farmTiles: [],
  tileItems: [],
  selectedPlayer: null,
});

/**
 * Observable domain cache shared by read adapters, tests, and mixed backends.
 */
export class GameStateStore {
  private readonly playerActionStateSubject: BehaviorSubject<PlayerActionState>;
  private readonly playerAppearanceSubject: BehaviorSubject<PlayerAppearance>;
  private readonly visiblePlayersSubject: BehaviorSubject<VisiblePlayerState[]>;
  private readonly inventorySubject: BehaviorSubject<InventoryState>;
  private readonly goldBalanceSubject: BehaviorSubject<GoldBalanceState>;
  private readonly tradeOffersSubject: BehaviorSubject<TradeOfferState[]>;
  private readonly farmTilesSubject: BehaviorSubject<FarmTileState[]>;
  private readonly tileItemsSubject: BehaviorSubject<TileItemState[]>;
  private readonly selectedPlayerSubject: BehaviorSubject<SelectedPlayerSummary | null>;

  readonly playerActionState$: Observable<PlayerActionState>;
  readonly playerAppearance$: Observable<PlayerAppearance>;
  readonly visiblePlayers$: Observable<VisiblePlayerState[]>;
  readonly inventory$: Observable<InventoryState>;
  readonly goldBalance$: Observable<GoldBalanceState>;
  readonly tradeOffers$: Observable<TradeOfferState[]>;
  readonly farmTiles$: Observable<FarmTileState[]>;
  readonly tileItems$: Observable<TileItemState[]>;
  readonly selectedPlayer$: Observable<SelectedPlayerSummary | null>;

  /** Seeds the store with defaults plus any test/runtime overrides. */
  constructor(seed: Partial<GameStateSnapshot> = {}) {
    const snapshot = {
      ...createDefaultGameStateSnapshot(),
      ...seed,
    };

    this.playerActionStateSubject = new BehaviorSubject(
      snapshot.playerActionState
    );
    this.playerAppearanceSubject = new BehaviorSubject(
      snapshot.playerAppearance
    );
    this.visiblePlayersSubject = new BehaviorSubject(snapshot.visiblePlayers);
    this.inventorySubject = new BehaviorSubject(snapshot.inventory);
    this.goldBalanceSubject = new BehaviorSubject(snapshot.goldBalance);
    this.tradeOffersSubject = new BehaviorSubject(snapshot.tradeOffers);
    this.farmTilesSubject = new BehaviorSubject(snapshot.farmTiles);
    this.tileItemsSubject = new BehaviorSubject(snapshot.tileItems);
    this.selectedPlayerSubject = new BehaviorSubject(snapshot.selectedPlayer);

    this.playerActionState$ = createDistinctStream(
      this.playerActionStateSubject
    );
    this.playerAppearance$ = createDistinctStream(this.playerAppearanceSubject);
    this.visiblePlayers$ = createDistinctStream(this.visiblePlayersSubject);
    this.inventory$ = createDistinctStream(this.inventorySubject);
    this.goldBalance$ = createDistinctStream(this.goldBalanceSubject);
    this.tradeOffers$ = createDistinctStream(this.tradeOffersSubject);
    this.farmTiles$ = createDistinctStream(this.farmTilesSubject);
    this.tileItems$ = createDistinctStream(this.tileItemsSubject);
    this.selectedPlayer$ = createDistinctStream(this.selectedPlayerSubject);
  }

  /** Returns the current synchronous snapshot for command adapters/tests. */
  get snapshot(): GameStateSnapshot {
    return {
      playerActionState: this.playerActionStateSubject.value,
      playerAppearance: this.playerAppearanceSubject.value,
      visiblePlayers: this.visiblePlayersSubject.value,
      inventory: this.inventorySubject.value,
      goldBalance: this.goldBalanceSubject.value,
      tradeOffers: this.tradeOffersSubject.value,
      farmTiles: this.farmTilesSubject.value,
      tileItems: this.tileItemsSubject.value,
      selectedPlayer: this.selectedPlayerSubject.value,
    };
  }

  /** Publishes the local player's latest action/position/energy state. */
  setPlayerActionState(state: PlayerActionState) {
    this.playerActionStateSubject.next(state);
  }

  /** Publishes the local player's visual appearance. */
  setPlayerAppearance(appearance: PlayerAppearance) {
    this.playerAppearanceSubject.next(appearance);
  }

  /** Publishes all currently visible players. */
  setVisiblePlayers(players: VisiblePlayerState[]) {
    this.visiblePlayersSubject.next(players);
  }

  /** Publishes the local player's inventory. */
  setInventory(inventory: InventoryState) {
    this.inventorySubject.next(inventory);
  }

  /** Publishes the local player's gold balance. */
  setGoldBalance(balance: GoldBalanceState) {
    this.goldBalanceSubject.next(balance);
  }

  /** Publishes currently relevant trade offers. */
  setTradeOffers(offers: TradeOfferState[]) {
    this.tradeOffersSubject.next(offers);
  }

  /** Publishes farm tile state for known tiles. */
  setFarmTiles(tiles: FarmTileState[]) {
    this.farmTilesSubject.next(tiles);
  }

  /** Publishes item drops currently known on tiles. */
  setTileItems(items: TileItemState[]) {
    this.tileItemsSubject.next(items);
  }

  /** Publishes the currently selected player summary. */
  setSelectedPlayer(player: SelectedPlayerSummary | null) {
    this.selectedPlayerSubject.next(player);
  }

  /** Completes every stream owned by this store. */
  dispose() {
    this.playerActionStateSubject.complete();
    this.playerAppearanceSubject.complete();
    this.visiblePlayersSubject.complete();
    this.inventorySubject.complete();
    this.goldBalanceSubject.complete();
    this.tradeOffersSubject.complete();
    this.farmTilesSubject.complete();
    this.tileItemsSubject.complete();
    this.selectedPlayerSubject.complete();
  }
}

const createDistinctStream = <T>(subject: BehaviorSubject<T>): Observable<T> =>
  subject
    .asObservable()
    .pipe(
      distinctUntilChanged((left, right) => stateKey(left) === stateKey(right))
    );

const stateKey = (value: unknown) =>
  JSON.stringify(value, (_key, nestedValue) =>
    typeof nestedValue === "bigint" ? `${nestedValue.toString()}n` : nestedValue
  );
