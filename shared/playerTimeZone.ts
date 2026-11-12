/** IANA time zones handle DST. Player choice controls visual clocks only;
 * server-authoritative reward and cooldown timestamps are unchanged. */
export function isValidPlayerTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80 ||
      !/^[A-Za-z0-9_+\/-]+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch { return false; }
}

export function detectedPlayerTimeZone(): string {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidPlayerTimeZone(value) ? value : "UTC";
}

/** Determine wall-clock minutes in the selected IANA zone without changing
 * the underlying timestamp. Defaults to the existing device-local behavior. */
export function localClockMinutes(date: Date, timeZone?: string | null): number {
  if (!timeZone || !isValidPlayerTimeZone(timeZone))
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (kind: string) => Number(parts.find(p => p.type === kind)?.value ?? 0);
  return part("hour") * 60 + part("minute") + part("second") / 60;
}
