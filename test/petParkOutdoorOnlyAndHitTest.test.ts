import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parkImageHitAt, parkImageHitClipPath, parkImageVisualCenter } from "../client/src/lib/petParkImageHit";

function withMask(check: (x: number, y: number) => boolean, execute: (src: string) => void) {
  const old = (globalThis as any).document;
  (globalThis as any).document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        drawImage() {},
        getImageData() {
          const data = new Uint8ClampedArray(96 * 96 * 4);
          for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
            if (check(x, y)) data[(y * 96 + x) * 4 + 3] = 255;
          }
          return { data };
        },
      }),
    }),
  };
  try { execute(`/assets/park-hit-test-${Date.now()}-${Math.random()}.png`); }
  finally { (globalThis as any).document = old; }
}

function image(src: string, width = 100, height = 100) {
  return {
    complete: true, naturalWidth: 100, naturalHeight: 100,
    currentSrc: src, src,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  } as unknown as HTMLImageElement;
}

test("transparent pixels and object-contain padding do not select a Pet Park asset", () => {
  withMask((x, y) => x >= 30 && x <= 65 && y >= 30 && y <= 65, src => {
    const img = image(src);
    assert.equal(parkImageHitAt(img, 50, 50), true);
    assert.equal(parkImageHitAt(img, 4, 4), false);
    const tall = image(src, 100, 200);
    assert.equal(parkImageHitAt(tall, 50, 10), false);
    assert.equal(parkImageHitAt(tall, 50, 100), true);
  });
});

test("flipped building art mirrors its alpha hit zone", () => {
  withMask((x, y) => x < 24 && y >= 20 && y <= 80, src => {
    const img = image(src);
    assert.equal(parkImageHitAt(img, 14, 50), true);
    assert.equal(parkImageHitAt(img, 14, 50, true), false);
    assert.equal(parkImageHitAt(img, 86, 50, true), true);
  });
});

test("player hit targets are clipped to visible art (including object-contain padding)", () => {
  const bounds = { left: .2, top: .1, width: .4, height: .5 };
  assert.equal(parkImageHitClipPath(bounds, 200, 100),
    "inset(28.799999999999997% 38.8% 43.8% 18.8%)");
  assert.deepEqual(parkImageVisualCenter(bounds, 200, 100), { xPct: 40, yPct: 42.5 });
  assert.equal(parkImageHitClipPath(null, 200, 100), undefined);
  assert.deepEqual(parkImageVisualCenter(null, 200, 100), { xPct: 50, yPct: 50 });
  const park = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  assert.match(park, /clipPath: scene\.canEditPark \? undefined : imageHitClips\[building\.imageUrl\]/);
  assert.match(park, /style=\{\{ clipPath: visibleDecorImage \? imageHitClips\[visibleDecorImage\] : undefined \}\}/);
  assert.match(park, /parkImageVisualCenter\(bounds, width, height\)/);
  assert.match(park, /data-testid="pet-park-water-source-indicator"/);
  assert.doesNotMatch(park, /absolute -right-1 -top-2 rounded-full border border-\[#c1d9b4\]/);
});

test("editor movement requires a second artwork tap and outdoor pets use owner-only drags", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  assert.match(page, /parkImageHitAt\(image, e\.clientX, e\.clientY, object\.flipped\)/);
  assert.match(page, /Date\.now\(\) - previous\.at < 400/);
  assert.match(page, /setMoveArmed\(doubleTap/);
  assert.match(page, /aria-label=\{\x60Move \$\{pet\.petNickname/);
  assert.match(page, /onPointerDown=\{myDeposit \? event => startOutdoorPetDrag\(event, myDeposit, position\) : undefined\}/);
  assert.match(page, /data-testid=\{myDeposit \? "pet-park-outdoor-drag" : "pet-park-outdoor-inspect"\}/);
  assert.match(page, /dropEquippedPet\(drag\.petId/);
  assert.doesNotMatch(page, /dropEquippedPetInside|indoorSelectedPetId/);
  assert.match(page, /indoorVisiblePets\.map\(pet =>/);
});

test("equipped pets remain private until explicitly placed outdoors or inside a building", () => {
  const player = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
  const display = readFileSync("server/routes/petParkDisplay.routes.ts", "utf8");
  assert.match(player, /slotNumber, showInPark: false/);
  assert.match(player, /isNull\(petParkDeposits\.buildingId\)/);
  assert.match(player, /isNotNull\(petParkDeposits\.parkXPct\)/);
  assert.match(player, /isNotNull\(petParkDeposits\.parkYPct\)/);
  assert.match(display, /display === "park" && !hasX/);
  assert.match(display, /showInPark: false, buildingId: null, roomEffectId: null/);
  assert.match(player, /isPetAccessibleParkRoom\(room\)/);
  assert.match(player, /isNotNull\(petParkDeposits\.buildingId\)/);
  assert.match(player, /checkpointAt: petParkDeposits\.checkpointAt/);
});

test("deleting a building makes previously indoor pets private without changing reward settlement", () => {
  const admin = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
  const segment = admin.split('app.delete("/api/admin/pet-park/buildings/:id"')[1]
    ?.split('app.delete("/api/admin/pet-park/terrain"')[0];
  assert.ok(segment);
  assert.match(segment, /db\.transaction\(async tx =>/);
  assert.match(segment, /showInPark: false, buildingId: null, roomEffectId: null/);
  assert.match(segment, /parkXPct: null, parkYPct: null/);
  assert.match(segment, /isNull\(petParkDeposits\.withdrawnAt\)/);
  assert.doesNotMatch(segment, /checkpointAt:|withdrawnAt:|petParkRewardClaims/);
});
