import { mutation } from "../../_generated/server";
import { ActionId, ACTION_SECONDS } from "../constants";
import {
  activeAction,
  assertNoActiveAction,
  nowUnixSeconds,
  patchPlayerActionState,
  requirePlayerBundle,
} from "../ecs";
import { sleepPlayerArgs } from "../validators";

export const sleepPlayer = mutation({
  args: sleepPlayerArgs,
  handler: async (ctx, args) => sleepPlayerDoc(ctx, args),
});

export async function sleepPlayerDoc(
  ctx: Parameters<typeof requirePlayerBundle>[0],
  args: {
    worldKey: string;
    playerKey: string;
  }
) {
  const { state } = await requirePlayerBundle(ctx, args);

  assertNoActiveAction(state);

  return await patchPlayerActionState(ctx, state, {
    energy: {
      current: state.energy.max,
      max: state.energy.max,
    },
    activeAction: activeAction(
      ActionId.sleep,
      "sleep",
      nowUnixSeconds(),
      ACTION_SECONDS.sleep
    ),
  });
}
