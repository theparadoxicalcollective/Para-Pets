import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerHouseBundleRoutes } from "../server/routes/houseBundle.routes";
import { houseBundleGardenPlots, houseBundles } from "../shared/schema";
import {
  clampHomeGardenPosition, clampHomeGardenSize,
  validHomeGardenCoordinate, validHomeGardenSize,
  HOME_GARDEN_PLOT_DEFAULT_SIZE, HOME_GARDEN_PLOT_MAX_PER_BUNDLE,
} from "../shared/homeBundleGardenPlots";

const read = (name: string) => readFileSync(name, "utf8");

test("Home Garden Plot placement is scene-relative and has safe phone/tablet limits", () => {
  for (const n of [0.02, 0.5, 0.98]) assert.equal(validHomeGardenCoordinate(n), true);
  for (const n of [-0.01, 0, 0.99, 1, Infinity, NaN, "0.4"]) assert.equal(validHomeGardenCoordinate(n), false);
  assert.equal(clampHomeGardenPosition(-0.1), 0.02);
  assert.equal(clampHomeGardenPosition(0.5), 0.5);
  assert.equal(clampHomeGardenPosition(1.1), 0.98);
  assert.equal(validHomeGardenSize(60), true);
  assert.equal(validHomeGardenSize(500), true);
  assert.equal(validHomeGardenSize(120.5), false);
  assert.equal(validHomeGardenSize(501), false);
  assert.equal(clampHomeGardenSize(40), 60);
  assert.equal(clampHomeGardenSize(520), 500);
  assert.equal(HOME_GARDEN_PLOT_DEFAULT_SIZE, 180);
  assert.equal(HOME_GARDEN_PLOT_MAX_PER_BUNDLE, 80);
});

