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

    const textureId: string = await ctx.runMutation(api.studio.registerSourceTexture, {
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
    });
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
            .withIndex("by_status_and_updatedAt", (q) =>
              q.eq("status", status)
            )
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
            .withIndex("by_status_and_updatedAt", (q) =>
              q.eq("status", status)
            )
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
    name: v.string(),
    width: v.number(),
    height: v.number(),
    mapJson: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("studioMaps", {
      name: args.name,
      width: args.width,
      height: args.height,
      mapJson: args.mapJson,
      createdAt: now,
      updatedAt: now,
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
}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    logTextureGeneration(args.requestId, "missing_api_key", {});
    throw new Error(
      "Missing OPENROUTER_API_KEY in Convex environment. Set it with `npx convex env set OPENROUTER_API_KEY <key>`."
    );
  }

  logTextureGeneration(args.requestId, "api_key_loaded", {
    apiKeyFingerprint: fingerprintSecret(apiKey),
    apiKeyLooksLikeOpenRouterKey: apiKey.startsWith("sk-or-"),
  });

  if (!apiKey.startsWith("sk-or-")) {
    logTextureGeneration(args.requestId, "invalid_api_key_shape", {
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
      logTextureGeneration(args.requestId, "openrouter_request", {
        attempt,
        model: args.imageModel,
        reasoningEffort: args.reasoningEffort ?? null,
      });

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost",
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
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logTextureGeneration(args.requestId, "openrouter_error_response", {
          attempt,
          status: response.status,
          durationMs: Date.now() - attemptStartedAt,
          bodyPreview: errorBody.slice(0, 500),
        });
        throw new Error(
          `OpenRouter image request failed (${response.status}): ${errorBody}`
        );
      }

      const result = (await response.json()) as OpenRouterImageResponse;
      const image = result.choices?.[0]?.message?.images?.[0];
      const dataUrl = image?.image_url?.url ?? image?.imageUrl?.url;

      if (!dataUrl) {
        logTextureGeneration(args.requestId, "openrouter_missing_image", {
          attempt,
          durationMs: Date.now() - attemptStartedAt,
        });
        throw new Error(`OpenRouter image model returned no image for "${args.title}".`);
      }

      logTextureGeneration(args.requestId, "openrouter_success", {
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
        logTextureGeneration(args.requestId, "failed", {
          attempt,
          retryable: isRetryableImageError(error),
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      logTextureGeneration(args.requestId, "retrying", {
        attempt,
        message: error instanceof Error ? error.message : String(error),
        delayMs: 1500 * attempt,
      });
      await delay(1500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  return (
    message.includes("terminated") ||
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
