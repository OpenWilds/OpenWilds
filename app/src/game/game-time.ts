export const GAME_SECONDS_PER_DAY = 24 * 60 * 60;
export const REAL_SECONDS_PER_GAME_DAY = 5 * 60;
export const WORLD_EPOCH_UNIX_SECONDS = 1_735_689_600;

export type GameTimeState = {
  day: number;
  hour: number;
  minute: number;
  normalizedDayTime: number;
};

export const getGameTime = (nowMs = Date.now()): GameTimeState => {
  const elapsedGameSeconds = getGameTimeSeconds(nowMs);
  const day = Math.floor(elapsedGameSeconds / GAME_SECONDS_PER_DAY) + 1;
  const secondsInDay = elapsedGameSeconds % GAME_SECONDS_PER_DAY;
  const hour = Math.floor(secondsInDay / (60 * 60));
  const minute = Math.floor((secondsInDay % (60 * 60)) / 60);
  const normalizedDayTime = secondsInDay / GAME_SECONDS_PER_DAY;

  return { day, hour, minute, normalizedDayTime };
};

export const getGameTimeSeconds = (nowMs = Date.now()) => {
  const elapsedRealSeconds = Math.max(
    0,
    Math.floor(nowMs / 1000) - WORLD_EPOCH_UNIX_SECONDS
  );

  return Math.floor(
    (elapsedRealSeconds * GAME_SECONDS_PER_DAY) / REAL_SECONDS_PER_GAME_DAY
  );
};

export const formatGameTime = (time = getGameTime()) =>
  `Day ${time.day} · ${time.hour.toString().padStart(2, "0")}:${time.minute
    .toString()
    .padStart(2, "0")}`;

export type GameTimeLighting = {
  alpha: number;
  color: number;
  phase: "Night" | "Dawn" | "Day" | "Dusk";
};

export const getGameTimeLighting = (
  time = getGameTime()
): GameTimeLighting => {
  const hour = time.normalizedDayTime * 24;

  if (hour < 5) {
    return { alpha: 0.5, color: 0x07142a, phase: "Night" };
  }

  if (hour < 7) {
    return {
      alpha: lerp(0.5, 0.12, (hour - 5) / 2),
      color: 0x28324d,
      phase: "Dawn",
    };
  }

  if (hour < 17) {
    return { alpha: 0.02, color: 0xfff2c0, phase: "Day" };
  }

  if (hour < 20) {
    return {
      alpha: lerp(0.08, 0.48, (hour - 17) / 3),
      color: 0x2a183f,
      phase: "Dusk",
    };
  }

  return { alpha: 0.5, color: 0x07142a, phase: "Night" };
};

const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * Math.max(0, Math.min(1, progress));
