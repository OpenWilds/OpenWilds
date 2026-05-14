import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";

import type { TerrainVisualAsset } from "../../assets/visual-assets";
import type {
  ObjectSpriteKind,
  ObjectSpriteStatus,
  PlantSpriteKind,
  PlantSpriteStatus,
  StudioObjectSpriteRecord,
  StudioPlantSpriteCell,
  StudioPlantSpriteRecord,
} from "../lib/studio-types";
import type { StudioMapExport } from "../phaser/studio-scene";

type TerrainStatus = "draft" | "library" | "archived";
type TextureStatus = "draft" | "approved" | "archived";
type StudioMutationClient = {
  mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    args: Mutation["_args"]
  ): Promise<Mutation["_returnType"]>;
  action<Action extends FunctionReference<"action">>(
    action: Action,
    args: Action["_args"]
  ): Promise<Action["_returnType"]>;
  query<Query extends FunctionReference<"query">>(
    query: Query,
    args: Query["_args"]
  ): Promise<Query["_returnType"]>;
};

type TerrainPromptMetadata = {
  terrainId: string;
  label: string;
  material: string;
  texturePrompt: string;
  stylePrompt: string;
};

type WorkspaceArg = {
  workspaceId: string;
};
type OptionalWorkspaceArg = {
  workspaceId?: string;
};

type StudioTerrainAssetRecord = TerrainPromptMetadata & {
  _id: string;
  workspaceId?: string;
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
  workspaceId?: string;
  url: string | null;
  contentType: string;
  size: number;
  status: TextureStatus;
  createdAt: number;
  updatedAt: number;
};

