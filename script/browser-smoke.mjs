import assert from "node:assert/strict";
import { chromium } from "playwright";

/**
 * Opt-in browser smoke pilot. Uses Vite's local dev server with API responses
 * stubbed in the browser; never connects to Railway or a player account.
 * Expand to authenticated gameplay only with an isolated fixture backend.
 */
const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
try {
  for (const { name, width, height, isMobile, hasTouch } of [
    { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: "tablet", width: 834, height: 1194, isMobile: true, hasTouch: true },
    { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch });
    const page = await context.newPage();
    try {
      await page.route("**/api/**", route => {
        if (new URL(route.request().url()).pathname === "/api/privacy-policy") {
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "Privacy policy browser smoke fixture." }) });
        }
        return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      });
      await page.goto(`${base}/privacy`, { waitUntil: "domcontentloaded" });
      await page.getByText("Privacy policy browser smoke fixture.").waitFor({ timeout: 30000 });
      const result = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        policyVisible: document.body.innerText.includes("Privacy policy browser smoke fixture."),
      }));
      assert.equal(result.policyVisible, true, `${name}: policy should render`);
      assert.ok(result.scrollWidth <= result.width + 2, `${name}: unexpected horizontal overflow ${JSON.stringify(result)}`);
      console.log(`PASS ${name}: public route renders at ${width}x${height} without horizontal overflow`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
