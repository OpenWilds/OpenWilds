import type { UI_ICONS } from "../../assets/ui-assets";
import type { FarmActionMode } from "../types";

export type TradeCallbacks = {
  createOffer: (args: {
    sellerMint: string;
    itemId: number;
    itemQuantity: number;
    goldAmount: number;
  }) => Promise<void>;
  acceptOffer: (offer: string) => Promise<void>;
  cancelOffer: (offer: string) => Promise<void>;
  finalizeOffer: (offer: string) => Promise<void>;
};

export type PantheonHudOptions = {
  onModeChange: (mode: FarmActionMode) => void;
  onItemSelect: (itemId: number | null) => void;
  onQuantityChange: (quantity: number) => void;
  trade: TradeCallbacks;
};

export type ToolDefinition = {
  mode: FarmActionMode;
  label: string;
  icon: keyof typeof UI_ICONS;
  shortcut: string;
};

export const tools: ToolDefinition[] = [
  { mode: "move", label: "Move", icon: "hands", shortcut: "1" },
  { mode: "till", label: "Hoe", icon: "dig", shortcut: "2" },
  { mode: "water", label: "Water", icon: "wateringCan", shortcut: "3" },
  { mode: "plant", label: "Plant", icon: "plant", shortcut: "4" },
  { mode: "harvest", label: "Harvest", icon: "harvest", shortcut: "5" },
  { mode: "chop", label: "Axe", icon: "axe", shortcut: "6" },
  { mode: "grab", label: "Grab", icon: "grab", shortcut: "7" },
  { mode: "drop", label: "Drop", icon: "drop", shortcut: "8" },
];
