export type ClearingTimer = ReturnType<typeof setTimeout>;

/** Keep only pending Clearing timers in the lifecycle registry. */
export function scheduleClearingTimer(
  timers: Set<ClearingTimer>,
  callback: () => void,
  delayMs: number,
  setTimer: typeof setTimeout = setTimeout,
): ClearingTimer {
  const timer = setTimer(() => {
    timers.delete(timer);
    callback();
  }, delayMs);
  timers.add(timer);
  return timer;
}
