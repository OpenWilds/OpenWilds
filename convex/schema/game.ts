import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  gameActiveAction,
  gameAppearance,
  gameEnergy,
  gameFreshnessFields,
  gameGridPoint,
  gameInventorySlot,
  gameReadBackend,
  gameRuntimeKind,
  gameSoilState,
  gameTradeStatus,
  gameWorldStatus,
  gameWriteBackend,
} from "./shared";

export const gameTables = {
  gameWorlds: defineTable({
    worldKey: v.string(),
    name: v.string(),
    runtimeKind: gameRuntimeKind,
    readBackend: gameReadBackend,
    writeBackend: gameWriteBackend,
    workspaceId: v.optional(v.id("studioWorkspaces")),
    studioMapId: v.optional(v.id("studioMaps")),
    status: gameWorldStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_worldKey", ["worldKey"])
    .index("by_workspaceId_and_status_and_updatedAt", [
      "workspaceId",
      "status",
      "updatedAt",
    ])
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
    soilState: gameSoilState,
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
    status: gameTradeStatus,
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
};
