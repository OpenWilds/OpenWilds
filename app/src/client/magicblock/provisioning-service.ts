/**
 * MagicBlock player provisioning boundary.
 *
 * This is the place for player setup concerns: loading world config, ensuring
 * component accounts exist, delegation readiness, starter inventory, and any
 * preparation required before Phaser starts. It currently forwards to the
 * legacy core while that logic is extracted.
 */
import type { MagicBlockClientCore as LegacyMagicBlockClientCore } from "./legacy-client-core";

/** Prepares the selected player for entering the game world. */
export class MagicBlockProvisioningService {
  /** Receives the legacy implementation until provisioning code is moved here. */
  constructor(private readonly legacy: LegacyMagicBlockClientCore) {}

  /** Ensures the selected player has the required on-chain world state. */
  prepareSelectedPlayer() {
    return this.legacy.prepareSelectedPlayer();
  }
}
