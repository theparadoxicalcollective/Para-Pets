import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real reorganized admin UI with isolated, disposable API fixtures.
// Verifies one save action, 12 independent slots, face requirements,
// Fem/Masc previews and reused media on edit. No Railway/database writes.
const fixtureId = "/__universal-clothing-fixture.tsx";
const fixture = [
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClientProvider} from "@tanstack/react-query";',
  'import {queryClient} from "@/lib/queryClient";',
  'import PlayerClothingAdminPanel from "@/components/PlayerClothingAdminPanel";',
  'import "@/index.css";',
  'queryClient.setDefaultOptions({queries:{...queryClient.getDefaultOptions().queries,retry:false,refetchOnWindowFocus:false}});',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={queryClient}>',
  '<PlayerClothingAdminPanel />',
  '</QueryClientProvider>);',
].join("\n");
const server = await createServer({
  server: { host: "127.0.0.1", port: 4299, strictPort: true },
  plugins: [{
    name: "universal-clothing-fixture",
    resolveId: id => id === fixtureId ? id : null,
    load: id => id === fixtureId ? fixture : null,
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.headers.accept?.includes("text/html")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>' +
          '<body style="margin:0;background:#0a1e14;color:#f3dfac"><div id="root" style="padding:12px"></div>' +
          '<script type="module" src="' + fixtureId + '"></script></body></html>'));
      });
    },
  }],
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64");
const partTypes = ["head", "top", "left_arm", "right_arm", "left_leg", "right_leg", "left_foot", "right_foot"];
const depth = { head: 80, top: 70, left_arm: 60, right_arm: 50, left_leg: 40, right_leg: 30, left_foot: 20, right_foot: 10 };
const mediaId = n => "/api/media/00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const sourceParts = partTypes.map((partType, i) => ({
  partType, imageUrl: mediaId(i + 1), xPct: 50, yPct: 50,
  widthPct: 100, pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: depth[partType],
}));
const bases = ["Fem", "Masc"].map((name, i) => ({
  id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
  name, publishedAt: null, publishedParts: null,
  updatedAt: "2026-11-11T04:00:00Z", draftParts: sourceParts,
}));
const fit = { xPct: 50, yPct: 50, widthPct: 100,
  pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 1 };
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const size of [
    { name: "compact phone", width: 320, height: 568 },
    { name: "phone", width: 390, height: 844 },
    { name: "tablet", width: 820, height: 1180 },
  ]) {
    let rows = [], nextId = 5, nextMedia = 50;
    const writes = [], errors = [];
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height }, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === "/api/admin/player-character/bases" && method === "GET")
        return route.fulfill({ json: bases });
      if (path === "/api/admin/player-character/clothing" && method === "GET")
        return route.fulfill({ json: rows });
      if (path === "/api/admin/player-character/clothing/item" && method === "POST") {
        const body = route.request().postDataJSON();
        writes.push(body);
        assert.ok(body.name);
        assert.ok(Number.isInteger(body.price) && body.price >= 0,
          size.name + ": all clothing has a whole-coin price");
        const old = body.id ? rows.find(row => row.id === body.id) : null;
        if (body.price > 0)
          assert.ok(body.shopImageData?.startsWith("data:image/png;base64,") || old?.shopImageUrl,
            size.name + ": priced item has independent shop art");
        assert.ok(!body.id || old, size.name + ": edit must target a saved item");
        assert.ok(!old || old.revision === body.expectedRevision,
          size.name + ": optimistic save revision");
        const universal = ["hair", "face", "back", "accessories"].includes(body.category);
        assert.equal(!!body.bodyVariants, !universal,
          size.name + ": only fitted clothing needs two upload sets");
        const fromParts = (partSet, source) => {
          const oldSegments = new Map(source.map(item => [item.slot, item]));
          const segments = [
            ...partSet.keep.map(keep => {
              const previous = oldSegments.get(keep.previousSlot);
              assert.ok(previous, "retained media must exist for this art set");
              return { ...previous, slot: keep.slot, partType: keep.partType,
                renderPlane: keep.renderPlane ?? "with_part" };
            }),
            ...partSet.images.map(img => ({
              slot: img.slot, partType: img.partType, imageUrl: mediaId(nextMedia++),
              fit, renderPlane: img.renderPlane ?? "with_part", canvasAligned: true,
              ...(body.category === "shoes" ? { shoesLayer: body.shoesLayer ?? "under" } : {}),
            })),
          ];
          assert.equal(new Set(segments.map(item => item.slot)).size, segments.length);
          assert.ok(segments.length > 0 && segments.length <= 13);
          if (body.category === "face")
            assert.deepEqual(segments.map(item => item.slot).sort(),
              ["face_open_eyes", "face_closed_eyes", "face_mouth"].sort());
          return segments;
        };
        const variants = body.bodyVariants ? {
          fem: fromParts(body.bodyVariants.fem,
            old?.draftBodyVariants?.fem ?? old?.draftSegments ?? []),
          masc: fromParts(body.bodyVariants.masc,
            old?.draftBodyVariants?.masc ?? old?.draftSegments ?? []),
        } : null;
        if (variants) assert.notEqual(variants.fem[0].imageUrl, variants.masc[0].imageUrl,
          size.name + ": body-specific versions use distinct media");
        const segments = variants?.fem ?? fromParts(body,
          old?.draftBodyVariants?.fem ?? old?.draftSegments ?? []);
        const saved = {
          id: old?.id ?? "00000000-0000-4000-8000-" + String(nextId++).padStart(12, "0"),
          name: body.name, category: body.category, price: body.price,
          shopImageUrl: body.shopImageData ? mediaId(nextMedia++) : old?.shopImageUrl ?? null,
          revision: old ? old.revision + 1 : 0,
          shopItemId: old?.shopItemId ?? mediaId(nextMedia++),
          universal: true, draftSegments: segments, publishedSegments: segments,
          draftBodyVariants: variants, publishedBodyVariants: variants,
        };
        rows = old ? rows.map(row => row.id === old.id ? saved : row) : [...rows, saved];
        return route.fulfill({ json: saved });
      }
      if (path.startsWith("/api/admin/player-character/clothing/item/") &&
          method === "DELETE") {
        const targetId = path.split("/").at(-1);
        const row = rows.find(item => item.id === targetId);
        assert.ok(row, "delete must target a saved design");
        assert.equal(route.request().postDataJSON().expectedRevision, row.revision);
        rows = rows.filter(item => item.id !== targetId);
        return route.fulfill({ json: { id: targetId, deleted: true } });
      }
      if (path.startsWith("/api/media/"))
        return route.fulfill({ body: png, contentType: "image/png" });
      if (path.startsWith("/api/")) return route.fulfill({ json: [] });
      return route.continue();
    });
    await page.goto("http://127.0.0.1:4299/admin", { waitUntil: "domcontentloaded" });
    await page.getByTestId("avatar-clothing-create-screen").waitFor({ state: "visible" });
    await page.getByTestId("avatar-clothing-preview-masc").click();
    assert.equal(await page.getByTestId("avatar-clothing-preview-masc").getAttribute("aria-pressed"), "true");
    await page.getByTestId("avatar-clothing-preview-fem").click();

    async function newItem(name, category) {
      await page.getByRole("tab", { name: "Create" }).click();
      await page.getByTestId("avatar-new-clothing-name").fill(name);
      await page.getByTestId("avatar-new-clothing-category").selectOption(category);
      await page.getByTestId("avatar-clothing-preview-fem").click();
    }
    async function showBody(kind) {
      await page.getByTestId("avatar-clothing-preview-" + kind).click();
      assert.equal(await page.getByTestId("avatar-clothing-preview-" + kind).getAttribute("aria-pressed"), "true");
    }
    async function addPart(anchor) {
      const before = await page.getByTestId("avatar-clothing-uploaded-parts").locator('[data-testid^="clothing-part-"]').count();
      await page.getByTestId("avatar-clothing-add-part").setInputFiles({
        name: "part.png", mimeType: "image/png", buffer: png,
      });
      const slot = "piece_" + (before + 1);
      await page.getByTestId("clothing-part-" + slot).waitFor({ state: "visible" });
      await page.getByTestId("avatar-clothing-attach-" + slot).selectOption(anchor);
      return slot;
    }
    async function saveItem() {
      const before = writes.length;
      const reply = page.waitForResponse(r =>
        r.url().endsWith("/api/admin/player-character/clothing/item") &&
        r.request().method() === "POST" && r.status() === 200);
      await page.getByTestId("avatar-save-clothing-item").click();
      await reply;
      await page.getByTestId("avatar-clothing-view").waitFor({ state: "visible" });
      assert.equal(writes.length, before + 1, size.name + ": single catalog save request");
    }

    await newItem("Three Part Blouse", "top");
    await addPart("top"); await addPart("left_arm"); await addPart("right_arm");
    assert.equal(await page.locator('[data-clothing-slot]').count(), 3);
    assert.equal(await page.getByTestId("avatar-clothing-uploaded-parts")
      .locator('[data-testid^="clothing-part-"]').count(), 3);
    assert.equal(await page.getByTestId("avatar-save-clothing-item").isDisabled(), true,
      size.name + ": Masc artwork required too");
    await showBody("masc");
    await addPart("top"); await addPart("left_arm"); await addPart("right_arm");
    assert.equal(await page.getByTestId("avatar-clothing-variant-masc-status").textContent(), "Masc: Complete");
    await showBody("fem");
    assert.equal(await page.getByTestId("avatar-clothing-uploaded-parts")
      .locator('[data-testid^="clothing-part-"]').count(), 3);
    await saveItem();
    assert.equal(rows.at(-1).universal, true);
    assert.equal(rows.at(-1).price, 0, size.name + ": free item auto-available");
    assert.deepEqual(rows.at(-1).draftSegments.map(x => x.partType), ["top", "left_arm", "right_arm"]);

    await newItem("Expressive Face", "face");
    assert.equal(await page.getByTestId("avatar-save-clothing-item").isDisabled(), true);
    for (const [index, slot] of ["face_open_eyes", "face_closed_eyes", "face_mouth"].entries()) {
      await page.getByTestId("avatar-clothing-upload-" + slot).setInputFiles({
        name: slot + ".png", mimeType: "image/png", buffer: png,
      });
      await page.getByTestId("clothing-part-" + slot).waitFor({ state: "visible" });
      if (index < 2) assert.equal(await page.getByTestId("avatar-save-clothing-item").isDisabled(), true);
    }
    assert.equal(await page.getByTestId("avatar-save-clothing-item").isEnabled(), true,
      size.name + ": one complete Face expression set is enough");
    assert.equal(await page.getByTestId("avatar-clothing-universal-artwork").count(), 1);
    await showBody("masc");
    assert.equal(await page.getByTestId("clothing-part-face_open_eyes").count(), 1,
      size.name + ": Masc preview uses universal Face image");
    await showBody("fem");
    const eyes = async () => page.evaluate(() => ({
      open: getComputedStyle(document.querySelector(".player-character-renderer__eyes-open")).opacity,
      closed: getComputedStyle(document.querySelector(".player-character-renderer__eyes-closed")).opacity,
    }));
    assert.deepEqual(await eyes(), { open: "1", closed: "0" });
    await page.getByRole("group", { name: "Face expression preview" })
      .getByRole("button", { name: "Closed Eyes", exact: true }).click();
    assert.deepEqual(await eyes(), { open: "0", closed: "1" });
    await page.getByRole("group", { name: "Face expression preview" })
      .getByRole("button", { name: "Open Eyes", exact: true }).click();
    await saveItem();

    await newItem("Two Hair Pieces", "hair");
    await addPart("head"); await addPart("head");
    await page.getByTestId("avatar-hair-layer-piece_2").selectOption("back");
    const hairBackDepth = Number(await page.locator('[data-clothing-slot="piece_2"]')
      .evaluate(el => getComputedStyle(el).zIndex));
    const hairBodyDepth = Number(await page.locator('[data-character-part="head"]').first()
      .evaluate(el => getComputedStyle(el).zIndex));
    assert.ok(hairBackDepth < hairBodyDepth,
      size.name + ": back hair must be behind the character, regardless of the numeric depth");
    await showBody("masc");
    assert.equal(await page.getByTestId("clothing-part-piece_2").count(), 1,
      size.name + ": Masc preview shares Hair pieces");
    await showBody("fem");
    await saveItem();
    assert.equal(rows.at(-1).draftBodyVariants, null,
      size.name + ": hair is saved as a single universal image set");
    assert.deepEqual(rows.at(-1).draftSegments.map(x => x.partType), ["head", "head"]);
    assert.equal(rows.at(-1).draftSegments[1].renderPlane, "behind_character");

    await newItem("Boots", "shoes");
    await addPart("left_foot"); await addPart("right_foot");
    await page.getByTestId("avatar-shoes-over-pants").click();
    await showBody("masc");
    await addPart("left_foot"); await addPart("right_foot");
    await showBody("fem");
    await saveItem();
    assert.ok(rows.at(-1).draftSegments.every(x => x.shoesLayer === "over"));

    await newItem("Royal Cape", "back");
    await addPart("top");
    await showBody("masc");
    assert.equal(await page.getByTestId("clothing-part-piece_1").count(), 1,
      size.name + ": Back accessory stays visible for Masc");
    await showBody("fem");
    await page.getByTestId("avatar-clothing-price").fill("350");
    assert.equal(await page.getByTestId("avatar-save-clothing-item").isDisabled(), true,
      size.name + ": paid item requires shop artwork");
    await page.getByTestId("avatar-clothing-shop-image-upload").setInputFiles({
      name: "cape-shop.png", mimeType: "image/png", buffer: png,
    });
    await page.getByRole("img", { name: "Shop item artwork preview" }).waitFor({ state: "visible" });
    await saveItem();
    assert.equal(rows.at(-1).price, 350);
    assert.ok(rows.at(-1).shopImageUrl);
    assert.notEqual(rows.at(-1).shopImageUrl, rows.at(-1).draftSegments[0].imageUrl,
      size.name + ": catalog image stays separate from equippable sprite");
    assert.equal(rows.at(-1).draftBodyVariants, null,
      size.name + ": back accessory uses one art set");
    await newItem("Pendant", "accessories");
    await addPart("top");
    assert.equal(await page.getByTestId("avatar-save-clothing-item").isEnabled(), true);
    await showBody("masc");
    assert.equal(await page.getByTestId("clothing-part-piece_1").count(), 1);
    await saveItem();
    assert.equal(rows.at(-1).draftBodyVariants, null,
      size.name + ": accessories use one art set");

    // Editing preserves media through previousSlot and cannot create duplicates.
    await page.getByTestId("avatar-clothing-view").getByRole("button", { name: /Three Part Blouse/ }).click();
    await page.getByTestId("avatar-new-clothing-name").fill("Blouse Updated");
    await saveItem();
    assert.equal(writes.at(-1).bodyVariants.fem.keep.length, 3);
    assert.equal(writes.at(-1).bodyVariants.masc.keep.length, 3);
    assert.equal(writes.at(-1).bodyVariants.fem.images.length, 0);
    assert.equal(writes.at(-1).bodyVariants.masc.images.length, 0);
    assert.equal(rows.length, 6);
    await page.getByTestId("avatar-clothing-view")
      .getByRole("button", { name: /Blouse Updated/ }).click();
    await page.getByTestId("avatar-delete-clothing-item").click();
    await page.getByTestId("avatar-delete-clothing-confirm-overlay").waitFor({ state: "visible" });
    await page.getByTestId("avatar-cancel-delete-clothing").click();
    assert.equal(rows.length, 6, size.name + ": cancel deletion leaves catalog unchanged");
    await page.getByTestId("avatar-delete-clothing-item").click();
    await page.getByTestId("avatar-confirm-delete-clothing").click();
    await page.getByTestId("avatar-clothing-view").waitFor({ state: "visible" });
    assert.equal(rows.length, 5, size.name + ": delete retires the selected item");
    assert.equal(await page.getByRole("button", { name: /Blouse Updated/ }).count(), 0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, size.name + ": clothing editor does not overflow the device viewport");
    assert.deepEqual(errors, [], size.name + ": no browser errors");
    console.log("PASS " + size.name + ": universal multi-part clothing, face, edit, previews, save item");
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
