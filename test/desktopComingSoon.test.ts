import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowDesktopComingSoon, type DesktopNoticeDevice } from "../client/src/lib/desktopComingSoon";

const pc: DesktopNoticeDevice = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130",
  platform: "Win32",
  maxTouchPoints: 0,
  touchFirst: false,
};

test("PC player gameplay and hub show the coming-soon notice regardless of window size", () => {
  for (const path of ["/", "/map", "/world/haunted_woods", "/pets", "/bag", "/pvp", "/coins", "/hub", "/games/molten-blocks"]) {
    assert.equal(shouldShowDesktopComingSoon(path, pc), true, path);
  }
});

test("phone, tablet and iPad with desktop user agent keep normal gameplay", () => {
  const devices: DesktopNoticeDevice[] = [
    { ...pc, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile", platform: "iPhone", touchFirst: true, maxTouchPoints: 5 },
    { ...pc, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel Tablet) Chrome/130", platform: "Linux armv8l", touchFirst: false, maxTouchPoints: 5 },
    { ...pc, userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0) Safari/605", platform: "iPad", touchFirst: false, maxTouchPoints: 5 },
    { ...pc, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605", platform: "MacIntel", touchFirst: false, maxTouchPoints: 5 },
    { ...pc, userAgent: "Mozilla/5.0 (Linux; Android 15; Tablet) Chrome/130", platform: "Linux", touchFirst: true, maxTouchPoints: 5 },
  ];
  for (const device of devices) {
    assert.equal(shouldShowDesktopComingSoon("/", device), false, device.userAgent);
    assert.equal(shouldShowDesktopComingSoon("/world/haunted_woods", device), false, device.userAgent);
  }
});

test("PC administration, sign-in and legal/account recovery routes stay available", () => {
  for (const path of ["/admin", "/auth", "/privacy", "/founders", "/forum", "/reset-password/example"]) {
    assert.equal(shouldShowDesktopComingSoon(path, pc), false, path);
  }
});

test("touchscreen laptop with desktop controls is still a PC", () => {
  assert.equal(shouldShowDesktopComingSoon("/", { ...pc, maxTouchPoints: 10 }), true);
});
