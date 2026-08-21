import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { SOUL_EXCHANGE_ESSENCE_BY_RARITY } from "../server/soulExchange";

const server = fs.readFileSync("server/soulExchange.ts", "utf8");
const client = fs.readFileSync("client/src/components/SoulExchangeOverlay.tsx", "utf8");

test("Soul Exchange has one authoritative rarity reward table", () => {
  assert.deepEqual(SOUL_EXCHANGE_ESSENCE_BY_RARITY, { 1: 50, 2: 125, 3: 300, 4: 750, 5: 1750 });
  assert.equal(Object.values(SOUL_EXCHANGE_ESSENCE_BY_RARITY).reduce((a, b) => a + b, 0), 2975);
});

test("batch exchange locks, validates every protected reference, and is all-or-nothing", () => {
  assert.match(server, /pg_advisory_xact_lock/);
  assert.match(server, /FOR UPDATE OF ui/);
  assert.match(server, /LOCK TABLE pet_equipped_accessories/);
  for (const table of ["pet_equipped_accessories", "player_market_listings", "pvp_battle_groups", "pet_house_positions", "clearing_reward_chests", "pet_cave_progress"]) assert.match(server, new RegExp(table));
  assert.match(server, /rows\.length !== ids\.length/);
  assert.match(server, /rows\.some\(row => row\.userId !== userId\)/);
  assert.match(server, /DELETE FROM user_inventory[\s\S]+UPDATE users SET essence=essence\+/);
  assert.match(server, /INSERT INTO soul_exchange_transactions/);
  assert.doesNotMatch(server, /DELETE FROM pet_equipped_accessories/);
});

test("one action history record provides server-side batch idempotency and replay", () => {
  assert.match(server, /WHERE exchange_action_id=\$\{actionId\}/);
  assert.match(server, /alreadyCompleted: true/);
  assert.match(server, /exchanged_pets/);
  assert.match(server, /new Set\(petInventoryIds/);
});

test("Soul Exchange UI supports multi-select, confirmation, and server-confirmed removal", () => {
  assert.match(client, /Set<string>/);
  assert.match(client, /aria-pressed=\{isSelected\}/);
  assert.match(client, /petInventoryIds: selected\.map/);
  assert.match(client, /\{total\.toLocaleString\(\)\} Essence/);
  assert.match(client, /Exchange Selected/);
  assert.doesNotMatch(client, /draggable|onDrag|window\.confirm/);
  assert.match(client, /role="alertdialog"/);
  assert.match(client, /disabled=\{busy\}/);
  assert.ok(client.indexOf("if (!response.ok) throw") < client.indexOf("setPets(current => current.filter"));
});

test("Soul Exchange presents readable pet cards with available pets first and protected pets clearly dimmed", () => {
  assert.match(client, /displayPets[\s\S]*Number\(b\.eligible\) - Number\(a\.eligible\)/);
  assert.match(client, /data-soul-card=\{pet\.eligible \? "available" : "unavailable"\}/);
  assert.match(client, /data-soul-availability=\{pet\.eligible \? "available" : "unavailable"\}/);
  assert.match(client, /brightness-75 saturate-\[\.75\] opacity-60/);
  assert.match(client, /rounded-2xl border backdrop-blur/);
  assert.match(client, /LockKeyhole/);
  assert.doesNotMatch(client, /grayscale saturate-0 opacity-35/);
});

test("blocked Soul Exchange pets use a lock-only card affordance and explain the required fix in a popup", () => {
  assert.match(client, /onClick=\{\(\) => setBlockedPet\(pet\)\}/);
  assert.match(client, /Why \$\{displayName\} is locked for exchange/);
  assert.match(client, /role="dialog"/);
  assert.match(client, /Pet Locked for Exchange/);
  assert.match(client, /must be removed from/);
  assert.match(client, /blockedPetUi\?\.label/);
  assert.match(client, /Change Active Pet/);
  assert.match(client, /Manage PvP Team/);
  assert.match(client, /Remove Accessories/);
  assert.match(client, /Open Market/);
  assert.match(client, /Open Pet House/);
  assert.match(client, /Open Clearing/);
  assert.match(client, /navigate\(route\)/);
  assert.match(client, /route: "\/pets"/);
  assert.match(client, /route: "\/pvp"/);
});

test("Soul Exchange uses the uploaded SE art and hides the global navigation for the full-screen scene", () => {
  for (const asset of [
    "SE-Button.png",
    "SE-EssenceBal.png",
    "SE-Logo.png",
    "SE-PetCard.png",
    "SE-Close.png",
    "SEBG1?url",
  ]) {
    assert.match(client, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(client, /setNavHidden\(true\)/);
  assert.match(client, /return \(\) => setNavHidden\(false\)/);
  assert.doesNotMatch(client, /soul-exchange-portal-v3/);
});

test("Soul Exchange polish keeps the header logo unique, moves the balance into the chooser, and uses the green Essence token in the footer", () => {
  assert.equal((client.match(/src=\{seLogo\}/g) || []).length, 1);
  assert.match(client, /currencyAssets\.essenceToken/);
  assert.match(client, /Select eligible pets to release permanently for Essence\./);
  assert.doesNotMatch(client, /Protected pets show what to change first\./);
  assert.match(client, /\{pet\.essenceValue\.toLocaleString\(\)\} Essence/);
  assert.match(client, /-translate-y-\[2px\][\s\S]*Exchange Selected/);
});

test("Soul Exchange keeps decorative type on headings and simplifies the sticky exchange summary", () => {
  assert.match(client, /font-fantasy[\s\S]*SOUL EXCHANGE/);
  assert.match(client, /font-fantasy[\s\S]*CHOOSE HATCHED PETS/);
  assert.match(client, /\{eligibleCount\} Eligible/);
  assert.match(client, /\{selected\.length\} Selected/);
  assert.doesNotMatch(client, /Total: \{total\.toLocaleString/);
  assert.doesNotMatch(client, /Greyed-out pets show what must be changed first/);
});

test("Soul Exchange is narrow-screen safe and honors reduced motion", () => {
  assert.match(client, /overflow-x-hidden/);
  assert.match(client, /safe-area-inset-bottom/);
  assert.match(client, /prefers-reduced-motion:reduce/);
  assert.match(client, /soul-selected-mote/);
  assert.doesNotMatch(client, /<canvas|requestAnimationFrame|three\.js/i);
});
