import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const withoutUndefined = <T extends Record<string, unknown>>(
  value: T
): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined)
  ) as T;

export const getWorldByKey = async (
  ctx: QueryCtx | MutationCtx,
  worldKey: string
) =>
  await ctx.db
    .query("gameWorlds")
    .withIndex("by_worldKey", (q) => q.eq("worldKey", worldKey))
    .unique();

export const ensureWorld = async (ctx: MutationCtx, worldKey: string) => {
  const existing = await getWorldByKey(ctx, worldKey);

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const id = await ctx.db.insert("gameWorlds", {
    worldKey,
    name: worldKey,
    runtimeKind: "magicblock-indexed",
    readBackend: "convex",
    writeBackend: "magicblock",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const world = await ctx.db.get(id);

  if (!world) {
    throw new Error("Failed to create game world.");
  }

  return world;
};

export const getPlayer = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  playerKey: string
) =>
  await ctx.db
    .query("gamePlayers")
    .withIndex("by_worldId_and_playerKey", (q) =>
      q.eq("worldId", worldId).eq("playerKey", playerKey)
    )
    .unique();

export const getPlayerState = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  playerKey: string
) =>
  await ctx.db
    .query("gamePlayerStates")
    .withIndex("by_worldId_and_playerKey", (q) =>
      q.eq("worldId", worldId).eq("playerKey", playerKey)
    )
    .unique();

export const getInventory = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  playerKey: string
) =>
  await ctx.db
    .query("gameInventories")
    .withIndex("by_worldId_and_playerKey", (q) =>
      q.eq("worldId", worldId).eq("playerKey", playerKey)
    )
    .unique();

export const getGoldBalance = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  playerKey: string
) =>
  await ctx.db
    .query("gameGoldBalances")
    .withIndex("by_worldId_and_playerKey", (q) =>
      q.eq("worldId", worldId).eq("playerKey", playerKey)
    )
    .unique();

export const getFarmTile = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  tileKey: string
) =>
  await ctx.db
    .query("gameFarmTiles")
    .withIndex("by_worldId_and_tileKey", (q) =>
      q.eq("worldId", worldId).eq("tileKey", tileKey)
    )
    .unique();

export const getTileItem = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  tileKey: string
) =>
  await ctx.db
    .query("gameTileItems")
    .withIndex("by_worldId_and_tileKey", (q) =>
      q.eq("worldId", worldId).eq("tileKey", tileKey)
    )
    .unique();

export const getTradeOffer = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  offer: string
) =>
  await ctx.db
    .query("gameTradeOffers")
    .withIndex("by_worldId_and_offer", (q) =>
      q.eq("worldId", worldId).eq("offer", offer)
    )
    .unique();

export const toPlayerActionState = (state: Doc<"gamePlayerStates">) => ({
  position: state.position,
  energy: state.energy,
  activeAction: state.activeAction,
});
