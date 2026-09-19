import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cardAdminValidation } from "../server/routes/cardAdmin.routes";

const adminPage = fs.readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const adminPanel = fs.readFileSync("client/src/components/CardAdminPanel.tsx", "utf8");
const preview = fs.readFileSync("client/src/components/CardPreview.tsx", "utf8");
const catalog = fs.readFileSync("client/src/lib/cardCatalog.ts", "utf8");
const routes = fs.readFileSync("server/routes/cardAdmin.routes.ts", "utf8");
const routeRegistry = fs.readFileSync("server/routes.ts", "utf8");
const boot = fs.readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");

test("Administration Realm exposes a focused Cards section", () => {
  assert.match(adminPage, /key: "cards"[\s\S]*?label: "Cards"/);
  assert.match(adminPage, /activeSection === "cards" && <CardAdminPanel/);
  assert.match(adminPage, /import CardAdminPanel/);
  assert.match(adminPanel, /data-testid="button-add-card"/);
  assert.match(adminPanel, /input-card-artwork/);
  assert.match(adminPanel, /input-card-name/);
  assert.match(adminPanel, /select-card-rarity/);
  assert.match(adminPanel, /input-card-description/);
});

test("each star rarity automatically maps to its matching bundled border", () => {
  for (let rarity = 1; rarity <= 5; rarity++) {
    assert.ok(fs.existsSync(`attached_assets/uploads/${rarity}StarBorder.png`));
    assert.match(catalog, new RegExp(`${rarity}: \\w+StarBorder`));
  }
  assert.match(preview, /CARD_BORDER_ASSETS\[rarity\]/);
  assert.doesNotMatch(adminPanel, /borderData|borderUpload|input-card-border/);
});

test("border editor uses one persisted percentage layout per rarity", () => {
  assert.match(adminPanel, /select-card-border-rarity/);
  assert.match(adminPanel, /select-card-layout-field-/);
  assert.match(adminPanel, /onLayoutChange=\{setCurrentLayout\}/);
  assert.match(preview, /setPointerCapture/);
  assert.match(preview, /left: `\$\{metrics\.x\}%`/);
  assert.match(preview, /top: `\$\{metrics\.y\}%`/);
  assert.match(adminPanel, /button-save-card-border-layout/);
  assert.match(routes, /app\.put\("\/api\/admin\/card-border-layouts\/:rarity", isAdmin/);
});

test("card APIs are admin-protected and durable", () => {
  assert.match(routeRegistry, /registerCardAdminRoutes\(app, \{ db, isAdmin, processCardImage: processWorldImage \}\)/);
  for (const path of [
    "/api/admin/cards",
    "/api/admin/cards/:id",
    "/api/admin/card-border-layouts",
    "/api/admin/card-border-layouts/:rarity",
  ]) {
    assert.ok(routes.includes(path));
  }
  assert.match(routes, /app\.post\("\/api\/admin\/cards", isAdmin/);
  assert.match(routes, /app\.patch\("\/api\/admin\/cards\/:id", isAdmin/);
  assert.match(routes, /app\.delete\("\/api\/admin\/cards\/:id", isAdmin/);
  assert.match(boot, /CREATE TABLE IF NOT EXISTS card_definitions/);
  assert.match(boot, /CREATE TABLE IF NOT EXISTS card_border_layouts/);
  assert.match(boot, /generate_series\(1, 5\)/);
});

test("server rejects invalid rarities and out-of-card layouts", () => {
  assert.equal(cardAdminValidation.parseRarity(1), 1);
  assert.equal(cardAdminValidation.parseRarity("5"), 5);
  assert.equal(cardAdminValidation.parseRarity(0), null);
  assert.equal(cardAdminValidation.parseRarity(6), null);

  const valid = {
    nameX: 13, nameY: 6, nameWidth: 74, nameHeight: 10, nameFontSize: 14,
    descriptionX: 13, descriptionY: 76, descriptionWidth: 74,
    descriptionHeight: 16, descriptionFontSize: 10,
    starX: 47, starY: 18, starWidth: 6, rarity: 1,
  };
  const { rarity, ...layout } = valid;
  assert.deepEqual(cardAdminValidation.parseLayout(valid), layout);
  assert.throws(() => cardAdminValidation.parseLayout({ ...valid, starX: 99 }), /Stars must stay inside/);
  assert.throws(
    () => cardAdminValidation.parseLayout({ ...valid, descriptionY: 90 }),
    /inside the card/,
  );
});
