/**
 * MagicBlock gameplay command writer.
 *
 * Owns player movement, sleep, and tile/item action commands. The current
 * implementation delegates to the native runtime so runtime behavior stays
 * stable while the transaction code is extracted behind this boundary.
 */
import type { GameWriteAdapter } from "../../game/ports";
import type { MagicBlockNativeClientCore } from "./native-client-core";

type ActionWriteMethods = Pick<
  GameWriteAdapter,
  "movePlayer" | "sleepPlayer" | "performAction"
>;

/** MagicBlock writer for gameplay actions. */
export class MagicBlockActionWriter implements ActionWriteMethods {
  /** Receives the current native runtime used by all MagicBlock commands. */
  constructor(private readonly runtime: MagicBlockNativeClientCore) {}

  movePlayer: GameWriteAdapter["movePlayer"] = (point) =>
    this.runtime.movePlayer(point);

  sleepPlayer: GameWriteAdapter["sleepPlayer"] = () =>
    this.runtime.sleepPlayer();

  performAction: GameWriteAdapter["performAction"] = (
    mode,
    point,
    selectedItemId,
    selectedQuantity
  ) =>
    this.runtime.performAction(mode, point, selectedItemId, selectedQuantity);
}
