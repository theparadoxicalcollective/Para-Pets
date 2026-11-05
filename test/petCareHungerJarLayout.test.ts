import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(p, "utf8");

test("Pet Care Hunger has one effective responsive layout and no obsolete higher-specificity overrides", () => {
  const base = read("client/src/index.css");
  const polish = read("client/src/petCarePolish.css");
  const entry = read("client/src/main.tsx");
  const from = base.indexOf(".pet-care-inventory-section .pet-care-hunger {");
  assert.ok(from >= 0);
  const hunger = base.slice(from, base.indexOf("\n}", from) + 2);

  assert.match(entry, /import "\.\/index\.css"/);
  assert.match(entry, /import "\.\/petCarePolish\.css"/);
  assert.doesNotMatch(polish, /\.pet-care-overlay\s+\.pet-care-inventory-section\s+\.pet-care-hunger\s*\{/);
  assert.match(hunger, /position: relative;/);
  assert.match(hunger, /inset: auto;/);
  assert.match(hunger, /calc\(94% - var\(--pet-care-usable-left\) - var\(--pet-care-scene-right\)\)/);
  assert.match(hunger, /clamp\(296px, 45vw, 380px\)/);
  assert.match(hunger, /transform: translate\([\s\S]*?clamp\(14px, 2.6dvh, 24px\)/);
  assert.doesNotMatch(hunger, /translateY\(-7px\)|clamp\(48px, 6dvh, 72px\)/);
  // Responsive controls for tablet/short surfaces stay intact.
  assert.match(polish, /@media \(min-width: 768px\)/);
  assert.match(polish, /@container \(max-height: 650px\)/);
  assert.match(polish, /\.pet-care-overlay \.pet-care-inventory-section \{[\s\S]*?overflow-y: auto/);
});

test("Gifts and Edibles names appear AFTER each jar, and glass alone is more transparent", () => {
  const page = read("client/src/features/pet-care/FeedingOverlay.tsx");
  const start = page.indexOf("function PetCareItemShelf(");
  const end = page.indexOf("// ── Feeding Overlay", start);
  assert.ok(start > 0 && end > start);
  const shelf = page.slice(start, end);
  const image = shelf.indexOf("src={petCareJar}");
  const label = shelf.indexOf("data-testid={`pet-care-${kind}-jar-label`}");
  assert.ok(image > 0 && label > image, "the labels must be below the jar image in the vertical flex layout");
  assert.match(shelf.slice(image, label), /<\/div>\s*\{\/\* Labels sit BELOW the glass/);
  assert.match(shelf, /justifyContent: "flex-end"/);
  assert.match(shelf, /data-pet-care-jar-boundary="true"/);
  assert.match(shelf, /data-testid=\{`pet-care-\$\{kind\}-jar`\}/);
  assert.match(shelf, /src=\{petCareJar\}[\s\S]*?opacity: 0\.38/);
  assert.match(shelf, /className="pet-care-item-jar__item"/);
  assert.match(shelf, /onPointerDown=\{dragEnabled \? \(event\) => beginJarMove\(event, visual\) : undefined\}/);
  assert.match(shelf, /\{visuals\.length === 0 &&/);
  assert.match(shelf, /\{title\}/);
  assert.doesNotMatch(shelf, /position: "absolute",\s*top: 0,\s*left: "50%"/);
});

test("Hunger values and jars retain their existing feed controls and item physics", () => {
  const page = read("client/src/features/pet-care/FeedingOverlay.tsx");
  const css = read("client/src/index.css");
  assert.match(page, /hungerVal=\{hungerVal\}/);
  assert.match(page, /hungerMax=\{maxHunger\}/);
  assert.match(page, /hungerPct=\{hungerPct\}/);
  assert.match(page, /<PetCareItemShelf kind="gifts"/);
  assert.match(page, /<PetCareItemShelf kind="edibles"/);
  assert.match(page, /stepPetCareJarPhysics/);
  assert.match(page, /onPointerMove=\{dragEnabled \? moveJarItem : undefined\}/);
  assert.match(css, /\.pet-care-inventory-section \.pet-care-hunger \.pet-care-meter \{\s*width: 100%/);
});

test("Pet Care Hunger remains raised by 24–48px with jars and tap targets unchanged", () => {
  const css = read("client/src/index.css");
  const page = read("client/src/features/pet-care/FeedingOverlay.tsx");
  const start = css.indexOf(".pet-care-inventory-section .pet-care-hunger {");
  const hunger = css.slice(start, css.indexOf("\n}", start) + 2);
  // Compare the previous and updated responsive translations at real phone/tablet heights.
  for (const height of [568, 667, 844, 915, 1024, 1194]) {
    const clamp = (min: number, value: number, max: number) => Math.max(min, Math.min(value, max));
    const before = clamp(48, height * 0.06, 72);
    const after = clamp(14, height * 0.026, 24);
    assert.ok(before - after >= 24 && before - after <= 48, `unexpected meter shift at ${height}px`);
  }
  assert.match(hunger, /position: relative;[\s\S]*?inset: auto;/);
  assert.match(page, /className="absolute left-0 right-0 pet-care-inventory-section"/);
  assert.match(page, /className="pet-care-inventory-jars"/);
  assert.ok(page.includes('data-testid={`pet-care-${kind}-jar`}'));
  assert.match(page, /data-pet-care-physics-body="true"/);
  assert.match(page, /src=\{petCareJar\}[\s\S]*?opacity: 0\.38[\s\S]*?pointerEvents: "none"/);
});
