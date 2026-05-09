import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const terrainStatus = v.union(
  v.literal("draft"),
  v.literal("library"),
  v.literal("archived")
);

const textureStatus = v.union(
  v.literal("draft"),
  v.literal("approved"),
  v.literal("archived")
);

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const listTerrainTextures = query({
  args: {
    status: v.optional(textureStatus),
  },
  handler: async (ctx, args) => {
    const status = args.status;
    const textures =
      status === undefined
        ? await ctx.db.query("studioTerrainTextures").order("desc").take(100)
        : await ctx.db
            .query("studioTerrainTextures")
            .withIndex("by_status_and_updatedAt", (q) =>
              q.eq("status", status)
            )
            .order("desc")
            .take(100);

    return await Promise.all(
      textures.map(async (texture) => ({
        ...texture,
        url: await ctx.storage.getUrl(texture.storageId),
      }))
    );
  },
});

export const registerSourceTexture = mutation({
  args: {
    terrainId: v.string(),
    label: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    material: v.string(),
    texturePrompt: v.string(),
    stylePrompt: v.string(),
    status: v.optional(textureStatus),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("studioTerrainTextures")
      .withIndex("by_terrainId", (q) => q.eq("terrainId", args.terrainId))
      .first();
    const patch = {
      terrainId: args.terrainId,
      label: args.label,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      material: args.material,
      texturePrompt: args.texturePrompt,
      stylePrompt: args.stylePrompt,
      status: args.status ?? "draft",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("studioTerrainTextures", {
      ...patch,
      createdAt: now,
    });
  },
});

export const registerTerrainAsset = mutation({
  args: {
    terrainId: v.string(),
    label: v.string(),
    sourceTextureId: v.optional(v.id("studioTerrainTextures")),
    atlasStorageId: v.id("_storage"),
    centerVariantsStorageId: v.id("_storage"),
    material: v.string(),
    texturePrompt: v.string(),
    stylePrompt: v.string(),
    status: v.optional(terrainStatus),
    tags: v.optional(v.array(v.string())),
    walkable: v.optional(v.boolean()),
    plantable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("studioTerrainAssets")
      .withIndex("by_terrainId", (q) => q.eq("terrainId", args.terrainId))
      .first();
    const patch = {
      terrainId: args.terrainId,
      label: args.label,
      sourceTextureId: args.sourceTextureId,
      atlasStorageId: args.atlasStorageId,
      centerVariantsStorageId: args.centerVariantsStorageId,
      material: args.material,
      texturePrompt: args.texturePrompt,
      stylePrompt: args.stylePrompt,
      status: args.status ?? "draft",
      tags: args.tags ?? [],
      walkable: args.walkable ?? true,
      plantable: args.plantable ?? true,
      generatedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("studioTerrainAssets", patch);
  },
});

export const listTerrainAssets = query({
  args: {
    status: v.optional(terrainStatus),
  },
  handler: async (ctx, args) => {
    const status = args.status;
    const assets =
      status === undefined
        ? await ctx.db.query("studioTerrainAssets").order("desc").take(100)
        : await ctx.db
            .query("studioTerrainAssets")
            .withIndex("by_status_and_updatedAt", (q) =>
              q.eq("status", status)
            )
            .order("desc")
            .take(100);

    return await Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        atlasUrl: await ctx.storage.getUrl(asset.atlasStorageId),
        centerVariantsUrl: await ctx.storage.getUrl(
          asset.centerVariantsStorageId
        ),
      }))
    );
  },
});

export const saveMap = mutation({
  args: {
    name: v.string(),
    width: v.number(),
    height: v.number(),
    mapJson: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("studioMaps", {
      name: args.name,
      width: args.width,
      height: args.height,
      mapJson: args.mapJson,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listMaps = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("studioMaps").order("desc").take(50);
  },
});
