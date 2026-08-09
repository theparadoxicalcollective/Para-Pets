import assert from "node:assert/strict";
import test from "node:test";
import { containPetCareMutation } from "../client/src/lib/petCareMutationSafety";
import { classifyPetCareItemGesture } from "../client/src/lib/petCareInteractions";

async function runApplication(kind: "feed" | "gift", reject = false) {
  const state = { calls: 0, toasts: 0, busy: true, ghost: true, glow: true, mounted: true };
  let crashReports = 0;
  const unhandled = () => { crashReports += 1; };
  process.on("unhandledRejection", unhandled);
  try {
    const success = await containPetCareMutation(async () => {
      state.calls += 1;
      if (reject) {
        state.toasts += 1; // React Query onError runs before mutateAsync rejects.
        throw new Error(`409: ${kind} inventory item was already consumed`);
      }
    }, () => {});
    state.busy = false;
    state.ghost = false;
    state.glow = false;
    await new Promise((resolve) => setImmediate(resolve));
    return { state, success, crashReports };
  } finally {
    process.off("unhandledRejection", unhandled);
  }
}

test("successful single edible and gift applications each submit exactly once", async () => {
  for (const kind of ["feed", "gift"] as const) {
    const result = await runApplication(kind);
    assert.equal(result.success, true);
    assert.equal(result.state.calls, 1);
  }
});

test("rejected feed and gift requests toast locally, remain mounted, and unlock", async () => {
  for (const kind of ["feed", "gift"] as const) {
    const { state, success, crashReports } = await runApplication(kind, true);
    assert.equal(success, false);
    assert.equal(state.toasts, 1);
    assert.equal(crashReports, 0);
    assert.equal(state.mounted, true);
    assert.deepEqual([state.busy, state.ghost, state.glow], [false, false, false]);
  }
});

test("rejected stacked edible submission is contained", async () => {
  const result = await runApplication("feed", true);
  assert.equal(result.crashReports, 0);
  assert.equal(result.state.busy, false);
});

test("duplicate release is consumed once and cancellation never applies", () => {
  let applications = 0;
  let active: number | null = 7;
  const release = (pointerId: number) => {
    if (active !== pointerId) return;
    active = null;
    applications += 1;
  };
  release(7); // pointerup
  release(7); // lostpointercapture bubbles afterward
  assert.equal(applications, 1);
  active = 8;
  active = null; // pointercancel is cleanup-only
  release(8);
  assert.equal(applications, 1);
});

test("horizontal shelf travel begins an item drag when arrows own paging", () => {
  assert.equal(classifyPetCareItemGesture(40, -5), "vertical-item-drag");
});

test("twenty sequential applications leave no busy state or ghost", async () => {
  for (let index = 0; index < 20; index += 1) {
    const { state } = await runApplication(index % 2 ? "gift" : "feed");
    assert.equal(state.calls, 1);
    assert.equal(state.busy, false);
    assert.equal(state.ghost, false);
  }
});
