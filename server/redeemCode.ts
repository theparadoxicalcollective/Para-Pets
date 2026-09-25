const REDEEM_CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{1,30}[A-Z0-9])?$/;

/** Canonical form stored and compared by the server. */
export function normalizeRedeemCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";
}

export function isValidRedeemCode(code: string): boolean {
  return code.length >= 3 && code.length <= 32 && REDEEM_CODE_PATTERN.test(code);
}

/** New codes must have a finite, positive number of account redemptions. */
export function parseMaxRedemptions(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 1 && count <= 1_000_000 ? count : null;
}
