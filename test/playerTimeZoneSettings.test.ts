import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registrationSchema, playerTimeZoneSchema } from "../shared/accountValidation";
import { isValidPlayerTimeZone, localClockMinutes } from "../shared/playerTimeZone";
import { getParkLampStrength, isNightInteriorArtworkActive } from "../client/src/lib/homeOutdoorLighting";

const read = (path: string) => readFileSync(path, "utf8");
test("only valid IANA time zones can be stored or sent at signup", () => {
  for (const timeZone of ["America/Chicago","America/New_York","Europe/London","Asia/Tokyo","UTC"]) {
    assert.equal(isValidPlayerTimeZone(timeZone), true);
    assert.equal(playerTimeZoneSchema.safeParse(timeZone).success, true);
  }
  for (const bad of ["Other/Imaginary", "UTC; DROP TABLE users", "", "A".repeat(90)]) {
    assert.equal(isValidPlayerTimeZone(bad), false);
    assert.equal(playerTimeZoneSchema.safeParse(bad).success, false);
  }
  const example = { username: "tester_zone", email: "zone@example.com", password: "securePass123", timeZone: "Asia/Tokyo" };
  assert.equal(registrationSchema.safeParse(example).success, true);
  assert.equal(registrationSchema.safeParse({...example,timeZone:"NOT_A_ZONE"}).success,false);
});
test("06:00 interior sunrise is calculated in each player's saved zone", () => {
  const sameInstant = new Date("2026-11-12T11:00:00Z");
  assert.equal(localClockMinutes(sameInstant, "America/New_York"), 6*60);
  assert.equal(localClockMinutes(sameInstant, "America/Los_Angeles"), 3*60);
  assert.equal(isNightInteriorArtworkActive("auto", sameInstant, "America/New_York"), false);
  assert.equal(isNightInteriorArtworkActive("auto", sameInstant, "America/Los_Angeles"), true);
  assert.equal(getParkLampStrength("auto", sameInstant, "America/New_York"), 0);
});
test("IANA offsets adapt automatically in summer and winter", () => {
  assert.equal(localClockMinutes(new Date("2026-01-15T12:00:00Z"), "America/New_York"), 7*60);
  assert.equal(localClockMinutes(new Date("2026-07-15T12:00:00Z"), "America/New_York"), 8*60);
  assert.equal(localClockMinutes(new Date("2026-01-15T12:00:00Z"), "Asia/Tokyo"), 21*60);
});
test("signup, profile and private editors share a saved zone without changing rewards", () => {
  const auth = read("client/src/pages/AuthPage.tsx");
  const profile = read("client/src/components/UserProfilePanel.tsx");
  const routes = read("server/routes.ts");
  const account = read("server/routes/account.routes.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const park = read("client/src/pages/PetParkPage.tsx");
  const world = read("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(auth, /testId="register-time-zone"/);
  assert.match(auth, /registrationSchema\.parse\(\{ username, email, password, timeZone/);
  assert.match(profile, /testId="profile-time-zone"/);
  assert.match(profile, /button-save-time-zone/);
  assert.match(routes, /app\.patch\("\/api\/user\/time-zone", isAuthenticated/);
  assert.match(account, /timeZone: timeZone \?\? null/);
  assert.match(boot, /ALTER TABLE users ADD COLUMN IF NOT EXISTS time_zone TEXT/);
  assert.match(park, /useHomeOutdoorLighting\("auto", clockAccount\?\.timeZone\)/);
  assert.match(world, /useHomeOutdoorLighting\("auto", clockAccount\?\.timeZone\)/);
  assert.doesNotMatch(routes.split('app.patch("/api/user/time-zone"')[1].split('app.patch("/api/user/username"')[0], /coins|essence|reward|cooldown/);
});
