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
        const old = body.id ? rows.find(row => row.id === body.id) : null;
        assert.ok(!body.id || old, size.name + ": edit must target a saved item");
        assert.ok(!old || old.revision === body.expectedRevision,
          size.name + ": optimistic save revision");
        const oldSegments = new Map((old?.draftSegments ?? []).map(x => [x.slot, x]));
        const segments = [
          ...body.keep.map(keep => {
            const previous = oldSegments.get(keep.previousSlot);
            assert.ok(previous, "server reuses only known media");
            return { ...previous, slot: keep.slot, partType: keep.partType,
              renderPlane: keep.renderPlane ?? "with_part" };
          }),
          ...body.images.map(img => ({
            slot: img.slot, partType: img.partType, imageUrl: mediaId(nextMedia++),
            fit, renderPlane: img.renderPlane ?? "with_part", canvasAligned: true,
            ...(body.category === "shoes" ? { shoesLayer: body.shoesLayer ?? "under" } : {}),
          })),
        ];
        assert.equal(new Set(segments.map(x => x.slot)).size, segments.length);
        assert.ok(segments.length <= 13);
        if (body.category === "face")
          assert.deepEqual(segments.map(x => x.slot).sort(),
            ["face_open_eyes", "face_closed_eyes", "face_mouth"].sort());
        const saved = {
          id: old?.id ?? "00000000-0000-4000-8000-" + String(nextId++).padStart(12, "0"),
          name: body.name, category: body.category, revision: old ? old.revision + 1 : 0,
          shopItemId: old?.shopItemId ?? mediaId(nextMedia++),
          universal: true, draftSegments: segments, publishedSegments: segments,
        };
        rows = old ? rows.map(row => row.id === old.id ? saved : row) : [...rows, saved];
        return route.fulfill({ json: saved });
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
    await saveItem();
    assert.equal(rows.at(-1).universal, true);
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
    assert.equal(await page.getByTestId("avatar-save-clothing-item").isEnabled(), true);
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
    assert.equal(await page.locator('[data-clothing-slot="piece_2"]').evaluate(el => getComputedStyle(el).zIndex), "-5");
    await saveItem();
    assert.deepEqual(rows.at(-1).draftSegments.map(x => x.partType), ["head", "head"]);
    assert.equal(rows.at(-1).draftSegments[1].renderPlane, "behind_character");

    await newItem("Boots", "shoes");
    await addPart("left_foot"); await addPart("right_foot");
    await page.getByTestId("avatar-shoes-over-pants").click();
    await saveItem();
    assert.ok(rows.at(-1).draftSegments.every(x => x.shoesLayer === "over"));

    // Editing preserves media through previousSlot and cannot create duplicates.
    await page.getByTestId("avatar-clothing-view").getByRole("button", { name: /Three Part Blouse/ }).click();
    await page.getByTestId("avatar-new-clothing-name").fill("Blouse Updated");
    await saveItem();
    assert.equal(writes.at(-1).keep.length, 3);
    assert.equal(writes.at(-1).images.length, 0);
    assert.equal(rows.length, 4);

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
