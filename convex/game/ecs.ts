import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { gameTileKey } from "../shared/ids";
import {
  ActionId,
  DEFAULT_MAX_ENERGY,
  FarmFeature,
  FarmKind,
  GRID_SIZE,
  STARTER_GOLD,
  getFarmType,
  getGameTimeSeconds,
  type FarmTypeDefinition,
} from "./constants";
import { defaultPlayerAppearance } from "./defaults";
import {
  getFarmTile,
  getGoldBalance,
  getInventory,
  getPlayer,
  getPlayerState,
  getTileItem,
  getTradeOffer,
  getWorldByKey,
  toPlayerActionState,
} from "./queries";

export type GridPoint = {
  x: number;
  y: number;
};

export type TileActionMode =
  | "till"
  | "water"
  | "plant"
  | "harvest"
  | "chop"
  | "grab"
  | "drop";

export const nowUnixSeconds = () => Date.now() / 1000;

export const freshness = (now = Date.now()) => ({
  source: "convex" as const,
  revision: now,
  updatedAt: now,
});

export const idleAction = () => ({
  action: ActionId.idle,
  kind: "idle" as const,
  startedAt: 0,
  endsAt: 0,
});

export const activeAction = (
  action: number,
  kind: "move" | "sleep" | "farm",
  startedAt: number,
  durationSeconds: number
) => ({
  action,
  kind,
  startedAt,
  endsAt: startedAt + durationSeconds,
});

export async function requireConvexWorld(ctx: MutationCtx, worldKey: string) {
  const world = await getWorldByKey(ctx, worldKey);

  if (!world) {
    throw new Error(`World ${worldKey} does not exist.`);
  }

  if (world.writeBackend !== "convex") {
    throw new Error(`World ${worldKey} does not use Convex writes.`);
  }

  if (world.status !== "active") {
    throw new Error(`World ${worldKey} is not active.`);
  }

  return world;
}

export function assertInBounds(point: GridPoint) {
  if (
    !Number.isInteger(point.x) ||
    !Number.isInteger(point.y) ||
    point.x < 0 ||
    point.x >= GRID_SIZE ||
    point.y < 0 ||
    point.y >= GRID_SIZE
  ) {
    throw new Error(`Tile ${point.x}, ${point.y} is outside the board.`);
  }
}

export function assertNoActiveAction(state: Doc<"gamePlayerStates">) {
  const now = nowUnixSeconds();

  if (state.activeAction.endsAt > now && state.activeAction.kind !== "idle") {
    throw new Error(`${state.activeAction.kind} action is still in progress.`);
  }
}

export async function requirePlayerBundle(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    playerKey: string;
  }
) {
  const world = await requireConvexWorld(ctx, args.worldKey);
  const [player, state, inventory, gold] = await Promise.all([
    getPlayer(ctx, world._id, args.playerKey),
    getPlayerState(ctx, world._id, args.playerKey),
    getInventory(ctx, world._id, args.playerKey),
    getGoldBalance(ctx, world._id, args.playerKey),
  ]);

  if (!player || !state || !inventory || !gold) {
    throw new Error(`Player ${args.playerKey} is not prepared.`);
  }

  return { world, player, state, inventory, gold };
}

export async function ensurePreparedPlayer(
  ctx: MutationCtx,
  args: {
    world: Doc<"gameWorlds">;
    playerKey: string;
    owner?: string;
    appearance?: {
      color: string;
      fill: number;
      spriteAssetId: string;
      stroke: number;
    };
  }
) {
  const now = Date.now();
  const meta = freshness(now);
  const owner = args.owner ?? "convex-dev-owner";
  const appearance = args.appearance ?? defaultPlayerAppearance;
  const existingPlayer = await getPlayer(ctx, args.world._id, args.playerKey);

  if (existingPlayer) {
    await ctx.db.patch(existingPlayer._id, {
      owner,
      appearance,
      source: "convex",
      revision: now,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("gamePlayers", {
      worldId: args.world._id,
      playerKey: args.playerKey,
      owner,
      appearance,
      entity: `convex:${args.playerKey}`,
      playerOwnerComponent: `convex:${args.playerKey}:owner`,
      positionComponent: `convex:${args.playerKey}:position`,
      inventoryComponent: `convex:${args.playerKey}:inventory`,
      ...meta,
    });
  }

  const existingState = await getPlayerState(
    ctx,
    args.world._id,
    args.playerKey
  );

  if (!existingState) {
    await ctx.db.insert("gamePlayerStates", {
      worldId: args.world._id,
      playerKey: args.playerKey,
      position: { x: 0, y: 0 },
      energy: { current: DEFAULT_MAX_ENERGY, max: DEFAULT_MAX_ENERGY },
      activeAction: idleAction(),
      ...meta,
    });
  }

  const existingInventory = await getInventory(
    ctx,
    args.world._id,
    args.playerKey
  );

  if (!existingInventory) {
    await ctx.db.insert("gameInventories", {
      worldId: args.world._id,
      playerKey: args.playerKey,
      slots: [],
      ...meta,
    });
  }

  const existingGold = await getGoldBalance(
    ctx,
    args.world._id,
    args.playerKey
  );

  if (!existingGold) {
    await ctx.db.insert("gameGoldBalances", {
      worldId: args.world._id,
      playerKey: args.playerKey,
      amount: STARTER_GOLD,
      ...meta,
    });
  }

  const preparedPlayer = await getPlayer(ctx, args.world._id, args.playerKey);

  if (!preparedPlayer) {
    throw new Error(`Failed to prepare player ${args.playerKey}.`);
  }

  return preparedPlayer;
}

export function updateSlots(
  slots: Array<{ itemId: number; quantity: number }>,
  itemId: number,
  delta: number
) {
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new Error("Item id must be a positive integer.");
  }

  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error("Inventory quantity delta must be a non-zero integer.");
  }

  const next = slots.map((slot) => ({ ...slot }));
  const index = next.findIndex((slot) => slot.itemId === itemId);
  const current = index >= 0 ? next[index].quantity : 0;
  const quantity = current + delta;

  if (quantity < 0) {
    throw new Error(`Not enough item ${itemId} in inventory.`);
  }

  if (quantity === 0) {
    return index >= 0 ? next.filter((slot) => slot.itemId !== itemId) : next;
  }

  if (index >= 0) {
    next[index] = { itemId, quantity };
    return next;
  }

  return [...next, { itemId, quantity }];
}

