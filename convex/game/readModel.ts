import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  defaultPlayerActionState,
  defaultPlayerAppearance,
  emptyReadModel,
} from "./defaults";
import {
  getGoldBalance,
  getInventory,
  getPlayer,
  getPlayerState,
  getWorldByKey,
  toPlayerActionState,
} from "./queries";
import {
  FARM_TILE_LIMIT,
  getWorldReadModelArgs,
  TILE_ITEM_LIMIT,
  TRADE_OFFER_LIMIT,
  VISIBLE_PLAYER_LIMIT,
} from "./validators";

export const getWorldReadModel = query({
  args: getWorldReadModelArgs,
  handler: getWorldReadModelHandler,
});

export async function getWorldReadModelHandler(
  ctx: QueryCtx,
  args: {
    worldKey: string;
    playerKey: string | null;
  }
) {
  const world = await getWorldByKey(ctx, args.worldKey);

  if (!world) {
    return emptyReadModel();
  }

  const players = await ctx.db
    .query("gamePlayers")
    .withIndex("by_worldId_and_updatedAt", (q) => q.eq("worldId", world._id))
    .order("desc")
    .take(VISIBLE_PLAYER_LIMIT);
  const selectedPlayer = args.playerKey
    ? await getPlayer(ctx, world._id, args.playerKey)
    : null;
  const selectedState = args.playerKey
    ? await getPlayerState(ctx, world._id, args.playerKey)
    : null;
  const selectedInventory = args.playerKey
    ? await getInventory(ctx, world._id, args.playerKey)
    : null;
  const selectedGold = args.playerKey
    ? await getGoldBalance(ctx, world._id, args.playerKey)
    : null;

  const [farmTiles, tileItems, tradeOffers, visiblePlayers] = await Promise.all(
    [
      listFarmTiles(ctx, world._id),
      listTileItems(ctx, world._id),
      listTradeOffers(ctx, world._id, args.playerKey),
      listVisiblePlayers(ctx, world._id, args.playerKey, players),
    ]
  );

  return {
    playerActionState: selectedState
      ? toPlayerActionState(selectedState)
      : defaultPlayerActionState,
    playerAppearance: selectedPlayer
      ? selectedPlayer.appearance
      : defaultPlayerAppearance,
    visiblePlayers,
    inventory: {
      slots: selectedInventory?.slots ?? [],
    },
    goldBalance: {
      amount: selectedGold?.amount ?? 0n,
    },
    tradeOffers,
    farmTiles,
    tileItems,
  };
}

const listFarmTiles = async (ctx: QueryCtx, worldId: Id<"gameWorlds">) => {
  const tiles = await ctx.db
    .query("gameFarmTiles")
    .withIndex("by_worldId_and_updatedAt", (q) => q.eq("worldId", worldId))
    .order("desc")
    .take(FARM_TILE_LIMIT);

  return tiles.map((tile) => ({
    x: tile.x,
    y: tile.y,
    soilState: tile.soilState,
    farmTypeId: tile.farmTypeId,
    plantedAt: tile.plantedAt,
    growthSeconds: tile.growthSeconds,
    growthUpdatedAt: tile.growthUpdatedAt,
    wateredUntil: tile.wateredUntil,
    lastHarvestedAt: tile.lastHarvestedAt,
    harvestCount: tile.harvestCount,
  }));
};

const listTileItems = async (ctx: QueryCtx, worldId: Id<"gameWorlds">) => {
  const items = await ctx.db
    .query("gameTileItems")
    .withIndex("by_worldId_and_updatedAt", (q) => q.eq("worldId", worldId))
    .order("desc")
    .take(TILE_ITEM_LIMIT);

  return items.map((item) => ({
    x: item.x,
    y: item.y,
    itemId: item.itemId,
    quantity: item.quantity,
  }));
};

const listTradeOffers = async (
  ctx: QueryCtx,
  worldId: Id<"gameWorlds">,
  playerKey: string | null
) => {
  if (!playerKey) {
    return [];
  }

  const [outgoing, incoming] = await Promise.all([
    ctx.db
      .query("gameTradeOffers")
      .withIndex("by_worldId_and_buyerPlayerMint_and_updatedAt", (q) =>
        q.eq("worldId", worldId).eq("buyerPlayerMint", playerKey)
      )
      .order("desc")
      .take(TRADE_OFFER_LIMIT),
    ctx.db
      .query("gameTradeOffers")
      .withIndex("by_worldId_and_sellerPlayerMint_and_updatedAt", (q) =>
        q.eq("worldId", worldId).eq("sellerPlayerMint", playerKey)
      )
      .order("desc")
      .take(TRADE_OFFER_LIMIT),
  ]);
  const offers = new Map<
    string,
    Doc<"gameTradeOffers"> & { direction: "incoming" | "outgoing" }
  >();

  for (const offer of outgoing) {
    offers.set(offer.offer, { ...offer, direction: "outgoing" });
  }
  for (const offer of incoming) {
    offers.set(offer.offer, { ...offer, direction: "incoming" });
  }

  return Array.from(offers.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, TRADE_OFFER_LIMIT)
    .map((offer) => ({
      offer: offer.offer,
      acceptance: offer.acceptance,
      direction: offer.direction,
      offerId: offer.offerId,
      buyer: offer.buyer,
      seller: offer.seller,
      buyerPlayerMint: offer.buyerPlayerMint,
      sellerPlayerMint: offer.sellerPlayerMint,
      buyerEntity: offer.buyerEntity,
      sellerEntity: offer.sellerEntity,
      itemId: offer.itemId,
      itemQuantity: offer.itemQuantity,
      goldAmount: offer.goldAmount,
      expiresAt: offer.expiresAt,
      status: offer.status,
    }));
};

const listVisiblePlayers = async (
  ctx: QueryCtx,
  worldId: Id<"gameWorlds">,
  selectedPlayerKey: string | null,
  players: Doc<"gamePlayers">[]
) => {
  const visiblePlayers = [];

  for (const player of players) {
    const [state, inventory] = await Promise.all([
      getPlayerState(ctx, worldId, player.playerKey),
      getInventory(ctx, worldId, player.playerKey),
    ]);

    visiblePlayers.push({
      mint: player.playerKey,
      owner: player.owner,
      entity: player.entity ?? "",
      playerOwnerComponent: player.playerOwnerComponent ?? "",
      positionComponent: player.positionComponent ?? "",
      inventoryComponent: player.inventoryComponent ?? "",
      isActive: player.playerKey === selectedPlayerKey,
      appearance: player.appearance,
      state: state ? toPlayerActionState(state) : defaultPlayerActionState,
      inventory: {
        slots: inventory?.slots ?? [],
      },
    });
  }

  return visiblePlayers;
};
