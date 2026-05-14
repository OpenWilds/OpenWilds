import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const VISIBLE_PLAYER_LIMIT = 128;
const TRADE_OFFER_LIMIT = 128;
const FARM_TILE_LIMIT = 1024;
const TILE_ITEM_LIMIT = 1024;

const sourceValidator = v.union(
  v.literal("convex"),
  v.literal("magicblock-base"),
  v.literal("magicblock-er"),
  v.literal("mud")
);

const runtimeKindValidator = v.union(
  v.literal("magicblock-indexed"),
  v.literal("convex"),
  v.literal("mud-indexed")
);

const writeBackendValidator = v.union(
  v.literal("magicblock"),
  v.literal("convex"),
  v.literal("mud")
);

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived")
);

const gridPointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

const energyValidator = v.object({
  current: v.number(),
  max: v.number(),
});

const activeActionValidator = v.object({
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

const appearanceValidator = v.object({
  color: v.string(),
  fill: v.number(),
  spriteAssetId: v.string(),
  stroke: v.number(),
});

const inventorySlotValidator = v.object({
  itemId: v.number(),
  quantity: v.number(),
});

const freshnessValidators = {
  source: sourceValidator,
  revision: v.number(),
  updatedAt: v.number(),
};

const defaultPlayerActionState = {
  position: { x: 0, y: 0 },
  energy: { current: 10, max: 10 },
  activeAction: {
    action: 0,
    kind: "idle" as const,
    startedAt: 0,
    endsAt: 0,
  },
};

const defaultPlayerAppearance = {
  color: "#f4a7b9",
  fill: 0xf4a7b9,
  spriteAssetId: "player",
  stroke: 0x1f2933,
};

export const getWorldReadModel = query({
  args: {
    worldKey: v.string(),
    playerKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const world = await getWorldByKey(ctx, args.worldKey);

    if (!world) {
      return emptyReadModel();
    }

    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_worldId_and_updatedAt", (q) => q.eq("worldId", world._id))
      .order("desc")
      .take(VISIBLE_PLAYER_LIMIT);
    const selectedPlayer = args.playerKey
      ? await getPlayer(ctx, world._id, args.playerKey)
      : null;
    const selectedState = args.playerKey
      ? await getPlayerState(ctx, world._id, args.playerKey)
      : null;
    const selectedInventory = args.playerKey
      ? await getInventory(ctx, world._id, args.playerKey)
      : null;
    const selectedGold = args.playerKey
      ? await getGoldBalance(ctx, world._id, args.playerKey)
      : null;

    const [farmTiles, tileItems, tradeOffers, visiblePlayers] =
      await Promise.all([
        listFarmTiles(ctx, world._id),
        listTileItems(ctx, world._id),
        listTradeOffers(ctx, world._id, args.playerKey),
        listVisiblePlayers(ctx, world._id, args.playerKey, players),
      ]);

    return {
      playerActionState: selectedState
        ? toPlayerActionState(selectedState)
        : defaultPlayerActionState,
      playerAppearance: selectedPlayer
        ? selectedPlayer.appearance
        : defaultPlayerAppearance,
      visiblePlayers,
      inventory: {
        slots: selectedInventory?.slots ?? [],
      },
      goldBalance: {
        amount: selectedGold?.amount ?? 0n,
      },
      tradeOffers,
      farmTiles,
      tileItems,
    };
  },
});

export const seedDevWorld = mutation({
  args: {
    worldKey: v.optional(v.string()),
    playerKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const worldKey = args.worldKey ?? "dev-world";
    const playerKey = args.playerKey ?? "dev-player";
    const now = Date.now();

    await upsertWorldDoc(ctx, {
      worldKey,
      name: "Dev World",
      runtimeKind: "convex",
      readBackend: "convex",
      writeBackend: "convex",
      status: "active",
      updatedAt: now,
    });
    await upsertPlayerDoc(ctx, {
      worldKey,
      playerKey,
      owner: "dev-owner",
      appearance: defaultPlayerAppearance,
      entity: "dev-entity",
      playerOwnerComponent: "dev-player-owner",
      positionComponent: "dev-position",
      inventoryComponent: "dev-inventory",
      source: "convex",
      revision: now,
      updatedAt: now,
    });
    await upsertPlayerStateDoc(ctx, {
      worldKey,
      playerKey,
      position: { x: 2, y: 3 },
      energy: { current: 9, max: 10 },
      activeAction: {
        action: 1,
        kind: "move",
        startedAt: now - 1000,
        endsAt: now,
      },
      source: "convex",
      revision: now,
      updatedAt: now,
    });
    await upsertInventoryDoc(ctx, {
      worldKey,
      playerKey,
      slots: [{ itemId: 1, quantity: 6 }],
      source: "convex",
      revision: now,
      updatedAt: now,
    });
    await upsertGoldBalanceDoc(ctx, {
      worldKey,
      playerKey,
      amount: 50n,
      source: "convex",
      revision: now,
      updatedAt: now,
    });
    await upsertFarmTileDoc(ctx, {
      worldKey,
      x: 2,
      y: 3,
      soilState: "tilled",
      farmTypeId: 1,
      plantedAt: now - 30000,
      growthSeconds: 60,
      growthUpdatedAt: now,
      wateredUntil: now + 30000,
      lastHarvestedAt: 0,
      harvestCount: 0,
      source: "convex",
      revision: now,
      updatedAt: now,
    });
    await upsertTileItemDoc(ctx, {
      worldKey,
      x: 4,
      y: 4,
      itemId: 7,
      quantity: 2,
      source: "convex",
      revision: now,
      updatedAt: now,
    });

    return { worldKey, playerKey };
  },
});

export const upsertWorld = internalMutation({
  args: {
    worldKey: v.string(),
    name: v.string(),
    runtimeKind: runtimeKindValidator,
    readBackend: v.literal("convex"),
    writeBackend: writeBackendValidator,
    studioMapId: v.optional(v.id("studioMaps")),
    status: v.optional(statusValidator),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => upsertWorldDoc(ctx, args),
});

export const upsertPlayer = internalMutation({
  args: {
    worldKey: v.string(),
    playerKey: v.string(),
    owner: v.string(),
    appearance: appearanceValidator,
    entity: v.optional(v.string()),
    playerOwnerComponent: v.optional(v.string()),
    positionComponent: v.optional(v.string()),
    inventoryComponent: v.optional(v.string()),
    ...freshnessValidators,
  },
  handler: async (ctx, args) => upsertPlayerDoc(ctx, args),
});

export const upsertPlayerState = internalMutation({
  args: {
    worldKey: v.string(),
    playerKey: v.string(),
    position: gridPointValidator,
    energy: energyValidator,
    activeAction: activeActionValidator,
    ...freshnessValidators,
  },
  handler: async (ctx, args) => upsertPlayerStateDoc(ctx, args),
});

export const upsertInventory = internalMutation({
  args: {
    worldKey: v.string(),
    playerKey: v.string(),
    slots: v.array(inventorySlotValidator),
    ...freshnessValidators,
  },
  handler: async (ctx, args) => upsertInventoryDoc(ctx, args),
});

export const upsertGoldBalance = internalMutation({
  args: {
    worldKey: v.string(),
    playerKey: v.string(),
    amount: v.int64(),
    ...freshnessValidators,
  },
  handler: async (ctx, args) => upsertGoldBalanceDoc(ctx, args),
});

export const upsertFarmTile = internalMutation({
  args: {
    worldKey: v.string(),
    x: v.number(),
    y: v.number(),
    soilState: v.union(v.literal("untilled"), v.literal("tilled")),
    farmTypeId: v.number(),
    plantedAt: v.number(),
    growthSeconds: v.number(),
    growthUpdatedAt: v.number(),
    wateredUntil: v.number(),
    lastHarvestedAt: v.number(),
    harvestCount: v.number(),
    ...freshnessValidators,
  },
  handler: async (ctx, args) => upsertFarmTileDoc(ctx, args),
});

export const upsertTileItem = internalMutation({
  args: {
    worldKey: v.string(),
    x: v.number(),
    y: v.number(),
    itemId: v.number(),
    quantity: v.number(),
    ...freshnessValidators,
  },
  handler: async (ctx, args) => upsertTileItemDoc(ctx, args),
});

export const upsertTradeOffer = internalMutation({
  args: {
    worldKey: v.string(),
    offer: v.string(),
    acceptance: v.optional(v.string()),
    offerId: v.string(),
    buyer: v.string(),
    seller: v.string(),
    buyerPlayerMint: v.string(),
    sellerPlayerMint: v.string(),
    buyerEntity: v.string(),
    sellerEntity: v.string(),
    itemId: v.number(),
    itemQuantity: v.number(),
    goldAmount: v.int64(),
    expiresAt: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("accepted"),
      v.literal("finalized")
    ),
    ...freshnessValidators,
  },
  handler: async (ctx, args) => upsertTradeOfferDoc(ctx, args),
});

export const upsertIndexerCheckpoint = internalMutation({
  args: {
    worldKey: v.string(),
    indexerKey: v.string(),
    checkpointKey: v.string(),
    cursor: v.optional(v.string()),
    ...freshnessValidators,
  },
  handler: async (ctx, args) => upsertIndexerCheckpointDoc(ctx, args),
});

const emptyReadModel = () => ({
  playerActionState: defaultPlayerActionState,
  playerAppearance: defaultPlayerAppearance,
  visiblePlayers: [],
  inventory: { slots: [] },
  goldBalance: { amount: 0n },
  tradeOffers: [],
  farmTiles: [],
  tileItems: [],
});

const getWorldByKey = async (ctx: QueryCtx | MutationCtx, worldKey: string) =>
  await ctx.db
    .query("gameWorlds")
    .withIndex("by_worldKey", (q) => q.eq("worldKey", worldKey))
    .unique();

const ensureWorld = async (ctx: MutationCtx, worldKey: string) => {
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

const shouldAcceptRevision = (
  existing: { revision: number } | null,
  revision: number
) => !existing || revision >= existing.revision;

const tileKey = (x: number, y: number) => `${x}:${y}`;

const withoutUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined)
  ) as T;

async function upsertWorldDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    name: string;
    runtimeKind: "magicblock-indexed" | "convex" | "mud-indexed";
    readBackend: "convex";
    writeBackend: "magicblock" | "convex" | "mud";
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

async function upsertPlayerDoc(
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

async function upsertPlayerStateDoc(
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

async function upsertInventoryDoc(
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

async function upsertGoldBalanceDoc(
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

async function upsertFarmTileDoc(
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
  const key = tileKey(args.x, args.y);
  const existing = await getFarmTile(ctx, world._id, key);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = {
    worldId: world._id,
    tileKey: key,
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

async function upsertTileItemDoc(
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
  const key = tileKey(args.x, args.y);
  const existing = await getTileItem(ctx, world._id, key);

  if (!shouldAcceptRevision(existing, args.revision)) {
    return existing?._id ?? null;
  }

  const doc = {
    worldId: world._id,
    tileKey: key,
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

async function upsertTradeOfferDoc(
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

async function upsertIndexerCheckpointDoc(
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

const getPlayer = async (
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

const getPlayerState = async (
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

const getInventory = async (
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

const getGoldBalance = async (
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

const getFarmTile = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  key: string
) =>
  await ctx.db
    .query("gameFarmTiles")
    .withIndex("by_worldId_and_tileKey", (q) =>
      q.eq("worldId", worldId).eq("tileKey", key)
    )
    .unique();

const getTileItem = async (
  ctx: QueryCtx | MutationCtx,
  worldId: Id<"gameWorlds">,
  key: string
) =>
  await ctx.db
    .query("gameTileItems")
    .withIndex("by_worldId_and_tileKey", (q) =>
      q.eq("worldId", worldId).eq("tileKey", key)
    )
    .unique();

const getTradeOffer = async (
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

const listFarmTiles = async (ctx: QueryCtx, worldId: Id<"gameWorlds">) => {
  const tiles = await ctx.db
    .query("gameFarmTiles")
    .withIndex("by_worldId_and_updatedAt", (q) => q.eq("worldId", worldId))
    .order("desc")
    .take(FARM_TILE_LIMIT);

  return tiles.map((tile) => ({
    x: tile.x,
    y: tile.y,
    soilState: tile.soilState,
    farmTypeId: tile.farmTypeId,
    plantedAt: tile.plantedAt,
    growthSeconds: tile.growthSeconds,
    growthUpdatedAt: tile.growthUpdatedAt,
    wateredUntil: tile.wateredUntil,
    lastHarvestedAt: tile.lastHarvestedAt,
    harvestCount: tile.harvestCount,
  }));
};

const listTileItems = async (ctx: QueryCtx, worldId: Id<"gameWorlds">) => {
  const items = await ctx.db
    .query("gameTileItems")
    .withIndex("by_worldId_and_updatedAt", (q) => q.eq("worldId", worldId))
    .order("desc")
    .take(TILE_ITEM_LIMIT);

  return items.map((item) => ({
    x: item.x,
    y: item.y,
    itemId: item.itemId,
    quantity: item.quantity,
  }));
};

const listTradeOffers = async (
  ctx: QueryCtx,
  worldId: Id<"gameWorlds">,
  playerKey: string | null
) => {
  if (!playerKey) {
    return [];
  }

  const [outgoing, incoming] = await Promise.all([
    ctx.db
      .query("gameTradeOffers")
      .withIndex("by_worldId_and_buyerPlayerMint_and_updatedAt", (q) =>
        q.eq("worldId", worldId).eq("buyerPlayerMint", playerKey)
      )
      .order("desc")
      .take(TRADE_OFFER_LIMIT),
    ctx.db
      .query("gameTradeOffers")
      .withIndex("by_worldId_and_sellerPlayerMint_and_updatedAt", (q) =>
        q.eq("worldId", worldId).eq("sellerPlayerMint", playerKey)
      )
      .order("desc")
      .take(TRADE_OFFER_LIMIT),
  ]);
  const offers = new Map<
    string,
    Doc<"gameTradeOffers"> & { direction: "incoming" | "outgoing" }
  >();

  for (const offer of outgoing) {
    offers.set(offer.offer, { ...offer, direction: "outgoing" });
  }
  for (const offer of incoming) {
    offers.set(offer.offer, { ...offer, direction: "incoming" });
  }

  return Array.from(offers.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, TRADE_OFFER_LIMIT)
    .map((offer) => ({
      offer: offer.offer,
      acceptance: offer.acceptance,
      direction: offer.direction,
      offerId: offer.offerId,
      buyer: offer.buyer,
      seller: offer.seller,
      buyerPlayerMint: offer.buyerPlayerMint,
      sellerPlayerMint: offer.sellerPlayerMint,
      buyerEntity: offer.buyerEntity,
      sellerEntity: offer.sellerEntity,
      itemId: offer.itemId,
      itemQuantity: offer.itemQuantity,
      goldAmount: offer.goldAmount,
      expiresAt: offer.expiresAt,
      status: offer.status,
    }));
};

const listVisiblePlayers = async (
  ctx: QueryCtx,
  worldId: Id<"gameWorlds">,
  selectedPlayerKey: string | null,
  players: Doc<"gamePlayers">[]
) => {
  const visiblePlayers = [];

  for (const player of players) {
    const [state, inventory] = await Promise.all([
      getPlayerState(ctx, worldId, player.playerKey),
      getInventory(ctx, worldId, player.playerKey),
    ]);

    visiblePlayers.push({
      mint: player.playerKey,
      owner: player.owner,
      entity: player.entity ?? "",
      playerOwnerComponent: player.playerOwnerComponent ?? "",
      positionComponent: player.positionComponent ?? "",
      inventoryComponent: player.inventoryComponent ?? "",
      isActive: player.playerKey === selectedPlayerKey,
      appearance: player.appearance,
      state: state ? toPlayerActionState(state) : defaultPlayerActionState,
      inventory: {
        slots: inventory?.slots ?? [],
      },
    });
  }

  return visiblePlayers;
};

const toPlayerActionState = (state: Doc<"gamePlayerStates">) => ({
  position: state.position,
  energy: state.energy,
  activeAction: state.activeAction,
});
