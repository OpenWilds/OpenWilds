import type {
  GameSessionAdapter,
  SelectedPlayerSummary,
} from "../../game/ports";
import type { PlayerNft } from "../player-nft";
import type { MagicBlockClientCore } from "./client-core";

export class MagicBlockSessionAdapter implements GameSessionAdapter {
  constructor(private readonly core: MagicBlockClientCore) {}

  boot: GameSessionAdapter["boot"] = () => this.core.boot();

  hasSelectedPlayer: GameSessionAdapter["hasSelectedPlayer"] = () =>
    this.core.hasSelectedPlayer();

  prepareSelectedPlayer: GameSessionAdapter["prepareSelectedPlayer"] = () =>
    this.core.prepareSelectedPlayer();

  subscribePlayerSelection: GameSessionAdapter["subscribePlayerSelection"] = (
    listener
  ) =>
    this.core.subscribePlayerSelection((player) =>
      listener(player ? this.toSelectedPlayerSummary(player) : null)
    );

  private toSelectedPlayerSummary(player: PlayerNft): SelectedPlayerSummary {
    return {
      mint: player.mint.toBase58(),
      owner: player.owner.toBase58(),
      color: player.color,
    };
  }
}
