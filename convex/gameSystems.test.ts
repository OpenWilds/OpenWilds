// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const testUser = "test-user";

const authedTest = () =>
  convexTest(schema, modules).withIdentity({
    subject: `${testUser}|test-session`,
    tokenIdentifier: `https://convex.test|${testUser}`,
  });

describe("Convex ECS systems", () => {
  it("creates a Convex-write world with seeded world items", async () => {
    const t = authedTest();

    await t.mutation(api.game.worlds.createConvexWorld, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });
    const model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });

    expect(model.visiblePlayers[0]).toMatchObject({
      mint: "player-a",
      owner: testUser,
    });
    expect(model.playerActionState.position).toEqual({ x: 0, y: 0 });
    expect(model.goldBalance.amount).toBe(50n);
    expect(model.tileItems).toHaveLength(9);
  });

  it("prepares players idempotently without resetting state", async () => {
    const t = authedTest();

    await t.mutation(api.game.worlds.prepareConvexPlayer, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });
    await t.mutation(api.game.systems.movement.movePlayer, {
      worldKey: "convex-world",
      playerKey: "player-a",
      point: { x: 2, y: 1 },
    });
    await t.mutation(api.game.worlds.prepareConvexPlayer, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });
    const model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });

    expect(model.playerActionState.position).toEqual({ x: 2, y: 1 });
  });

  it("rejects systems for non-Convex-write worlds", async () => {
    const t = authedTest();

    await t.mutation(internal.game.ingest.upsertWorld, {
      worldKey: "magic-world",
      name: "Magic World",
      runtimeKind: "magicblock-indexed",
      readBackend: "convex",
      writeBackend: "magicblock",
    });

    await expect(
      t.mutation(api.game.systems.movement.movePlayer, {
        worldKey: "magic-world",
        playerKey: "player-a",
        point: { x: 1, y: 1 },
      })
    ).rejects.toThrow("does not use Convex writes");
  });

  it("moves players through the Convex movement system", async () => {
    const t = authedTest();

    await t.mutation(api.game.worlds.prepareConvexPlayer, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });
    const moved = await t.mutation(api.game.systems.movement.movePlayer, {
      worldKey: "convex-world",
      playerKey: "player-a",
      point: { x: 2, y: 3 },
    });
    const model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });

    expect(moved.position).toEqual({ x: 2, y: 3 });
    expect(moved.activeAction.kind).toBe("move");
    expect(model.playerActionState.position).toEqual({ x: 2, y: 3 });
    expect(model.playerActionState.energy.current).toBe(5);
  });

  it("updates tile items, farm tiles, and inventory through tile systems", async () => {
    const t = authedTest();

    await t.mutation(api.game.worlds.prepareConvexPlayer, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });
    const grabbed = await t.mutation(
      api.game.systems.tileActions.performTileAction,
      {
        worldKey: "convex-world",
        playerKey: "player-a",
        mode: "grab",
        point: { x: 9, y: 10 },
      }
    );

    expect("item" in grabbed ? grabbed.item : undefined).toBeNull();

    await resetPlayerAction(t, "convex-world", "player-a");
    const tilled = await t.mutation(
      api.game.systems.tileActions.performTileAction,
      {
        worldKey: "convex-world",
        playerKey: "player-a",
        mode: "till",
        point: { x: 2, y: 2 },
      }
    );

    expect("tile" in tilled ? tilled.tile.soilState : undefined).toBe("tilled");

    await resetPlayerAction(t, "convex-world", "player-a");
    const planted = await t.mutation(
      api.game.systems.tileActions.performTileAction,
      {
        worldKey: "convex-world",
        playerKey: "player-a",
        mode: "plant",
        point: { x: 2, y: 2 },
        selectedItemId: 100,
        selectedQuantity: 1,
      }
    );

    expect("tile" in planted ? planted.tile.farmTypeId : undefined).toBe(1);

    await resetPlayerAction(t, "convex-world", "player-a");
    await t.mutation(internal.game.ingest.upsertFarmTile, {
      worldKey: "convex-world",
      x: 2,
      y: 2,
      soilState: "tilled",
      farmTypeId: 1,
      plantedAt: 1,
      growthSeconds: 2 * 24 * 60 * 60,
      growthUpdatedAt: 1,
      wateredUntil: 999999999,
      lastHarvestedAt: 0,
      harvestCount: 0,
      ...freshness(),
    });
    const harvested = await t.mutation(
      api.game.systems.tileActions.performTileAction,
      {
        worldKey: "convex-world",
        playerKey: "player-a",
        mode: "harvest",
        point: { x: 2, y: 2 },
      }
    );

    expect("tile" in harvested ? harvested.tile.harvestCount : undefined).toBe(
      1
    );

    await resetPlayerAction(t, "convex-world", "player-a");
    const dropped = await t.mutation(
      api.game.systems.tileActions.performTileAction,
      {
        worldKey: "convex-world",
        playerKey: "player-a",
        mode: "drop",
        point: { x: 3, y: 3 },
        selectedItemId: 101,
        selectedQuantity: 1,
      }
    );
    const model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "convex-world",
      playerKey: "player-a",
    });

    expect("item" in dropped ? dropped.item : undefined).toMatchObject({
      x: 3,
      y: 3,
      itemId: 101,
    });
    expect(model.tileItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 3, y: 3, itemId: 101, quantity: 1 }),
      ])
    );
  });

  it("creates, accepts, finalizes, and cancels trades", async () => {
    const t = authedTest();

    await t.mutation(api.game.worlds.prepareConvexPlayer, {
      worldKey: "convex-world",
      playerKey: "buyer",
    });
    await t.mutation(api.game.worlds.prepareConvexPlayer, {
      worldKey: "convex-world",
      playerKey: "seller",
    });
    const created = await t.mutation(api.game.systems.trades.createTradeOffer, {
      worldKey: "convex-world",
      playerKey: "buyer",
      sellerMint: "seller",
      itemId: 101,
      itemQuantity: 1,
      goldAmount: 10,
    });

    await t.mutation(api.game.systems.trades.acceptTradeOffer, {
      worldKey: "convex-world",
      playerKey: "seller",
      offer: created.offer,
    });
    await t.mutation(api.game.systems.trades.finalizeTradeOffer, {
      worldKey: "convex-world",
      playerKey: "buyer",
      offer: created.offer,
    });
    let model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "convex-world",
      playerKey: "buyer",
    });

    expect(model.tradeOffers[0]).toMatchObject({
      offer: created.offer,
      status: "finalized",
    });

    await t.mutation(api.game.systems.trades.cancelTradeOffer, {
      worldKey: "convex-world",
      playerKey: "buyer",
      offer: created.offer,
    });
    model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "convex-world",
      playerKey: "buyer",
    });

    expect(model.tradeOffers).toEqual([]);
  });
});

const freshness = () => ({
  source: "convex" as const,
  revision: Date.now() + 100000,
  updatedAt: Date.now() + 100000,
});

const resetPlayerAction = async (
  t: ReturnType<typeof authedTest>,
  worldKey: string,
  playerKey: string
) =>
  await t.mutation(internal.game.ingest.upsertPlayerState, {
    worldKey,
    playerKey,
    position: { x: 0, y: 0 },
    energy: { current: 10, max: 10 },
    activeAction: {
      action: 0,
      kind: "idle",
      startedAt: 0,
      endsAt: 0,
    },
    ...freshness(),
  });
