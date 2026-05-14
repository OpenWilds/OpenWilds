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
  gameSource,
  gameTradeStatus,
  gameWorldStatus,
  gameWriteBackend,
} from "../schema/shared";

export const VISIBLE_PLAYER_LIMIT = 128;
export const TRADE_OFFER_LIMIT = 128;
export const FARM_TILE_LIMIT = 1024;
export const TILE_ITEM_LIMIT = 1024;

export const sourceValidator = gameSource;
export const runtimeKindValidator = gameRuntimeKind;
export const readBackendValidator = gameReadBackend;
export const writeBackendValidator = gameWriteBackend;
export const statusValidator = gameWorldStatus;
export const gridPointValidator = gameGridPoint;
export const energyValidator = gameEnergy;
export const activeActionValidator = gameActiveAction;
export const appearanceValidator = gameAppearance;
export const inventorySlotValidator = gameInventorySlot;
export const soilStateValidator = gameSoilState;
export const tradeStatusValidator = gameTradeStatus;
export const freshnessValidators = gameFreshnessFields;

export const getWorldReadModelArgs = {
  worldKey: v.string(),
  playerKey: v.union(v.string(), v.null()),
};

export const seedDevWorldArgs = {
  worldKey: v.optional(v.string()),
  playerKey: v.optional(v.string()),
};

export const upsertWorldArgs = {
  worldKey: v.string(),
  name: v.string(),
  runtimeKind: runtimeKindValidator,
  readBackend: readBackendValidator,
  writeBackend: writeBackendValidator,
  studioMapId: v.optional(v.id("studioMaps")),
  status: v.optional(statusValidator),
  updatedAt: v.optional(v.number()),
};

export const upsertPlayerArgs = {
  worldKey: v.string(),
  playerKey: v.string(),
  owner: v.string(),
  appearance: appearanceValidator,
  entity: v.optional(v.string()),
  playerOwnerComponent: v.optional(v.string()),
  positionComponent: v.optional(v.string()),
  inventoryComponent: v.optional(v.string()),
  ...freshnessValidators,
};

export const upsertPlayerStateArgs = {
  worldKey: v.string(),
  playerKey: v.string(),
  position: gridPointValidator,
  energy: energyValidator,
  activeAction: activeActionValidator,
  ...freshnessValidators,
};

export const upsertInventoryArgs = {
  worldKey: v.string(),
  playerKey: v.string(),
  slots: v.array(inventorySlotValidator),
  ...freshnessValidators,
};

export const upsertGoldBalanceArgs = {
  worldKey: v.string(),
  playerKey: v.string(),
  amount: v.int64(),
  ...freshnessValidators,
};

export const upsertFarmTileArgs = {
  worldKey: v.string(),
  x: v.number(),
  y: v.number(),
  soilState: soilStateValidator,
  farmTypeId: v.number(),
  plantedAt: v.number(),
  growthSeconds: v.number(),
  growthUpdatedAt: v.number(),
  wateredUntil: v.number(),
  lastHarvestedAt: v.number(),
  harvestCount: v.number(),
  ...freshnessValidators,
};

export const upsertTileItemArgs = {
  worldKey: v.string(),
  x: v.number(),
  y: v.number(),
  itemId: v.number(),
  quantity: v.number(),
  ...freshnessValidators,
};

export const upsertTradeOfferArgs = {
  worldKey: v.string(),
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
  status: tradeStatusValidator,
  ...freshnessValidators,
};

export const upsertIndexerCheckpointArgs = {
  worldKey: v.string(),
  indexerKey: v.string(),
  checkpointKey: v.string(),
  cursor: v.optional(v.string()),
  ...freshnessValidators,
};
