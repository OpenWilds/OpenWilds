export const GAME_SECONDS_PER_DAY = 24 * 60 * 60;
export const REAL_SECONDS_PER_GAME_DAY = 5 * 60;
export const WORLD_EPOCH_UNIX_SECONDS = 1_735_689_600;

export type GameTimeState = {
  day: number;
  hour: number;
  minute: number;
};

export const getGameTime = (nowMs = Date.now()): GameTimeState => {
  const elapsedRealSeconds = Math.max(
    0,
    Math.floor(nowMs / 1000) - WORLD_EPOCH_UNIX_SECONDS
  );
  const elapsedGameSeconds = Math.floor(
    (elapsedRealSeconds * GAME_SECONDS_PER_DAY) / REAL_SECONDS_PER_GAME_DAY
  );
  const day = Math.floor(elapsedGameSeconds / GAME_SECONDS_PER_DAY) + 1;
  const secondsInDay = elapsedGameSeconds % GAME_SECONDS_PER_DAY;
  const hour = Math.floor(secondsInDay / (60 * 60));
  const minute = Math.floor((secondsInDay % (60 * 60)) / 60);

  return { day, hour, minute };
};

export const formatGameTime = (time = getGameTime()) =>
  `Day ${time.day} · ${time.hour.toString().padStart(2, "0")}:${time.minute
    .toString()
    .padStart(2, "0")}`;
