import { ACTIVE_PET_UPDATE_CONFIRMED_EVENT } from "@/lib/queryClient";

// Begin Journey — tutorial quest state management (localStorage-backed)
// Step-5 fake-mode flag: true when egg is already hatch-ready so drag uses a pretend animation
let _step5FakeMode = false;
export const bjSetStep5FakeMode = (v: boolean) => { _step5FakeMode = v; };
export const bjIsStep5FakeMode  = (): boolean  => _step5FakeMode;

// Step-5 tap-mode flag: true after fake potion used — overlay lifts, player taps egg to hatch
let _step5TapMode = false;
export const bjSetStep5TapMode = (v: boolean) => { _step5TapMode = v; };
export const bjIsStep5TapMode  = (): boolean  => _step5TapMode;

const TOTAL_STEPS = 7; // steps 0–6
const CURRENT_FLOW_VERSION = "2";

export const BJ_LS_KEY = "bj_step";
export const BJ_VERSION_KEY = "bj_flow_version";
export const BJ_STARTER_INVENTORY_KEY = "bj_starter_inventory_id";
export const BJ_EVENT  = "bj_step_changed";

export function bjGetStep(): number | "done" | null {
  const v = localStorage.getItem(BJ_LS_KEY);
  if (v === null) return null;
  if (v === "done") return "done";
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 0 && n < TOTAL_STEPS ? n : null;
}

export function bjSetStep(s: number | "done") {
  localStorage.setItem(BJ_VERSION_KEY, CURRENT_FLOW_VERSION);
  localStorage.setItem(BJ_LS_KEY, s === "done" ? "done" : String(s));
  window.dispatchEvent(new Event(BJ_EVENT));
}

export function bjSetStarterInventoryId(inventoryId: string) {
  localStorage.setItem(BJ_STARTER_INVENTORY_KEY, inventoryId);
}

export function bjGetStarterInventoryId(): string | null {
  return localStorage.getItem(BJ_STARTER_INVENTORY_KEY);
}

export function bjStart() {
  if (bjGetStep() !== "done") {
    localStorage.removeItem(BJ_STARTER_INVENTORY_KEY);
    bjSetStep(0);
  }
}

// Explicit player/admin recovery. This clears any stale starter reference so the
// server-backed picker can safely resume or grant the selected 3-star egg.
export function bjRestart() {
  localStorage.removeItem(BJ_STARTER_INVENTORY_KEY);
  bjSetStep(0);
}

export function bjIsCurrentFlowVersion(): boolean {
  return localStorage.getItem(BJ_VERSION_KEY) === CURRENT_FLOW_VERSION;
}

export function bjGetStatus(): "not_started" | "active" | "done" {
  const v = localStorage.getItem(BJ_LS_KEY);
  if (v === null) return "not_started";
  if (v === "done") return "done";
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 0 && n < TOTAL_STEPS ? "active" : "not_started";
}

// Step 3 waits for the server-confirmed active-pet PATCH and only accepts the
// exact starter egg selected in step 0. Selecting a different pet cannot skip
// the tutorial.
if (typeof window !== "undefined") {
  const tutorialWindow = window as Window & { __paraBjActivePetAckInstalled?: boolean };
  if (!tutorialWindow.__paraBjActivePetAckInstalled) {
    tutorialWindow.__paraBjActivePetAckInstalled = true;
    window.addEventListener(ACTIVE_PET_UPDATE_CONFIRMED_EVENT, (event: Event) => {
      const activePetId = (event as CustomEvent<{ activePetId?: string | null }>).detail?.activePetId;
      if (
        bjGetStep() === 3 &&
        activePetId &&
        activePetId === bjGetStarterInventoryId()
      ) {
        bjSetStep(4);
      }
    });
  }
}
