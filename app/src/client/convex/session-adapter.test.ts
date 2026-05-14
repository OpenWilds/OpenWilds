import { describe, expect, it } from "vitest";
import type { FunctionReference } from "convex/server";
import { GameStateStore } from "../../game/state-store";
import { ConvexSessionAdapter } from "./session-adapter";
import type { ConvexGameMutationClient } from "./write-adapter";

class FakeConvexMutationClient implements ConvexGameMutationClient {
  readonly calls: unknown[] = [];

  async mutation<Mutation extends FunctionReference<"mutation">>(
    _mutation: Mutation,
    args: Mutation["_args"]
  ): Promise<Mutation["_returnType"]> {
    this.calls.push(args);
    return {
      worldKey: "world-1",
      playerKey: "player-a",
      owner: "owner-a",
      color: "#abcdef",
    } as Mutation["_returnType"];
  }
}

describe("ConvexSessionAdapter", () => {
  it("publishes the dev selected player on boot", async () => {
    const state = new GameStateStore();
    const client = new FakeConvexMutationClient();
    const adapter = new ConvexSessionAdapter({
      worldKey: "world-1",
      playerKey: "player-a",
      owner: "owner-a",
      appearance: appearance("#f4a7b9"),
      state,
      client,
    });
    const selections: Array<string | null> = [];
    const subscription = adapter.selectedPlayer$.subscribe((player) =>
      selections.push(player?.mint ?? null)
    );

    await adapter.boot();

    expect(adapter.hasSelectedPlayer()).toBe(true);
    expect(selections).toEqual([null, "player-a"]);

    subscription.unsubscribe();
    state.dispose();
  });

  it("prepares the selected player through Convex", async () => {
    const state = new GameStateStore();
    const client = new FakeConvexMutationClient();
    const adapter = new ConvexSessionAdapter({
      worldKey: "world-1",
      playerKey: "player-a",
      owner: "owner-a",
      appearance: appearance("#abcdef"),
      state,
      client,
    });
    const owners: Array<string | null> = [];
    const subscription = adapter.selectedPlayer$.subscribe((player) =>
      owners.push(player?.owner ?? null)
    );

    await adapter.prepareSelectedPlayer();

    expect(client.calls[0]).toEqual({
      worldKey: "world-1",
      playerKey: "player-a",
      owner: "owner-a",
      appearance: appearance("#abcdef"),
    });
    expect(owners).toEqual([null, "owner-a"]);

    subscription.unsubscribe();
    state.dispose();
  });
});

const appearance = (color: string) => ({
  color,
  fill: 0xf4a7b9,
  spriteAssetId: "player" as const,
  stroke: 0x1f2933,
});
