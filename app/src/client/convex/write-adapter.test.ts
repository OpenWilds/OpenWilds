import { describe, expect, it } from "vitest";
import type { FunctionReference } from "convex/server";
import {
  ConvexWriteAdapter,
  type ConvexGameMutationClient,
} from "./write-adapter";
import type { ActionResult, PlayerActionState } from "../../game/types";

class FakeConvexMutationClient implements ConvexGameMutationClient {
  readonly calls: unknown[] = [];
  readonly responses: unknown[] = [];

  async mutation<Mutation extends FunctionReference<"mutation">>(
    _mutation: Mutation,
    args: Mutation["_args"]
  ): Promise<Mutation["_returnType"]> {
    this.calls.push(args);
    return this.responses.shift() as Mutation["_returnType"];
  }
}

describe("ConvexWriteAdapter", () => {
  it("calls Convex movement mutations with world and player context", async () => {
    const client = new FakeConvexMutationClient();
    const adapter = new ConvexWriteAdapter({
      worldKey: "world-1",
      playerKey: "player-a",
      client,
    });
    const state = playerState({ x: 2, y: 3 });
    client.responses.push(state);

    const moved = await adapter.movePlayer({ x: 2, y: 3 });

    expect(moved).toEqual(state);
    expect(client.calls[0]).toEqual({
      worldKey: "world-1",
      playerKey: "player-a",
      point: { x: 2, y: 3 },
    });
  });

  it("calls Convex tile action mutations and returns domain results", async () => {
    const client = new FakeConvexMutationClient();
    const adapter = new ConvexWriteAdapter({
      worldKey: "world-1",
      playerKey: "player-a",
      client,
    });
    const result: ActionResult = {
      player: playerState({ x: 1, y: 1 }),
      item: { x: 1, y: 1, itemId: 7, quantity: 2 },
    };
    client.responses.push(result);

    const dropped = await adapter.performAction("drop", { x: 1, y: 1 }, 7, 2);

    expect(dropped).toEqual(result);
    expect(client.calls[0]).toEqual({
      worldKey: "world-1",
      playerKey: "player-a",
      mode: "drop",
      point: { x: 1, y: 1 },
      selectedItemId: 7,
      selectedQuantity: 2,
    });
  });

  it("calls Convex trade mutations with selected player context", async () => {
    const client = new FakeConvexMutationClient();
    const adapter = new ConvexWriteAdapter({
      worldKey: "world-1",
      playerKey: "buyer",
      client,
    });
    client.responses.push({ offer: "offer-1", offerId: "1" }, null);

    await adapter.createTradeOffer({
      sellerMint: "seller",
      itemId: 4,
      itemQuantity: 2,
      goldAmount: 10,
    });
    await adapter.finalizeTradeOffer("offer-1");

    expect(client.calls).toEqual([
      {
        worldKey: "world-1",
        playerKey: "buyer",
        sellerMint: "seller",
        itemId: 4,
        itemQuantity: 2,
        goldAmount: 10,
      },
      {
        worldKey: "world-1",
        playerKey: "buyer",
        offer: "offer-1",
      },
    ]);
  });
});

const playerState = (position: {
  x: number;
  y: number;
}): PlayerActionState => ({
  position,
  energy: { current: 9, max: 10 },
  activeAction: {
    action: 1,
    kind: "move",
    startedAt: 1,
    endsAt: 2,
  },
});
