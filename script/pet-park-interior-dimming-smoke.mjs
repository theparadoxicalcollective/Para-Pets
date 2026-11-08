import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Isolated Pet Park admin editor test: no Railway or real park/player writes.
const moduleId = "/__pet-park-interior-dimming-fixture.tsx";
const fixture = "import React from \"react\";\nimport { createRoot } from \"react-dom/client\";\nimport { QueryClient, QueryClientProvider } from \"@tanstack/react-query\";\nimport { TooltipProvider } from \"@/components/ui/tooltip\";\nimport PetParkBuildingDetails from \"@/components/PetParkBuildingDetails\";\nimport \"@/index.css\";\nconst art = \"data:image/svg+xml;base64,\" + btoa('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"700\" height=\"1000\"><rect width=\"700\" height=\"1000\" fill=\"#aa8e60\"/></svg>');\nconst building = { id:\"cottage\",name:\"Fixture Cottage\",imageUrl:art,interiorImageUrl:art,nightInteriorImageUrl:art,maxPets:20,interiorDarkness:35,interiorEffects:[] };\nconst client = new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});\ncreateRoot(document.getElementById(\"root\")).render(<QueryClientProvider client={client}><TooltipProvider><PetParkBuildingDetails building={building} initialShowEffectChoices onUpdated={()=>{}} onClose={()=>{}} /></TooltipProvider></QueryClientProvider>);";
const server = await createServer({
  server: { host: "127.0.0.1", port: 4197, strictPort: true },
  plugins: [{
    name: "park-interior-dimming-fixture",
    resolveId(id) { return id === moduleId ? id : null; },
    load(id) { return id === moduleId ? fixture : null; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.headers.accept?.includes("text/html")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="game-stage" style="position:absolute;inset:0"><div id="root"></div></div><script type="module" src="' + moduleId + '"></script></body></html>'));
      });
    },
  }],
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [["phone", 390, 844], ["tablet", 834, 1194]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const writes = [], errors = [];
    let savedDay = 35;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname === "/api/admin/pet-park/buildings/cottage" && req.method() === "PATCH") {
        const body = req.postDataJSON();
        writes.push(body);
        if (body.interiorDarkness !== undefined) savedDay = body.interiorDarkness;
        // Keep a slow write so a transient server response cannot reset preview.
        await new Promise(resolve => setTimeout(resolve, 180));
        return route.fulfill({ json: {
          id: "cottage", name: "Fixture Cottage", maxPets: 20, isShop: false,
          interiorDarkness: savedDay, nightInteriorImageUrl: art, interiorImageUrl: art, interiorEffects: [],
        } });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto("http://127.0.0.1:4197/fixture", { waitUntil: "commit", timeout: 30_000 });
    const slider = page.getByTestId("slider-park-interior-darkness");
    await slider.waitFor({ state: "visible" });
    assert.equal(await slider.inputValue(), "35", name + ": initial darkness matches saved value");
    const mask = page.getByTestId("pet-park-interior-room").getByTestId("home-interior-darkness-layer");
    assert.equal(await mask.evaluate(element => element.tagName.toLowerCase()), "svg",
      name + ": no-light editor starts with the stable SVG mask");
    assert.equal(await page.getByTestId("slider-park-interior-night-darkness").count(), 0,
      name + ": old nighttime darkness slider has been removed");
    const nightImage = page.getByTestId("pet-park-night-interior-image");
    await nightImage.waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Preview night interior lighting" }).click();
    assert.equal(await nightImage.evaluate(el => el.style.display), "block",
      name + ": night preview switches to the alternate artwork");
    assert.equal(await mask.locator('rect[fill="black"]').evaluate(el => Number(el.style.fillOpacity)), .35,
      name + ": night uses the same 35% darkness mask");
    await page.getByRole("button", { name: "Preview day interior lighting" }).click();
    assert.equal(await nightImage.evaluate(el => el.style.display), "none",
      name + ": day preview restores the original image");
    await page.getByRole("button", { name: "Preview live interior lighting" }).click();
    const response = page.waitForResponse(r => r.url().endsWith("/buildings/cottage") && r.request().method() === "PATCH");
    await slider.focus();
    await slider.press("End");
    // The immediate preview must be correct even before a slow PATCH returns.
    assert.equal(await slider.inputValue(), "90", name + ": slider immediately previews full darkness");
    assert.equal(await mask.locator('rect[fill="black"]').evaluate(el => Number(el.style.fillOpacity)), .9,
      name + ": live background darkens to 90%, not a delayed or lighter version");
    await response;
    await page.getByRole("button", { name: "Add effect inside building" }).focus();
    assert.equal(await slider.inputValue(), "90", name + ": saved value never reverts to initial 35%");
    assert.equal(writes.filter(write => write.interiorDarkness !== undefined).length, 1,
      name + ": keyup plus blur must not duplicate the same darkness write");
    // Adding the first interior lamp must not switch rendering technology.
    await page.getByRole("button", { name: /^Lamp Light/ }).click();
    assert.equal(await mask.evaluate(el => el.tagName.toLowerCase()), "svg",
      name + ": adding the first lamp does not replace the darkness mask");
    assert.deepEqual(errors, [], name + ": no runtime errors");
    console.log("PASS " + name + ": instant interior dimming, single save, stable light masks");
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
