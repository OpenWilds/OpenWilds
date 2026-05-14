import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { shouldAcceptRevision } from "./freshness";
import {
  ensureWorld,
  getFarmTile,
  getGoldBalance,
  getInventory,
  getPlayer,
  getPlayerState,
  getTileItem,
  getTradeOffer,
  getWorldByKey,
  withoutUndefined,
} from "./queries";
import {
  upsertFarmTileArgs,
  upsertGoldBalanceArgs,
  upsertIndexerCheckpointArgs,
  upsertInventoryArgs,
  upsertPlayerArgs,
  upsertPlayerStateArgs,
  upsertTileItemArgs,
  upsertTradeOfferArgs,
  upsertWorldArgs,
} from "./validators";
import { gameTileKey } from "../shared/ids";

export const upsertWorld = internalMutation({
  args: upsertWorldArgs,
  handler: async (ctx, args) => upsertWorldDoc(ctx, args),
});

export const upsertPlayer = internalMutation({
  args: upsertPlayerArgs,
  handler: async (ctx, args) => upsertPlayerDoc(ctx, args),
});

export const upsertPlayerState = internalMutation({
  args: upsertPlayerStateArgs,
  handler: async (ctx, args) => upsertPlayerStateDoc(ctx, args),
});

export const upsertInventory = internalMutation({
  args: upsertInventoryArgs,
  handler: async (ctx, args) => upsertInventoryDoc(ctx, args),
});

export const upsertGoldBalance = internalMutation({
  args: upsertGoldBalanceArgs,
  handler: async (ctx, args) => upsertGoldBalanceDoc(ctx, args),
});

export const upsertFarmTile = internalMutation({
  args: upsertFarmTileArgs,
  handler: async (ctx, args) => upsertFarmTileDoc(ctx, args),
});

export const upsertTileItem = internalMutation({
  args: upsertTileItemArgs,
  handler: async (ctx, args) => upsertTileItemDoc(ctx, args),
});

export const upsertTradeOffer = internalMutation({
  args: upsertTradeOfferArgs,
  handler: async (ctx, args) => upsertTradeOfferDoc(ctx, args),
});

export const upsertIndexerCheckpoint = internalMutation({
  args: upsertIndexerCheckpointArgs,
  handler: async (ctx, args) => upsertIndexerCheckpointDoc(ctx, args),
});

export async function upsertWorldDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    name: string;
    runtimeKind: "magicblock-indexed" | "convex" | "mud-indexed";
    readBackend: "convex";
    writeBackend: "magicblock" | "convex" | "mud";
    workspaceId?: Id<"studioWorkspaces">;
    studioMapId?: Id<"studioMaps">;
    status?: "draft" | "active" | "archived";
    updatedAt?: number;
  }
) {
  const now = args.updatedAt ?? Date.now();
  const existing = await getWorldByKey(ctx, args.worldKey);
  const doc = withoutUndefined({
    worldKey: args.worldKey,
    name: args.name,
    runtimeKind: args.runtimeKind,
    readBackend: args.readBackend,
    writeBackend: args.writeBackend,
    workspaceId: args.workspaceId,
    studioMapId: args.studioMapId,
    status: args.status ?? "active",
    updatedAt: now,
  });

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gameWorlds", {
    ...doc,
    createdAt: now,
  });
}

export async function upsertPlayerDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    playerKey: string;
    owner: string;
    appearance: {
      color: string;
      fill: number;
      spriteAssetId: string;
      stroke: number;
    };
    entity?: string;
    playerOwnerComponent?: string;
    positionComponent?: string;
    inventoryComponent?: string;
    source: Doc<"gamePlayers">["source"];
    revision: number;
    updatedAt: number;
  }
) {
  const world = await ensureWorld(ctx, args.worldKey);
  const existing = await getPlayer(ctx, world._id, args.playerKey);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = withoutUndefined({
    worldId: world._id,
    playerKey: args.playerKey,
    owner: args.owner,
    appearance: args.appearance,
    entity: args.entity,
    playerOwnerComponent: args.playerOwnerComponent,
    positionComponent: args.positionComponent,
    inventoryComponent: args.inventoryComponent,
    source: args.source,
    revision: args.revision,
    updatedAt: args.updatedAt,
  });

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gamePlayers", doc);
}

