import { ACTIVE_PET_UPDATE_CONFIRMED_EVENT } from "@/lib/queryClient";

// Begin Journey — tutorial quest state management (localStorage-backed)
let _step5FakeMode = false;
export const bjSetStep5FakeMode = (v: boolean) => { _step5FakeMode = v; };
export const bjIsStep5FakeMode  = (): boolean  => _step5FakeMode;

let _step5TapMode = false;
export const bjSetStep5TapMode = (v: boolean) => { _step5TapMode = v; };
export const bjIsStep5TapMode  = (): boolean  => _step5TapMode;

const TOTAL_STEPS = 7;
const CURRENT_FLOW_VERSION = "2";

export const BJ_LS_KEY = "bj_step";
export const BJ_VERSION_KEY = "bj_flow_version";
export const BJ_STARTER_INVENTORY_KEY = "bj_starter_inventory_id";
export const BJ_PLAYER_KEY = "bj_active_player_id";
export const BJ_EVENT = "bj_step_changed";

let activePlayerId: string | null = null;

function read(key: string): string | null {
  try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); }
  catch { return null; }
}

function write(key: string, value: string) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); }
  catch {}
}

function remove(key: string) {
  try { if (typeof localStorage !== "undefined") localStorage.removeItem(key); }
  catch {}
}

function playerKey(base: string): string {
  return activePlayerId ? `${base}:${activePlayerId}` : base;
}

/**
 * Select the authenticated player's local tutorial namespace.
 *
 * The first player to run this version receives the legacy unscoped state so
 * an in-progress tutorial survives deployment. Later account switches always
 * use their own namespace and cannot inherit another player's step or egg id.
 */
export function bjUsePlayer(playerId: string | null | undefined) {
  const nextPlayerId = typeof playerId === "string" && playerId.trim() ? playerId.trim() : null;
  if (activePlayerId === nextPlayerId) return;
  activePlayerId = nextPlayerId;
  _step5FakeMode = false;
  _step5TapMode = false;
  if (!nextPlayerId) return;

  const previousOwner = read(BJ_PLAYER_KEY);
  if (!previousOwner) {
    for (const base of [BJ_LS_KEY, BJ_VERSION_KEY, BJ_STARTER_INVENTORY_KEY]) {
      const legacyValue = read(base);
      const destination = playerKey(base);
      if (legacyValue !== null && read(destination) === null) write(destination, legacyValue);
    }
  }
  write(BJ_PLAYER_KEY, nextPlayerId);
}

export function bjGetStep(): number | "done" | null {
  const value = read(playerKey(BJ_LS_KEY));
  if (value === null) return null;
  if (value === "done") return "done";
  const step = parseInt(value, 10);
  return !isNaN(step) && step >= 0 && step < TOTAL_STEPS ? step : null;
}

export function bjSetStep(step: number | "done") {
  write(playerKey(BJ_VERSION_KEY), CURRENT_FLOW_VERSION);
  write(playerKey(BJ_LS_KEY), step === "done" ? "done" : String(step));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BJ_EVENT));
}

export function bjSetStarterInventoryId(inventoryId: string) {
  write(playerKey(BJ_STARTER_INVENTORY_KEY), inventoryId);
}

export function bjGetStarterInventoryId(): string | null {
  return read(playerKey(BJ_STARTER_INVENTORY_KEY));
}

export function bjStart() {
  if (bjGetStep() !== "done") {
    remove(playerKey(BJ_STARTER_INVENTORY_KEY));
    bjSetStep(0);
  }
}

export function bjRestart() {
  remove(playerKey(BJ_STARTER_INVENTORY_KEY));
  bjSetStep(0);
}

export function bjIsCurrentFlowVersion(): boolean {
  return read(playerKey(BJ_VERSION_KEY)) === CURRENT_FLOW_VERSION;
}

export function bjGetStatus(): "not_started" | "active" | "done" {
  const value = read(playerKey(BJ_LS_KEY));
  if (value === null) return "not_started";
  if (value === "done") return "done";
  const step = parseInt(value, 10);
  return !isNaN(step) && step >= 0 && step < TOTAL_STEPS ? "active" : "not_started";
}

if (typeof window !== "undefined") {
  const tutorialWindow = window as Window & { __paraBjActivePetAckInstalled?: boolean };
  if (!tutorialWindow.__paraBjActivePetAckInstalled) {
    tutorialWindow.__paraBjActivePetAckInstalled = true;
    window.addEventListener(ACTIVE_PET_UPDATE_CONFIRMED_EVENT, (event: Event) => {
      const activePetId = (event as CustomEvent<{ activePetId?: string | null }>).detail?.activePetId;
      if (bjGetStep() === 3 && activePetId && activePetId === bjGetStarterInventoryId()) {
        bjSetStep(4);
      }
    });
  }
}
