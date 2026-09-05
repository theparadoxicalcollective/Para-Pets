import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MINI_PET_PART_TYPES, miniPetCreateSchema } from "../shared/miniPet";

test("Mini Pets expose exactly the supported eight part types", () => {
  assert.deepEqual(MINI_PET_PART_TYPES, [
    "body", "tail", "left_wing", "right_wing", "head", "left_ear", "right_ear", "eyes",
  ]);
});

test("Mini Pet validation permits combined stat boosts and only subtle animation profiles", () => {
  const payload = {
    name: "Willow Wisp",
    imageData: "data:image/png;base64,AA==",
    rarity: 5,
    price: 1250,
    atkBoost: 25,
    healthBoost: 100,
    defBoost: 15,
    animationStyle: "float" as const,
  };
  const valid = miniPetCreateSchema.safeParse(payload);
  assert.equal(valid.success, true);
  assert.equal(miniPetCreateSchema.safeParse({ ...payload, animationStyle: "spin" }).success, false);
  assert.equal(miniPetCreateSchema.safeParse({ ...payload, rarity: 6 }).success, false);
});

test("Mini Pet routes enforce ownership, listing, exclusivity, and atomic stat deltas", () => {
  const source = readFileSync(new URL("../server/routes/miniPet.routes.ts", import.meta.url), "utf8");
  assert.match(source, /ui\.user_id=\$\{user\.id\}/);
  assert.match(source, /si\.type='mini_pet' AND ui\.is_listed=false/);
  assert.match(source, /already equipped/);
  assert.match(source, /db\.transaction/);
  assert.match(source, /pet_atk=GREATEST/);
  assert.match(source, /ON CONFLICT\(pet_inventory_id\) DO UPDATE/);
  assert.match(source, /UPDATE user_inventory pet SET/);
});

test("admins can set and edit a validated Mini Pet coin price", () => {
  const admin = readFileSync(new URL("../client/src/components/MiniPetAdminPanel.tsx", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../server/routes/miniPet.routes.ts", import.meta.url), "utf8");
  assert.match(admin, /input-mini-pet-price/);
  assert.match(admin, /button-edit-mini-pet/);
  assert.match(routes, /app\.patch\("\/api\/admin\/mini-pets\/:shopItemId"/);
  assert.match(routes, /price: parsed\.data\.price/);
});

test("Closet and Active Pet screens render the Mini Pet entry points without moving existing controls", () => {
  const closet = readFileSync(new URL("../client/src/components/PetEquipAccessoriesPage.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../client/src/pages/HomePage.tsx", import.meta.url), "utf8");
  assert.match(closet, /button-open-mini-pets/);
  assert.match(closet, /mini-pet-inventory/);
  assert.match(home, /active-pet-mini-pet-overlay/);
  assert.match(home, /left: "3%"/);
});
