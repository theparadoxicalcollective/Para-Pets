import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldUseDocumentLayout } from "../client/src/lib/stage";

test("public Hub uses a real viewport at Android widths and keyboard heights", () => {
  for (const width of [320, 360, 375, 390, 393, 412, 430, 600, 800]) {
    assert.equal(shouldUseDocumentLayout("/hub", width), true);
    assert.equal(shouldUseDocumentLayout("/auth", width), true);
    assert.equal(shouldUseDocumentLayout("/", width), false);
  }
});

test("Hub sign-in stays scrollable with Android software keyboard", () => {
  const hub = readFileSync("client/src/pages/ParaPetsHubPage.tsx", "utf8");
  assert.match(hub, /data-testid="signin-modal-backdrop"/);
  assert.match(hub, /overflow-y-auto overscroll-contain px-4 py-5/);
  assert.match(hub, /max-w-sm my-auto rounded-3xl overflow-hidden shrink-0/);
  assert.match(hub, /data-testid="button-hero-play-game"/);
  assert.match(hub, /href=\{user \? "\/" : "\/auth"\}/);
  assert.match(hub, /para-pets-hub-scrollbar fixed inset-0 overflow-y-auto overscroll-y-contain/);
});
