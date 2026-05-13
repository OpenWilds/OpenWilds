/**
 * MagicBlock session orchestration.
 *
 * Combines selected-player state, boot flow, and provisioning. It translates
 * MagicBlock-specific player NFT objects into domain-only summaries before
 * publishing them through the shared state store.
 */
import type { GameSessionAdapter } from "../../game/ports";
import type { GameStateStore } from "../../game/state-store";
import type { SelectedPlayerSummary } from "../../game/types";
import type { PlayerNft } from "../player-nft";
import type { MagicBlockClientCore as LegacyMagicBlockClientCore } from "./legacy-client-core";
import { MagicBlockProvisioningService } from "./provisioning-service";

/** Implements the backend-neutral session port for MagicBlock. */
export class MagicBlockSessionService implements GameSessionAdapter {
  readonly selectedPlayer$: GameSessionAdapter["selectedPlayer$"];

  private readonly unsubscribeSelection: () => void;
  private readonly provisioning: MagicBlockProvisioningService;

  /** Bridges legacy selection callbacks and composes provisioning behavior. */
  constructor(
    private readonly legacy: LegacyMagicBlockClientCore,
    private readonly state: GameStateStore
  ) {
    this.provisioning = new MagicBlockProvisioningService(this.legacy);
    this.selectedPlayer$ = this.state.selectedPlayer$;
    this.unsubscribeSelection = this.legacy.subscribePlayerSelection((player) =>
      this.state.setSelectedPlayer(
        player ? this.toSelectedPlayerSummary(player) : null
      )
    );
  }

  boot: GameSessionAdapter["boot"] = () => this.legacy.boot();

  hasSelectedPlayer: GameSessionAdapter["hasSelectedPlayer"] = () =>
    this.legacy.hasSelectedPlayer();

  prepareSelectedPlayer: GameSessionAdapter["prepareSelectedPlayer"] = () =>
    this.provisioning.prepareSelectedPlayer();

  /** Detaches the selected-player bridge from the legacy client. */
  dispose() {
    this.unsubscribeSelection();
  }

  /** Removes Solana-specific fields before exposing player selection to UI. */
  private toSelectedPlayerSummary(player: PlayerNft): SelectedPlayerSummary {
    return {
      mint: player.mint.toBase58(),
      owner: player.owner.toBase58(),
      color: player.color,
    };
  }
}
