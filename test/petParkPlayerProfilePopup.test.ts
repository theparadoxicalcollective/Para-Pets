import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const park = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const card = readFileSync("client/src/components/PlayerDetailPanel.tsx", "utf8");
const playerRoutes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");

test("Pet Park uses the existing full player-detail component instead of duplicating profile UI", () => {
  assert.match(park, /import PlayerDetailPanel from "@\/components\/PlayerDetailPanel"/);
  assert.match(park, /\{inspectedPet && <ViewportModalPortal>/);
  assert.match(park, /<PlayerDetailPanel userId=\{inspectedPet\.ownerId\} currentUserId=\{viewingUser\?\.id\}/);
  assert.match(park, /presentation="popup" onClose=\{\(\) => setInspectedPet\(null\)\}/);
  assert.doesNotMatch(park, /Keeper: \{inspectedPet\.ownerName\}/);
  assert.match(playerRoutes, /ownerId: users\.id/);
  assert.match(park, /queryKey: \["\/api\/auth\/me"\], enabled: !!inspectedPet/);
});

test("shared player card keeps the established profile content and changes only popup geometry", () => {
  for (const testId of [
    "player-identity-row", "img-player-profile", "text-player-username",
    "companion-showcase", "active-pet-information", "equipped-accessories-row",
    "active-pet-stats", "button-add-friend", "button-visit-pethouse",
    "button-view-aquarium", "button-close-player-detail",
  ]) assert.ok(card.includes(testId), testId);
  assert.match(card, /presentation = "sheet"/);
  assert.match(card, /presentation === "popup" \? "w-full rounded-3xl" : "w-full rounded-t-3xl"/);
  assert.match(card, /maxWidth: presentation === "popup" \? 440 : 480/);
  assert.match(card, /style=\{presentation === "popup" \? \{ minWidth: 166 \} : undefined\}/);
  assert.match(card, /maxHeight: presentation === "popup"/);
  assert.match(card, /100dvh - max\(28px, env\(safe-area-inset-top/);
  assert.match(card, /overflowY: "auto"/);
  assert.match(card, /overscrollBehavior: "contain"/);
  assert.match(card, /role="dialog" aria-modal="true"/);
  assert.match(card, /if \(event\.key === "Escape"\) onClose\(\)/);
  assert.match(card, /data-global-hud-blocker="true"/);
  assert.match(card, /onClick=\{onClose\}/);
});

test("indoor visitors can inspect other players while owners can still drag without accidental card opens", () => {
  assert.match(park, /data-testid="pet-park-indoor-inspect"/);
  assert.match(park, /!deposit && <button type="button"/);
  assert.match(park, /onClick=\{\(\) => setInspectedPet\(pet\)\}/);
  assert.match(park, /suppressIndoorInspectUntil\.current = Date\.now\(\) \+ 450/);
  assert.match(park, /onPointerDown=\{event => startPlacedIndoorPetDrag/);
  assert.match(park, /onPointerMove=\{movePlacedIndoorPet\}/);
  assert.match(park, /data-testid=\{myDeposit \? "pet-park-outdoor-drag" : "pet-park-outdoor-inspect"\}/);
});
