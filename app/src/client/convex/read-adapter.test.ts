import { describe, expect, it } from "vitest";
import type { FunctionReference } from "convex/server";
import {
  ConvexReadAdapter,
  type ConvexGameReadModel,
  type ConvexGameReadQueryClient,
} from "./read-adapter";
import {
  createDefaultGameStateSnapshot,
  GameStateStore,
} from "../../game/state-store";

type Watcher = {
  args: { worldKey: string; playerKey: string | null };
  callback: (snapshot: ConvexGameReadModel) => void;
  unsubscribed: boolean;
};

class FakeConvexReadClient implements ConvexGameReadQueryClient {
  readonly watchers: Watcher[] = [];

  onUpdate<Query extends FunctionReference<"query">>(
    _query: Query,
    args: Query["_args"],
    callback: (result: Query["_returnType"]) => unknown
  ) {
    const watcher: Watcher = {
      args: args as Watcher["args"],
      callback: callback as Watcher["callback"],
      unsubscribed: false,
    };
    this.watchers.push(watcher);

    return () => {
      watcher.unsubscribed = true;
    };
  }

  emit(index: number, snapshot: ConvexGameReadModel) {
    this.watchers[index]?.callback(snapshot);
  }
}

describe("ConvexReadAdapter", () => {
  it("emits cached defaults before Convex returns a snapshot", () => {
    const state = new GameStateStore();
    const client = new FakeConvexReadClient();
    const adapter = new ConvexReadAdapter({
      worldKey: "world-1",
      state,
      client,
    });
    const positions: string[] = [];
    const subscription = adapter.playerActionState$.subscribe((player) =>
      positions.push(`${player.position.x},${player.position.y}`)
    );

    expect(positions).toEqual(["0,0"]);
    expect(client.watchers[0].args).toEqual({
      worldKey: "world-1",
      playerKey: null,
    });

    subscription.unsubscribe();
    adapter.dispose();
    state.dispose();
  });

  it("publishes Convex snapshots into game read streams", () => {
    const state = new GameStateStore();
    const client = new FakeConvexReadClient();
    const adapter = new ConvexReadAdapter({
      worldKey: "world-1",
      state,
      client,
    });
    const positions: string[] = [];
    const goldAmounts: string[] = [];
    const positionSubscription = adapter.playerActionState$.subscribe(
      (player) => positions.push(`${player.position.x},${player.position.y}`)
    );
    const goldSubscription = adapter.goldBalance$.subscribe((gold) =>
      goldAmounts.push(gold.amount.toString())
    );

    client.emit(
      0,
      readModel({
        playerActionState: {
          position: { x: 7, y: 8 },
          energy: { current: 4, max: 10 },
          activeAction: {
            action: 1,
            kind: "move",
            startedAt: 10,
            endsAt: 11,
          },
        },
        goldBalance: { amount: 42n },
      })
    );

    expect(positions).toEqual(["0,0", "7,8"]);
    expect(goldAmounts).toEqual(["0", "42"]);

    positionSubscription.unsubscribe();
    goldSubscription.unsubscribe();
    adapter.dispose();
    state.dispose();
  });

  it("resubscribes when the selected player changes", () => {
    const state = new GameStateStore();
    const client = new FakeConvexReadClient();
    const adapter = new ConvexReadAdapter({
      worldKey: "world-1",
      state,
      client,
    });

    state.setSelectedPlayer({
      mint: "player-a",
      owner: "owner-a",
      color: "rose",
    });
    state.setSelectedPlayer({
      mint: "player-a",
      owner: "owner-a",
      color: "rose",
    });

    expect(client.watchers).toHaveLength(2);
    expect(client.watchers[0].unsubscribed).toBe(true);
    expect(client.watchers[1].args).toEqual({
      worldKey: "world-1",
      playerKey: "player-a",
    });

    adapter.dispose();
    state.dispose();
  });

  it("unsubscribes active Convex watches on dispose", () => {
    const state = new GameStateStore();
    const client = new FakeConvexReadClient();
    const adapter = new ConvexReadAdapter({
      worldKey: "world-1",
      state,
      client,
    });

    adapter.dispose();
    state.setSelectedPlayer({
      mint: "player-after-dispose",
      owner: "owner",
      color: "blue",
    });

    expect(client.watchers).toHaveLength(1);
    expect(client.watchers[0].unsubscribed).toBe(true);

    state.dispose();
  });
});

const readModel = (
  overrides: Partial<ConvexGameReadModel> = {}
): ConvexGameReadModel => {
  const defaults = createDefaultGameStateSnapshot();

  return {
    playerActionState: defaults.playerActionState,
    playerAppearance: defaults.playerAppearance,
    visiblePlayers: defaults.visiblePlayers,
    inventory: defaults.inventory,
    goldBalance: defaults.goldBalance,
    tradeOffers: defaults.tradeOffers,
    farmTiles: defaults.farmTiles,
    tileItems: defaults.tileItems,
    ...overrides,
  };
};
