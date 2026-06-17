// Begin Journey — tutorial quest state management (localStorage-backed)
// Step-5 fake-mode flag: true when egg is already hatch-ready so drag uses a pretend animation
let _step5FakeMode = false;
export const bjSetStep5FakeMode = (v: boolean) => { _step5FakeMode = v; };
export const bjIsStep5FakeMode  = (): boolean  => _step5FakeMode;
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

export function bjGetStatus(): "not_started" | "active" | "done" {
  const v = localStorage.getItem(BJ_LS_KEY);
  if (v === null) return "not_started";
  if (v === "done") return "done";
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 0 && n < TOTAL_STEPS ? "active" : "not_started";
}
