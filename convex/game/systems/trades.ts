import { mutation } from "../../_generated/server";
import { requireConvexWorld, requireTradeOffer } from "../ecs";
import {
  createTradeOfferSystemArgs,
  tradeOfferSystemArgs,
} from "../validators";

export const createTradeOffer = mutation({
  args: createTradeOfferSystemArgs,
  handler: async (ctx, args) => {
    const world = await requireConvexWorld(ctx, args.worldKey);

    if (args.sellerMint === args.playerKey) {
      throw new Error("Buyer and seller must be different players.");
    }

    if (!Number.isInteger(args.itemId) || args.itemId <= 0) {
      throw new Error("Trade item id must be a positive integer.");
    }

    if (!Number.isInteger(args.itemQuantity) || args.itemQuantity <= 0) {
      throw new Error("Trade item quantity must be positive.");
    }

    if (!Number.isFinite(args.goldAmount) || args.goldAmount <= 0) {
      throw new Error("Trade gold amount must be positive.");
    }

    const now = Date.now();
    const offerId = `${args.playerKey}-${now}`;
    const offer = `convex:${world.worldKey}:${offerId}`;

    await ctx.db.insert("gameTradeOffers", {
      worldId: world._id,
      offer,
      offerId,
      buyer: args.playerKey,
      seller: args.sellerMint,
      buyerPlayerMint: args.playerKey,
      sellerPlayerMint: args.sellerMint,
      buyerEntity: `convex:${args.playerKey}`,
      sellerEntity: `convex:${args.sellerMint}`,
      itemId: args.itemId,
      itemQuantity: args.itemQuantity,
      goldAmount: BigInt(Math.floor(args.goldAmount)),
      expiresAt: Math.floor(now / 1000) + 60 * 60,
      status: "open",
      source: "convex",
      revision: now,
      updatedAt: now,
    });

    return { offer, offerId };
  },
});

export const acceptTradeOffer = mutation({
  args: tradeOfferSystemArgs,
  handler: async (ctx, args) => {
    const world = await requireConvexWorld(ctx, args.worldKey);
    const trade = await requireTradeOffer(ctx, world, args.offer);

    if (trade.status !== "open") {
      throw new Error("Trade offer is not open.");
    }

    if (trade.sellerPlayerMint !== args.playerKey) {
      throw new Error("Only the seller can accept this trade.");
    }

    const now = Date.now();

    await ctx.db.patch(trade._id, {
      acceptance: `${args.offer}:accepted`,
      status: "accepted",
      source: "convex",
      revision: now,
      updatedAt: now,
    });
  },
});

export const finalizeTradeOffer = mutation({
  args: tradeOfferSystemArgs,
  handler: async (ctx, args) => {
    const world = await requireConvexWorld(ctx, args.worldKey);
    const trade = await requireTradeOffer(ctx, world, args.offer);

    if (trade.status !== "accepted") {
      throw new Error("Trade offer is not accepted.");
    }

    if (trade.buyerPlayerMint !== args.playerKey) {
      throw new Error("Only the buyer can finalize this trade.");
    }

    const now = Date.now();

    await ctx.db.patch(trade._id, {
      status: "finalized",
      source: "convex",
      revision: now,
      updatedAt: now,
    });
  },
});

export const cancelTradeOffer = mutation({
  args: tradeOfferSystemArgs,
  handler: async (ctx, args) => {
    const world = await requireConvexWorld(ctx, args.worldKey);
    const trade = await requireTradeOffer(ctx, world, args.offer);

    if (
      trade.buyerPlayerMint !== args.playerKey &&
      trade.sellerPlayerMint !== args.playerKey
    ) {
      throw new Error("Only a trade participant can cancel this trade.");
    }

    await ctx.db.delete(trade._id);
  },
});
