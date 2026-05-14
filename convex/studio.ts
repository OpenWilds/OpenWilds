import { v } from "convex/values";

import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { requireAuthUserId } from "./authz";

const photoroomSegmentEndpoint = "https://sdk.photoroom.com/v1/segment";

const terrainStatus = v.union(
  v.literal("draft"),
  v.literal("library"),
  v.literal("archived")
);

const textureStatus = v.union(
  v.literal("draft"),
  v.literal("approved"),
  v.literal("archived")
);

const plantSpriteKind = v.union(v.literal("plant"), v.literal("tree"));
const objectSpriteKind = v.union(v.literal("building"), v.literal("object"));

const plantSpriteStatus = v.union(
  v.literal("draft"),
  v.literal("library"),
  v.literal("archived")
);
const objectSpriteStatus = plantSpriteStatus;

const plantSpriteCell = v.object({
  stateId: v.string(),
  stateTitle: v.string(),
  columnLabel: v.string(),
  row: v.number(),
  column: v.number(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuthUserId(ctx);

    return await ctx.storage.generateUploadUrl();
  },
});

export const generateSourceTexture = action({
  args: {
    terrainId: v.string(),
    label: v.string(),
    material: v.string(),
    texturePrompt: v.string(),
    stylePrompt: v.string(),
    imageModel: v.optional(v.string()),
    reasoningEffort: v.optional(
      v.union(
        v.literal("none"),
        v.literal("minimal"),
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("xhigh")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const startedAt = Date.now();
    const requestId = createGenerationRequestId(args.terrainId);
    const imageModel =
      args.imageModel ??
      process.env.OPENROUTER_IMAGE_MODEL ??
      "google/gemini-2.5-flash-image";
    const reasoningEffort =
      args.reasoningEffort ?? process.env.OPENROUTER_REASONING_EFFORT ?? "high";
    const prompt = buildTexturePrompt(args);

    logTextureGeneration(requestId, "started", {
      terrainId: args.terrainId,
      label: args.label,
      material: args.material,
      imageModel,
      reasoningEffort,
      promptLength: prompt.length,
    });

    const content = await requestOpenRouterImage({
      id: `${args.terrainId}-source-texture`,
      title: `${args.label} source texture`,
      prompt,
      imageModel,
      reasoningEffort,
      requestId,
      logScope: "texture",
    });
    logTextureGeneration(requestId, "image_received", {
      contentType: content.contentType,
      dataUrlLength: content.dataUrl.length,
    });

    const blob = await dataUrlToBlob(content.dataUrl);
    logTextureGeneration(requestId, "blob_decoded", {
      contentType: blob.type || content.contentType,
      size: blob.size,
    });

    const storageId = await ctx.storage.store(blob);
    logTextureGeneration(requestId, "stored", {
      storageId,
      size: blob.size,
    });

    const textureId: string = await ctx.runMutation(
      api.studio.registerSourceTexture,
      {
        terrainId: args.terrainId,
        label: args.label,
        storageId,
        fileName: `${args.terrainId}-source-texture.png`,
        contentType: content.contentType,
        size: blob.size,
        material: args.material,
        texturePrompt: args.texturePrompt,
        stylePrompt: args.stylePrompt,
        status: "approved",
      }
    );
    const url = await ctx.storage.getUrl(storageId);
    logTextureGeneration(requestId, "registered", {
      textureId,
      hasUrl: url !== null,
      durationMs: Date.now() - startedAt,
    });

    return {
      textureId,
      storageId,
      url,
      prompt: content.prompt,
      model: content.model,
      contentType: content.contentType,
      size: blob.size,
    };
  },
});

export const listTerrainTextures = query({
  args: {
    status: v.optional(textureStatus),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const status = args.status;
    const textures =
      status === undefined
        ? await ctx.db.query("studioTerrainTextures").order("desc").take(100)
        : await ctx.db
            .query("studioTerrainTextures")
            .withIndex("by_status_and_updatedAt", (q) => q.eq("status", status))
            .order("desc")
            .take(100);

    return await Promise.all(
      textures.map(async (texture) => ({
        ...texture,
        url: await ctx.storage.getUrl(texture.storageId),
      }))
    );
  },
});

export const registerSourceTexture = mutation({
  args: {
    terrainId: v.string(),
    label: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    material: v.string(),
    texturePrompt: v.string(),
    stylePrompt: v.string(),
    status: v.optional(textureStatus),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const now = Date.now();
    const existing = await ctx.db
      .query("studioTerrainTextures")
      .withIndex("by_terrainId", (q) => q.eq("terrainId", args.terrainId))
      .first();
    const patch = {
      terrainId: args.terrainId,
      label: args.label,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      material: args.material,
      texturePrompt: args.texturePrompt,
      stylePrompt: args.stylePrompt,
      status: args.status ?? "draft",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("studioTerrainTextures", {
      ...patch,
      createdAt: now,
    });
  },
});

export const registerTerrainAsset = mutation({
  args: {
    terrainId: v.string(),
    label: v.string(),
    sourceTextureId: v.optional(v.id("studioTerrainTextures")),
    atlasStorageId: v.id("_storage"),
    centerVariantsStorageId: v.id("_storage"),
    material: v.string(),
    texturePrompt: v.string(),
    stylePrompt: v.string(),
    status: v.optional(terrainStatus),
    tags: v.optional(v.array(v.string())),
    walkable: v.optional(v.boolean()),
    plantable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const now = Date.now();
    const existing = await ctx.db
      .query("studioTerrainAssets")
      .withIndex("by_terrainId", (q) => q.eq("terrainId", args.terrainId))
      .first();
    const patch = {
      terrainId: args.terrainId,
      label: args.label,
      sourceTextureId: args.sourceTextureId,
      atlasStorageId: args.atlasStorageId,
      centerVariantsStorageId: args.centerVariantsStorageId,
      material: args.material,
      texturePrompt: args.texturePrompt,
      stylePrompt: args.stylePrompt,
      status: args.status ?? "draft",
      tags: args.tags ?? [],
      walkable: args.walkable ?? true,
      plantable: args.plantable ?? true,
      generatedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("studioTerrainAssets", patch);
  },
});

export const generatePlantSprite = action({
  args: {
    plantId: v.string(),
    label: v.string(),
    kind: plantSpriteKind,
    region: v.string(),
    habitat: v.string(),
    objectPrompt: v.string(),
    stylePrompt: v.string(),
    cellSize: v.optional(v.number()),
    imageModel: v.optional(v.string()),
    reasoningEffort: v.optional(
      v.union(
        v.literal("none"),
        v.literal("minimal"),
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("xhigh")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const startedAt = Date.now();
    const requestId = createGenerationRequestId(args.plantId);
    const imageModel =
      args.imageModel ??
      process.env.OPENROUTER_IMAGE_MODEL ??
      "google/gemini-2.5-flash-image";
    const reasoningEffort =
      args.reasoningEffort ?? process.env.OPENROUTER_REASONING_EFFORT ?? "high";
    const rows = 4;
    const columns = 4;
    const cellSize = normalizePlantCellSize(args.kind, args.cellSize);
    const states = getPlantSpriteStates(args.kind);
    const columnLabels = ["step 1", "step 2", "step 3", "step 4"];
    const cells = buildPlantSpriteCells({
      states,
      columnLabels,
      columns,
      cellSize,
    });
    const layoutGuide = createObjectSpriteLayoutGuide({
      rows,
      columns,
    });
    const prompt = buildPlantSpritePrompt({
      ...args,
      cellSize,
      rows,
      columns,
      states,
      columnLabels,
    });

    logPlantGeneration(requestId, "started", {
      plantId: args.plantId,
      label: args.label,
      kind: args.kind,
      imageModel,
      reasoningEffort,
      promptLength: prompt.length,
    });
    const layoutGuideStorageId = await ctx.storage.store(layoutGuide.blob);
    logPlantGeneration(requestId, "layout_guide_stored", {
      storageId: layoutGuideStorageId,
      size: layoutGuide.blob.size,
      width: layoutGuide.width,
      height: layoutGuide.height,
    });

    const content = await requestOpenRouterImage({
      id: `${args.plantId}-sprite-sheet`,
      title: `${args.label} sprite sheet`,
      prompt,
      imageModel,
      reasoningEffort,
      referenceImageDataUrls: [layoutGuide.dataUrl],
      requestId,
      logScope: "plant",
    });
    logPlantGeneration(requestId, "image_received", {
      contentType: content.contentType,
      dataUrlLength: content.dataUrl.length,
    });

    const rawBlob = await dataUrlToBlob(content.dataUrl);
    logPlantGeneration(requestId, "background_removal_started", {
      rawContentType: rawBlob.type || content.contentType,
      rawSize: rawBlob.size,
    });
    const blob = await removeObjectSpriteBackground(
      rawBlob,
      `${args.plantId}-sprite-sheet.png`
    );
    const storageId = await ctx.storage.store(blob);
    logPlantGeneration(requestId, "stored", {
      storageId,
      size: blob.size,
    });

    const spriteId: string = await ctx.runMutation(
      api.studio.registerPlantSprite,
      {
        plantId: args.plantId,
        label: args.label,
        kind: args.kind,
        spriteStorageId: storageId,
        layoutGuideStorageId,
        fileName: `${args.plantId}-sprite-sheet.png`,
        contentType: blob.type || "image/png",
        size: blob.size,
        status: "library",
        region: args.region,
        habitat: args.habitat,
        objectPrompt: args.objectPrompt,
        stylePrompt: args.stylePrompt,
        generatedPrompt: content.prompt,
        model: content.model,
        rows,
        columns,
        cellSize,
        atlasWidth: columns * cellSize,
        atlasHeight: rows * cellSize,
        cells,
      }
    );
    const url = await ctx.storage.getUrl(storageId);

    logPlantGeneration(requestId, "registered", {
      spriteId,
      hasUrl: url !== null,
      durationMs: Date.now() - startedAt,
    });

    return {
      spriteId,
      plantId: args.plantId,
      label: args.label,
      kind: args.kind,
      spriteStorageId: storageId,
      url,
      contentType: blob.type || "image/png",
      size: blob.size,
      status: "library",
      region: args.region,
      habitat: args.habitat,
      objectPrompt: args.objectPrompt,
      stylePrompt: args.stylePrompt,
      generatedPrompt: content.prompt,
      model: content.model,
      rows,
      columns,
      cellSize,
      atlasWidth: columns * cellSize,
      atlasHeight: rows * cellSize,
      cells,
      updatedAt: Date.now(),
    };
  },
});

export const registerPlantSprite = mutation({
  args: {
    plantId: v.string(),
    label: v.string(),
    kind: plantSpriteKind,
    spriteStorageId: v.id("_storage"),
    layoutGuideStorageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    status: v.optional(plantSpriteStatus),
    region: v.string(),
    habitat: v.string(),
    objectPrompt: v.string(),
    stylePrompt: v.string(),
    generatedPrompt: v.string(),
    model: v.string(),
    rows: v.number(),
    columns: v.number(),
    cellSize: v.number(),
    atlasWidth: v.number(),
    atlasHeight: v.number(),
    cells: v.array(plantSpriteCell),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const now = Date.now();
    const existing = await ctx.db
      .query("studioPlantSprites")
      .withIndex("by_plantId", (q) => q.eq("plantId", args.plantId))
      .first();
    const patch = {
      plantId: args.plantId,
      label: args.label,
      kind: args.kind,
      spriteStorageId: args.spriteStorageId,
      layoutGuideStorageId: args.layoutGuideStorageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      status: args.status ?? "draft",
      region: args.region,
      habitat: args.habitat,
      objectPrompt: args.objectPrompt,
      stylePrompt: args.stylePrompt,
      generatedPrompt: args.generatedPrompt,
      model: args.model,
      rows: args.rows,
      columns: args.columns,
      cellSize: args.cellSize,
      atlasWidth: args.atlasWidth,
      atlasHeight: args.atlasHeight,
      cells: args.cells,
      generatedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("studioPlantSprites", {
      ...patch,
      createdAt: now,
    });
  },
});

export const listPlantSprites = query({
  args: {
    status: v.optional(plantSpriteStatus),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const status = args.status;
    const sprites =
      status === undefined
        ? await ctx.db.query("studioPlantSprites").order("desc").take(100)
        : await ctx.db
            .query("studioPlantSprites")
            .withIndex("by_status_and_updatedAt", (q) => q.eq("status", status))
            .order("desc")
            .take(100);

    return await Promise.all(
      sprites.map(async (sprite) => ({
        ...sprite,
        url: await ctx.storage.getUrl(sprite.spriteStorageId),
        layoutGuideUrl: sprite.layoutGuideStorageId
          ? await ctx.storage.getUrl(sprite.layoutGuideStorageId)
          : null,
      }))
    );
  },
});

export const generateObjectSprite = action({
  args: {
    objectId: v.string(),
    label: v.string(),
    kind: objectSpriteKind,
    region: v.string(),
    habitat: v.string(),
    objectPrompt: v.string(),
    stylePrompt: v.string(),
    imageModel: v.optional(v.string()),
    reasoningEffort: v.optional(
      v.union(
        v.literal("none"),
        v.literal("minimal"),
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("xhigh")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const startedAt = Date.now();
    const requestId = createGenerationRequestId(args.objectId);
    const imageModel =
      args.imageModel ??
      process.env.OPENROUTER_IMAGE_MODEL ??
      "google/gemini-2.5-flash-image";
    const reasoningEffort =
      args.reasoningEffort ?? process.env.OPENROUTER_REASONING_EFFORT ?? "high";
    const prompt = buildObjectSpritePrompt(args);

    logObjectGeneration(requestId, "started", {
      objectId: args.objectId,
      label: args.label,
      kind: args.kind,
      imageModel,
      reasoningEffort,
      promptLength: prompt.length,
    });

    const content = await requestOpenRouterImage({
      id: `${args.objectId}-object-sprite`,
      title: `${args.label} object sprite`,
      prompt,
      imageModel,
      reasoningEffort,
      requestId,
      logScope: "object",
    });
    logObjectGeneration(requestId, "image_received", {
      contentType: content.contentType,
      dataUrlLength: content.dataUrl.length,
    });

    const rawBlob = await dataUrlToBlob(content.dataUrl);
    logObjectGeneration(requestId, "background_removal_started", {
      rawContentType: rawBlob.type || content.contentType,
      rawSize: rawBlob.size,
    });
    const blob = await removeObjectSpriteBackground(
      rawBlob,
      `${args.objectId}-object-sprite.png`
    );
    const storageId = await ctx.storage.store(blob);
    logObjectGeneration(requestId, "stored", {
      storageId,
      size: blob.size,
    });

    const spriteId: string = await ctx.runMutation(
      api.studio.registerObjectSprite,
      {
        objectId: args.objectId,
        label: args.label,
        kind: args.kind,
        spriteStorageId: storageId,
        fileName: `${args.objectId}-object-sprite.png`,
        contentType: blob.type || "image/png",
        size: blob.size,
        status: "library",
        region: args.region,
        habitat: args.habitat,
        objectPrompt: args.objectPrompt,
        stylePrompt: args.stylePrompt,
        generatedPrompt: content.prompt,
        model: content.model,
      }
    );
    const url = await ctx.storage.getUrl(storageId);

    logObjectGeneration(requestId, "registered", {
      spriteId,
      hasUrl: url !== null,
      durationMs: Date.now() - startedAt,
    });

    return {
      spriteId,
      objectId: args.objectId,
      label: args.label,
      kind: args.kind,
      spriteStorageId: storageId,
      url,
      contentType: blob.type || "image/png",
      size: blob.size,
      status: "library",
      region: args.region,
      habitat: args.habitat,
      objectPrompt: args.objectPrompt,
      stylePrompt: args.stylePrompt,
      generatedPrompt: content.prompt,
      model: content.model,
      updatedAt: Date.now(),
    };
  },
});

export const registerObjectSprite = mutation({
  args: {
    objectId: v.string(),
    label: v.string(),
    kind: objectSpriteKind,
    spriteStorageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    status: v.optional(objectSpriteStatus),
    region: v.string(),
    habitat: v.string(),
    objectPrompt: v.string(),
    stylePrompt: v.string(),
    generatedPrompt: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const now = Date.now();
    const existing = await ctx.db
      .query("studioObjectSprites")
      .withIndex("by_objectId", (q) => q.eq("objectId", args.objectId))
      .first();
    const patch = {
      objectId: args.objectId,
      label: args.label,
      kind: args.kind,
      spriteStorageId: args.spriteStorageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      status: args.status ?? "draft",
      region: args.region,
      habitat: args.habitat,
      objectPrompt: args.objectPrompt,
      stylePrompt: args.stylePrompt,
      generatedPrompt: args.generatedPrompt,
      model: args.model,
      generatedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("studioObjectSprites", {
      ...patch,
      createdAt: now,
    });
  },
});

export const listObjectSprites = query({
  args: {
    status: v.optional(objectSpriteStatus),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const status = args.status;
    const sprites =
      status === undefined
        ? await ctx.db.query("studioObjectSprites").order("desc").take(100)
        : await ctx.db
            .query("studioObjectSprites")
            .withIndex("by_status_and_updatedAt", (q) => q.eq("status", status))
            .order("desc")
            .take(100);

    return await Promise.all(
      sprites.map(async (sprite) => ({
        ...sprite,
        url: await ctx.storage.getUrl(sprite.spriteStorageId),
      }))
    );
  },
});

export const listTerrainAssets = query({
  args: {
    status: v.optional(terrainStatus),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const status = args.status;
    const assets =
      status === undefined
        ? await ctx.db.query("studioTerrainAssets").order("desc").take(100)
        : await ctx.db
            .query("studioTerrainAssets")
            .withIndex("by_status_and_updatedAt", (q) => q.eq("status", status))
            .order("desc")
            .take(100);

    return await Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        atlasUrl: await ctx.storage.getUrl(asset.atlasStorageId),
        centerVariantsUrl: await ctx.storage.getUrl(
          asset.centerVariantsStorageId
        ),
      }))
    );
  },
});

export const saveMap = mutation({
  args: {
    mapId: v.optional(v.id("studioMaps")),
    name: v.string(),
    width: v.number(),
    height: v.number(),
    mapJson: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);

    const now = Date.now();
    const patch = {
      name: args.name,
      width: args.width,
      height: args.height,
      mapJson: args.mapJson,
      updatedAt: now,
    };

    if (args.mapId) {
      await ctx.db.patch(args.mapId, patch);
      return args.mapId;
    }

    return await ctx.db.insert("studioMaps", {
      ...patch,
      createdAt: now,
    });
  },
});

export const listMaps = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthUserId(ctx);

    return await ctx.db.query("studioMaps").order("desc").take(50);
  },
});

type OpenRouterImageResponse = {
  choices?: Array<{
    message?: {
      images?: Array<{
        image_url?: {
          url?: string;
        };
        imageUrl?: {
          url?: string;
        };
      }>;
    };
  }>;
};

type ImageGenerationScope = "texture" | "plant" | "object";

async function requestOpenRouterImage(args: {
  id: string;
  title: string;
  prompt: string;
  imageModel: string;
  reasoningEffort?: string;
  referenceImageDataUrls?: string[];
  requestId: string;
  logScope: ImageGenerationScope;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    logImageGeneration(args.logScope, args.requestId, "missing_api_key", {});
    throw new Error(
      "Missing OPENROUTER_API_KEY in Convex environment. Set it with `npx convex env set OPENROUTER_API_KEY <key>`."
    );
  }

  logImageGeneration(args.logScope, args.requestId, "api_key_loaded", {
    apiKeyFingerprint: fingerprintSecret(apiKey),
    apiKeyLooksLikeOpenRouterKey: apiKey.startsWith("sk-or-"),
  });

  if (!apiKey.startsWith("sk-or-")) {
    logImageGeneration(args.logScope, args.requestId, "invalid_api_key_shape", {
      apiKeyFingerprint: fingerprintSecret(apiKey),
    });
    throw new Error(
      "OPENROUTER_API_KEY is set in Convex, but it does not look like an OpenRouter key. Create an OpenRouter API key that starts with `sk-or-` and set it with `npx convex env set OPENROUTER_API_KEY <key>`."
    );
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const attemptStartedAt = Date.now();

    try {
      logImageGeneration(args.logScope, args.requestId, "openrouter_request", {
        attempt,
        model: args.imageModel,
        reasoningEffort: args.reasoningEffort ?? null,
      });

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              process.env.OPENROUTER_SITE_URL ?? "http://localhost",
            "X-Title": process.env.OPENROUTER_APP_NAME ?? "Open Wilds Studio",
          },
          body: JSON.stringify({
            model: args.imageModel,
            reasoning: args.reasoningEffort
              ? {
                  effort: args.reasoningEffort,
                  exclude: true,
                }
              : undefined,
            messages: [
              {
                role: "user",
                content: args.referenceImageDataUrls?.length
                  ? [
                      {
                        type: "text",
                        text: args.prompt,
                      },
                      ...args.referenceImageDataUrls.map((url) => ({
                        type: "image_url",
                        image_url: {
                          url,
                        },
                      })),
                    ]
                  : args.prompt,
              },
            ],
            modalities: ["image", "text"],
            stream: false,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        logImageGeneration(
          args.logScope,
          args.requestId,
          "openrouter_error_response",
          {
            attempt,
            status: response.status,
            durationMs: Date.now() - attemptStartedAt,
            bodyPreview: errorBody.slice(0, 500),
          }
        );
        throw new Error(
          `OpenRouter image request failed (${response.status}): ${errorBody}`
        );
      }

      const responseBody = await response.text();
      const result = parseOpenRouterImageResponse(responseBody, {
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        logScope: args.logScope,
        requestId: args.requestId,
        status: response.status,
      });
      const image = result.choices?.[0]?.message?.images?.[0];
      const dataUrl = image?.image_url?.url ?? image?.imageUrl?.url;

      if (!dataUrl) {
        logImageGeneration(
          args.logScope,
          args.requestId,
          "openrouter_missing_image",
          {
            attempt,
            durationMs: Date.now() - attemptStartedAt,
          }
        );
        throw new Error(
          `OpenRouter image model returned no image for "${args.title}".`
        );
      }

      logImageGeneration(args.logScope, args.requestId, "openrouter_success", {
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        contentType: getDataUrlContentType(dataUrl),
      });

      return {
        id: args.id,
        title: args.title,
        prompt: args.prompt,
        model: args.imageModel,
        contentType: getDataUrlContentType(dataUrl),
        dataUrl,
      };
    } catch (error) {
      lastError = error;

      if (attempt >= 3 || !isRetryableImageError(error)) {
        logImageGeneration(args.logScope, args.requestId, "failed", {
          attempt,
          retryable: isRetryableImageError(error),
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      logImageGeneration(args.logScope, args.requestId, "retrying", {
        attempt,
        message: error instanceof Error ? error.message : String(error),
        delayMs: 1500 * attempt,
      });
      await delay(1500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseOpenRouterImageResponse(
  body: string,
  args: {
    attempt: number;
    durationMs: number;
    logScope: ImageGenerationScope;
    requestId: string;
    status: number;
  }
): OpenRouterImageResponse {
  if (!body.trim()) {
    logImageGeneration(
      args.logScope,
      args.requestId,
      "openrouter_empty_response",
      {
        attempt: args.attempt,
        durationMs: args.durationMs,
        status: args.status,
      }
    );
    throw new Error("OpenRouter returned an empty JSON response body.");
  }

  try {
    return JSON.parse(body) as OpenRouterImageResponse;
  } catch (error) {
    logImageGeneration(
      args.logScope,
      args.requestId,
      "openrouter_invalid_json",
      {
        attempt: args.attempt,
        durationMs: args.durationMs,
        status: args.status,
        bodyPreview: body.slice(0, 500),
        message: error instanceof Error ? error.message : String(error),
      }
    );
    throw new Error(
      `OpenRouter returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function buildTexturePrompt(args: {
  material: string;
  texturePrompt: string;
  stylePrompt: string;
}) {
  return [
    `Create one seamless square terrain source texture for ${args.material}.`,
    "",
    `Texture brief: ${args.texturePrompt}.`,
    `Style direction: ${args.stylePrompt}.`,
    "",
    "This image will be used as the exact source texture for a 47-tile dual-grid autotile generator.",
    "Make a single flat top-down material swatch, not a tile sheet, not a map, and not a scene.",
    "The texture must be seamless or near-seamless on all four edges.",
    "Use consistent visual density across the entire square: repeated details must have the same size, spacing, and amount everywhere.",
    "Use larger 2x-scale readable shapes, fewer tiny repeated flecks, and enough quiet negative space for characters and objects.",
    "Avoid large unique focal elements, landmarks, symbols, logos, text, UI, borders, frames, cast shadows, perspective objects, or lighting gradients.",
    "Keep the material readable when cropped into many 256px terrain tiles.",
    "Return one square PNG only.",
  ].join("\n");
}

function buildObjectSpritePrompt(args: {
  label: string;
  kind: "building" | "object";
  region: string;
  habitat: string;
  objectPrompt: string;
  stylePrompt: string;
}) {
  const subject =
    args.kind === "building" ? "building or structure" : "world object or prop";

  return [
    `Create one standalone transparent PNG game sprite for ${args.label}.`,
    `Subject type: ${subject}.`,
    `Object brief: ${args.objectPrompt}.`,
    `Region: ${args.region || "custom"}.`,
    `Terrain, habitat, or placement notes: ${args.habitat || "custom"}.`,
    "",
    "Make exactly one isolated subject, not a sprite sheet, not a variant grid, and not a scene.",
    "Use a three-quarter top-down game perspective compatible with a tile-based world editor.",
    "The image will be placed over selectable rectangular grid footprints, so give it a clear readable footprint silhouette and a stable bottom/ground contact area.",
    "Keep the whole subject fully visible with comfortable transparent padding around every edge.",
    "Use a plain removable background if full transparency is not possible; it will be removed in post-processing.",
    "Do not include labels, readable text, logos, watermarks, UI, people, terrain tiles, decorative borders, multiple separate copies, or cast shadows that imply a fixed scene background.",
    "",
    "Style direction:",
    args.stylePrompt,
    "",
    "Return one PNG image only.",
  ].join("\n");
}

type PlantSpriteKind = "plant" | "tree";

type PlantSpriteState = {
  id: string;
  title: string;
  prompt: string;
};

function normalizePlantCellSize(kind: PlantSpriteKind, cellSize?: number) {
  const fallback = kind === "tree" ? 256 : 128;
  const normalized = Math.floor(cellSize ?? fallback);

  if (!Number.isFinite(normalized)) {
    return fallback;
  }

  return Math.min(512, Math.max(16, normalized));
}

function getPlantSpriteStates(kind: PlantSpriteKind): PlantSpriteState[] {
  if (kind === "tree") {
    return [
      {
        id: "seed",
        title: "Seed",
        prompt:
          "column 1 is an isolated collectible tree seed, nut, pit, cone, or sapling item with no dirt; columns 2-4 are planted seed and tiny sapling steps rooted in matching terrain",
      },
      {
        id: "growing",
        title: "Growing",
        prompt:
          "progressive sapling-to-young-tree growth steps, with trunk height and canopy volume increasing while the root point stays fixed",
      },
      {
        id: "grown",
        title: "Grown",
        prompt:
          "different stable mature harvest-ready tree variants with consistent species identity, native terrain roots, and readable canopy silhouettes",
      },
      {
        id: "harvested",
        title: "Harvested",
        prompt:
          "columns 1-2 are post-harvest tree remnants left in the ground; columns 3-4 are isolated harvested tree resource pickups",
      },
    ];
  }

  return [
    {
      id: "seed",
      title: "Seed",
      prompt:
        "column 1 is an isolated collectible seed, bulb, spore, pearl, or cutting with no dirt; columns 2-4 are planted seed growth steps rooted in matching terrain",
    },
    {
      id: "growing",
      title: "Growing",
      prompt: "progressive young growth steps for the ground plant",
    },
    {
      id: "grown",
      title: "Grown, Dry, And Dead",
      prompt:
        "columns 1-2 are stable mature harvest-ready variants of the same plant; column 3 is a dry version of that mature plant; column 4 is a dead version of that mature plant",
    },
    {
      id: "harvested",
      title: "Harvested And High Quality",
      prompt:
        "column 1 is the standard post-harvest plant remnant left in the ground; column 2 is the harvested/cut plant state; columns 3-4 are high-quality harvested versions of the same plant",
    },
  ];
}

function buildPlantSpritePrompt(args: {
  plantId: string;
  label: string;
  kind: PlantSpriteKind;
  region: string;
  habitat: string;
  objectPrompt: string;
  stylePrompt: string;
  rows: number;
  columns: number;
  cellSize: number;
  states: PlantSpriteState[];
  columnLabels: string[];
}) {
  const width = args.columns * args.cellSize;
  const height = args.rows * args.cellSize;

  return [
    `Create a game object sprite sheet for ${args.label}.`,
    `Object brief: ${args.objectPrompt}.`,
    `Region: ${args.region || "custom"}.`,
    `Allowed terrain habitat ids or notes: ${args.habitat || "custom"}.`,
    args.kind === "tree"
      ? "This tree must look native to its terrain and region. Do not make wet-terrain variants look like ordinary dry-land trees."
      : "This is a ground, wetland, vine, moss, flower, or crop-like plant. Keep it lower and smaller than trees.",
    "",
    "Reference image 1 is a checkerboard layout guide. Use it as the exact composition template with exact sizes, all cells are square all equal size.",
    `Preserve its ${args.columns}:${args.rows} sheet ratio and its ${args.columns} columns by ${args.rows} rows of equal square cells.`,
    `The exact guide has also been saved to Convex storage as the layout guide for ${args.plantId}.`,
    "Place exactly one frame in the center of each checkerboard cell.",
    "Align the center of each object frame to the center of its cell.",
    "Keep every frame fully inside its own cell, with consistent margins and no overlap into neighboring cells.",
    "Keep the checkerboard grid visible in the final image so the generated frames can be verified against the grid.",
    "Preserve the alternating white and gray cell backgrounds from the guide.",
    "Draw the object frames on top of the provided checkerboard cells.",
    "",
    `Target runtime atlas metadata: ${width}x${height} logical units, arranged as ${args.rows} rows by ${args.columns} columns.`,
    `Each logical grid cell is ${args.cellSize}x${args.cellSize} units. The generated image may be higher resolution, but it must keep the same ${args.columns}:${args.rows} grid ratio.`,
    "Keep the object scale, anchor point, perspective, and lighting consistent across cells.",
    "Do not crop any object. Leave enough breathing room inside each cell for animation motion.",
    "Do not draw labels, text, numbers, watermarks, decorative borders, or UI.",
    "Use a transparent background for every cell.",
    "",
    "Rows, top to bottom:",
    ...args.states.map(
      (state, row) =>
        `Row ${row}: ${state.title} (${state.id}) - ${state.prompt}`
    ),
    "",
    "Columns, left to right:",
    ...args.columnLabels.map((label, column) => `Column ${column}: ${label}.`),
    "",
    "Column behavior:",
    ...buildPlantColumnBehaviorPrompt(args.kind),
    "",
    "Style direction:",
    args.stylePrompt,
    "",
    "Return one PNG containing the full sprite sheet only.",
  ].join("\n");
}

function buildPlantColumnBehaviorPrompt(kind: PlantSpriteKind) {
  if (kind === "tree") {
    return [
      "For seed rows, column 1 is an isolated collectible seed item with no dirt below it. Columns 2 through the end are planted seed growth steps from left to right.",
      "For grown or harvest-ready rows, columns are different stable variants of the same mature state, not a transformation sequence.",
      "For harvested rows, the first half of columns are post-harvest tree trunk, stump, or canopy remnants left in the ground, and the second half are isolated fruit, cone, branch, seed pod, resin, leaf bundle, or tree resource pickups.",
      "Keep all columns in a row coherent for that row's state, not different unrelated designs.",
      "Preserve the same silhouette language and materials across all states so the tree clearly evolves from row to row.",
      "Tree frames should be rooted at the bottom center of each cell, with trunks growing upward from a stable ground contact point.",
      "Mature tree frames must read much larger than crop frames: use a full tree silhouette that will still look detailed and intentional when rendered about two terrain tiles tall.",
    ];
  }

  return [
    "For seed rows, column 1 is an isolated collectible seed item with no dirt below it. Columns 2 through the end are planted seed growth steps from left to right.",
    "For growing rows, columns are progressive growth frames from young sprout to nearly mature plant.",
    "For grown rows, columns 1-2 are normal mature harvest-ready variants only. Column 3 must be a dry mature plant. Column 4 must be a dead mature plant.",
    "For harvested rows, column 1 is the standard post-harvest remnant left in the ground. Column 2 is the harvested or cut plant state. Columns 3-4 must be high-quality harvested versions of the same plant.",
    "Dry, dead, harvested, and high-quality cells must remain the same plant species and silhouette family; communicate condition through posture, leaf fullness, color, and small natural details, not text or UI icons.",
    "Keep all columns in a row coherent for that row's state, not different unrelated designs.",
    "Preserve the same silhouette language and materials across all states so the plant clearly evolves from row to row.",
  ];
}

function buildPlantSpriteCells(args: {
  states: PlantSpriteState[];
  columnLabels: string[];
  columns: number;
  cellSize: number;
}) {
  return args.states.flatMap((state, row) =>
    args.columnLabels.map((columnLabel, column) => ({
      stateId: state.id,
      stateTitle: state.title,
      columnLabel,
      row,
      column,
      x: column * args.cellSize,
      y: row * args.cellSize,
      width: args.cellSize,
      height: args.cellSize,
    }))
  );
}

function createObjectSpriteLayoutGuide(args: {
  rows: number;
  columns: number;
}) {
  const guideCellSize = 256;
  const width = args.columns * guideCellSize;
  const height = args.rows * guideCellSize;
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / guideCellSize);

    for (let x = 0; x < width; x += 1) {
      const column = Math.floor(x / guideCellSize);
      const fill = (row + column) % 2 === 0 ? 255 : 216;
      const offset = (y * width + x) * 4;

      pixels[offset] = fill;
      pixels[offset + 1] = fill;
      pixels[offset + 2] = fill;
      pixels[offset + 3] = 255;
    }
  }

  const png = encodePngRgba(width, height, pixels);
  const blob = new Blob([png], { type: "image/png" });

  return {
    blob,
    dataUrl: `data:image/png;base64,${bytesToBase64(png)}`,
    width,
    height,
  };
}

async function dataUrlToBlob(dataUrl: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);

  if (!match) {
    throw new Error("OpenRouter returned an invalid image data URL.");
  }

  const contentType = match[1] ?? "application/octet-stream";
  const isBase64 = match[2] === ";base64";
  const data = match[3];
  const bytes = isBase64
    ? base64ToBytes(data)
    : textToBytes(decodeURIComponent(data));

  return new Blob([bytes], {
    type: contentType,
  });
}

async function removeObjectSpriteBackground(blob: Blob, fileName: string) {
  const apiKey = process.env.PHOTOROOM_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Missing PHOTOROOM_API_KEY in Convex environment. Plant Studio now follows the Pantheon sprite workflow and requires PhotoRoom background removal after generation. Set it with `npx convex env set PHOTOROOM_API_KEY <key>`."
    );
  }

  const form = new FormData();
  form.append("image_file", blob, fileName);
  form.append("format", "png");
  form.append("channels", "rgba");
  form.append("size", "full");

  const response = await fetch(photoroomSegmentEndpoint, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `PhotoRoom background removal failed (${response.status}): ${body}`
    );
  }

  return new Blob([await response.arrayBuffer()], {
    type: "image/png",
  });
}

function getDataUrlContentType(dataUrl: string) {
  const match = /^data:([^;,]+)/.exec(dataUrl);

  return match?.[1] ?? "application/octet-stream";
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function textToBytes(text: string) {
  return new TextEncoder().encode(text);
}

function encodePngRgba(width: number, height: number, rgba: Uint8Array) {
  const scanlineLength = width * 4 + 1;
  const raw = new Uint8Array(scanlineLength * height);

  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * scanlineLength;
    const rgbaOffset = y * width * 4;

    raw[rawOffset] = 0;
    raw.set(rgba.subarray(rgbaOffset, rgbaOffset + width * 4), rawOffset + 1);
  }

  const idat = zlibStore(raw);
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return concatBytes([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function zlibStore(data: Uint8Array) {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];

  for (let offset = 0; offset < data.length; offset += 65535) {
    const block = data.subarray(offset, Math.min(offset + 65535, data.length));
    const header = new Uint8Array(5);
    const finalBlock = offset + block.length >= data.length;

    header[0] = finalBlock ? 1 : 0;
    header[1] = block.length & 0xff;
    header[2] = (block.length >> 8) & 0xff;
    header[3] = ~block.length & 0xff;
    header[4] = (~block.length >> 8) & 0xff;
    blocks.push(header, block);
  }

  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, adler32(data));
  blocks.push(checksum);

  return concatBytes(blocks);
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatBytes([typeBytes, data])));

  return chunk;
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function adler32(bytes: Uint8Array) {
  let a = 1;
  let b = 0;

  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }

  return ((b << 16) | a) >>> 0;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function isRetryableImageError(error: unknown) {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  return (
    message.includes("terminated") ||
    message.includes("empty json response") ||
    message.includes("unexpected end of json") ||
    message.includes("invalid json") ||
    message.includes("bad gateway") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createGenerationRequestId(terrainId: string) {
  const suffix = Math.random().toString(36).slice(2, 8);

  return `${terrainId}-${Date.now().toString(36)}-${suffix}`;
}

function logTextureGeneration(
  requestId: string,
  event: string,
  metadata: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      scope: "studio.texture_generation",
      requestId,
      event,
      ...metadata,
    })
  );
}

function logPlantGeneration(
  requestId: string,
  event: string,
  metadata: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      scope: "studio.plant_generation",
      requestId,
      event,
      ...metadata,
    })
  );
}

function logObjectGeneration(
  requestId: string,
  event: string,
  metadata: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      scope: "studio.object_generation",
      requestId,
      event,
      ...metadata,
    })
  );
}

function logImageGeneration(
  scope: ImageGenerationScope,
  requestId: string,
  event: string,
  metadata: Record<string, unknown>
) {
  if (scope === "plant") {
    logPlantGeneration(requestId, event, metadata);
    return;
  }

  if (scope === "object") {
    logObjectGeneration(requestId, event, metadata);
    return;
  }

  logTextureGeneration(requestId, event, metadata);
}

function fingerprintSecret(secret: string) {
  if (secret.length <= 8) {
    return {
      length: secret.length,
      preview: "<too-short-to-preview>",
    };
  }

  return {
    length: secret.length,
    preview: `${secret.slice(0, 5)}...${secret.slice(-4)}`,
  };
}
