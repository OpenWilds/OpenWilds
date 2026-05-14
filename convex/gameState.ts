import { internalMutation, mutation, query } from "./_generated/server";
import { seedDevWorldHandler } from "./game/dev";
import {
  upsertFarmTileDoc,
  upsertGoldBalanceDoc,
  upsertIndexerCheckpointDoc,
  upsertInventoryDoc,
  upsertPlayerDoc,
  upsertPlayerStateDoc,
  upsertTileItemDoc,
  upsertTradeOfferDoc,
  upsertWorldDoc,
} from "./game/ingest";
import { getWorldReadModelHandler } from "./game/readModel";
import {
  getWorldReadModelArgs,
  seedDevWorldArgs,
  upsertFarmTileArgs,
  upsertGoldBalanceArgs,
  upsertIndexerCheckpointArgs,
  upsertInventoryArgs,
  upsertPlayerArgs,
  upsertPlayerStateArgs,
  upsertTileItemArgs,
  upsertTradeOfferArgs,
  upsertWorldArgs,
} from "./game/validators";

export const getWorldReadModel = query({
  args: getWorldReadModelArgs,
  handler: getWorldReadModelHandler,
});

export const seedDevWorld = mutation({
  args: seedDevWorldArgs,
  handler: seedDevWorldHandler,
});

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
