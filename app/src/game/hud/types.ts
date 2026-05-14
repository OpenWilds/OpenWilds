import type { UI_ICONS } from "../../assets/ui-assets";
import type { ContextAction, EquippedTool } from "../types";

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
  onToolChange: (tool: EquippedTool) => void;
  onContextActionChange: (action: ContextAction | null) => void;
  onItemSelect: (itemId: number | null) => void;
  onQuantityChange: (quantity: number) => void;
  onSleep: () => void;
  trade: TradeCallbacks;
};

export type ToolDefinition = {
  tool: EquippedTool;
  label: string;
  icon: keyof typeof UI_ICONS;
  shortcut: string;
};

export type ContextActionDefinition = {
  action: ContextAction;
  label: string;
  icon: keyof typeof UI_ICONS;
};

export const tools: ToolDefinition[] = [
  { tool: "hand", label: "Hand", icon: "hands", shortcut: "1" },
  { tool: "hoe", label: "Hoe", icon: "axe", shortcut: "2" },
  { tool: "wateringCan", label: "Water", icon: "wateringCan", shortcut: "3" },
];

export const contextActions: Record<ContextAction, ContextActionDefinition> = {
  grab: { action: "grab", label: "Grab", icon: "grab" },
  plant: { action: "plant", label: "Plant", icon: "plant" },
  drop: { action: "drop", label: "Drop", icon: "drop" },
  harvest: { action: "harvest", label: "Harvest", icon: "harvest" },
  till: { action: "till", label: "Dig", icon: "dig" },
  chop: { action: "chop", label: "Chop", icon: "axe" },
  water: { action: "water", label: "Water", icon: "wateringCan" },
};
