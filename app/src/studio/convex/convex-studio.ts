import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import type { TerrainVisualAsset } from "../../assets/visual-assets";
import type { StudioMapExport } from "../phaser/studio-scene";

type TerrainStatus = "draft" | "library" | "archived";
type TextureStatus = "draft" | "approved" | "archived";

type TerrainPromptMetadata = {
  terrainId: string;
  label: string;
  material: string;
  texturePrompt: string;
  stylePrompt: string;
};

type StudioTerrainAssetRecord = TerrainPromptMetadata & {
  _id: string;
  atlasUrl: string | null;
  centerVariantsUrl: string | null;
  status: TerrainStatus;
  tags: string[];
  walkable: boolean;
  plantable: boolean;
  generatedAt: number;
};

type StudioTerrainTextureRecord = TerrainPromptMetadata & {
  _id: string;
  url: string | null;
  contentType: string;
  size: number;
  status: TextureStatus;
  createdAt: number;
  updatedAt: number;
};

export type StudioSourceTexture = TerrainPromptMetadata & {
  textureId: string;
  url: string | null;
  contentType: string;
  size: number;
  status: TextureStatus;
  updatedAt: number;
};

export type GeneratedSourceTexture = StudioSourceTexture & {
  storageId: string;
  prompt: string;
  model: string;
};

type UploadResult = {
  storageId: string;
};

declare const __OPEN_WILDS_CONVEX_URL__: string;

const convexUrl = __OPEN_WILDS_CONVEX_URL__;

const client = convexUrl
  ? new ConvexHttpClient(convexUrl, {
      logger: false,
    })
  : null;

const refs = {
  generateUploadUrl: makeFunctionReference<"mutation", {}, string>(
    "studio:generateUploadUrl"
  ),
  registerSourceTexture: makeFunctionReference<
    "mutation",
    TerrainPromptMetadata & {
      storageId: string;
      fileName: string;
      contentType: string;
      size: number;
      status?: TextureStatus;
    },
    string
  >("studio:registerSourceTexture"),
  registerTerrainAsset: makeFunctionReference<
    "mutation",
    TerrainPromptMetadata & {
      sourceTextureId?: string;
      atlasStorageId: string;
      centerVariantsStorageId: string;
      status?: TerrainStatus;
      tags?: string[];
      walkable?: boolean;
      plantable?: boolean;
    },
    string
  >("studio:registerTerrainAsset"),
  listTerrainAssets: makeFunctionReference<
    "query",
    { status?: TerrainStatus },
    StudioTerrainAssetRecord[]
  >("studio:listTerrainAssets"),
  listTerrainTextures: makeFunctionReference<
    "query",
    { status?: TextureStatus },
    StudioTerrainTextureRecord[]
  >("studio:listTerrainTextures"),
  saveMap: makeFunctionReference<
    "mutation",
    {
      mapId?: string;
      name: string;
      width: number;
      height: number;
      mapJson: string;
    },
    string
  >("studio:saveMap"),
  generateSourceTexture: makeFunctionReference<
    "action",
    TerrainPromptMetadata & {
      imageModel?: string;
      reasoningEffort?:
        | "none"
        | "minimal"
        | "low"
        | "medium"
        | "high"
        | "xhigh";
    },
    GeneratedSourceTexture
  >("studio:generateSourceTexture"),
};

export const isConvexStudioConfigured = () => client !== null;

export async function uploadStudioFile(file: Blob): Promise<UploadResult> {
  const convex = getClient();
  const uploadUrl = await convex.mutation(refs.generateUploadUrl, {});
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Convex upload failed: ${response.status}`);
  }

  return (await response.json()) as UploadResult;
}

export async function registerSourceTexture(
  args: TerrainPromptMetadata & {
    file: File;
  }
) {
  const convex = getClient();
  const upload = await uploadStudioFile(args.file);

  return await convex.mutation(refs.registerSourceTexture, {
    terrainId: args.terrainId,
    label: args.label,
    storageId: upload.storageId,
    fileName: args.file.name,
    contentType: args.file.type || "image/png",
    size: args.file.size,
    material: args.material,
    texturePrompt: args.texturePrompt,
    stylePrompt: args.stylePrompt,
    status: "approved",
  });
}

export async function generateSourceTexture(
  args: TerrainPromptMetadata
): Promise<GeneratedSourceTexture> {
  const convex = getClient();
  const result = await convex.action(refs.generateSourceTexture, args);

  return {
    ...result,
    ...args,
    updatedAt: Date.now(),
  };
}

export async function registerGeneratedTerrainAsset(
  args: TerrainPromptMetadata & {
    sourceTextureId?: string;
    atlasBlob: Blob;
    centerVariantsBlob: Blob;
  }
) {
  const convex = getClient();
  const [atlas, centerVariants] = await Promise.all([
    uploadStudioFile(args.atlasBlob),
    uploadStudioFile(args.centerVariantsBlob),
  ]);

  return await convex.mutation(refs.registerTerrainAsset, {
    terrainId: args.terrainId,
    label: args.label,
    sourceTextureId: args.sourceTextureId,
    atlasStorageId: atlas.storageId,
    centerVariantsStorageId: centerVariants.storageId,
    material: args.material,
    texturePrompt: args.texturePrompt,
    stylePrompt: args.stylePrompt,
    status: "library",
    tags: [],
    walkable: true,
    plantable: true,
  });
}

export async function listStudioTerrainAssets(): Promise<TerrainVisualAsset[]> {
  const convex = getClient();
  const records = await convex.query(refs.listTerrainAssets, {
    status: "library",
  });

  return records.flatMap((record) => {
    if (!record.atlasUrl || !record.centerVariantsUrl) {
      return [];
    }

    return [
      {
        id: record.terrainId,
        label: record.label,
        atlasUrl: record.atlasUrl,
        centerVariantsUrl: record.centerVariantsUrl,
        generated: true,
      },
    ];
  });
}

export async function listStudioSourceTextures(): Promise<
  StudioSourceTexture[]
> {
  const convex = getClient();
  const records = await convex.query(refs.listTerrainTextures, {});

  return records.flatMap((record) => {
    if (!record.url || record.status === "archived") {
      return [];
    }

    return [
      {
        textureId: record._id,
        terrainId: record.terrainId,
        label: record.label,
        material: record.material,
        texturePrompt: record.texturePrompt,
        stylePrompt: record.stylePrompt,
        url: record.url,
        contentType: record.contentType,
        size: record.size,
        status: record.status,
        updatedAt: record.updatedAt,
      },
    ];
  });
}

export async function saveStudioMapToConvex(
  name: string,
  map: StudioMapExport,
  mapId?: string | null
) {
  const convex = getClient();

  return await convex.mutation(refs.saveMap, {
    mapId: mapId ?? undefined,
    name,
    width: map.width,
    height: map.height,
    mapJson: JSON.stringify(map),
  });
}

export async function dataUrlToPngBlob(dataUrl: string) {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error("Could not convert generated image to uploadable blob.");
  }

  return await response.blob();
}

function getClient() {
  if (!client) {
    throw new Error("Set VITE_CONVEX_URL in .env.local to use Studio storage.");
  }

  return client;
}
