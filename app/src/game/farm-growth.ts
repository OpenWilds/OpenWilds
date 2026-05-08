import { FarmFeature, type FarmTypeDefinition } from "./farm";
import type { FarmTileState } from "./types";

export type FarmGrowthProjection = {
  growthSeconds: number;
  progress: number;
  stageIndex: number;
  stageProgress: number;
  harvestReady: boolean;
};

const findStageIndex = (
  stageThresholdSeconds: number[],
  growthSeconds: number
) =>
  stageThresholdSeconds.reduce(
    (stage, threshold, index) => (growthSeconds >= threshold ? index : stage),
    0
  );

export const projectFarmGrowth = (
  tile: FarmTileState,
  farm: FarmTypeDefinition,
  nowGameSeconds: number
): FarmGrowthProjection => {
  const needsWater = (farm.flags & FarmFeature.needsWater) !== 0;
  const growthUntil = needsWater
    ? Math.min(tile.wateredUntil, nowGameSeconds)
    : nowGameSeconds;
  const projectedElapsed =
    tile.growthUpdatedAt > 0
      ? Math.max(0, growthUntil - tile.growthUpdatedAt)
      : 0;
  const growthSeconds = Math.min(
    farm.requiredGrowthSeconds,
    tile.growthSeconds + projectedElapsed
  );
  const progress = growthSeconds / farm.requiredGrowthSeconds;
  const stageIndex = findStageIndex(farm.stageThresholdSeconds, growthSeconds);
  const stageStart = farm.stageThresholdSeconds[stageIndex] ?? 0;
  const stageEnd =
    farm.stageThresholdSeconds[stageIndex + 1] ?? farm.requiredGrowthSeconds;
  const stageSpan = Math.max(1, stageEnd - stageStart);
  const regrowthReady =
    tile.lastHarvestedAt === 0 ||
    (farm.regrowSeconds > 0 &&
      nowGameSeconds - tile.lastHarvestedAt >= farm.regrowSeconds);

  return {
    growthSeconds,
    progress,
    stageIndex,
    stageProgress: Math.min(
      1,
      Math.max(0, (growthSeconds - stageStart) / stageSpan)
    ),
    harvestReady: growthSeconds >= farm.requiredGrowthSeconds && regrowthReady,
  };
};
