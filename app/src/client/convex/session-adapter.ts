import { makeFunctionReference } from "convex/server";
import type { GameSessionAdapter } from "../../game/ports";
import type { GameStateStore } from "../../game/state-store";
import type { PlayerAppearance, SelectedPlayerSummary } from "../../game/types";
import type { ConvexGameMutationClient } from "./write-adapter";

type PrepareConvexPlayerArgs = {
  worldKey: string;
  playerKey: string;
  owner?: string;
  appearance?: PlayerAppearance;
};

const refs = {
  prepareConvexPlayer: makeFunctionReference<
    "mutation",
    PrepareConvexPlayerArgs,
    {
      worldKey: string;
      playerKey: string;
      owner: string;
      color: string;
    }
  >("game/worlds:prepareConvexPlayer"),
};

export type ConvexSessionAdapterArgs = {
  worldKey: string;
  playerKey: string;
  owner: string;
  appearance: PlayerAppearance;
  state: GameStateStore;
  client: ConvexGameMutationClient;
  onError?: (error: Error) => void;
};

export class ConvexSessionAdapter implements GameSessionAdapter {
  readonly selectedPlayer$: GameSessionAdapter["selectedPlayer$"];

  private selectedPlayer: SelectedPlayerSummary | null = null;

  constructor(private readonly args: ConvexSessionAdapterArgs) {
    this.selectedPlayer$ = args.state.selectedPlayer$;
  }

  async boot() {
    this.selectedPlayer = this.selection();
    this.args.state.setSelectedPlayer(this.selectedPlayer);
  }

  hasSelectedPlayer() {
    return this.selectedPlayer !== null;
  }

  async prepareSelectedPlayer() {
    try {
      const prepared = await this.args.client.mutation(
        refs.prepareConvexPlayer,
        {
          worldKey: this.args.worldKey,
          playerKey: this.args.playerKey,
          owner: this.args.owner,
          appearance: this.args.appearance,
        }
      );

      this.selectedPlayer = {
        mint: prepared.playerKey,
        owner: prepared.owner,
        color: prepared.color,
      };
      this.args.state.setSelectedPlayer(this.selectedPlayer);
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.args.onError?.(normalized);
      throw normalized;
    }
  }

  private selection(): SelectedPlayerSummary {
    return {
      mint: this.args.playerKey,
      owner: this.args.owner,
      color: this.args.appearance.color,
    };
  }
}
