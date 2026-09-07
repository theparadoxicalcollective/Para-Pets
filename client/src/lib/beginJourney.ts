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

export const BJ_LS_KEY = "bj_step";
export const BJ_EVENT  = "bj_step_changed";

export function bjGetStep(): number | "done" | null {
  const v = localStorage.getItem(BJ_LS_KEY);
  if (v === null) return null;
  if (v === "done") return "done";
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 0 && n < TOTAL_STEPS ? n : null;
}

export function bjSetStep(s: number | "done") {
  localStorage.setItem(BJ_LS_KEY, s === "done" ? "done" : String(s));
  window.dispatchEvent(new Event(BJ_EVENT));
}

export function bjStart() {
  if (bjGetStep() !== "done") bjSetStep(0);
}

// Explicit player action from the empty active-pet stage. Unlike bjStart, this
// intentionally repairs stale browser completion left by an interrupted quest.
export function bjRestart() {
  bjSetStep(0);
}

export function bjGetStatus(): "not_started" | "active" | "done" {
  const v = localStorage.getItem(BJ_LS_KEY);
  if (v === null) return "not_started";
  if (v === "done") return "done";
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 0 && n < TOTAL_STEPS ? "active" : "not_started";
}

// Step 2 is special: the visual overlay forwards the tap to PetInventory, but
// progression must be tied to the server-confirmed active-pet PATCH rather than
// to React Query propagation timing. The shared API layer emits this event only
// after a successful response. A null activePetId is a deselection and must never
// advance the tutorial.
if (typeof window !== "undefined") {
  const tutorialWindow = window as Window & { __paraBjActivePetAckInstalled?: boolean };
  if (!tutorialWindow.__paraBjActivePetAckInstalled) {
    tutorialWindow.__paraBjActivePetAckInstalled = true;
    window.addEventListener(ACTIVE_PET_UPDATE_CONFIRMED_EVENT, (event: Event) => {
      const activePetId = (event as CustomEvent<{ activePetId?: string | null }>).detail?.activePetId;
      if (bjGetStep() === 2 && activePetId) {
        bjSetStep(3);
      }
    });
  }
}
