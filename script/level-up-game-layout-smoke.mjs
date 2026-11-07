import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Actual Level Up component and pointer handlers. Uses isolated fixture data,
// never a real inventory, Railway instance or player account.
const moduleId = "/__level-up-layout-fixture.tsx";
const fixture = [
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClient,QueryClientProvider} from "@tanstack/react-query";',
  'import PetLevelUpPage from "@/components/PetLevelUpPage";',
  'import "@/index.css";',
  'const q=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});',
  'const png="data:image/svg+xml;base64,"+btoa(\'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="75" fill="#a8733a"/><path d="M85 70 L115 70" stroke="#fff" stroke-width="5"/></svg>\');',
  'const xp={inventoryId:"xp1",shopItemId:"xp",name:"XP Potion",type:"special",imageUrl:png,statBoostType:null,statBoostAmount:null,specialType:"level",specialAmount:1,quantity:2};',
  'const showItem=location.search.includes("items=1");',
  'const finite=location.search.includes("finite=1");',
  'window.__xpUsedCount=0;',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={q}>',
  '  <PetLevelUpPage deviceSurface petName="Grassland Cow" petInventoryId="cow-1" petImage={png}',
  '    petTemplateId={null} rarity={3} petLevel={8} petAtk={90} petDef={75} petHealth={1300}',
  '    itemsRemaining={finite?3:Infinity} items={showItem?[xp]:[]} isPending={false}',
  '    onUseItem={()=>{window.__xpUsedCount++;}} onSuccessAnimEnd={()=>{}}',
  '    onClose={()=>{document.getElementById("root").textContent="Closed Level Up";}}/>',
  ' </QueryClientProvider>);',
].join("\n");
const server = await createServer({ server: { host: "127.0.0.1", port: 4195, strictPort: true },
  plugins: [{
    name: "level-up-layout-fixture",
    resolveId: id => id === moduleId ? id : null,
    load: id => id === moduleId ? fixture : null,
    configureServer(server) { server.middlewares.use(async (req, res, next) => {
      if (!req.headers.accept?.includes("text/html")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await server.transformIndexHtml(req.url,
        '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
        '<div id="game-stage" data-coordinate-owner="viewport" style="position:fixed;inset:0">'+
        '<div id="root" style="position:absolute;inset:0;width:100%;height:100%"></div>'+
        '<div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div>'+
        '</div><script type="module" src="'+moduleId+'"></script></body></html>'));
    }); },
  }],
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const [label, width, height] of [
    ["iPhone", 390, 844], ["small Android", 360, 740],
    ["tablet", 834, 1194], ["small phone", 320, 568],
  ]) {
    const context = await browser.newContext({ viewport: { width, height },
      isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.setDefaultTimeout(20000);
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/pet-page-placement/levelUp")
        return route.fulfill({ json: { x: 0, y: 0, scale: 1 } });
      return route.fulfill({ json: {} });
    });
    await page.goto("http://127.0.0.1:4195/level-up", { waitUntil: "commit" });
    const layout = page.locator(".lupage");
    await layout.waitFor({ state: "visible" });
    const close = page.getByRole("button", { name: "Close Level Up" });
    const title = page.getByRole("heading", { name: "LEVEL UP" });
    const tray = page.locator(".lupage-tray");
    await close.waitFor({ state: "visible" });
    await title.waitFor({ state: "visible" });
    await tray.waitFor({ state: "visible" });
    assert.equal(await close.evaluate(el => el.parentElement.classList.contains("lupage")), true,
      label+": independent close button is outside the title");
    const headerStyle = await page.locator(".lupage-head").evaluate(el => {
      const style = getComputedStyle(el);
      return { border: style.borderTopWidth, background: style.backgroundImage };
    });
    assert.equal(headerStyle.border, "0px", label+": header has no long bordered panel");
    assert.equal(headerStyle.background, "none", label+": forest shows through title");
    const closeBox = await close.boundingBox();
    assert.ok(closeBox.x + closeBox.width > width - 38 && closeBox.y >= 0,
      label+": close sits independently at upper right");
    assert.equal(await page.getByText(/No limit|Tap your pet to view|Drag an XP item onto Grassland Cow to gain levels/).count(), 0,
      label+": redundant text bands are gone");

    const petZone = page.getByTestId("zone-levelup-pet-drop");
    const stars = page.getByTestId("levelup-active-pet-style-stars");
    const name = page.locator(".lupage-nameplate");
    const zoneBox = await petZone.boundingBox();
    const starsBox = await stars.boundingBox();
    const nameBox = await name.boundingBox();
    const starSize = await stars.locator("img").first().evaluate(img => img.getBoundingClientRect().width);
    assert.ok(Math.abs(starsBox.y - (zoneBox.y + zoneBox.height * .24)) < 2,
      label+": stars are anchored near the pet's top rather than floating above it");
    assert.ok(starSize >= 40 && starSize <= 63, label+": rarity stars are slightly larger");
    assert.ok(nameBox.y >= zoneBox.y + zoneBox.height + 12,
      label+": pet name and level sit lower than the pet zone");

    const trayBox = await tray.boundingBox();
    assert.ok(trayBox.width <= 344 && trayBox.height <= 115,
      label+": empty XP tray is compact, not a full-width text panel");
    assert.equal(await tray.getByText("No XP items in your bag").count(), 1);
    await petZone.click();
    await page.getByTestId("levelup-pet-stats-popover").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close pet stats" }).click();
    assert.equal(await page.getByTestId("levelup-pet-stats-popover").count(), 0,
      label+": pet statistics remain available even without instruction text");

    // Verify an actual usable XP item still responds to the original pointer
    // handlers after the layout is simplified.
    await page.goto("http://127.0.0.1:4195/level-up?items=1&finite=1", { waitUntil: "commit" });
    const item = page.getByTestId("item-levelup-xp1");
    await item.waitFor({ state: "visible" });
    await item.click();
    assert.equal(await page.evaluate(() => window.__xpUsedCount), 1,
      label+": tap uses the XP item exactly once");
    assert.equal(await page.getByText("3 uses left").count(), 1,
      label+": finite budgets stay inside the XP tray");
    assert.equal(await page.locator(".lupage-rule").count(), 0);
    await page.getByRole("button", { name: "Close Level Up" }).click();
    await page.getByText("Closed Level Up").waitFor({ state: "visible" });
    assert.deepEqual(errors, [], label+": no JavaScript exceptions");
    console.log("PASS "+label+": compact Level Up layout, stats, XP use and close");
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
