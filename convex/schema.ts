import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const terrainPromptFields = {
  material: v.string(),
  texturePrompt: v.string(),
  stylePrompt: v.string(),
};

export default defineSchema({
  studioTerrainTextures: defineTable({
    terrainId: v.string(),
    label: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    ...terrainPromptFields,
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("archived")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_terrainId", ["terrainId"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  studioTerrainAssets: defineTable({
    terrainId: v.string(),
    label: v.string(),
    sourceTextureId: v.optional(v.id("studioTerrainTextures")),
    atlasStorageId: v.id("_storage"),
    centerVariantsStorageId: v.id("_storage"),
    ...terrainPromptFields,
    generatedAt: v.number(),
    updatedAt: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("library"),
      v.literal("archived")
    ),
    tags: v.array(v.string()),
    walkable: v.boolean(),
    plantable: v.boolean(),
  })
    .index("by_terrainId", ["terrainId"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  studioMaps: defineTable({
    name: v.string(),
    width: v.number(),
    height: v.number(),
    mapJson: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
  }).index("by_updatedAt", ["updatedAt"]),
});