export type StudioSourceTexture = TerrainPromptMetadata & {
  textureId: string;
  workspaceId?: string;
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

export type GeneratedTerrainAsset = TerrainPromptMetadata & {
  terrainAssetId: string;
  workspaceId?: string;
  sourceTextureId: string;
  atlasStorageId: string;
  centerVariantsStorageId: string;
  atlasUrl: string | null;
  centerVariantsUrl: string | null;
  status: TerrainStatus;
  tags: string[];
  walkable: boolean;
  plantable: boolean;
  generatedAt: number;
};

export type PlantSpritePromptMetadata = {
  plantId: string;
  label: string;
  kind: PlantSpriteKind;
  region: string;
  habitat: string;
  objectPrompt: string;
  stylePrompt: string;
  cellSize?: number;
};

export type GeneratedPlantSprite = {
  spriteId: string;
  workspaceId?: string;
  plantId: string;
  label: string;
  kind: PlantSpriteKind;
  spriteStorageId: string;
  url: string | null;
  contentType: string;
  size: number;
  status: PlantSpriteStatus;
  region: string;
  habitat: string;
  objectPrompt: string;
  stylePrompt: string;
  generatedPrompt: string;
  model: string;
  rows: number;
  columns: number;
  cellSize: number;
  atlasWidth: number;
  atlasHeight: number;
  cells: StudioPlantSpriteCell[];
  updatedAt: number;
};

export type ObjectSpritePromptMetadata = {
  objectId: string;
  label: string;
  kind: ObjectSpriteKind;
  region: string;
  habitat: string;
  objectPrompt: string;
  stylePrompt: string;
};

export type GeneratedObjectSprite = {
  spriteId: string;
  workspaceId?: string;
  objectId: string;
  label: string;
  kind: ObjectSpriteKind;
  spriteStorageId: string;
  url: string | null;
  contentType: string;
  size: number;
  status: ObjectSpriteStatus;
  region: string;
  habitat: string;
  objectPrompt: string;
  stylePrompt: string;
  generatedPrompt: string;
  model: string;
  updatedAt: number;
};

type UploadResult = {
  storageId: string;
};

declare const __OPEN_WILDS_CONVEX_URL__: string;

const convexUrl = __OPEN_WILDS_CONVEX_URL__;
let studioClient: StudioMutationClient | null = null;

const refs = {
  generateUploadUrl: makeFunctionReference<"mutation", WorkspaceArg, string>(
    "studio:generateUploadUrl"
  ),
  registerSourceTexture: makeFunctionReference<
    "mutation",
    TerrainPromptMetadata &
      WorkspaceArg & {
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
    TerrainPromptMetadata &
      WorkspaceArg & {
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
    WorkspaceArg & { status?: TerrainStatus },
    StudioTerrainAssetRecord[]
  >("studio:listTerrainAssets"),
  listTerrainTextures: makeFunctionReference<
    "query",
    WorkspaceArg & { status?: TextureStatus },
    StudioTerrainTextureRecord[]
  >("studio:listTerrainTextures"),
  listPlantSprites: makeFunctionReference<
    "query",
    WorkspaceArg & { status?: PlantSpriteStatus },
    StudioPlantSpriteRecord[]
  >("studio:listPlantSprites"),
  listObjectSprites: makeFunctionReference<
    "query",
    WorkspaceArg & { status?: ObjectSpriteStatus },
    StudioObjectSpriteRecord[]
  >("studio:listObjectSprites"),
  saveMap: makeFunctionReference<
    "mutation",
    WorkspaceArg & {
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
    TerrainPromptMetadata &
      WorkspaceArg & {
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
  buildTerrainAsset: makeFunctionReference<
    "action",
    TerrainPromptMetadata &
      WorkspaceArg & {
        sourceTextureId: string;
        status?: TerrainStatus;
        tags?: string[];
        walkable?: boolean;
        plantable?: boolean;
      },
    GeneratedTerrainAsset
  >("studioTerrainBuild:buildTerrainAsset"),
  generatePlantSprite: makeFunctionReference<
    "action",
    PlantSpritePromptMetadata &
      WorkspaceArg & {
        imageModel?: string;
        reasoningEffort?:
          | "none"
          | "minimal"
          | "low"
          | "medium"
          | "high"
          | "xhigh";
      },
    GeneratedPlantSprite
  >("studio:generatePlantSprite"),
  generateObjectSprite: makeFunctionReference<
    "action",
    ObjectSpritePromptMetadata &
      WorkspaceArg & {
        imageModel?: string;
        reasoningEffort?:
          | "none"
          | "minimal"
          | "low"
          | "medium"
          | "high"
          | "xhigh";
      },
    GeneratedObjectSprite
  >("studio:generateObjectSprite"),
};

export const isConvexStudioConfigured = () => Boolean(convexUrl);

export function setStudioConvexClient(client: StudioMutationClient | null) {
  studioClient = client;
}

export async function uploadStudioFile(
  workspaceId: string | undefined,
  file: Blob
): Promise<UploadResult> {
  const convex = getClient();
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const uploadUrl = await convex.mutation(refs.generateUploadUrl, {
    workspaceId: resolvedWorkspaceId,
  });
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
  } & OptionalWorkspaceArg
) {
  const convex = getClient();
  const workspaceId = requireWorkspaceId(args.workspaceId);
  const upload = await uploadStudioFile(workspaceId, args.file);

  return await convex.mutation(refs.registerSourceTexture, {
    workspaceId,
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
  args: TerrainPromptMetadata & OptionalWorkspaceArg
): Promise<GeneratedSourceTexture> {
  const convex = getClient();
  const workspaceId = requireWorkspaceId(args.workspaceId);
  const result = await convex.action(refs.generateSourceTexture, {
    ...args,
    workspaceId,
  });

  return {
    ...result,
    ...args,
    workspaceId,
    updatedAt: Date.now(),
  };
}

export async function buildTerrainAssetFromSourceTexture(
  args: TerrainPromptMetadata & {
    sourceTextureId: string;
  } & OptionalWorkspaceArg
): Promise<GeneratedTerrainAsset> {
  const convex = getClient();
  const workspaceId = requireWorkspaceId(args.workspaceId);
  const result = await convex.action(refs.buildTerrainAsset, {
    ...args,
    workspaceId,
    status: "library",
    tags: [],
    walkable: true,
    plantable: true,
  });

  return {
    ...result,
    ...args,
    workspaceId,
  };
}

export async function generatePlantSprite(
  args: PlantSpritePromptMetadata & OptionalWorkspaceArg
): Promise<GeneratedPlantSprite> {
  const convex = getClient();
  const workspaceId = requireWorkspaceId(args.workspaceId);
  const result = await convex.action(refs.generatePlantSprite, {
    ...args,
    workspaceId,
  });

  return {
    ...result,
    ...args,
    workspaceId,
    updatedAt: Date.now(),
  };
}

export async function generateObjectSprite(
  args: ObjectSpritePromptMetadata & OptionalWorkspaceArg
): Promise<GeneratedObjectSprite> {
  const convex = getClient();
  const workspaceId = requireWorkspaceId(args.workspaceId);
  const result = await convex.action(refs.generateObjectSprite, {
    ...args,
    workspaceId,
  });

  return {
    ...result,
    ...args,
    workspaceId,
    updatedAt: Date.now(),
  };
}

export async function registerGeneratedTerrainAsset(
  args: TerrainPromptMetadata & {
    sourceTextureId?: string;
    atlasBlob: Blob;
    centerVariantsBlob: Blob;
  } & OptionalWorkspaceArg
) {
  const convex = getClient();
  const workspaceId = requireWorkspaceId(args.workspaceId);
  const [atlas, centerVariants] = await Promise.all([
    uploadStudioFile(workspaceId, args.atlasBlob),
    uploadStudioFile(workspaceId, args.centerVariantsBlob),
  ]);

  return await convex.mutation(refs.registerTerrainAsset, {
    workspaceId,
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

export async function listStudioTerrainAssets(
  workspaceId?: string
): Promise<TerrainVisualAsset[]> {
  const convex = getClient();
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const records = await convex.query(refs.listTerrainAssets, {
    workspaceId: resolvedWorkspaceId,
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

export async function listStudioSourceTextures(
  workspaceId?: string
): Promise<StudioSourceTexture[]> {
  const convex = getClient();
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const records = await convex.query(refs.listTerrainTextures, {
    workspaceId: resolvedWorkspaceId,
  });

  return records.flatMap((record) => {
    if (!record.url || record.status === "archived") {
      return [];
    }

    return [
      {
        textureId: record._id,
        workspaceId: record.workspaceId,
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

export async function listStudioPlantSprites(
  workspaceId?: string
): Promise<StudioPlantSpriteRecord[]> {
  const convex = getClient();
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const records = await convex.query(refs.listPlantSprites, {
    workspaceId: resolvedWorkspaceId,
    status: "library",
  });

  return records.filter((record) => record.url && record.status !== "archived");
}

export async function listStudioObjectSprites(
  workspaceId?: string
): Promise<StudioObjectSpriteRecord[]> {
  const convex = getClient();
  const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
  const records = await convex.query(refs.listObjectSprites, {
    workspaceId: resolvedWorkspaceId,
    status: "library",
  });

  return records.filter((record) => record.url && record.status !== "archived");
}

export async function saveStudioMapToConvex(
  workspaceIdOrName: string,
  nameOrMap: string | StudioMapExport,
  mapOrMapId?: StudioMapExport | string | null,
  maybeMapId?: string | null
) {
  const convex = getClient();
  const workspaceId =
    typeof nameOrMap === "string"
      ? requireWorkspaceId(workspaceIdOrName)
      : requireWorkspaceId(undefined);
  const name = typeof nameOrMap === "string" ? nameOrMap : workspaceIdOrName;
  const map = typeof nameOrMap === "string" ? mapOrMapId : nameOrMap;
  const mapId =
    typeof nameOrMap === "string"
      ? maybeMapId
      : (mapOrMapId as string | null | undefined);

  if (!map || typeof map === "string") {
    throw new Error("World map is required.");
  }

  return await convex.mutation(refs.saveMap, {
    workspaceId,
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
  if (!studioClient) {
    throw new Error("Sign in to use Studio storage.");
  }

  return studioClient;
}

function requireWorkspaceId(workspaceId: string | undefined) {
  const resolved =
    workspaceId ??
    window.localStorage.getItem("open-wilds:studio:selected-workspace");

  if (!resolved) {
    throw new Error("Select a workspace first.");
  }

  return resolved;
}
