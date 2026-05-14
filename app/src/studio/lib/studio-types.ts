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
  workspaceId?: string;
  url: string | null;
  contentType: string;
  size: number;
  status: TextureStatus;
  createdAt: number;
  updatedAt: number;
};

export type StudioTerrainAssetRecord = TerrainPromptMetadata & {
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

export type StudioMapRecord = {
  _id: string;
  workspaceId?: string;
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
  workspaceId?: string;
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
  workspaceId?: string;
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

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type StudioWorkspaceSummary = {
  _id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

export type StudioWorkspaceMember = {
  _id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: number;
  updatedAt: number;
  user: {
    _id: string;
    email: string | null;
    name: string | null;
  };
};

export type StudioWorkspaceInvite = {
  _id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  invitedBy: string;
  acceptedBy?: string;
  acceptedAt?: number;
  declinedAt?: number;
  revokedAt?: number;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
};

export type StudioPendingWorkspaceInvite = StudioWorkspaceInvite & {
  workspace: StudioWorkspaceSummary | null;
};
