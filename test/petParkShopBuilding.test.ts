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
  assert.match(details, /mutation\.mutate\(\{ isShop: next \}\)/);
  assert.match(details, /ON · Shop enabled/);
  assert.match(details, /OFF · Regular building/);
  assert.match(park, /<PetParkShopShelf/);
  assert.match(park, /buildingId=\{activeBuilding\.id\}/);
  assert.match(park, /activeBuilding\.isShop && !fullPageRoom/);
  assert.doesNotMatch(park, /390\s*[x×]\s*844/);
});

test("shop merchandise is positioned on the room artwork with compact filtered picker and checkout", () => {
  const component = get("client/src/components/PetParkShopShelf.tsx");
  assert.match(component, /data-testid="pet-park-shop-merchandise"/);
  assert.match(component, /data-testid=\{\`pet-park-shop-item-\$\{item\.id\}\`\}/);
  assert.match(component, /safeSetPointerCapture/);
  assert.match(component, /changeStock\(ids, layout\.map/);
  assert.match(component, /aria-label="Search shop items"/);
  assert.match(component, /aria-label="Filter shop items"/);
  assert.match(component, /aria-label="Choose a shop item"/);
  for (const category of ["All", "Pets", "Items", "Seeds", "Tools"]) {
    assert.match(component, new RegExp('name: "' + category + '"'));
  }
  assert.match(component, /shopItemIds: next\.ids, shopItemPlacements: next\.layout/);
  assert.match(component, /enabled: canEditPark && showPicker/);
  assert.match(component, /staleTime: 30_000/);
  assert.match(component, /data-testid="pet-park-shop-purchase-dialog"/);
  assert.match(component, /PARA_PETS_COIN_IMAGE/);
  assert.match(component, /\/api\/shop\/pet-park\/buy\//);
  assert.match(component, /\{ buildingId, quantity \}/);
  assert.match(component, /buy\.mutate\(\{ item: selectedBuy, quantity: purchaseQuantity \}\)/);
  assert.match(component, /totalPurchasePrice = \(selectedBuy\?\.price \?\? 0\) \* purchaseQuantity/);
  assert.match(component, /selectedBuy\?\.type === "pet" \|\| selectedBaseKind \? 1 : 20/);
  assert.match(component, /viewer\.coins < totalPurchasePrice/);
  assert.match(component, /data-testid="pet-park-shop-quantity-plus"/);
  assert.match(component, /data-testid="pet-park-shop-quantity-minus"/);
  assert.match(component, /data-testid="pet-park-shop-total-price"/);
  assert.match(component, /data-testid="pet-park-shop-purchase-confirmation"/);
  assert.doesNotMatch(component, /toast\(\{ title: "Purchase complete"/,
    "routine shop successes must not create the large centered notification");
  assert.match(component, /role="status" aria-live="polite"/);
  assert.match(component, /qc\.invalidateQueries\(\{ queryKey: \["\/api\/inventory"\] \}\)/);
  assert.doesNotMatch(component, /\/api\/pet-park\/buildings\/\:id\/buy/, "never introduce a second insecure coin checkout path");
});

test("shop purchases reuse the authenticated inventory ledger and reject unstocked merchandise", () => {
  const routes = get("server/routes.ts");
  const player = get("server/routes/petParkPlayer.routes.ts");
  const admin = get("server/routes/petParkAdmin.routes.ts");
  const migration = get("server/startup/migrations/ensurePetParkStorage.ts");
  const schema = get("shared/schema.ts");
  const page = get("client/src/pages/PetParkPage.tsx");
  assert.match(routes, /req\.params\.worldId === "pet-park"/);
  assert.match(routes, /!building\.shopItemIds\.includes\(itemId\)/);
  assert.match(routes, /purchaseInventoryItem\(/);
  assert.match(routes, /sql\`\$\{usersTable\.coins\} >= \$\{cost\}\`/);
  assert.match(routes, /shopItem\.type === "garden_fruit"/);
  assert.match(player, /building\.isShop\) return \{ status: 422 as const \}/);
  assert.match(admin, /updates\.isShop === true/);
  assert.match(admin, /await tx\.update\(petParkDeposits\)\.set/);
  assert.match(page, /!popupRoom && !activeBuilding\.isShop && <div data-testid="pet-park-interior-slots"/);
  assert.match(page, /activeBuilding\.isShop && !fullPageRoom && <PetParkShopShelf/);
  assert.match(schema, /shopItemPlacements: jsonb\("shop_item_placements"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS shop_item_placements jsonb NOT NULL DEFAULT/);
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


test("Park building interiors reuse home translucent darkness with active light cutouts", () => {
  const schema = get("shared/schema.ts");
  const migration = get("server/startup/migrations/ensurePetParkStorage.ts");
  const routes = get("server/routes/petParkAdmin.routes.ts");
  const room = get("client/src/components/PetParkInteriorRoom.tsx");
  const page = get("client/src/pages/PetParkPage.tsx");
  const editor = get("client/src/components/PetParkBuildingDetails.tsx");
  const home = get("client/src/components/HomeInteriorEffect.tsx");

  assert.match(schema, /interiorDarkness: integer\("interior_darkness"\)\.notNull\(\)\.default\(35\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS interior_darkness integer NOT NULL DEFAULT 35/);
  assert.match(routes, /Number\.isInteger\(body\.interiorDarkness\)/);
  assert.match(routes, /updates\.interiorDarkness = body\.interiorDarkness/);
  assert.match(routes, /interiorDarkness = 35/);

  assert.match(room, /import \{ HomeInteriorDarknessLayer, HomeInteriorEffectsLayer, HomeInteriorExitSparkle \}/);
  assert.match(room, /<HomeInteriorDarknessLayer darkness=\{darkness\}/);
  assert.match(room, /offEffectIds=\{offEffectIds\} panX=\{0\} imgWidth=\{imageWidth\}/);
  assert.match(room, /sceneHeight=\{dimensions\.height\} sunlightStrength=\{sunlightStrength\}[\s\S]*?zIndex=\{2\}/);
  const background = room.indexOf('<img src={imageUrl}');
  const dark = room.indexOf('<HomeInteriorDarknessLayer');
  const effects = room.indexOf('<HomeInteriorEffectsLayer');
  const pets = room.indexOf('{typeof children === "function"');
  assert.ok(background >= 0 && background < dark && dark < effects && effects < pets,
    "darkness must only shade the background, not lamps, water, portals or pets");
  assert.match(home, /data-testid="home-interior-darkness-layer"/);
  assert.match(home, /isHouseInteriorLightEffectType\(effect\.type\)/);
  assert.match(page, /darkness=\{activeBuilding\.interiorDarkness \?\? 35\}/);

  assert.match(editor, /data-testid="slider-park-interior-darkness"/);
  assert.match(editor, /max=\{HOUSE_INTERIOR_DARKNESS_MAX\}/);
  assert.match(editor, /mutation\.mutate\(\{ interiorDarkness: value \}/);
  assert.match(editor, /<PetParkInteriorRoom key=\{imagePreview\}[\s\S]*?darkness=\{darkness\}/);
  assert.doesNotMatch(page, /390\s*[x×]\s*844/);
});
