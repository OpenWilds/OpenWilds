import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { normalizeEmail } from "./workspaceAuth";

const bootstrapConfirmation = "BACKFILL_EXISTING_STUDIO_ASSETS";

export const bootstrapDefaultWorkspace = mutation({
  args: {
    ownerEmail: v.string(),
    workspaceName: v.string(),
    secret: v.string(),
    confirm: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireBootstrapSecret(args.secret);

    if (args.confirm !== bootstrapConfirmation) {
      throw new Error(`Set confirm to ${bootstrapConfirmation}.`);
    }

    const ownerEmail = normalizeEmail(args.ownerEmail);

    if (!ownerEmail) {
      throw new Error("Owner email is required.");
    }

    const owner = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", ownerEmail))
      .first();

    if (!owner) {
      throw new Error(`No Convex Auth user exists for ${ownerEmail}.`);
    }

    const counts = await countUnscopedAssets(ctx);

    if (args.dryRun) {
      return {
        dryRun: true,
        ownerUserId: String(owner._id),
        workspaceId: null,
        counts,
      };
    }

    const now = Date.now();
    const workspaceName = normalizeWorkspaceName(args.workspaceName);
    const workspaceSlug = slugify(workspaceName);
    const existingWorkspace = await ctx.db
      .query("studioWorkspaces")
      .withIndex("by_slug", (q) => q.eq("slug", workspaceSlug))
      .first();
    const workspaceId =
      existingWorkspace?._id ??
      (await ctx.db.insert("studioWorkspaces", {
        name: workspaceName,
        slug: workspaceSlug,
        createdBy: String(owner._id),
        createdAt: now,
        updatedAt: now,
      }));
    const existingMembership = await ctx.db
      .query("studioWorkspaceMembers")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", String(owner._id))
      )
      .first();

    if (existingMembership) {
      if (existingMembership.role !== "owner") {
        await ctx.db.patch(existingMembership._id, {
          role: "owner",
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("studioWorkspaceMembers", {
        workspaceId,
        userId: String(owner._id),
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const doc of await ctx.db.query("studioTerrainTextures").collect()) {
      if (!doc.workspaceId) {
        await ctx.db.patch(doc._id, { workspaceId });
      }
    }

    for (const doc of await ctx.db.query("studioTerrainAssets").collect()) {
      if (!doc.workspaceId) {
        await ctx.db.patch(doc._id, { workspaceId });
      }
    }

    for (const doc of await ctx.db.query("studioMaps").collect()) {
      if (!doc.workspaceId) {
        await ctx.db.patch(doc._id, { workspaceId });
      }
    }

    for (const doc of await ctx.db.query("studioPlantSprites").collect()) {
      if (!doc.workspaceId) {
        await ctx.db.patch(doc._id, { workspaceId });
      }
    }

    for (const doc of await ctx.db.query("studioObjectSprites").collect()) {
      if (!doc.workspaceId) {
        await ctx.db.patch(doc._id, { workspaceId });
      }
    }

    for (const world of await ctx.db.query("gameWorlds").collect()) {
      if (world.workspaceId) {
        continue;
      }

      const linkedMap = world.studioMapId
        ? await ctx.db.get(world.studioMapId)
        : null;

      await ctx.db.patch(world._id, {
        workspaceId: linkedMap?.workspaceId ?? workspaceId,
      });
    }

    return {
      dryRun: false,
      ownerUserId: String(owner._id),
      workspaceId,
      counts,
    };
  },
});

async function countUnscopedAssets(ctx: MutationCtx) {
  const [
    terrainTextures,
    terrainAssets,
    maps,
    plantSprites,
    objectSprites,
    gameWorlds,
  ] = await Promise.all([
    ctx.db.query("studioTerrainTextures").collect(),
    ctx.db.query("studioTerrainAssets").collect(),
    ctx.db.query("studioMaps").collect(),
    ctx.db.query("studioPlantSprites").collect(),
    ctx.db.query("studioObjectSprites").collect(),
    ctx.db.query("gameWorlds").collect(),
  ]);

  return {
    terrainTextures: terrainTextures.filter((doc) => !doc.workspaceId).length,
    terrainAssets: terrainAssets.filter((doc) => !doc.workspaceId).length,
    maps: maps.filter((doc) => !doc.workspaceId).length,
    plantSprites: plantSprites.filter((doc) => !doc.workspaceId).length,
    objectSprites: objectSprites.filter((doc) => !doc.workspaceId).length,
    gameWorlds: gameWorlds.filter((doc) => !doc.workspaceId).length,
  };
}

function requireBootstrapSecret(secret: string) {
  const expected = process.env.WORKSPACE_BOOTSTRAP_SECRET?.trim();

  if (!expected) {
    throw new Error(
      "Set WORKSPACE_BOOTSTRAP_SECRET before running workspace bootstrap."
    );
  }

  if (secret !== expected) {
    throw new Error("Invalid workspace bootstrap secret.");
  }
}

function normalizeWorkspaceName(name: string) {
  const normalized = name.trim();

  if (!normalized) {
    throw new Error("Workspace name is required.");
  }

  return normalized;
}

function slugify(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}
