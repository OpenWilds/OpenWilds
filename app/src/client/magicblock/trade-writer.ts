/**
 * MagicBlock trade command writer.
 *
 * Isolates trade create/accept/cancel/finalize commands from movement and tile
 * actions. Base-layer trade routing remains in the native runtime until the
 * concrete transaction code is moved here.
 */
import type { GameWriteAdapter } from "../../game/ports";
import type { MagicBlockNativeClientCore } from "./native-client-core";

type TradeWriteMethods = Pick<
  GameWriteAdapter,
  | "createTradeOffer"
  | "acceptTradeOffer"
  | "cancelTradeOffer"
  | "finalizeTradeOffer"
>;

/** MagicBlock writer for trade commands. */
export class MagicBlockTradeWriter implements TradeWriteMethods {
  /** Receives the current native runtime used by all MagicBlock trade writes. */
  constructor(private readonly runtime: MagicBlockNativeClientCore) {}

  createTradeOffer: GameWriteAdapter["createTradeOffer"] = (args) =>
    this.runtime.createTradeOffer(args);

  acceptTradeOffer: GameWriteAdapter["acceptTradeOffer"] = (offer) =>
    this.runtime.acceptTradeOffer(offer);

  cancelTradeOffer: GameWriteAdapter["cancelTradeOffer"] = (offer) =>
    this.runtime.cancelTradeOffer(offer);

  finalizeTradeOffer: GameWriteAdapter["finalizeTradeOffer"] = (offer) =>
    this.runtime.finalizeTradeOffer(offer);
}
