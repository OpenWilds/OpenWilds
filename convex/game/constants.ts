export const GRID_SIZE = 20;
export const DEFAULT_MAX_ENERGY = 10;
export const STARTER_GOLD = 50n;
export const WALK_ENERGY_PER_TILE = 1;
export const WALK_SECONDS_PER_TILE = 0.35;
export const ACTION_SECONDS = {
  sleep: 0.75,
  farm: 0.45,
} as const;

export const ActionId = {
  idle: 0,
  move: 1,
  sleep: 2,
  till: 3,
  water: 4,
  plant: 5,
  harvest: 6,
  chop: 7,
  grab: 8,
  drop: 9,
} as const;

export const GAME_SECONDS_PER_DAY = 24 * 60 * 60;
export const REAL_SECONDS_PER_GAME_DAY = 5 * 60;
export const WORLD_EPOCH_UNIX_SECONDS = 1_735_689_600;

const HOUR = 60 * 60;
const DAY = GAME_SECONDS_PER_DAY;

export const ItemId = {
  none: 0,
  grassFiber: 1,
  berry: 2,
  stone: 3,
  reed: 4,
  turnipSeed: 100,
  turnip: 101,
  wheatSeed: 102,
  wheat: 103,
  berrySeed: 104,
  appleSapling: 120,
  apple: 121,
  acorn: 122,
  oakLog: 123,
  wood: 124,
} as const;

export const FarmKind = {
  crop: 1,
  tree: 2,
} as const;

export const FarmFeature = {
  requiresTilledSoil: 1 << 0,
  needsWater: 1 << 1,
} as const;

export type FarmTypeDefinition = {
  farmTypeId: number;
  kind: (typeof FarmKind)[keyof typeof FarmKind];
  seedItemId: number;
  harvestItemId: number;
  requiredGrowthSeconds: number;
  regrowSeconds: number;
  baseYield: number;
  chopItemId: number;
  chopYield: number;
  flags: number;
};

export const FARM_TYPES: FarmTypeDefinition[] = [
  {
    farmTypeId: 1,
    kind: FarmKind.crop,
    seedItemId: ItemId.turnipSeed,
    harvestItemId: ItemId.turnip,
    requiredGrowthSeconds: 2 * DAY,
    regrowSeconds: 0,
    baseYield: 1,
    chopItemId: ItemId.none,
    chopYield: 0,
    flags: FarmFeature.requiresTilledSoil | FarmFeature.needsWater,
  },
  {
    farmTypeId: 2,
    kind: FarmKind.crop,
    seedItemId: ItemId.wheatSeed,
    harvestItemId: ItemId.wheat,
    requiredGrowthSeconds: 3 * DAY,
    regrowSeconds: 0,
    baseYield: 2,
    chopItemId: ItemId.none,
    chopYield: 0,
    flags: FarmFeature.requiresTilledSoil | FarmFeature.needsWater,
  },
  {
    farmTypeId: 3,
    kind: FarmKind.crop,
    seedItemId: ItemId.berrySeed,
    harvestItemId: ItemId.berry,
    requiredGrowthSeconds: 4 * DAY,
    regrowSeconds: 2 * DAY,
    baseYield: 3,
    chopItemId: ItemId.none,
    chopYield: 0,
    flags: FarmFeature.requiresTilledSoil | FarmFeature.needsWater,
  },
  {
    farmTypeId: 20,
    kind: FarmKind.tree,
    seedItemId: ItemId.appleSapling,
    harvestItemId: ItemId.apple,
    requiredGrowthSeconds: 7 * DAY,
    regrowSeconds: DAY,
    baseYield: 3,
    chopItemId: ItemId.wood,
    chopYield: 8,
    flags: 0,
  },
  {
    farmTypeId: 21,
    kind: FarmKind.tree,
    seedItemId: ItemId.acorn,
    harvestItemId: ItemId.none,
    requiredGrowthSeconds: 6 * DAY,
    regrowSeconds: 0,
    baseYield: 0,
    chopItemId: ItemId.oakLog,
    chopYield: 5,
    flags: 0,
  },
];

export const WORLD_ITEM_DROPS = [
  { x: 9, y: 10, itemId: ItemId.turnipSeed, quantity: 3 },
  { x: 10, y: 9, itemId: ItemId.wheatSeed, quantity: 2 },
  { x: 12, y: 10, itemId: ItemId.berrySeed, quantity: 2 },
  { x: 13, y: 11, itemId: ItemId.acorn, quantity: 1 },
  { x: 8, y: 8, itemId: ItemId.appleSapling, quantity: 1 },
  { x: 5, y: 5, itemId: ItemId.berry, quantity: 4 },
  { x: 6, y: 7, itemId: ItemId.grassFiber, quantity: 5 },
  { x: 16, y: 4, itemId: ItemId.stone, quantity: 3 },
  { x: 1, y: 8, itemId: ItemId.reed, quantity: 2 },
] as const;

export const getFarmType = (farmTypeId: number) =>
  FARM_TYPES.find((farm) => farm.farmTypeId === farmTypeId) ?? null;

export const getFarmTypeBySeedItem = (itemId: number) =>
  FARM_TYPES.find((farm) => farm.seedItemId === itemId) ?? null;

export const getGameTimeSeconds = (nowMs = Date.now()) => {
  const elapsedRealSeconds = Math.max(
    0,
    Math.floor(nowMs / 1000) - WORLD_EPOCH_UNIX_SECONDS
  );

  return Math.floor(
    (elapsedRealSeconds * GAME_SECONDS_PER_DAY) / REAL_SECONDS_PER_GAME_DAY
  );
};
