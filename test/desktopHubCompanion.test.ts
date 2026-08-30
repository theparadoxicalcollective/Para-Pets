import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DESKTOP_COMPANION_URL,
  getDesktopCompanionPlacement,
  isDesktopCompanionEnvironment,
  isEmbeddedDesktopCompanion,
  shouldShowDesktopCompanionForPath,
} from "../client/src/lib/desktopCompanion";
import { calculateStageLayout } from "../client/src/lib/stage";

const desktop = {
  width: 1920,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  maxTouchPoints: 0,
  desktopPointer: true,
};

test("Hub companion is limited to true desktop environments", () => {
  assert.equal(isDesktopCompanionEnvironment(desktop), true);
  assert.equal(isDesktopCompanionEnvironment({ ...desktop, width: 1179 }), false);
  assert.equal(isDesktopCompanionEnvironment({ ...desktop, desktopPointer: false }), false);
  assert.equal(isDesktopCompanionEnvironment({
    ...desktop,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile",
  }), false);
  assert.equal(isDesktopCompanionEnvironment({
    ...desktop,
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel Tablet)",
  }), false);
  assert.equal(isDesktopCompanionEnvironment({
    ...desktop,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    maxTouchPoints: 5,
  }), false);
});

test("Hub companion appears only when a full second portrait stage fits", () => {
  const roomy = getDesktopCompanionPlacement(calculateStageLayout(1920, 1080));
  assert.ok(roomy);
  assert.ok(roomy.left >= 16);

  const cramped = getDesktopCompanionPlacement(calculateStageLayout(1180, 844));
  assert.equal(cramped, null);
});

test("embedded Hub and utility pages never create another companion", () => {
  assert.equal(DESKTOP_COMPANION_URL, "/hub?desktopCompanion=1");
  assert.equal(isEmbeddedDesktopCompanion("?desktopCompanion=1"), true);
  assert.equal(isEmbeddedDesktopCompanion(""), false);
  assert.equal(shouldShowDesktopCompanionForPath("/"), true);
  assert.equal(shouldShowDesktopCompanionForPath("/world/volcanic"), true);
  assert.equal(shouldShowDesktopCompanionForPath("/hub"), false);
  assert.equal(shouldShowDesktopCompanionForPath("/auth?mode=register"), false);
  assert.equal(shouldShowDesktopCompanionForPath("/reset-password/token"), false);
});

test("desktop shell keeps the Hub companion behind desktop-only guards", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const app = readFileSync(path.join(repoRoot, "client", "src", "App.tsx"), "utf8");
  const css = readFileSync(path.join(repoRoot, "client", "src", "tabletStageShell.css"), "utf8");
  const hub = readFileSync(path.join(repoRoot, "client", "src", "pages", "ParaPetsHubPage.tsx"), "utf8");
  const indexCss = readFileSync(path.join(repoRoot, "client", "src", "index.css"), "utf8");
  assert.match(app, /className="desktop-hub-companion"/);
  assert.match(app, /isDesktopCompanionRuntime\(\)/);
  assert.match(css, /min-width: 1180px/);
  assert.match(css, /hover: hover/);
  assert.match(css, /pointer: fine/);
  assert.match(hub, /para-pets-hub-scrollbar fixed inset-0 overflow-y-auto/);
  assert.match(indexCss, /\.para-pets-hub-scrollbar::\-webkit-scrollbar-thumb/);
  assert.match(indexCss, /scrollbar-color: #a88432 #07150f/);
});
