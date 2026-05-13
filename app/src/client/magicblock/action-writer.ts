/**
 * MagicBlock gameplay command writer.
 *
 * Owns player movement, sleep, and tile/item action commands. The current
 * implementation delegates to the legacy client so runtime behavior stays
 * stable while the transaction code is extracted behind this boundary.
 */
import type { GameWriteAdapter } from "../../game/ports";
import type { MagicBlockClientCore as LegacyMagicBlockClientCore } from "./legacy-client-core";

type ActionWriteMethods = Pick<
  GameWriteAdapter,
  "movePlayer" | "sleepPlayer" | "performAction"
>;

/** MagicBlock writer for gameplay actions. */
export class MagicBlockActionWriter implements ActionWriteMethods {
  /** Receives the current legacy executor used by all MagicBlock commands. */
  constructor(private readonly legacy: LegacyMagicBlockClientCore) {}

  movePlayer: GameWriteAdapter["movePlayer"] = (point) =>
    this.legacy.movePlayer(point);

  sleepPlayer: GameWriteAdapter["sleepPlayer"] = () =>
    this.legacy.sleepPlayer();

  performAction: GameWriteAdapter["performAction"] = (
    mode,
    point,
    selectedItemId,
    selectedQuantity
  ) => this.legacy.performAction(mode, point, selectedItemId, selectedQuantity);
}
