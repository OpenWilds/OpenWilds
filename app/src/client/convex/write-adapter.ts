import { ConvexClient } from "convex/browser";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { GameWriteAdapter } from "../../game/ports";
import type {
  ActionResult,
  ActionMode,
  GridPoint,
  PlayerActionState,
} from "../../game/types";

declare const __OPEN_WILDS_CONVEX_URL__: string | undefined;

type MovePlayerArgs = {
  worldKey: string;
  playerKey: string;
  point: GridPoint;
};

type SleepPlayerArgs = {
  worldKey: string;
  playerKey: string;
};

type PerformTileActionArgs = {
  worldKey: string;
  playerKey: string;
  mode: ActionMode;
  point: GridPoint;
  selectedItemId?: number | null;
  selectedQuantity?: number | null;
};

type CreateTradeOfferArgs = {
  worldKey: string;
  playerKey: string;
  sellerMint: string;
  itemId: number;
  itemQuantity: number;
  goldAmount: number;
};

type TradeOfferArgs = {
  worldKey: string;
  playerKey: string;
  offer: string;
};

export type ConvexGameMutationClient = {
  mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    args: Mutation["_args"]
  ): Promise<Mutation["_returnType"]>;
  close?: () => Promise<void> | void;
};

export type ConvexWriteAdapterArgs = {
  worldKey: string;
  playerKey: string;
  client: ConvexGameMutationClient;
  closeClientOnDispose?: boolean;
  onError?: (error: Error) => void;
};

export type CreateConvexWriteAdapterArgs = {
  worldKey: string;
  playerKey: string;
  convexUrl?: string;
  client?: ConvexGameMutationClient;
  onError?: (error: Error) => void;
};

const refs = {
  movePlayer: makeFunctionReference<
    "mutation",
    MovePlayerArgs,
    PlayerActionState
  >("game/systems/movement:movePlayer"),
  sleepPlayer: makeFunctionReference<
    "mutation",
    SleepPlayerArgs,
    PlayerActionState
  >("game/systems/rest:sleepPlayer"),
  performTileAction: makeFunctionReference<
    "mutation",
    PerformTileActionArgs,
    ActionResult
  >("game/systems/tileActions:performTileAction"),
  createTradeOffer: makeFunctionReference<
    "mutation",
    CreateTradeOfferArgs,
    { offer: string; offerId: string }
  >("game/systems/trades:createTradeOffer"),
  acceptTradeOffer: makeFunctionReference<"mutation", TradeOfferArgs, null>(
    "game/systems/trades:acceptTradeOffer"
  ),
  cancelTradeOffer: makeFunctionReference<"mutation", TradeOfferArgs, null>(
    "game/systems/trades:cancelTradeOffer"
  ),
  finalizeTradeOffer: makeFunctionReference<"mutation", TradeOfferArgs, null>(
    "game/systems/trades:finalizeTradeOffer"
  ),
};

export class ConvexWriteAdapter implements GameWriteAdapter {
  constructor(private readonly args: ConvexWriteAdapterArgs) {}

  async movePlayer(point: GridPoint) {
    return await this.runGameplayMutation(refs.movePlayer, {
      worldKey: this.args.worldKey,
      playerKey: this.args.playerKey,
      point,
    });
  }

  async sleepPlayer() {
    return await this.runGameplayMutation(refs.sleepPlayer, {
      worldKey: this.args.worldKey,
      playerKey: this.args.playerKey,
    });
  }

  async performAction(
    mode: ActionMode,
    point: GridPoint,
    selectedItemId?: number | null,
    selectedQuantity?: number | null
  ) {
    return await this.runGameplayMutation(refs.performTileAction, {
      worldKey: this.args.worldKey,
      playerKey: this.args.playerKey,
      mode,
      point,
      selectedItemId,
      selectedQuantity,
    });
  }

  async createTradeOffer(args: {
    sellerMint: string;
    itemId: number;
    itemQuantity: number;
    goldAmount: number;
  }) {
    await this.runCommandMutation(refs.createTradeOffer, {
      worldKey: this.args.worldKey,
      playerKey: this.args.playerKey,
      sellerMint: args.sellerMint,
      itemId: args.itemId,
      itemQuantity: args.itemQuantity,
      goldAmount: args.goldAmount,
    });
  }

  async acceptTradeOffer(offer: string) {
    await this.runCommandMutation(refs.acceptTradeOffer, this.tradeArgs(offer));
  }

  async cancelTradeOffer(offer: string) {
    await this.runCommandMutation(refs.cancelTradeOffer, this.tradeArgs(offer));
  }

  async finalizeTradeOffer(offer: string) {
    await this.runCommandMutation(
      refs.finalizeTradeOffer,
      this.tradeArgs(offer)
    );
  }

  dispose() {
    if (this.args.closeClientOnDispose) {
      void this.args.client.close?.();
    }
  }

  private tradeArgs(offer: string): TradeOfferArgs {
    return {
      worldKey: this.args.worldKey,
      playerKey: this.args.playerKey,
      offer,
    };
  }

  private async runGameplayMutation<
    Mutation extends FunctionReference<"mutation">
  >(mutation: Mutation, args: Mutation["_args"]) {
    try {
      return await this.args.client.mutation(mutation, args);
    } catch (error) {
      this.args.onError?.(toError(error));
      return null;
    }
  }

  private async runCommandMutation<
    Mutation extends FunctionReference<"mutation">
  >(mutation: Mutation, args: Mutation["_args"]) {
    try {
      await this.args.client.mutation(mutation, args);
    } catch (error) {
      this.args.onError?.(toError(error));
    }
  }
}

export const createConvexWriteAdapter = ({
  worldKey,
  playerKey,
  convexUrl = getConfiguredConvexUrl(),
  client,
  onError,
}: CreateConvexWriteAdapterArgs) => {
  const writeClient = client ?? createConvexClient(convexUrl);

  return new ConvexWriteAdapter({
    worldKey,
    playerKey,
    client: writeClient,
    closeClientOnDispose: !client,
    onError,
  });
};

const createConvexClient = (convexUrl: string): ConvexClient => {
  if (!convexUrl) {
    throw new Error(
      "Set VITE_CONVEX_URL in .env.local to use Convex game writes."
    );
  }

  return new ConvexClient(convexUrl);
};

const getConfiguredConvexUrl = () =>
  typeof __OPEN_WILDS_CONVEX_URL__ === "string"
    ? __OPEN_WILDS_CONVEX_URL__
    : "";

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));