test("Garden Plots persist separately from included inventory entitlements", () => {
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/runEssentialBoot.ts");
  assert.match(schema, /export const houseBundleGardenPlots = pgTable\("house_bundle_garden_plots"/);
  assert.match(schema, /bundleId: varchar\("bundle_id"\)\.notNull\(\)\.references\(\(\) => houseBundles.id, \{ onDelete: "cascade" \}\)/);
  assert.match(schema, /index\("house_bundle_garden_plots_bundle_idx"\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS house_bundle_garden_plots/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS house_bundle_garden_plots_bundle_idx/);
  assert.match(migration, /CHECK \(x_pct >= 0 AND x_pct <= 1\)/);
  assert.match(migration, /CHECK \(size >= 60 AND size <= 500\)/);
  const route = read("server/routes/houseBundle.routes.ts");
  assert.match(route, /app\.post\("\/api\/admin\/house-bundles\/:bundleId\/garden-plots", isAdmin/);
  assert.match(route, /app\.get\("\/api\/admin\/house-bundles\/:bundleId\/garden-plots", isAdmin/);
  assert.match(route, /app\.patch\("\/api\/admin\/house-bundle-garden-plots\/:id", isAdmin/);
  assert.match(route, /app\.delete\("\/api\/admin\/house-bundle-garden-plots\/:id", isAdmin/);
  assert.match(route, /validHomeGardenCoordinate\(xPct\)/);
  assert.match(route, /validHomeGardenSize\(size\)/);
  assert.match(route, /HOME_GARDEN_PLOT_MAX_PER_BUNDLE/);
  // Player fetches only the saved scene tiles, not the inventory-grant table.
  assert.match(route, /app\.get\("\/api\/house-bundles\/:bundleId\/garden-plots"/);
  const gardenRoute = route.split("Outdoor Garden Plots")[1]?.split("Home Bundle included Decor")[0] ?? "";
  assert.doesNotMatch(gardenRoute, /userInventory|userHouseBundleItemGrants|gardenActionReceipts|petParkSceneItems/);
});

test("Outdoor Home editor has dedicated Garden Plot controls with pointer-safe dragging", () => {
  const scene = read("client/src/components/HomeBundleSection.tsx");
  const editor = read("client/src/components/HomeBundleGardenPlotsControl.tsx");
  assert.match(scene, /<HomeBundleGardenPlotsControl bundleId=\{bundle.id\}/);
  assert.match(editor, /data-testid="button-add-bundle-garden-plot"/);
  assert.match(editor, /data-testid="confirm-add-home-garden-plot"/);
  assert.match(editor, /data-testid="home-bundle-garden-plot-controls"/);
  assert.match(editor, /data-testid=\{\x60home-bundle-garden-plot-\$\{plot.id\}\x60\}/);
  assert.match(editor, /<PetParkTerrainDetail type="garden_plot"/);
  assert.match(editor, /safeSetPointerCapture\(event.currentTarget, event.pointerId\)/);
  assert.match(editor, /onPointerMove=\{onMove\} onPointerUp=\{onUp\}/);
  assert.match(editor, /clampHomeGardenPosition/);
  assert.match(editor, /positionFor\(event.clientX, event.clientY\);\s*dragRef.current = null/);
  for (const label of ["Decrease Garden Plot size", "Increase Garden Plot size", "Remove Garden Plot"])
    assert.ok(editor.includes(label));
  assert.match(editor, /api\/admin\/house-bundle-garden-plots/);
  assert.match(editor, /zIndex: chosen \? 24 : 3/);
});

test("Home plot art is shown under normal buildings without altering the garden economy", () => {
  const home = read("client/src/pages/PetHousePage.tsx");
  const art = read("client/src/components/PetParkTerrainDetail.tsx");
  assert.match(home, /data-testid="home-garden-plot-layer"/);
  assert.match(home, /homeBundleGardenPlots\.map\(plot =>/);
  assert.match(home, /<PetParkTerrainDetail type="garden_plot"/);
  assert.match(home, /style=\{\{ zIndex: 3 \}\}/);
  assert.match(home, /\{\/\* Buildings layer \*\/\}/);
  assert.match(home, /queryKey: \["\/api\/house-bundles", activeBundle\?\.id, "garden-plots"\]/);
  assert.match(home, /!openInterior && imgWidth > 0 && homeBundleGardenPlots\.length > 0/);
  assert.match(art, /type === "garden_plot"/);
  assert.match(art, /polygon\(50% 0%, 100% 50%, 50% 100%, 0% 50%\)/);
  assert.doesNotMatch(home, /\/api\/pet-park\/garden\/plots.*homeBundleGardenPlots/);
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  assert.match(visitor, /data-testid="visitor-home-garden-plot-layer"/);
  assert.match(visitor, /homeBundleGardenPlots\.map\(plot =>/);
  assert.match(visitor, /<PetParkTerrainDetail type="garden_plot"/);
  assert.match(visitor, /style=\{\{ zIndex: 3 \}\}/);
});

test("admin can create, reposition and remove a plot without touching inventory", async () => {
  const handlers = new Map<string, { auth: unknown; handler: (...args: any[]) => Promise<unknown> }>();
  const admin = () => {};
  const app: any = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    app[method] = (url: string, ...args: any[]) => {
      handlers.set(method.toUpperCase() + " " + url, {
        auth: args.length > 1 ? args[0] : null,
        handler: args.at(-1),
      });
    };
  }
  const plots: any[] = [];
  let inventoryWrites = 0;
  const db: any = {
    select() {
      return { from(table: unknown) {
        return { where() {
          return {
            orderBy: async () => table === houseBundleGardenPlots ? [...plots] : [],
            limit: async () => table === houseBundles ? [{ id: "bundle-1" }] : [],
          };
        } };
      } };
    },
    insert(table: unknown) {
      assert.equal(table, houseBundleGardenPlots);
      return { values(data: any) {
        return { returning: async () => {
          const plot = { id: "plot-" + (plots.length + 1), ...data };
          plots.push(plot);
          return [plot];
        } };
      } };
    },
    update(table: unknown) {
      assert.equal(table, houseBundleGardenPlots);
      return { set(patch: any) {
        return { where() {
          return { returning: async () => {
            if (!plots.length) return [];
            Object.assign(plots[0], patch);
            return [plots[0]];
          } };
        } };
      } };
    },
    delete(table: unknown) {
      if (table !== houseBundleGardenPlots) inventoryWrites++;
      assert.equal(table, houseBundleGardenPlots);
      return { where() {
        return { returning: async () => plots.splice(0, plots.length).map(({ id }) => ({ id })) };
      } };
    },
  };
  registerHouseBundleRoutes(app, {
    db, storage: {} as any, isAuthenticated: (() => {}) as any, isAdmin: admin as any,
    processWorldImage: async () => "",
  });
  const invoke = async (method: string, url: string, body: any = {}) => {
    const route = handlers.get(method + " " + url);
    assert.ok(route, method + " " + url);
    if (url.startsWith("/api/admin/")) assert.equal(route.auth, admin);
    const res: any = {
      statusCode: 200, body: null,
      status(code: number) { this.statusCode = code; return this; },
      json(value: any) { this.body = value; return this; },
    };
    await route.handler({ params: { bundleId: "bundle-1", id: plots[0]?.id }, body }, res);
    return res;
  };
  const addUrl = "/api/admin/house-bundles/:bundleId/garden-plots";
  assert.equal((await invoke("POST", addUrl, { xPct: -1, yPct: .5, size: 180 })).statusCode, 400);
  assert.equal(plots.length, 0, "invalid placement never inserts a row");
  const created = await invoke("POST", addUrl, { xPct: .3, yPct: .6, size: 180 });
  assert.equal(created.statusCode, 201);
  assert.deepEqual([created.body.xPct, created.body.yPct, created.body.size], [.3,.6,180]);
  const changed = await invoke("PATCH", "/api/admin/house-bundle-garden-plots/:id", {
    xPct: .5, yPct: .8, size: 220,
  });
  assert.equal(changed.statusCode, 200);
  assert.deepEqual([changed.body.xPct, changed.body.yPct, changed.body.size], [.5,.8,220]);
  const owner = await invoke("GET", "/api/house-bundles/:bundleId/garden-plots");
  assert.equal(owner.body.length, 1);
  const removed = await invoke("DELETE", "/api/admin/house-bundle-garden-plots/:id");
  assert.equal(removed.statusCode, 200);
  assert.deepEqual(plots, []);
  assert.equal(inventoryWrites, 0);
});
