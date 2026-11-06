import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { petParkBuildings } from "../shared/schema";
const get = (path: string) => readFileSync(path, "utf8");

test("Pet Park building shop is additive, owner-safe and does not alter existing placement", () => {
  const schema = get("shared/schema.ts");
  const migration = get("server/startup/migrations/ensurePetParkStorage.ts");
  const adminRoutes = get("server/routes/petParkAdmin.routes.ts");
  const playerRoutes = get("server/routes/petParkPlayer.routes.ts");
  assert.ok(petParkBuildings);
  assert.match(schema, /isShop: boolean\("is_shop"\)\.notNull\(\)\.default\(false\)/);
  assert.match(schema, /shopItemIds: jsonb\("shop_item_ids"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_shop boolean NOT NULL DEFAULT false/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS shop_item_ids jsonb NOT NULL DEFAULT/);
  assert.match(adminRoutes, /name: name\.trim\(\), imageUrl, interiorImageUrl, xPct, yPct, size, flipped, layer, maxPets, isShop, shopItemIds: \[\]/);
  assert.match(adminRoutes, /app\.get\("\/api\/admin\/pet-park\/shop-catalog", isAdmin/);
  assert.match(adminRoutes, /ilike\(shopItems\.name/);
  assert.match(adminRoutes, /limit\(100\)/);
  assert.match(adminRoutes, /updates\.shopItemIds = ids/);
  assert.match(adminRoutes, /new Set\(ids\)\.size !== ids\.length/);
  assert.match(adminRoutes, /inArray\(shopItems\.id, ids\)/);
  assert.match(playerRoutes, /app\.get\("\/api\/pet-park\/buildings\/:id\/shop-items", isAuthenticated/);
  assert.match(playerRoutes, /if \(!allowed\) return res\.status\(403\)/);
  assert.match(playerRoutes, /if \(!building\?\.isShop\) return res\.status\(404\)/);
  assert.doesNotMatch(playerRoutes, /app\.post\("\/api\/pet-park\/buildings\/:id\/buy"/);
});

test("admin can size new buildings and mark older ones as shops, without rewriting scene stage", () => {
  const panel = get("client/src/components/PetParkAdminPanel.tsx");
  const details = get("client/src/components/PetParkBuildingDetails.tsx");
  const park = get("client/src/pages/PetParkPage.tsx");
  assert.match(panel, /const \[buildingSize, setBuildingSize\] = useState\(300\)/);
  assert.match(panel, /aria-label="Building starting size"/);
  assert.match(panel, /type="range"\s+min=\{120\}/);
  assert.match(panel, /size: buildingSize, isShop: buildingIsShop/);
  assert.match(panel, /aria-label="Is Shop building"/);
  assert.match(details, /aria-label="Is Shop building"/);
  assert.match(details, /mutation\.mutate\(\{ name: name\.trim\(\), maxPets, isShop \}\)/);
  assert.match(park, /<PetParkShopShelf buildingId=\{activeBuilding\.id\}/);
  assert.match(park, /activeBuilding\.isShop && !fullPageRoom/);
  assert.doesNotMatch(park, /390\s*[x×]\s*844/);
});

test("shop shelf uses existing item records, images and a compact catalog filter", () => {
  const component = get("client/src/components/PetParkShopShelf.tsx");
  assert.match(component, /data-testid="pet-park-shop-shelf"/);
  assert.match(component, /aria-label="Add shop item"/);
  assert.match(component, /aria-label="Search shop items"/);
  assert.match(component, /aria-label="Filter shop items"/);
  for (const category of ["All", "Pets", "Items", "Seeds", "Tools"]) {
    assert.match(component, new RegExp('name: "' + category + '"'));
  }
  assert.match(component, /item\.imageUrl \|\| item\.eggImageUrl \|\| item\.hatchedImageUrl/);
  assert.match(component, /disabled=\{itemIds\.includes\(item\.id\) \|\| save\.isPending\}/);
  assert.match(component, /itemIds\.filter\(current => current !== id\)/);
  assert.match(component, /shopItemIds: nextItemIds/);
  assert.match(component, /enabled: canEditPark && showPicker/);
  assert.match(component, /staleTime: 30_000/);
  assert.doesNotMatch(component, /api\/shop\/:worldId\/buy/, "don't bypass existing coin shop purchase validation");
});

test("stability fixes keep third-slot purchase state, bounded mobile picker, no pet foot shadows", () => {
  const page = get("client/src/pages/PetParkPage.tsx");
  const portrait = get("client/src/components/PetParkPetPortrait.tsx");
  const policy = get("server/petPark/slotPolicy.ts");
  assert.match(page, /if \(variables\.path === "\/api\/pet-park\/slots\/unlock"\)/);
  assert.match(page, /qc\.setQueryData<ParkScene>\(\["\/api\/pet-park\/scene"\]/);
  assert.match(page, /setActiveSlot\(null\)/);
  assert.match(page, /visiblePetChoices = matchingPets\.slice\(0, 24\)/);
  assert.match(page, /aria-label="Search pets to equip"/);
  assert.match(portrait, /loading="lazy" decoding="async"/);
  assert.match(page, /cameraFrame\.current = window\.requestAnimationFrame/);
  assert.match(page, /refetchInterval: selectedGardenPlotId \? 5000 : 30_000/);
  assert.doesNotMatch(page, /PetParkGroundShadow|pet-park-contact-shadow/);
  assert.match(policy, /requestedSlot === 2 \? PET_PARK_SECOND_SLOT_PRICE : PET_PARK_THIRD_SLOT_PRICE/);
});
