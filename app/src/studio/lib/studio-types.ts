export type TextureStatus = "draft" | "approved" | "archived";
export type TerrainStatus = "draft" | "library" | "archived";
export type PlantSpriteKind = "plant" | "tree";
export type PlantSpriteStatus = "draft" | "library" | "archived";
export type ObjectSpriteKind = "building" | "object";
export type ObjectSpriteStatus = "draft" | "library" | "archived";

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

export type StudioMapRecord = {
  _id: string;
  name: string;
  width: number;
  height: number;
  mapJson: string;
  createdAt: number;
  updatedAt: number;
};

export type StudioPlantSpriteCell = {
  stateId: string;
  stateTitle: string;
  columnLabel: string;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StudioPlantSpriteRecord = {
  _id: string;
  plantId: string;
  label: string;
  kind: PlantSpriteKind;
  url: string | null;
  layoutGuideUrl: string | null;
  fileName: string;
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
  generatedAt: number;
  createdAt: number;
  updatedAt: number;
};

export type StudioObjectSpriteRecord = {
  _id: string;
  objectId: string;
  label: string;
  kind: ObjectSpriteKind;
  url: string | null;
  fileName: string;
  contentType: string;
  size: number;
  status: ObjectSpriteStatus;
  region: string;
  habitat: string;
  objectPrompt: string;
  stylePrompt: string;
  generatedPrompt: string;
  model: string;
  generatedAt: number;
  createdAt: number;
  updatedAt: number;
};

export type StudioRouteId =
  | "dashboard"
  | "textures"
  | "plants"
  | "objects"
  | "map"
  | "assets";

export type StudioRoute = {
  icon: string;
  id: StudioRouteId;
  kicker: string;
  title: string;
};
