import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CardCornerBanner from "../client/src/components/CardCornerBanner";
import { CARD_LABELS, CARD_LABEL_DETAILS, parseCardLabel } from "../shared/cardLabel";
import { serializeCard } from "../server/routes/cardAdmin.routes";

test("card labels allow the three events and can be removed", () => {
  assert.equal(parseCardLabel(""), null);
  assert.equal(parseCardLabel(null), null);
  for (const label of CARD_LABELS) assert.equal(parseCardLabel(label), label);
  assert.throws(() => parseCardLabel("summer"), /Invalid card label/);
});

test("seasonal banners stay inset, use a stronger diagonal, and glow in their event color", () => {
  assert.equal(CARD_LABEL_DETAILS.halloween.background, "#6D2F8E");
  assert.equal(CARD_LABEL_DETAILS.christmas.background, "#176B43");
  assert.equal(CARD_LABEL_DETAILS.valentine.background, "#8F3042");

  for (const label of CARD_LABELS) {
    const markup = renderToStaticMarkup(createElement(CardCornerBanner, { label, depth3d: true }));
    assert.match(markup, new RegExp(CARD_LABEL_DETAILS[label].text));
    assert.match(markup, new RegExp(CARD_LABEL_DETAILS[label].background));
    assert.match(markup, new RegExp(CARD_LABEL_DETAILS[label].highlight));
    assert.match(markup, /stroke="#f0c96f"/);
    assert.match(markup, /rotate\(-18 23 20\.5\)/);
    assert.match(markup, /M 4 16 L 41 16/);
    assert.doesNotMatch(markup, /M -/);
    assert.match(markup, /feDropShadow/);
    assert.match(markup, /flood-opacity="\.78"/);
    assert.match(markup, /translateZ\(38px\)/);
  }
});

test("the saved label is sent with the player's card", () => {
  const card = serializeCard({ id: "one", name: "Moon", artwork_url: "/moon.png", rarity: 5, card_label: "halloween" });
  assert.equal(card.label, "halloween");
  assert.equal(serializeCard({ id: "two", name: "Sun", artwork_url: "/sun.png", rarity: 3 }).label, null);
});
