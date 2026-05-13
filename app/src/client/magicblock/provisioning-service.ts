/**
 * MagicBlock player provisioning boundary.
 *
 * This is the place for player setup concerns: loading world config, ensuring
 * component accounts exist, delegation readiness, starter inventory, and any
 * preparation required before Phaser starts. It currently forwards to the
 * runtime core while that logic is extracted.
 */
import type { MagicBlockNativeClientCore } from "./native-client-core";

/** Prepares the selected player for entering the game world. */
export class MagicBlockProvisioningService {
  /** Receives the native implementation until provisioning code is moved here. */
  constructor(private readonly runtime: MagicBlockNativeClientCore) {}

  /** Ensures the selected player has the required on-chain world state. */
  prepareSelectedPlayer() {
    return this.runtime.prepareSelectedPlayer();
  }
}
