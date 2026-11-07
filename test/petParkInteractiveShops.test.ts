import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultParkShopPlacement, validParkShopPlacements,
  withParkShopDefaults, PARK_SHOP_MAX_ITEMS,
} from "../shared/petParkShopPlacements";
const read = (path: string) => readFileSync(path, "utf8");

test("merchandise coordinates are image relative and safely bounded, not legacy phone pixels", () => {
  const ids = Array.from({ length: 9 }, (_, i) => "item-" + i);
  const placements = withParkShopDefaults(ids, []);
  assert.equal(placements.length, ids.length);
  assert.equal(placements[0].xPct, 0.5, "first stocked item is visible on a portrait mobile room");
  assert.ok(validParkShopPlacements(placements));
  assert.deepEqual(withParkShopDefaults(ids, [ { ...defaultParkShopPlacement(ids[0], 0), xPct: .71 } ])[0],
    { itemId: ids[0], xPct: .71, yPct: .38, size: 12, rotation: 0, flippedX: false, priceTagXPct: .72, priceTagYPct: .78 });
  assert.ok(!validParkShopPlacements([{ itemId: "one", xPct: -1, yPct: .5, size: 12 }]));
  assert.ok(!validParkShopPlacements([{ itemId: "one", xPct: .2, yPct: 1.01, size: 12 }]));
  assert.ok(!validParkShopPlacements([{ itemId: "one", xPct: .2, yPct: .5, size: 999 }]));
  assert.ok(!validParkShopPlacements([{ itemId: "one", xPct: .2, yPct: .5, size: NaN }]));
  assert.ok(!validParkShopPlacements(Array.from({ length: PARK_SHOP_MAX_ITEMS + 1 },
    (_, i) => defaultParkShopPlacement("item-" + i, i))));
  assert.ok(!validParkShopPlacements([defaultParkShopPlacement("one", 0), defaultParkShopPlacement("one", 1)]));
});

test("shop deposits never enter and switching a live building to shop keeps reward clocks", () => {
  const admin = read("server/routes/petParkAdmin.routes.ts");
  const player = read("server/routes/petParkPlayer.routes.ts");
  const migration = read("server/startup/migrations/ensurePetParkStorage.ts");
  assert.match(player, /!building \|\| !building\.interiorImageUrl \|\| building\.isShop/);
  assert.match(admin, /if \(updates\.isShop === true\) \{/);
  assert.match(admin, /buildingId: null, roomEffectId: null, showInPark: false/);
  assert.doesNotMatch(admin.slice(admin.indexOf("if (updates.isShop === true) {"),
    admin.indexOf("const [building] = await tx.update", admin.indexOf("if (updates.isShop === true) {"))),
    /checkpointAt|petParkRewardClaims|withdrawnAt: new Date/);
  assert.match(migration, /WHERE withdrawn_at IS NULL AND building_id IN/);
  assert.match(migration, /SELECT id FROM pet_park_buildings WHERE is_shop = true/);
});

test("park purchases can only buy displayed stock through existing atomic shop transaction", () => {
  const server = read("server/routes.ts");
  const admin = read("server/routes/petParkAdmin.routes.ts");
  const player = read("server/routes/petParkPlayer.routes.ts");
  const schema = read("shared/schema.ts");
  assert.match(server, /req\.params\.worldId === "pet-park"/);
  assert.match(server, /building\.shopItemIds\.includes\(itemId\)/);
  assert.match(server, /building\.interiorImageUrl/);
  assert.match(server, /viewer\?\.isAdmin/);
  assert.match(server, /purchaseInventoryItem\(/);
  assert.match(server, /shopItem\.type === "garden_fruit"/);
  assert.match(admin, /validParkShopPlacements\(body\.shopItemPlacements\)/);
  assert.match(admin, /currentIds\.includes\(item\.itemId\)/);
  assert.match(player, /placement: placementMap\.get\(id\) \?\? null/);
  assert.match(schema, /shopItemPlacements: jsonb\("shop_item_placements"\)/);
});

test("shop visual UI uses no extra camera, ensures tap-away closing and keeps player purchase separate from placement", () => {
  const view = read("client/src/components/PetParkShopShelf.tsx");
  const room = read("client/src/components/PetParkInteriorRoom.tsx");
  const page = read("client/src/pages/PetParkPage.tsx");
  assert.match(view, /imageWidth: number; imageHeight: number/);
  assert.match(view, /left: placement\.xPct \* imageWidth/);
  assert.match(view, /top: placement\.yPct \* imageHeight/);
  assert.match(view, /safeSetPointerCapture\(event\.currentTarget, event\.pointerId\)/);
  assert.match(view, /data-testid="pet-park-shop-purchase-dialog"/);
  assert.match(view, /PARA_PETS_COIN_IMAGE/);
  assert.match(view, /\/api\/shop\/pet-park\/buy\//);
  assert.match(view, /aria-label="Close purchase details"/);
  assert.match(view, /aria-label="Close shop item picker"/);
  assert.match(view, /!purchasing\.current && !buy\.isPending/);
  assert.match(view, /onSettled: \(\) => \{ purchasing\.current = false; \}/);
  assert.match(room, /\{typeof children === "function" \? children/);
  assert.match(page, /!popupRoom && !activeBuilding\.isShop && <div data-testid="pet-park-interior-slots"/);
  assert.match(page, /activeBuilding\.isShop && !fullPageRoom && <PetParkShopShelf/);
});
