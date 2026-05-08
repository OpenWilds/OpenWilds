import { FarmItemId } from "./farm";
import { ItemId } from "./terrain";
import type { GridPoint } from "./types";

export type WorldItemDefinition = GridPoint & {
  itemId: number;
  quantity: number;
};

export const WORLD_ITEM_DROPS: WorldItemDefinition[] = [
  { x: 9, y: 10, itemId: FarmItemId.turnipSeed, quantity: 3 },
  { x: 10, y: 9, itemId: FarmItemId.wheatSeed, quantity: 2 },
  { x: 12, y: 10, itemId: FarmItemId.berrySeed, quantity: 2 },
  { x: 13, y: 11, itemId: FarmItemId.acorn, quantity: 1 },
  { x: 8, y: 8, itemId: FarmItemId.appleSapling, quantity: 1 },
  { x: 5, y: 5, itemId: ItemId.berry, quantity: 4 },
  { x: 6, y: 7, itemId: ItemId.grassFiber, quantity: 5 },
  { x: 16, y: 4, itemId: ItemId.stone, quantity: 3 },
  { x: 1, y: 8, itemId: ItemId.reed, quantity: 2 },
];

export const getWorldItemKey = ({ x, y }: GridPoint) => `${x},${y}`;

export const getItemColor = (itemId: number) => {
  switch (itemId) {
    case FarmItemId.turnipSeed:
    case FarmItemId.wheatSeed:
    case FarmItemId.berrySeed:
    case FarmItemId.acorn:
      return 0xc58f38;
    case FarmItemId.appleSapling:
      return 0x5f9b54;
    case ItemId.berry:
      return 0xba6ee8;
    case ItemId.grassFiber:
      return 0x75a843;
    case ItemId.stone:
      return 0x7c8794;
    case ItemId.reed:
      return 0x4f9c7d;
    default:
      return 0xf0c15b;
  }
};
