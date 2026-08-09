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
  assert.match(client, /Total: \{total\.toLocaleString\(\)\} Essence/);
  assert.doesNotMatch(client, /draggable|onDrag|window\.confirm/);
  assert.match(client, /role="alertdialog"/);
  assert.match(client, /disabled=\{busy\}/);
  assert.ok(client.indexOf("if (!response.ok) throw") < client.indexOf("setPets(current => current.filter"));
});

test("Soul Exchange is narrow-screen safe and honors reduced motion", () => {
  assert.match(client, /overflow-x-hidden/);
  assert.match(client, /safe-area-inset-bottom/);
  assert.match(client, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(client, /<canvas|requestAnimationFrame|three\.js/i);
});
