import type { GameReadAdapter } from "../../game/ports";
import type { MagicBlockClientCore } from "./client-core";

export class MagicBlockReadAdapter implements GameReadAdapter {
  constructor(private readonly core: MagicBlockClientCore) {}

  subscribePlayerActionState: GameReadAdapter["subscribePlayerActionState"] = (
    listener
  ) => this.core.subscribePlayerActionState(listener);

  subscribePlayerAppearance: GameReadAdapter["subscribePlayerAppearance"] = (
    listener
  ) => this.core.subscribePlayerAppearance(listener);

  subscribeVisiblePlayers: GameReadAdapter["subscribeVisiblePlayers"] = (
    listener
  ) => this.core.subscribeVisiblePlayers(listener);

  subscribeInventory: GameReadAdapter["subscribeInventory"] = (listener) =>
    this.core.subscribeInventory(listener);

  subscribeGoldBalance: GameReadAdapter["subscribeGoldBalance"] = (listener) =>
    this.core.subscribeGoldBalance(listener);

  subscribeTradeOffers: GameReadAdapter["subscribeTradeOffers"] = (listener) =>
    this.core.subscribeTradeOffers(listener);

  subscribeFarmTiles: GameReadAdapter["subscribeFarmTiles"] = (listener) =>
    this.core.subscribeFarmTiles(listener);

  subscribeTileItems: GameReadAdapter["subscribeTileItems"] = (listener) =>
    this.core.subscribeTileItems(listener);
}
