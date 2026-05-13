/**
 * MagicBlock compatibility facade.
 *
 * This file is intentionally small: it combines the native MagicBlock runtime
 * with the new read/write/session service modules and exposes old callback
 * methods only for compatibility. New app code should use `readService`,
 * `writeService`, and `sessionService` through `createMagicBlockGameBackend`.
 */
import type { HudController } from "../hud";
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
import { GameStateStore } from "../../game/state-store";
import type { PlayerNft } from "../player-nft";
import { MagicBlockAgentSessionService } from "./agent-session-service";
import { MagicBlockControlBinder } from "./control-binder";
import { MagicBlockNativeClientCore } from "./native-client-core";
import { MagicBlockReadService } from "./read-service";
import { MagicBlockSessionService } from "./session-service";
import { MagicBlockWriteService } from "./write-service";

/**
 * Bridges the old monolithic MagicBlock client into the new service layout.
 */
export class MagicBlockClientCore {
  readonly state: GameStateStore;
  readonly readService: MagicBlockReadService;
  readonly writeService: MagicBlockWriteService;
  readonly sessionService: MagicBlockSessionService;

  private readonly runtime: MagicBlockNativeClientCore;
  private readonly agentSessionService: MagicBlockAgentSessionService;
  private readonly controls: MagicBlockControlBinder;

  /** Creates the shared state store and focused MagicBlock service modules. */
  constructor(hud: HudController, state = new GameStateStore()) {
    this.state = state;
    this.runtime = new MagicBlockNativeClientCore(hud);
    this.agentSessionService = new MagicBlockAgentSessionService(this.runtime);
    this.controls = new MagicBlockControlBinder(
      hud,
      this.runtime,
      this.agentSessionService
    );
    this.readService = new MagicBlockReadService(this.runtime, this.state);
    this.writeService = new MagicBlockWriteService(this.runtime);
    this.sessionService = new MagicBlockSessionService(
      this.runtime,
      this.state
    );
    this.controls.bind();
  }

  /** Boots the MagicBlock session flow through the session service. */
  boot() {
    return this.sessionService.boot();
  }

  /** Tears down read bridges, session subscriptions, runtime timers, and state. */
  dispose() {
    this.controls.dispose();
    this.readService.dispose();
    this.sessionService.dispose();
    this.runtime.dispose();
    this.state.dispose();
  }

  /** Returns whether a player NFT is currently selected. */
  hasSelectedPlayer() {
    return this.sessionService.hasSelectedPlayer();
  }

  /** Ensures the selected player is provisioned and ready to enter the game. */
  prepareSelectedPlayer() {
    return this.sessionService.prepareSelectedPlayer();
  }

  movePlayer: MagicBlockWriteService["movePlayer"] = (point) =>
    this.writeService.movePlayer(point);

  sleepPlayer: MagicBlockWriteService["sleepPlayer"] = () =>
    this.writeService.sleepPlayer();

  performAction: MagicBlockWriteService["performAction"] = (
    mode,
    point,
    selectedItemId,
    selectedQuantity
  ) =>
    this.writeService.performAction(
      mode,
      point,
      selectedItemId,
      selectedQuantity
    );

  createTradeOffer: MagicBlockWriteService["createTradeOffer"] = (args) =>
    this.writeService.createTradeOffer(args);

  acceptTradeOffer: MagicBlockWriteService["acceptTradeOffer"] = (offer) =>
    this.writeService.acceptTradeOffer(offer);

  cancelTradeOffer: MagicBlockWriteService["cancelTradeOffer"] = (offer) =>
    this.writeService.cancelTradeOffer(offer);

  finalizeTradeOffer: MagicBlockWriteService["finalizeTradeOffer"] = (offer) =>
    this.writeService.finalizeTradeOffer(offer);

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribePlayerActionState(listener: (state: PlayerActionState) => void) {
    return this.runtime.subscribePlayerActionState(listener);
  }

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribePlayerAppearance(listener: (appearance: PlayerAppearance) => void) {
    return this.runtime.subscribePlayerAppearance(listener);
  }

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribePlayerSelection(listener: (player: PlayerNft | null) => void) {
    return this.runtime.subscribePlayerSelection(listener);
  }

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribeVisiblePlayers(listener: (players: VisiblePlayerState[]) => void) {
    return this.runtime.subscribeVisiblePlayers(listener);
  }

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribeInventory(listener: (inventory: InventoryState) => void) {
    return this.runtime.subscribeInventory(listener);
  }

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribeGoldBalance(listener: (balance: GoldBalanceState) => void) {
    return this.runtime.subscribeGoldBalance(listener);
  }

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribeTradeOffers(listener: (offers: TradeOfferState[]) => void) {
    return this.runtime.subscribeTradeOffers(listener);
  }

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribeFarmTiles(listener: (tiles: FarmTileState[]) => void) {
    return this.runtime.subscribeFarmTiles(listener);
  }

  /** Compatibility callback wrapper for runtime callers. Prefer streams. */
  subscribeTileItems(listener: (items: TileItemState[]) => void) {
    return this.runtime.subscribeTileItems(listener);
  }
}
