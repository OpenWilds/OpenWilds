/**
 * MagicBlock agent-session orchestration.
 *
 * Owns the active Agent Mode command boundary. The control binder supplies the
 * delegate key and prepared BOLT session transaction values; the runtime then
 * performs the MagicBlock/Solana reads and writes without pulling those command
 * inputs from DOM controls.
 */
import type { MagicBlockNativeClientCore } from "./native-client-core";

/** Coordinates Agent Mode grant/revoke/status commands for the HUD binder. */
export class MagicBlockAgentSessionService {
  constructor(private readonly runtime: MagicBlockNativeClientCore) {}

  /** Refreshes Agent Mode status for the delegate text currently in the UI. */
  refreshStatus(delegateValue: string) {
    return this.runtime.refreshAgentModeStatusForInput(delegateValue);
  }

  /** Grants full-control Agent Mode after ensuring the BOLT session exists. */
  grant(delegateValue: string, preparedTransactionValue: string) {
    return this.runtime.grantAgentSessionForInput(
      delegateValue,
      preparedTransactionValue
    );
  }

  /** Revokes Open Wilds Agent Mode scopes for the supplied delegate. */
  revoke(delegateValue: string) {
    return this.runtime.revokeAgentSessionForInput(delegateValue);
  }
}
