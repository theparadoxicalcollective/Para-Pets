import test from "node:test";
import assert from "node:assert/strict";
import {
  getAutomaticHomeNightStrength,
  getParkLampStrength,
  isNightInteriorArtworkActive,
  getParkFireflyStrength,
  HOME_OUTDOOR_DUSK_START_MINUTE,
  PARK_LAMPS_OFF_MINUTE,
  PARK_NIGHT_INTERIOR_START_MINUTE,
  PARK_DAY_INTERIOR_START_MINUTE,
  PARK_FIREFLY_START_MINUTE,
} from "../client/src/lib/homeOutdoorLighting";

const local = (hour: number, minute = 0, seconds = 0) =>
  new Date(2026, 10, 8, hour, minute, seconds);

test("night interior image switches instantly at 19:00 and daytime image at 06:30", () => {
  assert.equal(HOME_OUTDOOR_DUSK_START_MINUTE, 18 * 60);
  assert.equal(PARK_NIGHT_INTERIOR_START_MINUTE, 19 * 60);
  assert.equal(PARK_DAY_INTERIOR_START_MINUTE, 6 * 60 + 30);
  assert.equal(isNightInteriorArtworkActive("auto", local(18, 59, 59)), false);
  assert.equal(isNightInteriorArtworkActive("auto", local(19)), true);
  assert.equal(isNightInteriorArtworkActive("auto", local(23)), true);
  assert.equal(isNightInteriorArtworkActive("auto", local(6, 29, 59)), true);
  assert.equal(isNightInteriorArtworkActive("auto", local(6, 30)), false);
  assert.equal(isNightInteriorArtworkActive("auto", local(12)), false);
  assert.equal(isNightInteriorArtworkActive("day", local(23)), false);
  assert.equal(isNightInteriorArtworkActive("night", local(12)), true);
});

test("park/world lamps and fireflies are completely off by 06:00, with later daylight", () => {
  assert.equal(PARK_LAMPS_OFF_MINUTE, 6 * 60);
  assert.equal(PARK_FIREFLY_START_MINUTE, PARK_NIGHT_INTERIOR_START_MINUTE);
  assert.equal(getParkLampStrength("auto", local(17, 59)), 0);
  assert.equal(getParkLampStrength("auto", local(18)), 0);
  assert.ok(getParkLampStrength("auto", local(18, 15)) > 0);
  assert.equal(getParkLampStrength("auto", local(20)), 1);
  assert.ok(getParkLampStrength("auto", local(5, 59)) > 0);
  assert.equal(getParkLampStrength("auto", local(6)), 0);
  assert.equal(getParkFireflyStrength("auto", local(18, 59, 59)), 0);
  assert.equal(getParkFireflyStrength("auto", local(19)), 0);
  assert.ok(getParkFireflyStrength("auto", local(19, 1)) > 0);
  assert.equal(getParkFireflyStrength("auto", local(19, 45)), 1);
  assert.ok(getParkFireflyStrength("auto", local(5, 59)) > 0);
  assert.equal(getParkFireflyStrength("auto", local(6)), 0);
  assert.ok(getAutomaticHomeNightStrength(local(6)) > 0,
    "background still brightens naturally after lamp/firefly shutdown");
  assert.equal(getParkLampStrength("day", local(22)), 0);
  assert.equal(getParkLampStrength("night", local(12)), 1);
  assert.equal(getParkFireflyStrength("day", local(22)), 0);
  assert.equal(getParkFireflyStrength("night", local(12)), 1);
});
