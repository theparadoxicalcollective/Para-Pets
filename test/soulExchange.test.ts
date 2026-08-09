import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { SOUL_EXCHANGE_ESSENCE_BY_RARITY } from "../server/soulExchange";

test("Soul Exchange has one authoritative rarity reward table",()=>{
 assert.deepEqual(SOUL_EXCHANGE_ESSENCE_BY_RARITY,{1:50,2:125,3:300,4:750,5:1750});
});
test("exchange transaction locks, validates protected references, records history, and is idempotent",()=>{
 const s=fs.readFileSync("server/soulExchange.ts","utf8");
 assert.match(s,/pg_advisory_xact_lock/);assert.match(s,/FOR UPDATE OF ui,u/);
 for(const table of ["pet_equipped_accessories","player_market_listings","pvp_battle_groups","pet_house_positions","clearing_reward_chests","pet_cave_progress"]) assert.match(s,new RegExp(table));
 assert.match(s,/UPDATE users SET essence=essence\+/);assert.match(s,/DELETE FROM user_inventory/);assert.match(s,/INSERT INTO soul_exchange_transactions/);
 assert.ok(s.indexOf("UPDATE users SET essence")<s.indexOf("DELETE FROM user_inventory")&&s.indexOf("DELETE FROM user_inventory")<s.indexOf("INSERT INTO soul_exchange_transactions"));
});
test("Soul Exchange UI requires tap selection and confirmation without optimistic deletion",()=>{
 const s=fs.readFileSync("client/src/components/SoulExchangeOverlay.tsx","utf8");
 assert.doesNotMatch(s,/draggable|onDrag|window\.confirm/);assert.match(s,/role="alertdialog"/);assert.match(s,/crypto\.randomUUID/);assert.match(s,/disabled=\{busy\}/);
 assert.ok(s.indexOf("if\(!r.ok\)throw")<s.indexOf("setPets(v=>v.filter"));
});
