import { v } from "convex/values";

import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

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

const plantSpriteStatus = v.union(
  v.literal("draft"),
  v.literal("library"),
  v.literal("archived")
);

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

    const content = await requestOpenRouterImage({
      id: `${args.plantId}-sprite-sheet`,
      title: `${args.label} sprite sheet`,
      prompt,
      imageModel,
      reasoningEffort,
      requestId,
      logScope: "plant",
    });
    logPlantGeneration(requestId, "image_received", {
      contentType: content.contentType,
      dataUrlLength: content.dataUrl.length,
    });

    const blob = await dataUrlToBlob(content.dataUrl);
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
        fileName: `${args.plantId}-sprite-sheet.png`,
        contentType: content.contentType,
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
      contentType: content.contentType,
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

export const listTerrainAssets = query({
  args: {
    status: v.optional(terrainStatus),
  },
  handler: async (ctx, args) => {
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

async function requestOpenRouterImage(args: {
  id: string;
  title: string;
  prompt: string;
  imageModel: string;
  reasoningEffort?: string;
  requestId: string;
  logScope: "texture" | "plant";
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
                content: args.prompt,
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
    logScope: "texture" | "plant";
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
      title: "Grown And Stressed",
      prompt:
        "columns 1-2 are stable mature harvest-ready variants of the same plant; column 3 is the same plant stressed from poor moisture, weak fertility, or bad terrain; column 4 is the same plant wilted from severe neglect",
    },
    {
      id: "harvested",
      title: "Harvested And Flourishing",
      prompt:
        "column 1 is one post-harvest plant remnant left in the ground; column 2 is one isolated harvested crop/resource pickup; column 3 is a flourishing ideal-care version; column 4 is a recently tended version that looks freshly watered or cared for without using UI icons",
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
    "Use an exact checkerboard-style sprite-sheet composition.",
    `Preserve a ${args.columns}:${args.rows} sheet ratio and exactly ${args.columns} columns by ${args.rows} rows of equal square cells.`,
    "Place exactly one frame in the center of each cell.",
    "Align the center of each object frame to the center of its cell.",
    "Keep every frame fully inside its own cell, with consistent margins and no overlap into neighboring cells.",
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
    "For grown rows, columns 1-2 are normal mature harvest-ready variants only. Column 3 must be a stressed care state. Column 4 must be a wilted severe-neglect state.",
    "For harvested rows, column 1 is the single post-harvest remnant left in the ground. Column 2 is the single isolated crop/resource pickup. Column 3 must be a flourishing ideal-care state. Column 4 must be a recently tended or freshly cared-for state.",
    "Care-state cells must remain the same plant species and silhouette family; communicate condition through posture, leaf fullness, color, dew, and small natural details, not text or UI icons.",
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

function logImageGeneration(
  scope: "texture" | "plant",
  requestId: string,
  event: string,
  metadata: Record<string, unknown>
) {
  if (scope === "plant") {
    logPlantGeneration(requestId, event, metadata);
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
