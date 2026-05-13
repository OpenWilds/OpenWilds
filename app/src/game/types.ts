import type { PlayerSpriteAssetId } from "../assets/visual-assets";

export type GridPoint = {
  x: number;
  y: number;
};

export type EnergyState = {
  current: number;
  max: number;
};

export type ActiveActionKind = "idle" | "move" | "sleep" | "farm" | "unknown";

export type ActiveActionState = {
  action: number;
  kind: ActiveActionKind;
  startedAt: number;
  endsAt: number;
};

export type PlayerActionState = {
  position: GridPoint;
  energy: EnergyState;
  activeAction: ActiveActionState;
};

export type InventorySlotState = {
  itemId: number;
  quantity: number;
};

export type InventoryState = {
  slots: InventorySlotState[];
};

export type EquippedTool = "hand" | "hoe" | "wateringCan";

export type GoldBalanceState = {
  amount: bigint;
};

export type TradeOfferStatus = "open" | "accepted" | "finalized";

export type TradeOfferState = {
  offer: string;
  acceptance?: string;
  direction: "incoming" | "outgoing";
  offerId: string;
  buyer: string;
  seller: string;
  buyerPlayerMint: string;
  sellerPlayerMint: string;
  buyerEntity: string;
  sellerEntity: string;
  itemId: number;
  itemQuantity: number;
  goldAmount: bigint;
  expiresAt: number;
  status: TradeOfferStatus;
};

export type FarmActionMode = "till" | "water" | "plant" | "harvest";
export type ResourceActionMode = "chop";
export type ItemActionMode = "grab" | "drop";
export type TileActionMode =
  | FarmActionMode
  | ResourceActionMode
  | ItemActionMode;
export type ActionMode = "move" | TileActionMode;
export type WorldTileActionMode = FarmActionMode | ResourceActionMode;

export type FarmTileState = GridPoint & {
  soilState: "untilled" | "tilled";
  farmTypeId: number;
  plantedAt: number;
  growthSeconds: number;
  growthUpdatedAt: number;
  wateredUntil: number;
  lastHarvestedAt: number;
  harvestCount: number;
};

export type ActionResult = {
  player: PlayerActionState;
  tile?: FarmTileState;
  item?: TileItemState | null;
};

export type TileItemState = GridPoint & {
  itemId: number;
  quantity: number;
};

export type PlayerAppearance = {
  color: string;
  fill: number;
  spriteAssetId: PlayerSpriteAssetId;
  stroke: number;
};

export type VisiblePlayerState = {
  mint: string;
  owner: string;
  entity: string;
  playerOwnerComponent: string;
  positionComponent: string;
  inventoryComponent: string;
  isActive: boolean;
  appearance: PlayerAppearance;
  state: PlayerActionState;
  inventory: InventoryState;
};

export type SelectedPlayerSummary = {
  mint: string;
  owner: string;
  color: string;
};

export type ActionTransitionState = {
  active: boolean;
  fromPosition: GridPoint;
  toPosition: GridPoint;
  fromEnergy: EnergyState;
  toEnergy: EnergyState;
  startedAt: number;
  endsAt: number;
};
