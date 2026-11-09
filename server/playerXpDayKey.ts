/** Server-owned calendar key for modest daily-capped mini-game XP receipts. */
export function playerXpDayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (part: string) => parts.find(piece => piece.type === part)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
