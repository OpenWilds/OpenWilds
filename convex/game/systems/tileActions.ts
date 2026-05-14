import { mutation, type MutationCtx } from "../../_generated/server";
import { gameTileKey } from "../../shared/ids";
import {
  ACTION_SECONDS,
  FarmFeature,
  ItemId,
  getFarmTypeBySeedItem,
  getGameTimeSeconds,
} from "../constants";
import {
  activeAction,
  assertInBounds,
  assertNoActiveAction,
  emptyFarmTile,
  farmActionState,
  getOrCreateFarmTile,
  getTileItemByPoint,
  isTreeFarm,
  nowUnixSeconds,
  patchFarmTile,
  patchPlayerActionState,
  projectFarmGrowth,
  requireFarmTypeForTile,
  requirePlayerBundle,
  updateSlots,
  type TileActionMode,
} from "../ecs";
import { movePlayerDoc } from "./movement";
import { performTileActionArgs } from "../validators";

export const performTileAction = mutation({
  args: performTileActionArgs,
  handler: async (ctx, args) => performTileActionDoc(ctx, args),
});

export async function performTileActionDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    playerKey: string;
    mode: "move" | TileActionMode;
    point: { x: number; y: number };
    selectedItemId?: number | null;
    selectedQuantity?: number | null;
  }
) {
  if (args.mode === "move") {
    return {
      player: await movePlayerDoc(ctx, {
        worldKey: args.worldKey,
        playerKey: args.playerKey,
        point: args.point,
      }),
    };
  }

  assertInBounds(args.point);

  const bundle = await requirePlayerBundle(ctx, args);

  assertNoActiveAction(bundle.state);

  switch (args.mode) {
    case "till":
      return await tillTile(ctx, bundle, args.point);
    case "water":
      return await waterTile(ctx, bundle, args.point);
    case "plant":
      return await plantTile(ctx, bundle, args);
    case "harvest":
      return await harvestTile(ctx, bundle, args.point);
    case "chop":
      return await chopTile(ctx, bundle, args.point);
    case "grab":
      return await grabTile(ctx, bundle, args.point);
    case "drop":
      return await dropTile(ctx, bundle, args);
  }
}

type PlayerBundle = Awaited<ReturnType<typeof requirePlayerBundle>>;

async function setFarmActionPlayer(
  ctx: MutationCtx,
  bundle: PlayerBundle,
  mode: TileActionMode
) {
  return await patchPlayerActionState(ctx, bundle.state, {
    activeAction: farmActionState(mode),
  });
}

async function tillTile(
  ctx: MutationCtx,
  bundle: PlayerBundle,
  point: { x: number; y: number }
) {
  const tile = await getOrCreateFarmTile(ctx, bundle.world, point);

  if (tile.farmTypeId !== 0) {
    throw new Error("Cannot till a planted tile.");
  }

  const [player, patchedTile] = await Promise.all([
    setFarmActionPlayer(ctx, bundle, "till"),
    patchFarmTile(ctx, tile, {
      soilState: "tilled",
    }),
  ]);

  return { player, tile: patchedTile };
}

async function waterTile(
  ctx: MutationCtx,
  bundle: PlayerBundle,
  point: { x: number; y: number }
) {
  const tile = await getOrCreateFarmTile(ctx, bundle.world, point);
  const nowGameSeconds = getGameTimeSeconds();
  const farm = tile.farmTypeId ? requireFarmTypeForTile(tile) : null;
  const growth = farm
    ? projectFarmGrowth(tile, farm, nowGameSeconds)
    : { growthSeconds: tile.growthSeconds };

  const [player, patchedTile] = await Promise.all([
    setFarmActionPlayer(ctx, bundle, "water"),
    patchFarmTile(ctx, tile, {
      growthSeconds: growth.growthSeconds,
      growthUpdatedAt: nowGameSeconds,
      wateredUntil: nowGameSeconds + 24 * 60 * 60,
    }),
  ]);

  return { player, tile: patchedTile };
}

async function plantTile(
  ctx: MutationCtx,
  bundle: PlayerBundle,
  args: {
    point: { x: number; y: number };
    selectedItemId?: number | null;
  }
) {
  const seedItemId = args.selectedItemId ?? ItemId.turnipSeed;
  const farm = getFarmTypeBySeedItem(seedItemId);

  if (!farm) {
    throw new Error(`Item ${seedItemId} cannot be planted.`);
  }

  const tile = await getOrCreateFarmTile(ctx, bundle.world, args.point);

  if (tile.farmTypeId !== 0) {
    throw new Error("Tile is already planted.");
  }

  if (
    (farm.flags & FarmFeature.requiresTilledSoil) !== 0 &&
    tile.soilState !== "tilled"
  ) {
    throw new Error("This crop requires tilled soil.");
  }

  const now = Date.now();
  const nowGameSeconds = getGameTimeSeconds(now);
  const slots = updateSlots(bundle.inventory.slots, seedItemId, -1);
  const [player, patchedTile] = await Promise.all([
    patchPlayerActionState(ctx, bundle.state, {
      activeAction: activeAction(
        5,
        "farm",
        nowUnixSeconds(),
        ACTION_SECONDS.farm
      ),
    }),
    patchFarmTile(ctx, tile, {
      farmTypeId: farm.farmTypeId,
      plantedAt: nowGameSeconds,
      growthSeconds: 0,
      growthUpdatedAt: nowGameSeconds,
      wateredUntil: tile.wateredUntil,
      lastHarvestedAt: 0,
      harvestCount: 0,
    }),
    ctx.db.patch(bundle.inventory._id, {
      slots,
      source: "convex",
      revision: now,
      updatedAt: now,
    }),
  ]);

  return { player, tile: patchedTile };
}

