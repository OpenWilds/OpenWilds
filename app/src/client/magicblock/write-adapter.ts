import type { GameWriteAdapter } from "../../game/ports";
import type { MagicBlockClientCore } from "./client-core";

export class MagicBlockWriteAdapter implements GameWriteAdapter {
  constructor(private readonly core: MagicBlockClientCore) {}

  movePlayer: GameWriteAdapter["movePlayer"] = (point) =>
    this.core.movePlayer(point);

  sleepPlayer: GameWriteAdapter["sleepPlayer"] = () => this.core.sleepPlayer();

  performAction: GameWriteAdapter["performAction"] = (
    mode,
    point,
    selectedItemId,
    selectedQuantity
  ) => this.core.performAction(mode, point, selectedItemId, selectedQuantity);

  createTradeOffer: GameWriteAdapter["createTradeOffer"] = (args) =>
    this.core.createTradeOffer(args);

  acceptTradeOffer: GameWriteAdapter["acceptTradeOffer"] = (offer) =>
    this.core.acceptTradeOffer(offer);

  cancelTradeOffer: GameWriteAdapter["cancelTradeOffer"] = (offer) =>
    this.core.cancelTradeOffer(offer);

  finalizeTradeOffer: GameWriteAdapter["finalizeTradeOffer"] = (offer) =>
    this.core.finalizeTradeOffer(offer);
}
