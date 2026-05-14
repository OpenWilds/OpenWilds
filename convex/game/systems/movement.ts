import { mutation } from "../../_generated/server";
import {
  ActionId,
  WALK_ENERGY_PER_TILE,
  WALK_SECONDS_PER_TILE,
} from "../constants";
import {
  activeAction,
  assertInBounds,
  assertNoActiveAction,
  nowUnixSeconds,
  patchPlayerActionState,
  requirePlayerBundle,
} from "../ecs";
import { movePlayerArgs } from "../validators";

export const movePlayer = mutation({
  args: movePlayerArgs,
  handler: async (ctx, args) => movePlayerDoc(ctx, args),
});

export async function movePlayerDoc(
  ctx: Parameters<typeof requirePlayerBundle>[0],
  args: {
    worldKey: string;
    playerKey: string;
    point: { x: number; y: number };
  }
) {
  assertInBounds(args.point);

  const { state } = await requirePlayerBundle(ctx, args);

  assertNoActiveAction(state);

  const distance =
    Math.abs(state.position.x - args.point.x) +
    Math.abs(state.position.y - args.point.y);

  if (distance === 0) {
    throw new Error("Movement action must move at least one tile.");
  }

  const cost = distance * WALK_ENERGY_PER_TILE;

  if (state.energy.current < cost) {
    throw new Error("Not enough energy for movement.");
  }

  const startedAt = nowUnixSeconds();

  return await patchPlayerActionState(ctx, state, {
    position: args.point,
    energy: {
      current: state.energy.current - cost,
      max: state.energy.max,
    },
    activeAction: activeAction(
      ActionId.move,
      "move",
      startedAt,
      Math.max(0.35, distance * WALK_SECONDS_PER_TILE)
    ),
  });
}
