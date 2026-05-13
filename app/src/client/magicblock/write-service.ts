/**
 * MagicBlock write orchestration.
 *
 * This service groups command handlers behind the backend-neutral
 * `GameWriteAdapter`. Today the handlers delegate to the legacy client; over
 * time the concrete transaction code can move into `MagicBlockActionWriter` and
 * `MagicBlockTradeWriter` without changing game-facing ports.
 */
import type { GameWriteAdapter } from "../../game/ports";
import type { MagicBlockClientCore as LegacyMagicBlockClientCore } from "./legacy-client-core";
import { MagicBlockActionWriter } from "./action-writer";
import { MagicBlockTradeWriter } from "./trade-writer";

/** Combines action and trade command writers into one write adapter. */
export class MagicBlockWriteService implements GameWriteAdapter {
  private readonly actions: MagicBlockActionWriter;
  private readonly trades: MagicBlockTradeWriter;

  /** Creates focused command writers for gameplay actions and trades. */
  constructor(legacy: LegacyMagicBlockClientCore) {
    this.actions = new MagicBlockActionWriter(legacy);
    this.trades = new MagicBlockTradeWriter(legacy);
  }

  movePlayer: GameWriteAdapter["movePlayer"] = (point) =>
    this.actions.movePlayer(point);

  sleepPlayer: GameWriteAdapter["sleepPlayer"] = () =>
    this.actions.sleepPlayer();

  performAction: GameWriteAdapter["performAction"] = (
    mode,
    point,
    selectedItemId,
    selectedQuantity
  ) =>
    this.actions.performAction(mode, point, selectedItemId, selectedQuantity);

  createTradeOffer: GameWriteAdapter["createTradeOffer"] = (args) =>
    this.trades.createTradeOffer(args);

  acceptTradeOffer: GameWriteAdapter["acceptTradeOffer"] = (offer) =>
    this.trades.acceptTradeOffer(offer);

  cancelTradeOffer: GameWriteAdapter["cancelTradeOffer"] = (offer) =>
    this.trades.cancelTradeOffer(offer);

  finalizeTradeOffer: GameWriteAdapter["finalizeTradeOffer"] = (offer) =>
    this.trades.finalizeTradeOffer(offer);
}
