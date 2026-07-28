import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const route=fs.readFileSync("server/routes/elysianClearingCombat.routes.ts","utf8");
const bootstrap=fs.readFileSync("server/clearingEquipment.ts","utf8");
const client=fs.readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");
test("session bootstrap avoids the invalid FULL JOIN and returns the prepared loadout immediately",()=>{
  assert.doesNotMatch(bootstrap,/FULL JOIN/);
  assert.match(route,/loadout,/);
  assert.match(route,/CLEARING_STARTER_WEAPON_FAILED/);
  assert.match(route,/CLEARING_MIGRATION_REQUIRED/);
});
test("session failures retain safe codes and expose an explicit bounded Retry action",()=>{
  assert.match(client,/await r\.json\(\)\.catch/);
  assert.match(client,/button-clearing-retry/);
  assert.match(client,/setSessionAttempt\(v=>v\+1\)/);
});
