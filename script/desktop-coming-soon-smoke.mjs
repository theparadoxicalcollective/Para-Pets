import assert from "node:assert/strict";
import { chromium } from "playwright";

// Exercise the real RootEntry -> authenticated App path. RootEntry owns
// sign-in at / for anonymous visitors, so desktop player notice is verified
// with an isolated signed-in user rather than bypassing the auth boundary.
const browser = await chromium.launch({ headless: true });
try {
  const profiles = [
    { name: "small PC window", width: 800, height: 600, touch: false },
    { name: "laptop", width: 1366, height: 768, touch: false },
    { name: "desktop", width: 1440, height: 900, touch: false },
    { name: "full HD PC", width: 1920, height: 1080, touch: false },
    { name: "phone", width: 390, height: 844, touch: true },
    { name: "Android tablet", width: 800, height: 1280, touch: true },
    { name: "large tablet", width: 834, height: 1194, touch: true },
  ];
  for (const { name, width, height, touch } of profiles) {
    const context = await browser.newContext({
      viewport: { width, height }, hasTouch: touch, isMobile: touch,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    // RootEntry keeps the anonymous home route as sign-in. A verified player
    // reaches App/GameStage, where the desktop-only gameplay gate lives.
    await page.route("**/api/auth/me", route => route.fulfill({
      json: { id: "desktop-notice-fixture", username: "QA", emailVerified: true,
        tutorial_quest_completed: true, tutorial_reward_claimed: true },
    }));
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
    if (touch) {
      await page.locator("#game-stage").waitFor({ state: "attached" });
      assert.equal(await page.getByTestId("desktop-coming-soon").count(), 0, name + ": no desktop gate on touch devices");
    } else {
      const notice = page.getByTestId("desktop-coming-soon");
      await notice.waitFor({ state: "visible" });
      assert.match(await notice.innerText(), /PC Version Coming Soon/);
      assert.match(await notice.innerText(), /phone or tablet/);
      assert.equal(await page.locator("#game-stage").count(), 0, name + ": underlying gameplay must not mount");
      const geometry = await notice.locator("main").evaluate(el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      assert.ok(geometry.left >= 0 && geometry.right <= width, name + ": message stays on screen");
      assert.ok(geometry.top >= 0 && geometry.bottom <= height, name + ": message fits on screen");
    }
    console.log("PASS " + name + ": " + (touch ? "normal gameplay entry preserved" : "desktop notice shown without gameplay"));
    await context.close();
  }

  // Anonymous desktop players must still reach sign-in at / (including the
  // legacy /auth redirect), while /privacy stays public. Administration and
  // other exempt routes are covered by the pure route policy test.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const path of ["/", "/privacy", "/auth"]) {
    await page.goto("http://127.0.0.1:4173" + path, { waitUntil: "domcontentloaded" });
    await page.locator("#game-stage").waitFor({ state: "attached" });
    assert.equal(await page.getByTestId("desktop-coming-soon").count(), 0, path + ": keep non-gameplay routes available");
  }
  console.log("PASS PC support routes: anonymous sign-in and privacy remain accessible");
  await context.close();
} finally {
  await browser.close();
}
