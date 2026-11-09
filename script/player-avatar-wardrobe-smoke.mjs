import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Exercise the REAL 08C player page against isolated account/avatar fixtures.
// No Railway connection, live game inventory or test-account mutation.
const moduleId = "/__player-avatar-wardrobe-fixture.tsx";
const fixture = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import { QueryClient, QueryClientProvider } from "@tanstack/react-query";',
  'import PlayerAvatarPage from "@/pages/PlayerAvatarPage";',
  'import "@/index.css";',
  'const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={qc}><PlayerAvatarPage /></QueryClientProvider>);',
].join("\n");
const server = await createServer({
  server: { host: "127.0.0.1", port: 4197, strictPort: true },
  plugins: [{
    name: "avatar-08c-fixture",
    resolveId: id => id === moduleId ? id : null,
    load: id => id === moduleId ? fixture : null,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.headers.accept?.includes("text/html")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
          '<div id="game-stage" data-coordinate-owner="viewport" style="position:fixed;inset:0">' +
          '<div id="root" style="position:absolute;inset:0"></div></div>' +
          '<script type="module" src="' + moduleId + '"></script></body></html>'));
      });
    },
  }],
});
const art = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><ellipse cx="70" cy="70" rx="48" ry="60" fill="#e4c474"/></svg>',
).toString("base64");
const fit = { xPct: 50, yPct: 50, widthPct: 100, pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 50 };
const part = (partType, index) => ({
  partType, imageUrl: art, ...fit, widthPct: 28, xPct: 50, yPct: 25 + index * 6, zIndex: index + 10,
});
const rig = ["head", "top", "left_arm", "right_arm", "left_leg", "right_leg", "left_foot", "right_foot"].map(part);
const item = (category, inventoryId, partTypes, overrides = {}) => ({
  category, inventoryId, shopItemId: "shop-" + inventoryId,
  name: inventoryId, imageUrl: art, quantity: 1, isListed: false, compatible: true,
  segments: partTypes.map(partType => ({ partType, imageUrl: art, fit, renderPlane: "with_part" })),
  ...overrides,
});
const owned = [
  item("head", "hat", ["head"]),
  item("head", "hat2", ["head"]),
  item("head", "hat3", ["head"]),
  item("head", "hat4", ["head"]),
  item("head", "hat5", ["head"]),
  item("hair", "hair", ["head"]),
  item("face", "face", ["head"]),
  item("bottom", "pants", ["left_leg", "right_leg"]),
  item("top", "listed-top", ["top"], { isListed: true, compatible: false }),
];
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [["compact phone", 320, 700], ["phone", 390, 844], ["tablet", 834, 1194]]) {
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    let avatar = {
      created: false, revision: null,
      base: { id: "base-1", name: "Forest Keeper", publishedAt: new Date().toISOString(), parts: rig },
      ownedClothing: owned, equipped: [], unavailableEquipmentSlots: [],
    };
    await page.route("**/api/player-avatar**", route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.pathname === "/api/player-avatar" && method === "GET") return route.fulfill({ json: avatar });
      if (url.pathname === "/api/player-avatar/create" && method === "POST") {
        const body = route.request().postDataJSON();
        assert.equal(body.baseId, "base-1", name + ": first save uses published base");
        writes.push({ method, kind: "create", body });
        avatar = { ...avatar, created: true, revision: 0 };
        return route.fulfill({ json: avatar });
      }
      if (url.pathname.startsWith("/api/player-avatar/equipment/") && method === "PUT") {
        const category = url.pathname.split("/").at(-1);
        const body = route.request().postDataJSON();
        assert.equal(body.expectedRevision, avatar.revision, name + ": equipment uses latest confirmed revision");
        writes.push({ method, kind: category, body });
        const replacement = body.inventoryId ? owned.find(entry => entry.inventoryId === body.inventoryId) : null;
        assert.ok(!replacement || (replacement.category === category && replacement.compatible && !replacement.isListed));
        avatar = {
          ...avatar, revision: avatar.revision + 1,
          equipped: [
            ...avatar.equipped.filter(entry => entry.category !== category),
            ...(replacement ? [{
              category, inventoryId: replacement.inventoryId, shopItemId: replacement.shopItemId,
              name: replacement.name, imageUrl: replacement.imageUrl, segments: replacement.segments,
            }] : []),
          ],
        };
        return route.fulfill({ json: avatar });
      }
      return route.fulfill({ status: 404, json: { message: "Unknown fixture route" } });
    });

    await page.goto("http://127.0.0.1:4197/avatar-wardrobe-fixture", { waitUntil: "commit" });
    await page.getByTestId("avatar-character-viewer").waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-testid^="avatar-category-"]').count(), 7,
      name + ": seven circular categories");
    const categoriesFit = await page.locator('[data-testid^="avatar-category-"]').evaluateAll(elements =>
      elements.every(el => {
        const r = el.getBoundingClientRect();
        return r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= 0 && r.width >= 44;
      }));
    assert.ok(categoriesFit, name + ": all category buttons are on screen and touchable");

    await page.getByTestId("avatar-create-button").tap();
    await page.getByTestId("avatar-owned-inventory").waitFor({ state: "visible" });
    assert.equal(writes[0].kind, "create", name + ": save is explicit");
    const overflow = await page.getByTestId("avatar-owned-inventory").evaluate(el => el.scrollWidth > el.clientWidth);
    assert.equal(overflow, true, name + ": owned clothing tray scrolls horizontally");

    await page.getByTestId("avatar-clothing-hat").tap();
    assert.equal(avatar.equipped.length, 0, name + ": preview does not save outfit");
    assert.equal(await page.locator('[data-clothing-part="head"]').count(), 1);
    await page.getByTestId("avatar-equip-button").tap();
    await page.waitForFunction(() => !!document.querySelector(".player-avatar-page__category--head .player-avatar-page__equipped-dot"));
    assert.equal(avatar.equipped.length, 1, name + ": head item saved");
    assert.equal(writes.at(-1).body.inventoryId, "hat");

    await page.getByTestId("avatar-category-hair").tap();
    await page.getByTestId("avatar-clothing-hair").tap();
    await page.getByTestId("avatar-equip-button").tap();
    await page.waitForFunction(() => !!document.querySelector(".player-avatar-page__category--hair .player-avatar-page__equipped-dot"));
    await page.getByTestId("avatar-category-face").tap();
    await page.getByTestId("avatar-clothing-face").tap();
    await page.getByTestId("avatar-equip-button").tap();
    await page.waitForFunction(() => !!document.querySelector(".player-avatar-page__category--face .player-avatar-page__equipped-dot"));
    assert.equal(await page.locator('[data-clothing-part="head"]').count(), 3,
      name + ": head, hair and face use one head anchor without clobbering");
    const keys = await page.locator('[data-clothing-part="head"]').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute("data-clothing-key")));
    assert.equal(new Set(keys).size, 3, name + ": layered garments have stable unique IDs");

    await page.getByTestId("avatar-category-bottom").tap();
    await page.getByTestId("avatar-clothing-pants").tap();
    assert.equal(await page.locator('[data-clothing-part="left_leg"]').count(), 1);
    assert.equal(await page.locator('[data-clothing-part="right_leg"]').count(), 1);
    await page.getByTestId("avatar-equip-button").tap();
    await page.waitForFunction(() => !!document.querySelector(".player-avatar-page__category--bottom .player-avatar-page__equipped-dot"));
    await page.getByTestId("avatar-unequip-button").tap();
    await page.waitForFunction(() => !document.querySelector(".player-avatar-page__category--bottom .player-avatar-page__equipped-dot"));
    assert.equal(avatar.equipped.some(entry => entry.category === "bottom"), false,
      name + ": remove unlinks only selected category");

    await page.getByTestId("avatar-category-top").tap();
    assert.equal(await page.getByTestId("avatar-clothing-listed-top").isDisabled(), true,
      name + ": listed clothing cannot be equipped");
    await page.getByTestId("avatar-category-shoes").tap();
    await page.getByTestId("avatar-wardrobe-empty").waitFor({ state: "visible" });
    assert.deepEqual(errors, [], name + ": no runtime page errors");
    console.log("PASS " + name + ": 08C first-save, owned shelf, previews, seven slots, shared head art, pants and remove");
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
