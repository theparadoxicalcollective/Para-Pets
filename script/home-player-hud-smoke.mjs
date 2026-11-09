import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Exercises the REAL 09 Home account HUD with isolated, disposable API fixtures.
// No Railway, production player account, pet inventory or combat state is changed.
const moduleId = "/__home-player-hud-fixture.tsx";
const fixture = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import { QueryClient, QueryClientProvider } from "@tanstack/react-query";',
  'import ViewportHudPortal from "@/components/ViewportHudPortal";',
  'import HomePlayerHud from "@/components/HomePlayerHud";',
  'import "@/index.css";',
  'const qc=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:0,refetchOnWindowFocus:false}}});',
  'const art="data:image/svg+xml;base64,"+btoa(\'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><ellipse cx="60" cy="60" rx="38" ry="45" fill="#ceb278"/></svg>\');',
  'const broken=new URLSearchParams(location.search).has("inventory-failed");',
  'const pets=[',
  '  {inventoryId:"pet-a",name:"First Companion",petNickname:"Flora",type:"pet",isHatched:true,isListed:false,imageUrl:art,hatchedImageUrl:art},',
  '  {inventoryId:"pet-b",name:"Second Companion",petNickname:"Bramble",type:"pet",isHatched:true,isListed:false,imageUrl:art,hatchedImageUrl:art},',
  '  {inventoryId:"pet-c",name:"Third Companion",petNickname:"Cedar",type:"pet",isHatched:true,isListed:false,imageUrl:art,hatchedImageUrl:art},',
  '  {inventoryId:"pet-egg",name:"Egg",petNickname:null,type:"pet",isHatched:false,isListed:false,imageUrl:art,hatchedImageUrl:null},',
  '  {inventoryId:"pet-listed",name:"Listed",petNickname:null,type:"pet",isHatched:true,isListed:true,imageUrl:art,hatchedImageUrl:art},',
  '];',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={qc}><ViewportHudPortal><HomePlayerHud userId="fixture-user" username="VeryLongPlayerNameThatShouldNotOverlapAnythingInTheHUD" inventory={broken?[]:pets} inventoryLoading={false} inventoryReady={!broken} inventoryError={broken}/></ViewportHudPortal></QueryClientProvider>);',
].join("\n");
const server = await createServer({
  server: { host: "127.0.0.1", port: 4198, strictPort: true },
  plugins: [{
    name: "home-player-hud-fixture",
    resolveId: id => id === moduleId ? id : null,
    load: id => id === moduleId ? fixture : null,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.headers.accept?.includes("text/html")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
          '<div id="game-stage" data-coordinate-owner="viewport" style="position:fixed;inset:0">' +
          '<div id="root" style="position:absolute;inset:0"></div>' +
          '<div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div></div>' +
          '<script type="module" src="' + moduleId + '"></script></body></html>'));
      });
    },
  }],
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [
    ["compact phone", 320, 700], ["phone", 390, 844], ["tablet", 834, 1194],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [], requests = [];
    let team = ["pet-a", "pet-b"], failNext = false;
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.route("**/api/player/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/player/progression") return route.fulfill({
        json: { level: 4, totalXp: 240, nextLevelTotalXp: null, xpToNextLevel: null },
      });
      if (path === "/api/player/pet-team" && route.request().method() === "GET") return route.fulfill({
        json: { petInventoryIds: team, attackPower: 400 },
      });
      if (path === "/api/player/pet-team" && route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        requests.push(body.petInventoryIds);
        if (failNext) {
          failNext = false;
          return route.fulfill({ status: 500, json: { message: "Temporary team save failure" } });
        }
        assert.ok(body.petInventoryIds.length <= 5);
        assert.equal(new Set(body.petInventoryIds).size, body.petInventoryIds.length);
        assert.ok(body.petInventoryIds.every(id => ["pet-a", "pet-b", "pet-c"].includes(id)));
        team = body.petInventoryIds;
        return route.fulfill({ json: { petInventoryIds: team, attackPower: 400 } });
      }
      return route.fulfill({ status: 404, json: { message: "Unknown fixture route" } });
    });
    await page.goto("http://127.0.0.1:4198/home-player-hud", { waitUntil: "commit" });
    const hud = page.getByTestId("home-player-hud");
    await hud.waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="home-player-level"]')?.textContent?.includes("LV 4"));
    assert.match(await page.getByTestId("home-player-total-xp").innerText(), /240 XP/);
    assert.equal(await page.getByTestId("home-player-empty-stars").locator("img").count(), 5);
    assert.equal(await page.locator('[data-testid^="home-player-team-slot-"]').count(), 5);
    const geometry = await hud.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, bottom: rect.bottom,
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        starOpacity: Number(getComputedStyle(el.querySelector(".home-player-hud__stars img")).opacity),
        nameEllipsis: getComputedStyle(el.querySelector(".home-player-hud__name")).textOverflow };
    });
    assert.ok(geometry.left >= -1 && geometry.right <= width + 1, name + ": no HUD horizontal overflow");
    assert.ok(geometry.bottom <= height && geometry.scrollWidth <= width + 2, name + ": no clipped HUD");
    assert.equal(geometry.nameEllipsis, "ellipsis", name + ": long username safely truncates");
    assert.ok(geometry.starOpacity < 0.4, name + ": player stars start empty");

    await page.getByTestId("home-player-team-slot-1").tap();
    const dialog = page.getByRole("dialog", { name: "Choose companion for slot 1" });
    await dialog.waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("home-player-picker-pet-pet-b").isDisabled(), true,
      name + ": cannot assign a companion that occupies another slot");
    assert.equal(await page.getByTestId("home-player-picker-pet-pet-listed").count(), 0,
      name + ": marketplace listings cannot join team");
    assert.equal(await page.getByTestId("home-player-picker-pet-pet-egg").count(), 0,
      name + ": unhatched eggs cannot join team");
    const replace = page.waitForResponse(r => r.url().endsWith("/api/player/pet-team") && r.request().method() === "PUT");
    await page.getByTestId("home-player-picker-pet-pet-c").tap();
    await replace;
    await page.waitForFunction(() => document.querySelector('[data-testid="home-player-team-slot-1"]')?.getAttribute("aria-label")?.includes("Cedar"));
    assert.deepEqual(team, ["pet-c", "pet-b"], name + ": replaces slot one without changing slot two");

    await page.getByTestId("home-player-team-slot-2").tap();
    const removed = page.waitForResponse(r => r.url().endsWith("/api/player/pet-team") && r.request().method() === "PUT");
    await page.getByTestId("home-player-team-remove").tap();
    await removed;
    assert.deepEqual(team, ["pet-c"], name + ": removal persists and preserves order");
    await page.waitForFunction(() => !document.querySelector('[data-testid="home-player-team-slot-2"]')?.hasAttribute("disabled"));

    await page.getByTestId("home-player-team-slot-2").tap();
    await page.getByRole("dialog", { name: "Choose companion for slot 2" }).waitFor({ state: "visible" });
    const append = page.waitForResponse(r => r.url().endsWith("/api/player/pet-team") && r.request().method() === "PUT");
    await page.getByTestId("home-player-picker-pet-pet-b").tap();
    await append;
    assert.deepEqual(team, ["pet-c", "pet-b"], name + ": a new member appends to one shared team");
    await page.waitForFunction(() => !document.querySelector('[data-testid="home-player-team-slot-2"]')?.hasAttribute("disabled"));

    if (name === "phone") {
      failNext = true;
      await page.getByTestId("home-player-team-slot-2").tap();
      const fails = page.waitForResponse(r => r.url().endsWith("/api/player/pet-team") && r.status() === 500);
      await page.getByTestId("home-player-team-remove").tap();
      await fails;
      await hud.getByRole("alert").waitFor({ state: "visible" });
      assert.deepEqual(team, ["pet-c", "pet-b"], "failed save leaves server-confirmed roster intact");
    }
    if (name === "phone") {
      const writesBefore = requests.length;
      await page.goto("http://127.0.0.1:4198/home-player-hud?inventory-failed=1",
        { waitUntil: "commit" });
      await page.getByRole("alert").waitFor({ state: "visible" });
      assert.match(await page.getByRole("alert").innerText(), /Pet inventory could not load/);
      assert.equal(await page.locator('[data-testid^="home-player-team-slot-"]:not([disabled])').count(), 0,
        name + ": no team edits are allowed after an inventory load failure");
      assert.equal(requests.length, writesBefore, name + ": failed inventory cannot erase saved roster");
    }
    assert.deepEqual(errors, [], name + ": no browser runtime exceptions");
    console.log("PASS " + name + ": five visible slots, server XP, roster editing and safe mobile HUD");
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
