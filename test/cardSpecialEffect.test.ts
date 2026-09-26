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

test("each special effect stays in its artwork overlay and supports reduced motion", () => {
  const render = (effect: "stars" | "aurora" | "wisps" | "pumpkin") =>
    renderToStaticMarkup(createElement(CardSpecialArtworkEffect, { effect, color: "#9CEEFF" }));
  const stars = render("stars");
  const pumpkin = render("pumpkin");
  const aurora = render("aurora");
  const wisps = render("wisps");
  assert.match(stars, /card-special-effect-stars/);
  assert.match(stars, /card-special-starfield-a/);
  assert.match(stars, /card-special-starfield-b/);
  assert.match(stars, /mask-size:10\.5% 13\.2%/);
  assert.match(stars, /mask-position:5\.25% 6\.6%/);
  assert.match(stars, /opacity: \.48/);
  assert.match(stars, /opacity: \.64/);
  assert.doesNotMatch(stars, /fill%3D%22none%22/);
  assert.doesNotMatch(stars, /<div class="card-special-holo"/);
  assert.ok(CARD_SPECIAL_EFFECTS.includes("pumpkin"));
  assert.equal(parseCardSpecialEffect("pumpkin"), "pumpkin");
  assert.match(pumpkin, /card-special-effect-pumpkin/);
  assert.match(pumpkin, /card-pumpkin-field/);
  assert.match(pumpkin, /pumpkin-holo-gradient/);
  assert.match(pumpkin, /#FFD27A/);
  assert.match(pumpkin, /#E43B25/);
  assert.match(pumpkin, /fill-opacity="\.52"/);
  assert.match(pumpkin, /card-special-pumpkin-/);
  assert.match(pumpkin, /cardPumpkinPop/);
  assert.match(aurora, /card-special-aurora-a/);
  assert.match(aurora, /<div class="card-special-holo"/);
  assert.doesNotMatch(aurora, /<svg/);
  assert.match(wisps, /card-special-mist/);
  assert.match(wisps, /<circle/);
  for (const markup of [stars, pumpkin, aurora, wisps]) {
    assert.match(markup, /prefers-reduced-motion/);
    assert.doesNotMatch(markup, /card-border/);
  }
});
