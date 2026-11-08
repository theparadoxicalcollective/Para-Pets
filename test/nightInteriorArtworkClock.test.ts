import test from "node:test";
import assert from "node:assert/strict";
import { getAutomaticHomeNightStrength, getHomeOutdoorNightStrength,
  isNightInteriorArtworkActive, HOME_OUTDOOR_DUSK_START_MINUTE,
  HOME_OUTDOOR_DAY_START_MINUTE } from "../client/src/lib/homeOutdoorLighting";

const local = (hour: number, minute = 0, seconds = 0) =>
  new Date(2026, 10, 8, hour, minute, seconds);

test("nighttime room art switches at the same dusk boundary that activates outdoor lamps", () => {
  assert.equal(HOME_OUTDOOR_DUSK_START_MINUTE, 18 * 60);
  assert.equal(HOME_OUTDOOR_DAY_START_MINUTE, 7 * 60 + 30);
  assert.equal(isNightInteriorArtworkActive(getAutomaticHomeNightStrength(local(17, 59, 59))), false);
  assert.equal(isNightInteriorArtworkActive(getAutomaticHomeNightStrength(local(18))), false);
  assert.equal(isNightInteriorArtworkActive(getAutomaticHomeNightStrength(local(18, 0, 1))), true);
  assert.equal(isNightInteriorArtworkActive(getAutomaticHomeNightStrength(local(20))), true);
  assert.equal(isNightInteriorArtworkActive(getAutomaticHomeNightStrength(local(7, 29, 59))), true);
  assert.equal(isNightInteriorArtworkActive(getAutomaticHomeNightStrength(local(7, 30))), false);
});

test("day/night editor preview uses the same instant room-art toggle", () => {
  assert.equal(isNightInteriorArtworkActive(getHomeOutdoorNightStrength("day", local(23))), false);
  assert.equal(isNightInteriorArtworkActive(getHomeOutdoorNightStrength("night", local(12))), true);
  assert.equal(isNightInteriorArtworkActive(0), false);
  assert.equal(isNightInteriorArtworkActive(1), true);
  assert.equal(isNightInteriorArtworkActive(Number.NaN), false);
});
