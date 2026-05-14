/**
 * MagicBlock read orchestration.
 *
 * The native runtime still owns the concrete MagicBlock account polling and
 * subscriptions. This service lazily bridges those callbacks into the shared
 * `GameStateStore`, then exposes backend-neutral RxJS streams through
 * `GameReadAdapter`.
 */
import { Observable, shareReplay } from "rxjs";
import type { GameReadAdapter } from "../../game/ports";
import type { GameStateStore } from "../../game/state-store";
import type { MagicBlockNativeClientCore } from "./native-client-core";

/** Converts MagicBlock read callbacks into reusable game read streams. */
export class MagicBlockReadService implements GameReadAdapter {
  readonly playerActionState$: GameReadAdapter["playerActionState$"];
  readonly playerAppearance$: GameReadAdapter["playerAppearance$"];
  readonly visiblePlayers$: GameReadAdapter["visiblePlayers$"];
  readonly inventory$: GameReadAdapter["inventory$"];
  readonly goldBalance$: GameReadAdapter["goldBalance$"];
  readonly tradeOffers$: GameReadAdapter["tradeOffers$"];
  readonly farmTiles$: GameReadAdapter["farmTiles$"];
  readonly tileItems$: GameReadAdapter["tileItems$"];

  private readonly activeRuntimeSubscriptions = new Set<() => void>();

  /** Wires each runtime read source to the matching state-store stream. */
  constructor(
    private readonly runtime: MagicBlockNativeClientCore,
    private readonly state: GameStateStore
  ) {
    this.playerActionState$ = this.mirrorRuntimeStream(
      this.state.playerActionState$,
      (emit) => this.runtime.subscribePlayerActionState(emit),
      (value) => this.state.setPlayerActionState(value)
    );
    this.playerAppearance$ = this.mirrorRuntimeStream(
      this.state.playerAppearance$,
      (emit) => this.runtime.subscribePlayerAppearance(emit),
      (value) => this.state.setPlayerAppearance(value)
    );
    this.visiblePlayers$ = this.mirrorRuntimeStream(
      this.state.visiblePlayers$,
      (emit) => this.runtime.subscribeVisiblePlayers(emit),
      (value) => this.state.setVisiblePlayers(value)
    );
    this.inventory$ = this.mirrorRuntimeStream(
      this.state.inventory$,
      (emit) => this.runtime.subscribeInventory(emit),
      (value) => this.state.setInventory(value)
    );
    this.goldBalance$ = this.mirrorRuntimeStream(
      this.state.goldBalance$,
      (emit) => this.runtime.subscribeGoldBalance(emit),
      (value) => this.state.setGoldBalance(value)
    );
    this.tradeOffers$ = this.mirrorRuntimeStream(
      this.state.tradeOffers$,
      (emit) => this.runtime.subscribeTradeOffers(emit),
      (value) => this.state.setTradeOffers(value)
    );
    this.farmTiles$ = this.mirrorRuntimeStream(
      this.state.farmTiles$,
      (emit) => this.runtime.subscribeFarmTiles(emit),
      (value) => this.state.setFarmTiles(value)
    );
    this.tileItems$ = this.mirrorRuntimeStream(
      this.state.tileItems$,
      (emit) => this.runtime.subscribeTileItems(emit),
      (value) => this.state.setTileItems(value)
    );
  }

  /** Detaches any active runtime subscriptions created by stream consumers. */
  dispose() {
    for (const unsubscribe of Array.from(this.activeRuntimeSubscriptions)) {
      unsubscribe();
    }
    this.activeRuntimeSubscriptions.clear();
  }

  /**
   * Attaches to a runtime callback source only while the RxJS stream is observed.
   *
   * This preserves the previous lazy polling behavior while giving consumers a
   * cached stream from the shared store.
   */
  private mirrorRuntimeStream<T>(
    storeStream: Observable<T>,
    subscribeRuntime: (emit: (value: T) => void) => () => void,
    writeStore: (value: T) => void
  ): Observable<T> {
    return new Observable<T>((subscriber) => {
      const unsubscribeRuntime = subscribeRuntime((value) => writeStore(value));
      const storeSubscription = storeStream.subscribe(subscriber);
      const unsubscribe = () => {
        storeSubscription.unsubscribe();
        unsubscribeRuntime();
        this.activeRuntimeSubscriptions.delete(unsubscribe);
      };

      this.activeRuntimeSubscriptions.add(unsubscribe);

      return unsubscribe;
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
