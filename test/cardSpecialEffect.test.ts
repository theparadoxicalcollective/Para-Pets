import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CardSpecialArtworkEffect from "../client/src/components/CardSpecialArtworkEffect";
import { serializeCard } from "../server/routes/cardAdmin.routes";
import { CARD_SPECIAL_EFFECTS, cardArtworkEffect, parseCardSpecialEffect } from "../shared/cardSpecialEffect";

test("special artwork effects override the rarity artwork effect, and can be cleared", () => {
  assert.equal(cardArtworkEffect(null), "rarity");
  assert.equal(parseCardSpecialEffect(""), null);
  assert.equal(parseCardSpecialEffect(undefined), null);
  for (const effect of CARD_SPECIAL_EFFECTS) {
    assert.equal(cardArtworkEffect(parseCardSpecialEffect(effect)), effect);
  }
  assert.throws(() => parseCardSpecialEffect("unknown"), /Invalid card special effect/);
});

test("stored special effect is included in the card sent to players", () => {
  const card = serializeCard({ id: "one", name: "Moon", artwork_url: "/moon.png", rarity: 5, special_effect: "stars" });
  assert.equal(card.specialEffect, "stars");
  assert.equal(serializeCard({ id: "two", name: "Sun", artwork_url: "/sun.png", rarity: 3 }).specialEffect, null);
});

test("Stars uses visible varied outline stars without covering the artwork", () => {
  const stars = renderToStaticMarkup(createElement(CardSpecialArtworkEffect, { effect: "stars", color: "#9CEEFF" }));
  assert.match(stars, /card-special-effect-stars/);
  assert.match(stars, /card-star-outline-field/);
  assert.match(stars, /card-special-star-outlines/);
  assert.match(stars, /fill="none"/);
  assert.match(stars, /stroke-width="\.48"/);
  assert.match(stars, /scale\(0\.82\)/);
  assert.match(stars, /scale\(1\.18\)/);
  assert.match(stars, /cardSpecialStarHue/);
  assert.doesNotMatch(stars, /card-special-starfield/);
});

test("Pumpkin and Moonfire Wisps render as visible but transparent artwork-only overlays", () => {
  const pumpkin = renderToStaticMarkup(createElement(CardSpecialArtworkEffect, { effect: "pumpkin", color: "#9CEEFF" }));
  const wisps = renderToStaticMarkup(createElement(CardSpecialArtworkEffect, { effect: "wisps", color: "#9CEEFF" }));

  assert.ok(CARD_SPECIAL_EFFECTS.includes("pumpkin"));
  assert.equal(parseCardSpecialEffect("pumpkin"), "pumpkin");
  assert.match(pumpkin, /card-special-effect-pumpkin/);
  assert.match(pumpkin, /card-pumpkin-field/);
  assert.match(pumpkin, /fill-opacity="\.42"/);
  assert.match(pumpkin, /stroke-opacity="\.78"/);
  assert.match(pumpkin, /cardPumpkinPop/);

  assert.match(wisps, /card-special-effect-wisps/);
  assert.match(wisps, /card-moonfire-wisp-field/);
  assert.match(wisps, /card-special-wisp/);
  assert.match(wisps, /cardWispFloat/);
  assert.match(wisps, /rx="2\.25"/);
  assert.match(wisps, /stop-opacity="\.92"/);

  for (const markup of [pumpkin, wisps]) {
    assert.match(markup, /prefers-reduced-motion/);
    assert.doesNotMatch(markup, /card-border/);
  }
});

test("Aurora remains separate from the other artwork effects", () => {
  const aurora = renderToStaticMarkup(createElement(CardSpecialArtworkEffect, { effect: "aurora", color: "#9CEEFF" }));
  assert.match(aurora, /card-special-aurora-a/);
  assert.match(aurora, /card-special-holo/);
  assert.doesNotMatch(aurora, /card-pumpkin-field/);
  assert.doesNotMatch(aurora, /card-moonfire-wisp-field/);
});
