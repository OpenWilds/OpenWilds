import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import { requireWorkspaceEditor } from "./workspaceAuth";

export const getSourceTextureForBuild = internalQuery({
  args: {
    workspaceId: v.id("studioWorkspaces"),
    sourceTextureId: v.id("studioTerrainTextures"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceEditor(ctx, args.workspaceId);

    const texture = await ctx.db.get(args.sourceTextureId);

    if (!texture || texture.workspaceId !== args.workspaceId) {
      throw new Error("Source texture not found");
    }

    return {
      _id: texture._id,
      workspaceId: texture.workspaceId,
      terrainId: texture.terrainId,
      label: texture.label,
      storageId: texture.storageId,
      contentType: texture.contentType,
      size: texture.size,
      material: texture.material,
      texturePrompt: texture.texturePrompt,
      stylePrompt: texture.stylePrompt,
      status: texture.status,
      updatedAt: texture.updatedAt,
    };
  },
});
