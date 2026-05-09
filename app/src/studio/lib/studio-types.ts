export type TextureStatus = "draft" | "approved" | "archived";
export type TerrainStatus = "draft" | "library" | "archived";

export type TerrainPromptMetadata = {
  terrainId: string;
  label: string;
  material: string;
  texturePrompt: string;
  stylePrompt: string;
};

export type StudioTerrainTextureRecord = TerrainPromptMetadata & {
  _id: string;
  url: string | null;
  contentType: string;
  size: number;
  status: TextureStatus;
  createdAt: number;
  updatedAt: number;
};

export type StudioTerrainAssetRecord = TerrainPromptMetadata & {
  _id: string;
  atlasUrl: string | null;
  centerVariantsUrl: string | null;
  status: TerrainStatus;
  tags: string[];
  walkable: boolean;
  plantable: boolean;
  generatedAt: number;
};

export type StudioRouteId = "dashboard" | "textures" | "map" | "assets";

export type StudioRoute = {
  icon: string;
  id: StudioRouteId;
  kicker: string;
  title: string;
};
