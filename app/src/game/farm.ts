import type * as Phaser from "phaser";
import {
  objectSpriteKey,
  type ObjectSpriteAssetId,
} from "../assets/visual-assets";
import { ItemId } from "./terrain";

export const FarmKind = {
  crop: 1,
  tree: 2,
} as const;

export const FarmFeature = {
  requiresTilledSoil: 1 << 0,
  needsWater: 1 << 1,
} as const;

export const FarmItemId = {
  none: 0,
  turnipSeed: 100,
  turnip: 101,
  wheatSeed: 102,
  wheat: 103,
  berrySeed: 104,
  berry: 105,
  appleSapling: 120,
  apple: 121,
  acorn: 122,
  oakLog: 123,
  wood: 124,
} as const;

export const FARM_ITEM_LABELS: Record<number, string> = {
  [ItemId.grassFiber]: "Grass Fiber",
  [ItemId.berry]: "Wild Berry",
  [ItemId.stone]: "Stone",
  [ItemId.reed]: "Reed",
  [FarmItemId.turnipSeed]: "Turnip Seed",
  [FarmItemId.turnip]: "Turnip",
  [FarmItemId.wheatSeed]: "Wheat Seed",
  [FarmItemId.wheat]: "Wheat",
  [FarmItemId.berrySeed]: "Berry Seed",
  [FarmItemId.berry]: "Wild Berry",
  [FarmItemId.appleSapling]: "Apple Sapling",
  [FarmItemId.apple]: "Apple",
  [FarmItemId.acorn]: "Acorn",
  [FarmItemId.oakLog]: "Oak Log",
  [FarmItemId.wood]: "Wood",
};

export const getFarmItemLabel = (itemId: number) =>
  FARM_ITEM_LABELS[itemId] ?? `Item ${itemId}`;

export type FarmTypeDefinition = {
  farmTypeId: number;
  label: string;
  kind: (typeof FarmKind)[keyof typeof FarmKind];
  seedItemId: number;
  harvestItemId: number;
  requiredGrowthSeconds: number;
  regrowSeconds: number;
  baseYield: number;
  chopItemId: number;
  chopYield: number;
  stageThresholdSeconds: number[];
  flags: number;
  color: number;
  accentColor: number;
  spriteAssetId: ObjectSpriteAssetId;
};

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export const FARM_TYPES: FarmTypeDefinition[] = [
  {
    farmTypeId: 1,
    label: "Turnip",
    kind: FarmKind.crop,
    seedItemId: FarmItemId.turnipSeed,
    harvestItemId: FarmItemId.turnip,
    requiredGrowthSeconds: 2 * DAY,
    regrowSeconds: 0,
    baseYield: 1,
    chopItemId: FarmItemId.none,
    chopYield: 0,
    stageThresholdSeconds: [0, 12 * HOUR, DAY, 2 * DAY],
    flags: FarmFeature.requiresTilledSoil | FarmFeature.needsWater,
    color: 0xd8f3a6,
    accentColor: 0x8f5e3b,
    spriteAssetId: "city-clover",
  },
  {
    farmTypeId: 2,
    label: "Wheat",
    kind: FarmKind.crop,
    seedItemId: FarmItemId.wheatSeed,
    harvestItemId: FarmItemId.wheat,
    requiredGrowthSeconds: 3 * DAY,
    regrowSeconds: 0,
    baseYield: 2,
    chopItemId: FarmItemId.none,
    chopYield: 0,
    stageThresholdSeconds: [0, DAY, 2 * DAY, 3 * DAY],
    flags: FarmFeature.requiresTilledSoil | FarmFeature.needsWater,
    color: 0xf3d76b,
    accentColor: 0xa26924,
    spriteAssetId: "sungrain",
  },
  {
    farmTypeId: 3,
    label: "Wild Berry",
    kind: FarmKind.crop,
    seedItemId: FarmItemId.berrySeed,
    harvestItemId: FarmItemId.berry,
    requiredGrowthSeconds: 4 * DAY,
    regrowSeconds: 2 * DAY,
    baseYield: 3,
    chopItemId: FarmItemId.none,
    chopYield: 0,
    stageThresholdSeconds: [0, DAY, 2 * DAY, 4 * DAY],
    flags: FarmFeature.requiresTilledSoil | FarmFeature.needsWater,
    color: 0xba6ee8,
    accentColor: 0x4f8b4c,
    spriteAssetId: "routeberry",
  },
  {
    farmTypeId: 20,
    label: "Apple Tree",
    kind: FarmKind.tree,
    seedItemId: FarmItemId.appleSapling,
    harvestItemId: FarmItemId.apple,
    requiredGrowthSeconds: 7 * DAY,
    regrowSeconds: DAY,
    baseYield: 3,
    chopItemId: FarmItemId.wood,
    chopYield: 8,
    stageThresholdSeconds: [0, 2 * DAY, 4 * DAY, 7 * DAY],
    flags: 0,
    color: 0x7fbe5a,
    accentColor: 0xe74f3d,
    spriteAssetId: "applewood",
  },
  {
    farmTypeId: 21,
    label: "Oak Tree",
    kind: FarmKind.tree,
    seedItemId: FarmItemId.acorn,
    harvestItemId: FarmItemId.none,
    requiredGrowthSeconds: 6 * DAY,
    regrowSeconds: 0,
    baseYield: 0,
    chopItemId: FarmItemId.oakLog,
    chopYield: 5,
    stageThresholdSeconds: [0, 2 * DAY, 4 * DAY, 6 * DAY],
    flags: 0,
    color: 0x5f9b54,
    accentColor: 0x8b5a2b,
    spriteAssetId: "stonepine",
  },
];

