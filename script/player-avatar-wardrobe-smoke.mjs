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
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={qc}><PlayerAvatarPage userId="wardrobe-fixture-user" /></QueryClientProvider>);',
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
  item("back", "free-back", ["top"], { free: true, universal: true }),
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
      created: false, revision: null, skinTone: null,
      base: { id: "base-1", name: "Fem", publishedAt: new Date().toISOString(), parts: rig },
      availableBases: [
        { id: "base-1", name: "Fem", publishedAt: new Date().toISOString(), parts: rig },
        { id: "base-2", name: "Masc", publishedAt: new Date().toISOString(), parts: rig },
      ],
      ownedClothing: owned, equipped: [], unavailableEquipmentSlots: [],
    };
    await page.route("**/api/player-avatar**", route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.pathname === "/api/player-avatar" && method === "GET") return route.fulfill({ json: avatar });
      if (url.pathname === "/api/player-avatar/create" && method === "POST") {
        const body = route.request().postDataJSON();
        assert.equal(body.baseId, "base-2", name + ": first save uses chosen Masc body");
        assert.equal(body.skinTone, "#d39a71", name + ": first save includes selected skin color");
        writes.push({ method, kind: "create", body });
        avatar = { ...avatar, created: true, revision: 0, skinTone: body.skinTone,
          base: avatar.availableBases.find(entry => entry.id === body.baseId) };
        return route.fulfill({ json: avatar });
      }
      if (url.pathname === "/api/player-avatar/base" && method === "PATCH") {
        const body = route.request().postDataJSON();
        assert.equal(body.expectedRevision, avatar.revision, name + ": body change is revision-checked");
        writes.push({ method, kind: "change-body", body });
        avatar = {
          ...avatar, revision: avatar.revision + 1, skinTone: body.skinTone,
          base: avatar.availableBases.find(entry => entry.id === body.baseId),
          equipped: body.clearClothing
            ? [] : body.baseId !== avatar.base.id
              ? avatar.equipped.filter(entry =>
                  owned.find(item => item.inventoryId === entry.inventoryId)?.universal)
              : avatar.equipped,
        };
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
    assert.equal(await page.locator('[data-testid^="avatar-category-"]').count(), 8,
      name + ": eight circular categories");
    const categoriesFit = await page.locator('[data-testid^="avatar-category-"]').evaluateAll(elements =>
      elements.every(el => {
        const r = el.getBoundingClientRect();
        return r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= 0 && r.width >= 44;
      }));
    assert.ok(categoriesFit, name + ": all category buttons are on screen and touchable");
    assert.equal(await page.locator('[data-testid^="avatar-category-"] img').count(), 8,
      name + ": every wardrobe button displays uploaded icon art");
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid^="avatar-category-"] img')]
        .every(image => image.complete && image.naturalWidth > 0));
    const iconFit = await page.locator('[data-testid^="avatar-category-"]').evaluateAll(buttons =>
      buttons.every(button => {
        const icon = button.querySelector("img");
        if (!icon || !icon.getAttribute("src")?.startsWith("data:image/webp;base64,")) return false;
        const circle = button.getBoundingClientRect(), art = icon.getBoundingClientRect();
        return art.width > 30 && art.width <= circle.width
          && art.height <= circle.height
          && !!button.getAttribute("aria-label");
      }));
    assert.ok(iconFit, name + ": optimized transparent artwork fits all eight circles");
    assert.equal(await page.locator(".player-avatar-page__header h1").count(), 0,
      name + ": no oversized header text");

    assert.equal(await page.getByTestId("avatar-body-selector").count(), 1,
      name + ": completed Fem/Masc choices visible");
    await page.getByTestId("avatar-choose-masc").tap();
    assert.equal(await page.getByTestId("avatar-choose-masc").getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByTestId("avatar-skin-tone-picker").count(), 0,
      name + ": skin picker starts closed");
    assert.equal(await page.getByTestId("avatar-clothing-category-panel").count(), 0,
      name + ": clothing categories start closed");
    await page.getByTestId("avatar-category-back").tap();
    await page.getByTestId("avatar-clothing-category-panel").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("avatar-clothing-free-back").count(), 1,
      name + ": universally free back clothing is available before creation");
    await page.getByTestId("avatar-clothing-free-back").tap();
    assert.equal(await page.locator('[data-clothing-part="top"]').count(), 1,
      name + ": a free piece previews on an unsaved character");
    await page.getByTestId("avatar-choose-fem").tap();
    assert.equal(await page.locator('[data-clothing-part="top"]').count(), 1,
      name + ": a draft clothing preview survives switching bodies");
    await page.getByTestId("avatar-choose-masc").tap();
    await page.getByTestId("avatar-category-back").tap();
    assert.equal(await page.getByTestId("avatar-clothing-category-panel").count(), 0,
      name + ": tapping the active clothing category closes it");
    await page.getByTestId("avatar-skin-picker-toggle").tap();
    await page.getByTestId("avatar-skin-tone-picker").waitFor({ state: "visible" });
    await page.getByTestId("avatar-skin-warm").tap();
    assert.equal(await page.locator('[data-testid="avatar-skin-tint"]').count(), 8,
      name + ": color preview tints the eight body layers");
    await page.getByTestId("avatar-category-head").tap();
    assert.equal(await page.getByTestId("avatar-skin-tone-picker").count(), 0,
      name + ": opening clothing hides skin colors");
    await page.getByTestId("avatar-create-button").tap();
    await page.getByTestId("avatar-save-confirmation").waitFor({ state: "visible" });
    assert.equal(await page.getByRole("dialog", { name: "Character Saved" }).count(), 1,
      name + ": themed save popup is accessible");
    assert.equal(await page.getByTestId("avatar-clothing-category-panel").count(), 0,
      name + ": saving closes clothing");
    assert.equal(await page.getByTestId("avatar-skin-tone-picker").count(), 0,
      name + ": saving closes skin picker");
    await page.getByTestId("avatar-save-confirmation-close").tap();
    assert.equal(writes[0].kind, "create", name + ": save is explicit");
    await page.getByTestId("avatar-category-head").tap();
    await page.getByTestId("avatar-owned-inventory").waitFor({ state: "visible" });
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
    const equippedBeforeColor = avatar.equipped.map(entry => entry.inventoryId).sort();
    await page.getByTestId("avatar-skin-picker-toggle").tap();
    await page.getByTestId("avatar-skin-rich").tap();
    await page.getByTestId("avatar-save-body-choice").tap();
    // Saving closes the color palette; assert the confirmed server state instead.
    assert.equal(avatar.skinTone, "#42291f", name + ": skin color persisted");
    await page.getByTestId("avatar-save-confirmation").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("avatar-skin-tone-picker").count(), 0,
      name + ": appearance save closes the picker");
    await page.getByTestId("avatar-save-confirmation-close").tap();
    assert.deepEqual(avatar.equipped.map(entry => entry.inventoryId).sort(), equippedBeforeColor,
      name + ": skin-only save never unequips clothing");
    await page.getByTestId("avatar-category-face").tap();
    await page.getByTestId("avatar-clothing-face").tap();
    await page.getByTestId("avatar-choose-fem").tap();
    assert.equal(await page.getByTestId("avatar-clothing-face").getAttribute("aria-pressed"), "true",
      name + ": selected face does not reset during Fem/Masc switch");
    assert.ok(await page.locator('[data-clothing-part="head"]').count() >= 1);
    await page.getByTestId("avatar-body-change").waitFor({ state: "visible" });
    assert.equal(avatar.base.id, "base-2", name + ": choosing a body only previews, not saves");
    await page.getByTestId("avatar-save-body-choice").tap();
    await page.waitForFunction(() => document.querySelector('[data-testid="avatar-choose-fem"]')?.getAttribute("aria-pressed") === "true");
    assert.equal(avatar.base.id, "base-1", name + ": saved body changes without losing clothing inventory");
    await page.getByTestId("avatar-save-confirmation").waitFor({state:"visible"});
    await page.getByTestId("avatar-save-confirmation-close").tap();
    assert.equal(avatar.ownedClothing.length, owned.length);
    const wornBeforeReset = avatar.equipped.length;
    assert.ok(wornBeforeReset > 0);
    const writesBeforeReset = writes.length;
    const showcaseRect = await page.getByTestId("avatar-character-viewer").boundingBox();
    await page.getByTestId("avatar-reset-character").tap();
    assert.equal(writes.length, writesBeforeReset,
      name + ": reset is preview-only until Save Appearance");
    assert.equal(await page.locator('[data-clothing-key]').count(), 0,
      name + ": reset shows only the bare base");
    assert.equal(await page.locator('[data-character-part]').count(), 8);
    await page.getByTestId("avatar-save-body-choice").tap();
    await page.getByTestId("avatar-save-confirmation").waitFor({state:"visible"});
    assert.equal(writes.at(-1).body.clearClothing, true,
      name + ": reset clears equipped items atomically");
    assert.deepEqual(avatar.equipped, []);
    assert.equal(avatar.ownedClothing.length, owned.length,
      name + ": reset never deletes player inventory");
    await page.getByTestId("avatar-save-confirmation-close").tap();
    await page.getByTestId("avatar-category-head").tap();
    const details = page.getByTestId("avatar-scrollable-details");
    await details.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const finalRect = await page.getByTestId("avatar-character-viewer").boundingBox();
    assert.ok(Math.abs(finalRect.y - showcaseRect.y) < 2,
      name + ": preview never moves when clothing list scrolls");
    assert.deepEqual(errors, [], name + ": no runtime page errors");
    console.log("PASS " + name + ": 08C first-save, owned shelf, previews, eight slots, shared head art, pants and remove");
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
