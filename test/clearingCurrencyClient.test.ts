import assert from "node:assert/strict";
import test from "node:test";
import { mergePlayerCurrencyBalances, PLAYER_CURRENCY_QUERY_KEY } from "../client/src/hooks/usePlayerCurrencyBalances";

test("Clearing and the active-pet page share the authoritative auth query key",()=>{
  assert.deepEqual(PLAYER_CURRENCY_QUERY_KEY,["/api/auth/me"]);
});
test("returned pickup balances replace both shared cached currency fields without losing user data",()=>{
  assert.deepEqual(mergePlayerCurrencyBalances({id:"u",coins:1,essence:2,username:"petter"},{coins:3,essence:20}),{id:"u",coins:3,essence:20,username:"petter"});
});
