import { internalMutation } from "../../_generated/server";
import { upsertIndexerCheckpointDoc } from "../../game/ingest";
import { upsertIndexerCheckpointArgs } from "../../game/validators";

export const upsertCheckpoint = internalMutation({
  args: upsertIndexerCheckpointArgs,
  handler: async (ctx, args) => upsertIndexerCheckpointDoc(ctx, args),
});