export const formatDuration = (seconds: number) => {
  if (seconds === 0) {
    return "none";
  }

  const days = seconds / DAY;
  if (Number.isInteger(days)) {
    return `${days}d`;
  }

  const hours = seconds / HOUR;
  return `${hours}h`;
};

export const describeFarmRules = (farm: FarmTypeDefinition) => {
  const rules = [
    farm.kind === FarmKind.tree ? "tree" : "crop",
    `grow ${formatDuration(farm.requiredGrowthSeconds)}`,
  ];

  if (farm.flags & FarmFeature.needsWater) {
    rules.push("watered growth");
  }

  if (farm.flags & FarmFeature.requiresTilledSoil) {
    rules.push("tilled soil");
  }

  if (farm.regrowSeconds > 0) {
    rules.push(`regrow ${formatDuration(farm.regrowSeconds)}`);
  }

  if (farm.chopYield > 0) {
    rules.push(`chop x${farm.chopYield}`);
  }

  if (farm.baseYield > 0) {
    rules.push(`yield x${farm.baseYield}`);
  }

  return rules.join(" · ");
};

export const drawFarmPlaceholder = (
  scene: Phaser.Scene,
  farm: FarmTypeDefinition,
  x: number,
  y: number,
  scale = 1
) => {
  const textureKey = objectSpriteKey(farm.spriteAssetId);
  if (scene.textures.exists(textureKey)) {
    const frame = farm.kind === FarmKind.tree ? 8 : 10;
    const image = scene.add
      .image(x, y + 4 * scale, textureKey, frame)
      .setDepth(4)
      .setOrigin(0.5, 0.68)
      .setDisplaySize(
        (farm.kind === FarmKind.tree ? 38 : 30) * scale,
        (farm.kind === FarmKind.tree ? 38 : 30) * scale
      );

    return image;
  }

  const graphics = scene.add.graphics();
  graphics.setDepth(4);

  if (farm.kind === FarmKind.tree) {
    graphics.fillStyle(0x7a5130, 1);
    graphics.fillRoundedRect(
      x - 4 * scale,
      y + 4 * scale,
      8 * scale,
      14 * scale,
      3 * scale
    );
    graphics.fillStyle(farm.color, 1);
    graphics.fillCircle(x, y, 15 * scale);
    graphics.fillCircle(x - 10 * scale, y + 4 * scale, 10 * scale);
    graphics.fillCircle(x + 10 * scale, y + 4 * scale, 10 * scale);
    graphics.fillStyle(farm.accentColor, 1);
    graphics.fillCircle(x + 6 * scale, y - 3 * scale, 3 * scale);
    graphics.fillCircle(x - 6 * scale, y + 5 * scale, 2.5 * scale);
    return graphics;
  }

  graphics.lineStyle(2 * scale, farm.accentColor, 1);
  graphics.lineBetween(x, y + 14 * scale, x, y - 8 * scale);
  graphics.lineBetween(x, y + 4 * scale, x - 8 * scale, y - 4 * scale);
  graphics.lineBetween(x, y + 2 * scale, x + 8 * scale, y - 7 * scale);
  graphics.fillStyle(farm.color, 1);
  graphics.fillCircle(x, y - 10 * scale, 7 * scale);
  graphics.fillStyle(farm.accentColor, 1);
  graphics.fillCircle(x + 2 * scale, y - 12 * scale, 2 * scale);
  return graphics;
};
