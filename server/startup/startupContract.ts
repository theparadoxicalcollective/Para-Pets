export const STARTUP_ORDER = [
  "essential-schema",
  "route-registration",
  "error-middleware",
  "static-or-vite",
  "http-listen",
  "noncritical-locked-background",
] as const;

export const NONCRITICAL_BOUNDARIES = ["migrations", "backfills", "seeds", "assetSync"] as const;