async function harvestTile(
  ctx: MutationCtx,
  bundle: PlayerBundle,
  point: { x: number; y: number }
) {
  const tile = await getOrCreateFarmTile(ctx, bundle.world, point);
  const farm = requireFarmTypeForTile(tile);

  if (farm.baseYield <= 0) {
    throw new Error("This farm type does not produce a harvest.");
  }

  const now = Date.now();
  const nowGameSeconds = getGameTimeSeconds(now);
  const growth = projectFarmGrowth(tile, farm, nowGameSeconds);

  if (!growth.harvestReady) {
    throw new Error("This tile is not ready to harvest.");
  }

  const slots = updateSlots(
    bundle.inventory.slots,
    farm.harvestItemId,
    farm.baseYield
  );
  const [player, patchedTile] = await Promise.all([
    patchPlayerActionState(ctx, bundle.state, {
      activeAction: farmActionState("harvest"),
    }),
    patchFarmTile(ctx, tile, {
      growthSeconds: growth.growthSeconds,
      growthUpdatedAt: nowGameSeconds,
      lastHarvestedAt: nowGameSeconds,
      harvestCount: tile.harvestCount + 1,
    }),
    ctx.db.patch(bundle.inventory._id, {
      slots,
      source: "convex",
      revision: now,
      updatedAt: now,
    }),
  ]);

  return { player, tile: patchedTile };
}

async function chopTile(
  ctx: MutationCtx,
  bundle: PlayerBundle,
  point: { x: number; y: number }
) {
  const tile = await getOrCreateFarmTile(ctx, bundle.world, point);
  const farm = requireFarmTypeForTile(tile);

  if (!isTreeFarm(farm) || farm.chopYield <= 0 || farm.chopItemId === 0) {
    throw new Error("This tile cannot be chopped.");
  }

  const now = Date.now();
  const slots = updateSlots(
    bundle.inventory.slots,
    farm.chopItemId,
    farm.chopYield
  );
  const [player, patchedTile] = await Promise.all([
    patchPlayerActionState(ctx, bundle.state, {
      activeAction: farmActionState("chop"),
    }),
    patchFarmTile(ctx, tile, emptyFarmTile(point)),
    ctx.db.patch(bundle.inventory._id, {
      slots,
      source: "convex",
      revision: now,
      updatedAt: now,
    }),
  ]);

  return { player, tile: patchedTile };
}

async function grabTile(
  ctx: MutationCtx,
  bundle: PlayerBundle,
  point: { x: number; y: number }
) {
  const item = await getTileItemByPoint(ctx, bundle.world, point);

  if (!item || item.itemId === 0 || item.quantity <= 0) {
    throw new Error("There is no item on that tile.");
  }

  const now = Date.now();
  const slots = updateSlots(bundle.inventory.slots, item.itemId, item.quantity);
  const player = await patchPlayerActionState(ctx, bundle.state, {
    activeAction: farmActionState("grab"),
  });

  await Promise.all([
    ctx.db.patch(bundle.inventory._id, {
      slots,
      source: "convex",
      revision: now,
      updatedAt: now,
    }),
    ctx.db.delete(item._id),
  ]);

  return { player, item: null };
}

async function dropTile(
  ctx: MutationCtx,
  bundle: PlayerBundle,
  args: {
    point: { x: number; y: number };
    selectedItemId?: number | null;
    selectedQuantity?: number | null;
  }
) {
  const itemId = args.selectedItemId ?? 0;
  const quantity = Math.max(1, Math.floor(args.selectedQuantity ?? 1));

  if (itemId <= 0) {
    throw new Error("Select an inventory item before dropping.");
  }

  const existing = await getTileItemByPoint(ctx, bundle.world, args.point);

  if (existing && existing.itemId !== 0 && existing.itemId !== itemId) {
    throw new Error("That tile already contains a different item.");
  }

  const now = Date.now();
  const tileKey = gameTileKey(args.point.x, args.point.y);
  const slots = updateSlots(bundle.inventory.slots, itemId, -quantity);
  const player = await patchPlayerActionState(ctx, bundle.state, {
    activeAction: farmActionState("drop"),
  });

  await ctx.db.patch(bundle.inventory._id, {
    slots,
    source: "convex",
    revision: now,
    updatedAt: now,
  });

  if (existing) {
    await ctx.db.patch(existing._id, {
      itemId,
      quantity: existing.quantity + quantity,
      source: "convex",
      revision: now,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("gameTileItems", {
      worldId: bundle.world._id,
      tileKey,
      x: args.point.x,
      y: args.point.y,
      itemId,
      quantity,
      source: "convex",
      revision: now,
      updatedAt: now,
    });
  }

  const updated = await getTileItemByPoint(ctx, bundle.world, args.point);

  if (!updated) {
    throw new Error("Failed to drop item.");
  }

  return {
    player,
    item: {
      x: updated.x,
      y: updated.y,
      itemId: updated.itemId,
      quantity: updated.quantity,
    },
  };
}
