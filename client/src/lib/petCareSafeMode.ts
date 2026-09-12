import type { RuntimeMode } from "./runtimeMode";

export const PET_CARE_PHASE_KEY = "para_pet_care_phase_v1";
export const PET_CARE_RECOVERY_WINDOW_MS = 5 * 60 * 1000;

export type PetCarePhase =
  | "mounted" | "item-selected" | "pointer-down" | "vertical-drag-started"
  | "drop-attempt" | "mutation-started" | "mutation-success-received"
  | "success-visual-started" | "cleanup-complete";

export type PetCarePhaseRecord = {
  version: 1;
  buildId: string;
  timestamp: number;
  route: string;
  runtimeMode: RuntimeMode["displayMode"];
  safeMode: boolean;
  phase: PetCarePhase;
  interactionId: string;
  itemType?: "edibles" | "gift";
};

export function sanitizePetCareRoute(pathname: string) {
  return pathname.startsWith("/pet-care/") ? "/pet-care/:pet" : "/pet-care";
}

export function shouldUsePetCareSafeMode(runtime: RuntimeMode, search: string, recovered = false) {
  if (recovered) return true;
  const override = new URLSearchParams(search).get("petCareSafe");
  if (override === "1") return true;
  if (override === "0") return false;
  return runtime.displayMode === "ios-browser"
    || runtime.displayMode === "ios-embedded"
    || runtime.displayMode === "ios-standalone"
    || runtime.displayMode === "android-browser"
    || runtime.displayMode === "android-standalone";
}

/** Keep visual degradation independent from Pet Care input capabilities. */
export function getPetCareRuntimeDecisions(runtime: RuntimeMode, search: string, recovered = false) {
  return {
    reducedVisualMode: shouldUsePetCareSafeMode(runtime, search, recovered),
    dragEnabled: true,
    emergencyInteractionFallback: false,
  } as const;
}

/**
 * Interactive confirmation is intentionally cheaper, not absent, in reduced
 * visual mode. Keep this separate from decorative safe-mode decisions so iOS
 * still communicates successful petting and item use without continuous or
 * filter-heavy effects.
 */
export function getPetCareFeedbackProfile(reducedVisualMode: boolean) {
  return reducedVisualMode
    ? { pettingHeartCount: 4, edibleHeartCount: 4, edibleSparkleCount: 7, giftHeartCount: 5, giftSparkleCount: 9, pettingIntervalMs: 720 }
    : { pettingHeartCount: 7, edibleHeartCount: 8, edibleSparkleCount: 14, giftHeartCount: 8, giftSparkleCount: 16, pettingIntervalMs: 380 };
}

export function readRecoverablePetCarePhase(storage: Pick<Storage, "getItem">, now = Date.now()) {
  try {
    const raw = storage.getItem(PET_CARE_PHASE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PetCarePhaseRecord;
    if (value.version !== 1 || value.phase === "cleanup-complete" || now - value.timestamp >= PET_CARE_RECOVERY_WINDOW_MS || now < value.timestamp) return null;
    return value;
  } catch { return null; }
}

function sendPhase(record: PetCarePhaseRecord | (PetCarePhaseRecord & { recoveredPhase: PetCarePhase; event: string })) {
  const body = JSON.stringify({ type: "error", msg: JSON.stringify(record), url: record.route, source: "pet-care-phase-v1" });
  try {
    if (navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "include" }).catch(() => {});
}

export function reportRecoveredPetCarePhase(record: PetCarePhaseRecord) {
  sendPhase({ ...record, event: "recovered-after-pet-care-termination", recoveredPhase: record.phase });
}

export function writePetCarePhase(storage: Pick<Storage, "setItem">, record: PetCarePhaseRecord) {
  // Persist locally on every phase, but report only if a later mount proves the
  // previous visit terminated mid-interaction. Normal mount/cleanup traffic is
  // not an error and must not bury real crashes in the production error log.
  try { storage.setItem(PET_CARE_PHASE_KEY, JSON.stringify(record)); } catch {}
}

export function clearPetCarePhase(storage: Pick<Storage, "removeItem">) {
  try { storage.removeItem(PET_CARE_PHASE_KEY); } catch {}
}