export function projectFarmGrowth(
  tile: Doc<"gameFarmTiles">,
  farm: FarmTypeDefinition,
  nowGameSeconds = getGameTimeSeconds()
) {
  const needsWater = (farm.flags & FarmFeature.needsWater) !== 0;
  const growthUntil = needsWater
    ? Math.min(tile.wateredUntil, nowGameSeconds)
    : nowGameSeconds;
  const elapsed =
    tile.growthUpdatedAt > 0
      ? Math.max(0, growthUntil - tile.growthUpdatedAt)
      : 0;
  const growthSeconds = Math.min(
    farm.requiredGrowthSeconds,
    tile.growthSeconds + elapsed
  );
  const regrowthReady =
    tile.lastHarvestedAt === 0 ||
    (farm.regrowSeconds > 0 &&
      nowGameSeconds - tile.lastHarvestedAt >= farm.regrowSeconds);

  return {
    growthSeconds,
    harvestReady: growthSeconds >= farm.requiredGrowthSeconds && regrowthReady,
  };
}

export async function patchPlayerActionState(
  ctx: MutationCtx,
  state: Doc<"gamePlayerStates">,
  patch: {
    position?: GridPoint;
    energy?: { current: number; max: number };
    activeAction?: Doc<"gamePlayerStates">["activeAction"];
  }
) {
  await ctx.db.patch(state._id, {
    ...patch,
    ...freshness(),
  });

  const updated = await ctx.db.get(state._id);

  if (!updated) {
    throw new Error("Player state disappeared after update.");
  }

  return toPlayerActionState(updated);
}

export function emptyFarmTile(point: GridPoint) {
  return {
    x: point.x,
    y: point.y,
    soilState: "untilled" as const,
    farmTypeId: 0,
    plantedAt: 0,
    growthSeconds: 0,
    growthUpdatedAt: 0,
    wateredUntil: 0,
    lastHarvestedAt: 0,
    harvestCount: 0,
  };
}

export async function getOrCreateFarmTile(
  ctx: MutationCtx,
  world: Doc<"gameWorlds">,
  point: GridPoint
) {
  const tileKey = gameTileKey(point.x, point.y);
  const existing = await getFarmTile(ctx, world._id, tileKey);

  if (existing) {
    return existing;
  }

  const id = await ctx.db.insert("gameFarmTiles", {
    worldId: world._id,
    tileKey,
    ...emptyFarmTile(point),
    ...freshness(),
  });
  const tile = await ctx.db.get(id);

  if (!tile) {
    throw new Error("Failed to create farm tile.");
  }

  return tile;
}

export async function patchFarmTile(
  ctx: MutationCtx,
  tile: Doc<"gameFarmTiles">,
  patch: Partial<Omit<Doc<"gameFarmTiles">, "_id" | "_creationTime">>
) {
  await ctx.db.patch(tile._id, {
    ...patch,
    ...freshness(),
  });

  const updated = await ctx.db.get(tile._id);

  if (!updated) {
    throw new Error("Farm tile disappeared after update.");
  }

  return {
    x: updated.x,
    y: updated.y,
    soilState: updated.soilState,
    farmTypeId: updated.farmTypeId,
    plantedAt: updated.plantedAt,
    growthSeconds: updated.growthSeconds,
    growthUpdatedAt: updated.growthUpdatedAt,
    wateredUntil: updated.wateredUntil,
    lastHarvestedAt: updated.lastHarvestedAt,
    harvestCount: updated.harvestCount,
  };
}

export async function getTileItemByPoint(
  ctx: MutationCtx,
  world: Doc<"gameWorlds">,
  point: GridPoint
) {
  return await getTileItem(ctx, world._id, gameTileKey(point.x, point.y));
}

export function actionIdForMode(mode: TileActionMode) {
  switch (mode) {
    case "till":
      return ActionId.till;
    case "water":
      return ActionId.water;
    case "plant":
      return ActionId.plant;
    case "harvest":
      return ActionId.harvest;
    case "chop":
      return ActionId.chop;
    case "grab":
      return ActionId.grab;
    case "drop":
      return ActionId.drop;
  }
}

export function requireFarmTypeForTile(tile: Doc<"gameFarmTiles">) {
  const farm = getFarmType(tile.farmTypeId);

  if (!farm) {
    throw new Error("Tile does not have a planted farm type.");
  }

  return farm;
}

export function isTreeFarm(farm: FarmTypeDefinition) {
  return farm.kind === FarmKind.tree;
}

export function farmActionState(mode: TileActionMode) {
  const now = nowUnixSeconds();

  return activeAction(actionIdForMode(mode), "farm", now, 0.45);
}

export async function requireTradeOffer(
  ctx: MutationCtx,
  world: Doc<"gameWorlds">,
  offer: string
) {
  const trade = await getTradeOffer(ctx, world._id, offer);

  if (!trade) {
    throw new Error(`Trade offer ${offer} does not exist.`);
  }

  return trade;
}
