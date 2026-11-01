import assert from "node:assert/strict";
import { chromium } from "playwright";

// Exercise the real App entry. The temporary PC gate must render before auth,
// tutorials, or other gameplay mounts; mobile and tablet paths stay untouched.
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

  // Public information and admin/account-recovery routes remain accessible.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const path of ["/privacy", "/auth", "/admin"]) {
    await page.goto("http://127.0.0.1:4173" + path, { waitUntil: "domcontentloaded" });
    await page.locator("#game-stage").waitFor({ state: "attached" });
    assert.equal(await page.getByTestId("desktop-coming-soon").count(), 0, path + ": keep non-gameplay routes available");
  }
  console.log("PASS PC support routes: notice does not block privacy, auth or admin");
  await context.close();
} finally {
  await browser.close();
}