export async function upsertPlayerStateDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    playerKey: string;
    position: { x: number; y: number };
    energy: { current: number; max: number };
    activeAction: {
      action: number;
      kind: "idle" | "move" | "sleep" | "farm" | "unknown";
      startedAt: number;
      endsAt: number;
    };
    source: Doc<"gamePlayerStates">["source"];
    revision: number;
    updatedAt: number;
  }
) {
  const world = await ensureWorld(ctx, args.worldKey);
  const existing = await getPlayerState(ctx, world._id, args.playerKey);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = {
    worldId: world._id,
    playerKey: args.playerKey,
    position: args.position,
    energy: args.energy,
    activeAction: args.activeAction,
    source: args.source,
    revision: args.revision,
    updatedAt: args.updatedAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gamePlayerStates", doc);
}

export async function upsertInventoryDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    playerKey: string;
    slots: Array<{ itemId: number; quantity: number }>;
    source: Doc<"gameInventories">["source"];
    revision: number;
    updatedAt: number;
  }
) {
  const world = await ensureWorld(ctx, args.worldKey);
  const existing = await getInventory(ctx, world._id, args.playerKey);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = {
    worldId: world._id,
    playerKey: args.playerKey,
    slots: args.slots,
    source: args.source,
    revision: args.revision,
    updatedAt: args.updatedAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gameInventories", doc);
}

export async function upsertGoldBalanceDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    playerKey: string;
    amount: bigint;
    source: Doc<"gameGoldBalances">["source"];
    revision: number;
    updatedAt: number;
  }
) {
  const world = await ensureWorld(ctx, args.worldKey);
  const existing = await getGoldBalance(ctx, world._id, args.playerKey);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = {
    worldId: world._id,
    playerKey: args.playerKey,
    amount: args.amount,
    source: args.source,
    revision: args.revision,
    updatedAt: args.updatedAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gameGoldBalances", doc);
}

export async function upsertFarmTileDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    x: number;
    y: number;
    soilState: "untilled" | "tilled";
    farmTypeId: number;
    plantedAt: number;
    growthSeconds: number;
    growthUpdatedAt: number;
    wateredUntil: number;
    lastHarvestedAt: number;
    harvestCount: number;
    source: Doc<"gameFarmTiles">["source"];
    revision: number;
    updatedAt: number;
  }
) {
  const world = await ensureWorld(ctx, args.worldKey);
  const tileKey = gameTileKey(args.x, args.y);
  const existing = await getFarmTile(ctx, world._id, tileKey);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = {
    worldId: world._id,
    tileKey,
    x: args.x,
    y: args.y,
    soilState: args.soilState,
    farmTypeId: args.farmTypeId,
    plantedAt: args.plantedAt,
    growthSeconds: args.growthSeconds,
    growthUpdatedAt: args.growthUpdatedAt,
    wateredUntil: args.wateredUntil,
    lastHarvestedAt: args.lastHarvestedAt,
    harvestCount: args.harvestCount,
    source: args.source,
    revision: args.revision,
    updatedAt: args.updatedAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gameFarmTiles", doc);
}

export async function upsertTileItemDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    x: number;
    y: number;
    itemId: number;
    quantity: number;
    source: Doc<"gameTileItems">["source"];
    revision: number;
    updatedAt: number;
  }
) {
  const world = await ensureWorld(ctx, args.worldKey);
  const tileKey = gameTileKey(args.x, args.y);
  const existing = await getTileItem(ctx, world._id, tileKey);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = {
    worldId: world._id,
    tileKey,
    x: args.x,
    y: args.y,
    itemId: args.itemId,
    quantity: args.quantity,
    source: args.source,
    revision: args.revision,
    updatedAt: args.updatedAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gameTileItems", doc);
}

export async function upsertTradeOfferDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    offer: string;
    acceptance?: string;
    offerId: string;
    buyer: string;
    seller: string;
    buyerPlayerMint: string;
    sellerPlayerMint: string;
    buyerEntity: string;
    sellerEntity: string;
    itemId: number;
    itemQuantity: number;
    goldAmount: bigint;
    expiresAt: number;
    status: "open" | "accepted" | "finalized";
    source: Doc<"gameTradeOffers">["source"];
    revision: number;
    updatedAt: number;
  }
) {
  const world = await ensureWorld(ctx, args.worldKey);
  const existing = await getTradeOffer(ctx, world._id, args.offer);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = withoutUndefined({
    worldId: world._id,
    offer: args.offer,
    acceptance: args.acceptance,
    offerId: args.offerId,
    buyer: args.buyer,
    seller: args.seller,
    buyerPlayerMint: args.buyerPlayerMint,
    sellerPlayerMint: args.sellerPlayerMint,
    buyerEntity: args.buyerEntity,
    sellerEntity: args.sellerEntity,
    itemId: args.itemId,
    itemQuantity: args.itemQuantity,
    goldAmount: args.goldAmount,
    expiresAt: args.expiresAt,
    status: args.status,
    source: args.source,
    revision: args.revision,
    updatedAt: args.updatedAt,
  });

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gameTradeOffers", doc);
}

export async function upsertIndexerCheckpointDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    indexerKey: string;
    checkpointKey: string;
    cursor?: string;
    source: Doc<"gameIndexerCheckpoints">["source"];
    revision: number;
    updatedAt: number;
  }
) {
  const world = await ensureWorld(ctx, args.worldKey);
  const existing = await ctx.db
    .query("gameIndexerCheckpoints")
    .withIndex("by_worldId_and_indexerKey_and_checkpointKey", (q) =>
      q
        .eq("worldId", world._id)
        .eq("indexerKey", args.indexerKey)
        .eq("checkpointKey", args.checkpointKey)
    )
    .unique();

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = withoutUndefined({
    worldId: world._id,
    indexerKey: args.indexerKey,
    checkpointKey: args.checkpointKey,
    cursor: args.cursor,
    source: args.source,
    revision: args.revision,
    updatedAt: args.updatedAt,
  });

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("gameIndexerCheckpoints", doc);
}
