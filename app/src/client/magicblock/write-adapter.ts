/**
 * MagicBlock write adapter wrapper.
 *
 * Exposes the MagicBlock write service as the public `GameWriteAdapter`. It is
 * deliberately pass-through so write composition stays obvious in backend
 * factories.
 */
import type { GameWriteAdapter } from "../../game/ports";

/** Exposes MagicBlock write commands through the backend-neutral write port. */
export class MagicBlockWriteAdapter implements GameWriteAdapter {
  /** Receives the already-composed MagicBlock write service. */
  constructor(private readonly service: GameWriteAdapter) {}

  movePlayer: GameWriteAdapter["movePlayer"] = (point) =>
    this.service.movePlayer(point);

  sleepPlayer: GameWriteAdapter["sleepPlayer"] = () =>
    this.service.sleepPlayer();

  performAction: GameWriteAdapter["performAction"] = (
    mode,
    point,
    selectedItemId,
    selectedQuantity
  ) =>
    this.service.performAction(mode, point, selectedItemId, selectedQuantity);

  createTradeOffer: GameWriteAdapter["createTradeOffer"] = (args) =>
    this.service.createTradeOffer(args);

  acceptTradeOffer: GameWriteAdapter["acceptTradeOffer"] = (offer) =>
    this.service.acceptTradeOffer(offer);

  cancelTradeOffer: GameWriteAdapter["cancelTradeOffer"] = (offer) =>
    this.service.cancelTradeOffer(offer);

  finalizeTradeOffer: GameWriteAdapter["finalizeTradeOffer"] = (offer) =>
    this.service.finalizeTradeOffer(offer);
}
