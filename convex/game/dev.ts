import { mutation, type MutationCtx } from "../_generated/server";
import { defaultPlayerAppearance } from "./defaults";
import {
  upsertFarmTileDoc,
  upsertGoldBalanceDoc,
  upsertInventoryDoc,
  upsertPlayerDoc,
  upsertPlayerStateDoc,
  upsertTileItemDoc,
  upsertWorldDoc,
} from "./ingest";
import { seedDevWorldArgs } from "./validators";

export const seedDevWorld = mutation({
  args: seedDevWorldArgs,
  handler: seedDevWorldHandler,
});

export async function seedDevWorldHandler(
  ctx: MutationCtx,
  args: {
    worldKey?: string;
    playerKey?: string;
  }
) {
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
}
