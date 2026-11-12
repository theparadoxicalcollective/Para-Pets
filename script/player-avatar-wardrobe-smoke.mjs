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
  universal: ["head", "hair", "face", "back", "accessories"].includes(category),
  segments: partTypes.map(partType => ({ partType, imageUrl: art, fit, renderPlane: "with_part" })),
  ...overrides,
});
const owned = [
  item("head", "hat", ["head"]),
  item("head", "hat2", ["head"]),
  item("head", "hat3", ["head"]),
  item("head", "hat4", ["head"]),
  item("head", "hat5", ["head"]),
  item("hair", "hair", ["head"], {
    // Legacy hairstyle: two independent pieces, without the admin color flag.
    colorPickerEnabled: false,
    segments: [
      { slot: "hair_front", partType: "head", imageUrl: art, fit,
        renderPlane: "with_part", canvasAligned: true },
      { slot: "hair_back", partType: "head", imageUrl: art, fit,
        renderPlane: "behind_character", canvasAligned: true },
    ],
  }),
  item("face", "face", ["head"]),
  item("bottom", "pants", ["left_leg", "right_leg"]),
  item("top", "listed-top", ["top"], { isListed: true, compatible: false }),
  item("top", "plain-top", ["top"], { universal: true, colorPickerEnabled: true,
    segments: [{ partType: "top", slot: "piece_1", canvasAligned: true,
      imageUrl: art, fit, renderPlane: "with_part" }] }),
  item("bottom", "canvas-pants", ["top"], { universal: true,
    segments: [{ partType: "top", slot: "piece_1", canvasAligned: true,
      imageUrl: art, fit, renderPlane: "with_part" }] }),
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
      created: false, revision: null, skinTone: null, topTucked: false,
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
        assert.deepEqual(Object.keys(body.outfit).sort(), ["back", "bottom", "face", "top"],
          name + ": initial save includes the three required categories and chosen optional Back");
        assert.equal(body.outfit.top.inventoryId, "plain-top");
        assert.equal(body.outfit.bottom.inventoryId, "canvas-pants");
        assert.equal(body.outfit.face.inventoryId, "face");
        writes.push({ method, kind: "create", body });
        avatar = { ...avatar, created: true, revision: 0, skinTone: body.skinTone,
          topTucked: body.topTucked,
          base: avatar.availableBases.find(entry => entry.id === body.baseId),
          equipped: Object.entries(body.outfit).map(([category, chosen]) => {
            const garment = owned.find(entry => entry.inventoryId === chosen.inventoryId);
            return { category, inventoryId: chosen.inventoryId,
              shopItemId: garment.shopItemId, name: garment.name,
              imageUrl: garment.imageUrl, segments: garment.segments,
              colorTint: chosen.colorTint ?? null };
          }) };
        return route.fulfill({ json: avatar });
      }
      if (url.pathname === "/api/player-avatar/character" && method === "PUT") {
        const body = route.request().postDataJSON();
        assert.equal(body.expectedRevision, avatar.revision,
          name + ": one full-character save uses the latest revision");
        assert.deepEqual(Object.keys(body.outfit).sort(),
          ["accessories", "back", "bottom", "face", "hair", "head", "shoes", "top"].sort(),
          name + ": full save includes exactly eight explicit slots");
        const next = Object.entries(body.outfit).flatMap(([category, chosen]) => {
          if (!chosen) return [];
          const garment = owned.find(entry => entry.inventoryId === chosen.inventoryId);
          assert.ok(garment && garment.category === category &&
            !garment.isListed && garment.quantity > 0,
            name + ": full save only equips eligible owned items");
          return [{
            category, inventoryId: chosen.inventoryId,
            shopItemId: garment.shopItemId, name: garment.name,
            imageUrl: garment.imageUrl, segments: garment.segments,
            colorTint: chosen.colorTint ?? null,
          }];
        });
        writes.push({ method, kind: "save-character", body });
        avatar = {
          ...avatar, revision: avatar.revision + 1, skinTone: body.skinTone,
          topTucked: body.topTucked,
          base: avatar.availableBases.find(entry => entry.id === body.baseId),
          equipped: next,
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
    await page.getByTestId("avatar-category-top").tap();
    assert.equal(await page.getByTestId("avatar-top-tuck").isChecked(), false,
      name + ": untucked is the default");
    assert.equal(await page.locator(".player-avatar-page__tuck-check svg").count(), 0,
      name + ": untucked toggle is visibly empty");
    await page.getByTestId("avatar-top-tuck").check();
    assert.equal(await page.getByTestId("avatar-top-tuck").isChecked(), true,
      name + ": new character can choose tuck before first save");
    assert.equal(await page.locator(".player-avatar-page__tuck-check svg").count(), 1,
      name + ": a gold checked mark is visible when tucked");
    await page.getByTestId("avatar-category-head").tap();
    assert.equal(await page.getByTestId("avatar-skin-tone-picker").count(), 0,
      name + ": opening clothing hides skin colors");
    assert.equal(await page.getByTestId("avatar-create-button").isDisabled(), true,
      name + ": first save blocked until Top, Bottoms and Face are selected");
    await page.getByTestId("avatar-category-top").tap();
    await page.getByTestId("avatar-clothing-plain-top").tap();
    assert.equal(await page.getByTestId("avatar-clothing-color-controls").count(), 0,
      name + ": ordinary Tops do not offer a clothing color picker");
    assert.equal(await page.getByTestId("avatar-create-button").isDisabled(), true,
      name + ": only selecting Top is not enough");
    await page.getByTestId("avatar-category-bottom").tap();
    await page.getByTestId("avatar-clothing-canvas-pants").tap();
    assert.equal(await page.getByTestId("avatar-create-button").isDisabled(), true,
      name + ": Face remains required");
    await page.getByTestId("avatar-category-face").tap();
    await page.getByTestId("avatar-clothing-face").tap();
    assert.equal(await page.getByTestId("avatar-create-button").isEnabled(), true,
      name + ": three required categories unlock character creation");
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
    assert.equal(writes[0].body.topTucked, true,
      name + ": first-save tuck preference persisted");
    await page.getByTestId("avatar-category-head").tap();
    await page.getByTestId("avatar-owned-inventory").waitFor({ state: "visible" });
    const shelfFitsOrScrolls = await page.getByTestId("avatar-owned-inventory").evaluate(el => {
      if (el.scrollWidth > el.clientWidth + 1) {
        el.scrollLeft = el.scrollWidth;
        return el.scrollLeft > 0;
      }
      // Compact thumbnails can all fit on tablets. Verify that none are clipped.
      const area = el.getBoundingClientRect();
      return [...el.querySelectorAll("button")].every(button =>
        button.getBoundingClientRect().right <= area.right + 1);
    });
    assert.equal(shelfFitsOrScrolls, true,
      name + ": compact clothing tray fits or scrolls without clipping");

    const initialOutfitCount = avatar.equipped.length;
    assert.equal(initialOutfitCount, 4, name + ": initial required outfit and Back persisted");
    const editStartWrites = writes.length;
    const footer = page.getByTestId("avatar-save-character-button");
    await footer.waitFor({state:"visible"});
    const footerBounds = await footer.boundingBox();
    assert.ok(footerBounds && footerBounds.bottom <= height + 1,
      name + ": Save Character stays visible above the phone bottom");

    // Trying items is reversible and local. Even body, tuck and hair color
    // edits must not send independent API mutations.
    await page.getByTestId("avatar-clothing-hat").tap();
    assert.equal(avatar.equipped.length, initialOutfitCount,
      name + ": tapping Hat only changes the on-screen preview");
    assert.equal(await page.locator('[data-clothing-part="head"]').count(), 2,
      name + ": pending Hat and the saved Face render together");
    await page.getByTestId("avatar-category-hair").tap();
    await page.getByTestId("avatar-clothing-hair").tap();
    await page.getByTestId("avatar-clothing-color-controls").waitFor({state:"visible"});
    await page.getByTestId("avatar-clothing-custom-color").evaluate(el => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, "#7744bb");
      el.dispatchEvent(new Event("input", {bubbles: true}));
      el.dispatchEvent(new Event("change", {bubbles: true}));
    });
    await page.waitForFunction(() =>
      document.querySelectorAll('[data-clothing-key^="hair:"] [data-testid="avatar-clothing-tint"]').length === 2);
    assert.equal(await page.locator('[data-clothing-key^="hair:"] [data-testid="avatar-clothing-tint"]').count(), 2,
      name + ": front and back hair share a live tint preview");
    await page.getByTestId("avatar-category-bottom").tap();
    await page.getByTestId("avatar-clothing-pants").tap();
    await page.getByTestId("avatar-unequip-button").tap();
    assert.equal(await page.locator('[data-clothing-part="left_leg"]').count(), 0,
      name + ": removing pending Bottoms immediately changes the preview");
    await page.getByTestId("avatar-clothing-canvas-pants").tap();
    await page.getByTestId("avatar-category-top").tap();
    assert.equal(await page.getByTestId("avatar-clothing-listed-top").isDisabled(),true,
      name + ": listed Tops cannot be selected");
    await page.getByTestId("avatar-top-tuck").uncheck();
    assert.equal(await page.locator(".player-avatar-page__tuck-check svg").count(),0,
      name + ": unchecked Tuck is visually empty");
    await page.getByTestId("avatar-top-tuck").check();
    assert.equal(await page.locator(".player-avatar-page__tuck-check svg").count(),1,
      name + ": checked Tuck has a visible gold checkmark");

    await page.getByTestId("avatar-skin-picker-toggle").tap();
    await page.getByTestId("avatar-skin-rich").tap();
    const skinBlend = await page.locator('[data-testid="avatar-skin-tint"]').first()
      .evaluate(el => ({mode:getComputedStyle(el).mixBlendMode,
        opacity:getComputedStyle(el).opacity}));
    assert.equal(skinBlend.mode,"color",name + ": skin color preserves painted shading");
    assert.ok(Number(skinBlend.opacity) <= .8,
      name + ": skin overlay is intentionally softer");
    await page.getByTestId("avatar-choose-fem").tap();
    assert.equal(avatar.base.id,"base-2",
      name + ": switching Fem/Masc never saves an intermediate appearance");
    await page.getByTestId("avatar-category-hair").tap();
    assert.equal(await page.getByTestId("avatar-clothing-hair").getAttribute("aria-pressed"),"true",
      name + ": selected hair remains usable when switching body types");
    assert.equal(writes.length,editStartWrites,
      name + ": body, tone, clothing, hair and Tuck are all preview-only");

    await footer.tap();
    await page.waitForFunction(() => document.querySelector('[data-testid="avatar-choose-fem"]')
      ?.getAttribute("aria-pressed")==="true" &&
      !document.querySelector('[data-testid="avatar-clothing-category-panel"]'));
    assert.equal(writes.length,editStartWrites+1,
      name + ": exactly one full-character transaction");
    const saved = writes.at(-1);
    assert.equal(saved.kind,"save-character");
    assert.equal(saved.body.baseId,"base-1");
    assert.equal(saved.body.skinTone,"#42291f");
    assert.equal(saved.body.topTucked,true);
    assert.equal(saved.body.outfit.hair.colorTint,"#7744bb");
    assert.equal(saved.body.outfit.head.inventoryId,"hat");
    assert.equal(saved.body.outfit.bottom.inventoryId,"canvas-pants");
    assert.equal(avatar.base.id,"base-1",name + ": Fem body was committed");
    assert.equal(avatar.equipped.find(entry=>entry.category==="hair")?.colorTint,"#7744bb",
      name + ": hair color persisted with full outfit");
    assert.equal(avatar.ownedClothing.length,owned.length,
      name + ": saving never deletes owned inventory");

    // Reset should remain local until Save Character, then clear *only*
    // equipped links while leaving all owned clothing available.
    const wornBeforeReset=avatar.equipped.length;
    assert.ok(wornBeforeReset>0);
    const writesBeforeReset=writes.length;
    const showcaseRect=await page.getByTestId("avatar-character-viewer").boundingBox();
    await page.getByTestId("avatar-reset-character").tap();
    assert.equal(writes.length,writesBeforeReset,name + ": reset does not write");
    assert.equal(await page.locator('[data-clothing-key]').count(),0,
      name + ": reset previews bare body");
    await footer.tap();
    await page.waitForFunction(() => document.querySelectorAll('[data-clothing-key]').length===0 &&
      !document.querySelector('[data-testid="avatar-clothing-category-panel"]'));
    assert.equal(writes.length,writesBeforeReset+1);
    assert.deepEqual(Object.values(writes.at(-1).body.outfit),Array(8).fill(null),
      name + ": reset commits all eight empty slots atomically");
    assert.deepEqual(avatar.equipped,[]);
    assert.equal(avatar.ownedClothing.length,owned.length);
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
