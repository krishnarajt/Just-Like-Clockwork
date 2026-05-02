const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export function secondsFromParts(hours = 0, minutes = 0, seconds = 0) {
  const totalSeconds =
    toFiniteNumber(hours) * 3600 + toFiniteNumber(minutes) * 60 + toFiniteNumber(seconds);

  return Math.max(0, Math.floor(totalSeconds));
}

export function partsFromSeconds(totalSeconds = 0) {
  const normalizedSeconds = Math.max(0, Math.floor(toFiniteNumber(totalSeconds)));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  return { hours, minutes, seconds };
}

export function elapsedSecondsFromWallClock(baseElapsedSeconds = 0, runningSinceMs = 0, nowMs = Date.now()) {
  const elapsedMs = Math.max(0, toFiniteNumber(nowMs) - toFiniteNumber(runningSinceMs));
  return secondsFromParts(0, 0, baseElapsedSeconds) + Math.floor(elapsedMs / 1000);
}
