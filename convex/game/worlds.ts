import { mutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAuthUserKey } from "../authz";
import { gameTileKey } from "../shared/ids";
import { WORLD_ITEM_DROPS } from "./constants";
import { ensurePreparedPlayer, freshness } from "./ecs";
import { upsertWorldDoc } from "./ingest";
import { getTileItem, getWorldByKey } from "./queries";
import { createConvexWorldArgs, prepareConvexPlayerArgs } from "./validators";

export const createConvexWorld = mutation({
  args: createConvexWorldArgs,
  handler: async (ctx, args) =>
    createConvexWorldDoc(ctx, {
      ...args,
      owner: await requireAuthUserKey(ctx),
    }),
});

export const prepareConvexPlayer = mutation({
  args: prepareConvexPlayerArgs,
  handler: async (ctx, args) =>
    prepareConvexPlayerDoc(ctx, {
      ...args,
      owner: await requireAuthUserKey(ctx),
    }),
});

export async function createConvexWorldDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
    name?: string;
    workspaceId?: Id<"studioWorkspaces">;
    studioMapId?: Id<"studioMaps">;
    playerKey?: string;
    owner?: string;
    appearance?: {
      color: string;
      fill: number;
      spriteAssetId: string;
      stroke: number;
    };
  }
) {
  const existing = await getWorldByKey(ctx, args.worldKey);
  const linkedMap = args.studioMapId
    ? await ctx.db.get(args.studioMapId)
    : null;
  const now = Date.now();
  const worldId = await upsertWorldDoc(ctx, {
    worldKey: args.worldKey,
    name: args.name ?? existing?.name ?? args.worldKey,
    runtimeKind: "convex",
    readBackend: "convex",
    writeBackend: "convex",
    workspaceId:
      args.workspaceId ?? linkedMap?.workspaceId ?? existing?.workspaceId,
    studioMapId: args.studioMapId ?? existing?.studioMapId,
    status: "active",
    updatedAt: now,
  });
  const world = await ctx.db.get(worldId);

  if (!world) {
    throw new Error(`Failed to create Convex world ${args.worldKey}.`);
  }

  if (!existing) {
    await seedWorldItems(ctx, world);
  }

  if (args.playerKey) {
    await ensurePreparedPlayer(ctx, {
      world,
      playerKey: args.playerKey,
      owner: args.owner,
      appearance: args.appearance,
    });
  }

  return {
    worldKey: world.worldKey,
    worldId: world._id,
    playerKey: args.playerKey ?? null,
    created: !existing,
  };
}

export async function prepareConvexPlayerDoc(
  ctx: MutationCtx,
  args: {
    worldKey: string;
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
  const result = await createConvexWorldDoc(ctx, {
    worldKey: args.worldKey,
    playerKey: args.playerKey,
    owner: args.owner,
    appearance: args.appearance,
  });
  const world = await ctx.db.get(result.worldId);

  if (!world) {
    throw new Error(`Failed to load Convex world ${args.worldKey}.`);
  }

  const player = await ensurePreparedPlayer(ctx, {
    world,
    playerKey: args.playerKey,
    owner: args.owner,
    appearance: args.appearance,
  });

  return {
    worldKey: world.worldKey,
    playerKey: player.playerKey,
    owner: player.owner,
    color: player.appearance.color,
  };
}

async function seedWorldItems(
  ctx: MutationCtx,
  world: {
    _id: Id<"gameWorlds">;
  }
) {
  const meta = freshness();

  for (const item of WORLD_ITEM_DROPS) {
    const tileKey = gameTileKey(item.x, item.y);
    const existing = await getTileItem(ctx, world._id, tileKey);

    if (existing) {
      continue;
    }

    await ctx.db.insert("gameTileItems", {
      worldId: world._id,
      tileKey,
      x: item.x,
      y: item.y,
      itemId: item.itemId,
      quantity: item.quantity,
      ...meta,
    });
  }
}
