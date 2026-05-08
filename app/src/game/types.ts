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

export type FarmActionMode =
  | "move"
  | "till"
  | "water"
  | "plant"
  | "harvest"
  | "chop"
  | "grab"
  | "drop";

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

export type FarmActionResult = {
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
  stroke: number;
};

export type VisiblePlayerState = {
  mint: string;
  isActive: boolean;
  appearance: PlayerAppearance;
  state: PlayerActionState;
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

export type GameClient = {
  movePlayer: (point: GridPoint) => Promise<PlayerActionState | null>;
  performFarmAction?: (
    mode: FarmActionMode,
    point: GridPoint,
    selectedItemId?: number | null,
    selectedQuantity?: number | null
  ) => Promise<FarmActionResult | null>;
  subscribePlayerActionState?: (
    listener: (state: PlayerActionState) => void
  ) => () => void;
  subscribePlayerAppearance?: (
    listener: (appearance: PlayerAppearance) => void
  ) => () => void;
  subscribeVisiblePlayers?: (
    listener: (players: VisiblePlayerState[]) => void
  ) => () => void;
  subscribeInventory?: (
    listener: (inventory: InventoryState) => void
  ) => () => void;
  subscribeFarmTiles?: (
    listener: (tiles: FarmTileState[]) => void
  ) => () => void;
  subscribeTileItems?: (
    listener: (items: TileItemState[]) => void
  ) => () => void;
};
