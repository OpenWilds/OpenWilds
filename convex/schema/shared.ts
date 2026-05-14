import { v } from "convex/values";

export const gameSource = v.union(
  v.literal("convex"),
  v.literal("magicblock-base"),
  v.literal("magicblock-er"),
  v.literal("mud")
);

export const gameRuntimeKind = v.union(
  v.literal("magicblock-indexed"),
  v.literal("convex"),
  v.literal("mud-indexed")
);

export const gameReadBackend = v.union(v.literal("convex"));

export const gameWriteBackend = v.union(
  v.literal("magicblock"),
  v.literal("convex"),
  v.literal("mud")
);

export const gameWorldStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived")
);

export const gameFreshnessFields = {
  source: gameSource,
  revision: v.number(),
  updatedAt: v.number(),
};

export const gameGridPoint = v.object({
  x: v.number(),
  y: v.number(),
});

export const gameEnergy = v.object({
  current: v.number(),
  max: v.number(),
});

export const gameActiveAction = v.object({
  action: v.number(),
  kind: v.union(
    v.literal("idle"),
    v.literal("move"),
    v.literal("sleep"),
    v.literal("farm"),
    v.literal("unknown")
  ),
  startedAt: v.number(),
  endsAt: v.number(),
});

export const gameAppearance = v.object({
  color: v.string(),
  fill: v.number(),
  spriteAssetId: v.string(),
  stroke: v.number(),
});

export const gameInventorySlot = v.object({
  itemId: v.number(),
  quantity: v.number(),
});

export const gameSoilState = v.union(
  v.literal("untilled"),
  v.literal("tilled")
);

export const gameTradeStatus = v.union(
  v.literal("open"),
  v.literal("accepted"),
  v.literal("finalized")
);
