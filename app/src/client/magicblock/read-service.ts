/**
 * MagicBlock read orchestration.
 *
 * The legacy client still owns the concrete MagicBlock account polling and
 * subscriptions. This service lazily bridges those callbacks into the shared
 * `GameStateStore`, then exposes backend-neutral RxJS streams through
 * `GameReadAdapter`.
 */
import { Observable, shareReplay } from "rxjs";
import type { GameReadAdapter } from "../../game/ports";
import type { GameStateStore } from "../../game/state-store";
import type { MagicBlockClientCore as LegacyMagicBlockClientCore } from "./legacy-client-core";

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

  private readonly activeLegacySubscriptions = new Set<() => void>();

  /** Wires each legacy read source to the matching state-store stream. */
  constructor(
    private readonly legacy: LegacyMagicBlockClientCore,
    private readonly state: GameStateStore
  ) {
    this.playerActionState$ = this.mirrorLegacyStream(
      this.state.playerActionState$,
      (emit) => this.legacy.subscribePlayerActionState(emit),
      (value) => this.state.setPlayerActionState(value)
    );
    this.playerAppearance$ = this.mirrorLegacyStream(
      this.state.playerAppearance$,
      (emit) => this.legacy.subscribePlayerAppearance(emit),
      (value) => this.state.setPlayerAppearance(value)
    );
    this.visiblePlayers$ = this.mirrorLegacyStream(
      this.state.visiblePlayers$,
      (emit) => this.legacy.subscribeVisiblePlayers(emit),
      (value) => this.state.setVisiblePlayers(value)
    );
    this.inventory$ = this.mirrorLegacyStream(
      this.state.inventory$,
      (emit) => this.legacy.subscribeInventory(emit),
      (value) => this.state.setInventory(value)
    );
    this.goldBalance$ = this.mirrorLegacyStream(
      this.state.goldBalance$,
      (emit) => this.legacy.subscribeGoldBalance(emit),
      (value) => this.state.setGoldBalance(value)
    );
    this.tradeOffers$ = this.mirrorLegacyStream(
      this.state.tradeOffers$,
      (emit) => this.legacy.subscribeTradeOffers(emit),
      (value) => this.state.setTradeOffers(value)
    );
    this.farmTiles$ = this.mirrorLegacyStream(
      this.state.farmTiles$,
      (emit) => this.legacy.subscribeFarmTiles(emit),
      (value) => this.state.setFarmTiles(value)
    );
    this.tileItems$ = this.mirrorLegacyStream(
      this.state.tileItems$,
      (emit) => this.legacy.subscribeTileItems(emit),
      (value) => this.state.setTileItems(value)
    );
  }

  /** Detaches any active legacy subscriptions created by stream consumers. */
  dispose() {
    for (const unsubscribe of Array.from(this.activeLegacySubscriptions)) {
      unsubscribe();
    }
    this.activeLegacySubscriptions.clear();
  }

  /**
   * Attaches to a legacy callback source only while the RxJS stream is observed.
   *
   * This preserves the previous lazy polling behavior while giving consumers a
   * cached stream from the shared store.
   */
  private mirrorLegacyStream<T>(
    storeStream: Observable<T>,
    subscribeLegacy: (emit: (value: T) => void) => () => void,
    writeStore: (value: T) => void
  ): Observable<T> {
    return new Observable<T>((subscriber) => {
      const unsubscribeLegacy = subscribeLegacy((value) => writeStore(value));
      const storeSubscription = storeStream.subscribe(subscriber);
      const unsubscribe = () => {
        storeSubscription.unsubscribe();
        unsubscribeLegacy();
        this.activeLegacySubscriptions.delete(unsubscribe);
      };

      this.activeLegacySubscriptions.add(unsubscribe);

      return unsubscribe;
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
