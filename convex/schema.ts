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

const gameSource = v.union(
  v.literal("convex"),
  v.literal("magicblock-base"),
  v.literal("magicblock-er"),
  v.literal("mud")
);

const gameFreshnessFields = {
  source: gameSource,
  revision: v.number(),
  updatedAt: v.number(),
};

const gameGridPoint = v.object({
  x: v.number(),
  y: v.number(),
});

const gameEnergy = v.object({
  current: v.number(),
  max: v.number(),
});

const gameActiveAction = v.object({
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

const gameAppearance = v.object({
  color: v.string(),
  fill: v.number(),
  spriteAssetId: v.string(),
  stroke: v.number(),
});

const gameInventorySlot = v.object({
  itemId: v.number(),
  quantity: v.number(),
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

  studioObjectSprites: defineTable({
    objectId: v.string(),
    label: v.string(),
    kind: v.union(v.literal("building"), v.literal("object")),
    spriteStorageId: v.id("_storage"),
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
    generatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_objectId", ["objectId"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  gameWorlds: defineTable({
    worldKey: v.string(),
    name: v.string(),
    runtimeKind: v.union(
      v.literal("magicblock-indexed"),
      v.literal("convex"),
      v.literal("mud-indexed")
    ),
    readBackend: v.union(v.literal("convex")),
    writeBackend: v.union(
      v.literal("magicblock"),
      v.literal("convex"),
      v.literal("mud")
    ),
    studioMapId: v.optional(v.id("studioMaps")),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_worldKey", ["worldKey"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  gamePlayers: defineTable({
    worldId: v.id("gameWorlds"),
    playerKey: v.string(),
    owner: v.string(),
    appearance: gameAppearance,
    entity: v.optional(v.string()),
    playerOwnerComponent: v.optional(v.string()),
    positionComponent: v.optional(v.string()),
    inventoryComponent: v.optional(v.string()),
    ...gameFreshnessFields,
  })
    .index("by_worldId_and_playerKey", ["worldId", "playerKey"])
    .index("by_worldId_and_updatedAt", ["worldId", "updatedAt"]),

  gamePlayerStates: defineTable({
    worldId: v.id("gameWorlds"),
    playerKey: v.string(),
    position: gameGridPoint,
    energy: gameEnergy,
    activeAction: gameActiveAction,
    ...gameFreshnessFields,
  }).index("by_worldId_and_playerKey", ["worldId", "playerKey"]),

  gameInventories: defineTable({
    worldId: v.id("gameWorlds"),
    playerKey: v.string(),
    slots: v.array(gameInventorySlot),
    ...gameFreshnessFields,
  }).index("by_worldId_and_playerKey", ["worldId", "playerKey"]),

  gameGoldBalances: defineTable({
    worldId: v.id("gameWorlds"),
    playerKey: v.string(),
    amount: v.int64(),
    ...gameFreshnessFields,
  }).index("by_worldId_and_playerKey", ["worldId", "playerKey"]),

  gameFarmTiles: defineTable({
    worldId: v.id("gameWorlds"),
    tileKey: v.string(),
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
    ...gameFreshnessFields,
  })
    .index("by_worldId_and_tileKey", ["worldId", "tileKey"])
    .index("by_worldId_and_updatedAt", ["worldId", "updatedAt"]),

  gameTileItems: defineTable({
    worldId: v.id("gameWorlds"),
    tileKey: v.string(),
    x: v.number(),
    y: v.number(),
    itemId: v.number(),
    quantity: v.number(),
    ...gameFreshnessFields,
  })
    .index("by_worldId_and_tileKey", ["worldId", "tileKey"])
    .index("by_worldId_and_updatedAt", ["worldId", "updatedAt"]),

  gameTradeOffers: defineTable({
    worldId: v.id("gameWorlds"),
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
    ...gameFreshnessFields,
  })
    .index("by_worldId_and_offer", ["worldId", "offer"])
    .index("by_worldId_and_buyerPlayerMint_and_updatedAt", [
      "worldId",
      "buyerPlayerMint",
      "updatedAt",
    ])
    .index("by_worldId_and_sellerPlayerMint_and_updatedAt", [
      "worldId",
      "sellerPlayerMint",
      "updatedAt",
    ]),

  gameIndexerCheckpoints: defineTable({
    worldId: v.id("gameWorlds"),
    indexerKey: v.string(),
    checkpointKey: v.string(),
    cursor: v.optional(v.string()),
    ...gameFreshnessFields,
  }).index("by_worldId_and_indexerKey_and_checkpointKey", [
    "worldId",
    "indexerKey",
    "checkpointKey",
  ]),
});
