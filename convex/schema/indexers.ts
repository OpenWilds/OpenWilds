import { defineTable } from "convex/server";
import { v } from "convex/values";
import { gameFreshnessFields } from "./shared";

export const indexerTables = {
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
};
