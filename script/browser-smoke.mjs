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
  // Chromium emulation is not a substitute for Android Chrome/WebView or iOS Safari
  // device testing. Explicit CSS viewport sizes protect small and large layouts.
  const androidUserAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  for (const { name, width, height, isMobile, hasTouch, deviceScaleFactor, userAgent } of [
    { name: "small Android phone", width: 360, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: androidUserAgent },
    { name: "large Android phone", width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625, userAgent: androidUserAgent },
    { name: "iPhone-sized phone", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { name: "Android-sized tablet", width: 800, height: 1280, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: androidUserAgent },
    { name: "tablet", width: 834, height: 1194, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch, deviceScaleFactor, ...(userAgent ? { userAgent } : {}) });
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
