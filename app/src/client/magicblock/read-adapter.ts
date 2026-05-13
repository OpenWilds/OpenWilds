/**
 * MagicBlock read adapter wrapper.
 *
 * Keeps the concrete MagicBlock read service behind the public `GameReadAdapter`
 * shape. This layer is intentionally thin so backend factories can swap read
 * adapters without pulling service internals into app boot code.
 */
import type { GameReadAdapter } from "../../game/ports";

/** Exposes MagicBlock read streams through the backend-neutral read port. */
export class MagicBlockReadAdapter implements GameReadAdapter {
  readonly playerActionState$: GameReadAdapter["playerActionState$"];
  readonly playerAppearance$: GameReadAdapter["playerAppearance$"];
  readonly visiblePlayers$: GameReadAdapter["visiblePlayers$"];
  readonly inventory$: GameReadAdapter["inventory$"];
  readonly goldBalance$: GameReadAdapter["goldBalance$"];
  readonly tradeOffers$: GameReadAdapter["tradeOffers$"];
  readonly farmTiles$: GameReadAdapter["farmTiles$"];
  readonly tileItems$: GameReadAdapter["tileItems$"];

  /** Copies stream references from the composed read service. */
  constructor(service: GameReadAdapter) {
    this.playerActionState$ = service.playerActionState$;
    this.playerAppearance$ = service.playerAppearance$;
    this.visiblePlayers$ = service.visiblePlayers$;
    this.inventory$ = service.inventory$;
    this.goldBalance$ = service.goldBalance$;
    this.tradeOffers$ = service.tradeOffers$;
    this.farmTiles$ = service.farmTiles$;
    this.tileItems$ = service.tileItems$;
  }
}
