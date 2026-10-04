import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_EVOLUTION_EFFECT_COLOR,
  sanitizeEvolutionPetEffects,
} from "../shared/petEvolutionEffects";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("evolution effect sanitizer accepts sparkle, smoke, and light ball safely", () => {
  const effects = sanitizeEvolutionPetEffects([
    { id: "spark", type: "sparkle", view: "front", xPct: 0.25, yPct: 0.4, sizePct: 18, color: "#ff00aa" },
    { id: "smoke", type: "smoke", view: "back", xPct: 2, yPct: -1, sizePct: 90, color: "#00ff00" },
    { id: "light", type: "light_ball", view: "front", xPct: 0.5, yPct: 0.5, sizePct: 20, color: "bad" },
  ]);

  assert.deepEqual(effects[0], {
    id: "spark",
    type: "sparkle",
    view: "front",
    xPct: 0.25,
    yPct: 0.4,
    sizePct: 18,
    color: "#ff00aa",
  });
  assert.equal(effects[1].view, "back");
  assert.equal(effects[1].xPct, 1);
  assert.equal(effects[1].yPct, 0);
  assert.equal(effects[1].sizePct, 80);
  assert.equal("color" in effects[1], false);
  assert.equal(effects[2].color, DEFAULT_EVOLUTION_EFFECT_COLOR.light_ball);
});

test("evolution effects persist through game_settings and are returned with evolution artwork", () => {
  const routes = read("server/routes.ts");

  assert.match(routes, /pet_evolution_effects:\$\{templateId\}/);
  assert.match(routes, /app\.put\("\/api\/admin\/pet-templates\/:id\/evolution-effects"/);
  assert.match(routes, /sanitizeEvolutionPetEffects\(req\.body\?\.effects\)/);
  assert.match(routes, /onConflictDoUpdate/);
  assert.match(routes, /evolutionEffects: await getEvolutionPetEffects\(templateId\)/);
});

test("Evolution Parts editor exposes an Effects tool with drag, color, size, and save controls", () => {
  const source = read("client/src/components/PetDatabasePanel.tsx");

  assert.match(source, /\['effects', 'Effects'\]/);
  assert.match(source, /button-add-evolution-effect-sparkle/);
  assert.match(source, /button-add-evolution-effect-smoke/);
  assert.match(source, /button-add-evolution-effect-light_ball/);
  assert.match(source, /input-evolution-effect-color/);
  assert.match(source, /input-evolution-effect-size/);
  assert.match(source, /button-save-evolution-effects/);
  assert.match(source, /startEvolutionEffectDrag/);
  assert.match(source, /moveEvolutionEffectDrag/);
});

test("evolved runtime pets render saved effects only for their active view", () => {
  const source = read("client/src/components/PetAnimatorCore.tsx");
  const visuals = read("client/src/components/EvolutionPetEffects.tsx");

  assert.match(source, /artworkForm === "evolution"/);
  assert.match(source, /filter\(effect => effect\.view === resolvedView\)/);
  assert.match(source, /EvolutionPetEffectsLayer/);

  assert.match(visuals, /evoPetSparkleGlint/);
  assert.match(visuals, /evoPetSmokeDrift/);
  assert.match(visuals, /evoPetLightPulse/);
  assert.match(visuals, /radial-gradient/);
});
