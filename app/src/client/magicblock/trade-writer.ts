/**
 * MagicBlock trade command writer.
 *
 * Isolates trade create/accept/cancel/finalize commands from movement and tile
 * actions. Base-layer trade routing remains in the legacy executor until the
 * concrete transaction code is moved here.
 */
import type { GameWriteAdapter } from "../../game/ports";
import type { MagicBlockClientCore as LegacyMagicBlockClientCore } from "./legacy-client-core";

type TradeWriteMethods = Pick<
  GameWriteAdapter,
  | "createTradeOffer"
  | "acceptTradeOffer"
  | "cancelTradeOffer"
  | "finalizeTradeOffer"
>;

/** MagicBlock writer for trade commands. */
export class MagicBlockTradeWriter implements TradeWriteMethods {
  /** Receives the current legacy executor used by all MagicBlock trade writes. */
  constructor(private readonly legacy: LegacyMagicBlockClientCore) {}

  createTradeOffer: GameWriteAdapter["createTradeOffer"] = (args) =>
    this.legacy.createTradeOffer(args);

  acceptTradeOffer: GameWriteAdapter["acceptTradeOffer"] = (offer) =>
    this.legacy.acceptTradeOffer(offer);

  cancelTradeOffer: GameWriteAdapter["cancelTradeOffer"] = (offer) =>
    this.legacy.cancelTradeOffer(offer);

  finalizeTradeOffer: GameWriteAdapter["finalizeTradeOffer"] = (offer) =>
    this.legacy.finalizeTradeOffer(offer);
}
