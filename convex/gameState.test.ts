// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("gameState Convex read model", () => {
  it("seeds a dev world and returns the shared read model", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.game.dev.seedDevWorld, {
      worldKey: "test-world",
      playerKey: "player-a",
    });
    const model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "test-world",
      playerKey: "player-a",
    });

    expect(model.playerActionState.position).toEqual({ x: 2, y: 3 });
    expect(model.inventory.slots).toEqual([{ itemId: 1, quantity: 6 }]);
    expect(model.goldBalance.amount).toBe(50n);
    expect(model.visiblePlayers[0]).toMatchObject({
      mint: "player-a",
      owner: "dev-owner",
      isActive: true,
    });
    expect(model.farmTiles).toHaveLength(1);
    expect(model.tileItems).toHaveLength(1);
  });

  it("keeps the legacy gameState API as a compatibility facade", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.gameState.seedDevWorld, {
      worldKey: "compat-world",
      playerKey: "player-a",
    });
    const model = await t.query(api.gameState.getWorldReadModel, {
      worldKey: "compat-world",
      playerKey: "player-a",
    });

    expect(model.playerActionState.position).toEqual({ x: 2, y: 3 });
    expect(model.visiblePlayers[0]).toMatchObject({
      mint: "player-a",
      isActive: true,
    });
  });

  it("ignores stale revisions", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.game.ingest.upsertPlayerState, {
      worldKey: "test-world",
      playerKey: "player-a",
      position: { x: 5, y: 6 },
      energy: { current: 8, max: 10 },
      activeAction: idleAction(),
      ...freshness(10),
    });
    await t.mutation(internal.game.ingest.upsertPlayerState, {
      worldKey: "test-world",
      playerKey: "player-a",
      position: { x: 99, y: 99 },
      energy: { current: 1, max: 10 },
      activeAction: idleAction(),
      ...freshness(9),
    });
    const model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "test-world",
      playerKey: "player-a",
    });

    expect(model.playerActionState.position).toEqual({ x: 5, y: 6 });
    expect(model.playerActionState.energy.current).toBe(8);
  });

  it("returns default player state with world-scoped tiles and items", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.game.ingest.upsertFarmTile, {
      worldKey: "test-world",
      x: 1,
      y: 2,
      soilState: "tilled",
      farmTypeId: 3,
      plantedAt: 10,
      growthSeconds: 60,
      growthUpdatedAt: 11,
      wateredUntil: 12,
      lastHarvestedAt: 0,
      harvestCount: 0,
      ...freshness(1),
    });
    await t.mutation(internal.game.ingest.upsertTileItem, {
      worldKey: "test-world",
      x: 2,
      y: 3,
      itemId: 7,
      quantity: 2,
      ...freshness(1),
    });
    const model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "test-world",
      playerKey: null,
    });

    expect(model.playerActionState.position).toEqual({ x: 0, y: 0 });
    expect(model.inventory.slots).toEqual([]);
    expect(model.farmTiles[0]).toMatchObject({
      x: 1,
      y: 2,
      soilState: "tilled",
    });
    expect(model.tileItems[0]).toMatchObject({
      x: 2,
      y: 3,
      itemId: 7,
      quantity: 2,
    });
  });

  it("returns incoming and outgoing trade offers for the selected player", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.game.ingest.upsertTradeOffer, {
      ...tradeOffer("outgoing-offer"),
      worldKey: "test-world",
      buyerPlayerMint: "player-a",
      sellerPlayerMint: "player-b",
      ...freshness(1),
    });
    await t.mutation(internal.game.ingest.upsertTradeOffer, {
      ...tradeOffer("incoming-offer"),
      worldKey: "test-world",
      buyerPlayerMint: "player-c",
      sellerPlayerMint: "player-a",
      ...freshness(2),
    });
    const model = await t.query(api.game.readModel.getWorldReadModel, {
      worldKey: "test-world",
      playerKey: "player-a",
    });

    expect(model.tradeOffers).toEqual([
      expect.objectContaining({
        offer: "incoming-offer",
        direction: "incoming",
      }),
      expect.objectContaining({
        offer: "outgoing-offer",
        direction: "outgoing",
      }),
    ]);
  });
});

const freshness = (revision: number) => ({
  source: "convex" as const,
  revision,
  updatedAt: revision,
});

const idleAction = () => ({
  action: 0,
  kind: "idle" as const,
  startedAt: 0,
  endsAt: 0,
});

const tradeOffer = (offer: string) => ({
  offer,
  offerId: offer,
  buyer: "buyer",
  seller: "seller",
  buyerEntity: "buyer-entity",
  sellerEntity: "seller-entity",
  itemId: 4,
  itemQuantity: 2,
  goldAmount: 10n,
  expiresAt: 100,
  status: "open" as const,
});
