const REDEEM_CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{1,30}[A-Z0-9])?$/;

/** Canonical form stored and compared by the server. */
export function normalizeRedeemCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";
}

export function isValidRedeemCode(code: string): boolean {
  return code.length >= 3 && code.length <= 32 && REDEEM_CODE_PATTERN.test(code);
}

