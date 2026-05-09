import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const terrainPromptFields = {
  material: v.string(),
  texturePrompt: v.string(),
  stylePrompt: v.string(),
};

const plantSpriteCellFields = v.object({
  stateId: v.string(),
  stateTitle: v.string(),
  columnLabel: v.string(),
  row: v.number(),
  column: v.number(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
});

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

  studioPlantSprites: defineTable({
    plantId: v.string(),
    label: v.string(),
    kind: v.union(v.literal("plant"), v.literal("tree")),
    spriteStorageId: v.id("_storage"),
    layoutGuideStorageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("library"),
      v.literal("archived")
    ),
    region: v.string(),
    habitat: v.string(),
    objectPrompt: v.string(),
    stylePrompt: v.string(),
    generatedPrompt: v.string(),
    model: v.string(),
    rows: v.number(),
    columns: v.number(),
    cellSize: v.number(),
    atlasWidth: v.number(),
    atlasHeight: v.number(),
    cells: v.array(plantSpriteCellFields),
    generatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plantId", ["plantId"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),
});
