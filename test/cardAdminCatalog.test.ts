import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cardAdminValidation } from "../server/routes/cardAdmin.routes";

const adminPage = fs.readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const adminPanel = fs.readFileSync("client/src/components/CardAdminPanel.tsx", "utf8");
const preview = fs.readFileSync("client/src/components/CardPreview.tsx", "utf8");
const detail = fs.readFileSync("client/src/components/CardDetailDialog.tsx", "utf8");
const collection = fs.readFileSync("client/src/pages/CardsCollectionPage.tsx", "utf8");
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
  assert.match(preview, /top: `\$\{metrics\.y \+ detailTitleYNudge\}%`/);
  assert.match(adminPanel, /button-save-card-border-layout/);
  assert.match(routes, /app\.put\("\/api\/admin\/card-border-layouts\/:rarity", isAdmin/);
});

test("card text editor uses simple nudge, center, size, and title-only curve controls", () => {
  assert.match(adminPanel, /button-nudge-card-text-up/);
  assert.match(adminPanel, /button-nudge-card-text-down/);
  assert.match(adminPanel, /button-nudge-card-text-left/);
  assert.match(adminPanel, /button-nudge-card-text-right/);
  assert.match(adminPanel, /button-center-card-text/);
  assert.match(adminPanel, /button-decrease-card-text-size/);
  assert.match(adminPanel, /button-increase-card-text-size/);
  assert.doesNotMatch(adminPanel, /type="range"/);
  assert.match(adminPanel, /selectedField === "name"[\s\S]*button-card-title-curve-decrease[\s\S]*button-card-title-curve-flat[\s\S]*button-card-title-curve-increase/);
  assert.match(catalog, /nameCurve: number/);
  assert.match(preview, /curve=\{isName \? layout\.nameCurve : 0\}/);
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
    nameX: 13, nameY: 6, nameWidth: 74, nameHeight: 10, nameFontSize: 14, nameCurve: 0,
    descriptionX: 13, descriptionY: 76, descriptionWidth: 74,
    descriptionHeight: 16, descriptionFontSize: 10,
    starX: 47, starY: 18, starWidth: 6, rarity: 1,
  };
  const { rarity, ...layout } = valid;
  assert.deepEqual(cardAdminValidation.parseLayout(valid), layout);
  assert.throws(() => cardAdminValidation.parseLayout({ ...valid, starX: 99 }), /Stars must stay inside/);
  assert.throws(() => cardAdminValidation.parseLayout({ ...valid, nameCurve: 9 }), /nameCurve must be between 0 and 8/);
  assert.throws(
    () => cardAdminValidation.parseLayout({ ...valid, descriptionY: 90 }),
    /inside the card/,
  );
});


test("detail cards use lightweight rarity-scaled magical glitter inside the artwork", () => {
  assert.match(preview, /brightness\(1\.2\)/);
  assert.match(preview, /RARITY_SPARKLE_COUNT[\s\S]*?1:\s*0[\s\S]*?2:\s*44[\s\S]*?3:\s*96[\s\S]*?4:\s*148[\s\S]*?5:\s*220/);
  assert.match(preview, /RARITY_GLINT_COUNT[\s\S]*?2:\s*5[\s\S]*?3:\s*14[\s\S]*?4:\s*26[\s\S]*?5:\s*44/);
  assert.match(preview, /RARITY_SWIRL_COUNT[\s\S]*?2:\s*1[\s\S]*?3:\s*1[\s\S]*?4:\s*2[\s\S]*?5:\s*3/);
  assert.match(preview, /CARD_GLITTER_POINTS = Array\.from\(\{ length: 220 \}/);
  assert.match(preview, /CARD_GLINT_POINTS = Array\.from\(\{ length: 44 \}/);
  assert.match(preview, /CARD_BORDER_GLINT_POINTS = Array\.from\(\{ length: 36 \}/);
  assert.doesNotMatch(preview, /Math\.random\(\)/);
  assert.match(preview, /showSparkles = false/);
  assert.match(detail, /showSparkles/);
  const artwork = preview.indexOf('data-testid="card-artwork-window"');
  const sparkles = preview.indexOf('data-testid="card-rarity-sparkles"');
  const border = preview.indexOf('alt={`${rarity}-star card border`}');
  assert.ok(artwork >= 0 && artwork < sparkles && sparkles < border, "sparkles belong inside the artwork, behind the frame");
  assert.match(preview, /card-glitter-batch-0/);
  assert.match(preview, /card-micro-glint/);
  assert.match(preview, /CARD_SWIRL_PATHS\.slice\(0, RARITY_SWIRL_COUNT\[rarity\]\)/);
  assert.match(preview, /card-sparkle-swirl-line/);
  assert.match(preview, /card-star-shape/);
  assert.match(preview, /cardSparkleSwirlFlow/);
  assert.match(preview, /linearGradient/);
  assert.match(preview, /stopOpacity="0"/);
  assert.doesNotMatch(preview, /stroke-dasharray: 17 83/);
  assert.match(preview, /showSparkles && rarity >= 3/);
  assert.match(preview, /data-testid="card-border-gold-glow"/);
  assert.match(preview, /zIndex: 3/);
  assert.match(preview, /maskImage: `url/);
  assert.match(preview, /mixBlendMode: "screen"/);
  assert.match(preview, /backgroundRepeat: "no-repeat, no-repeat"/);
  assert.match(preview, /backgroundPosition: "0% 0, 190% 0"/);
  assert.match(preview, /from \{ background-position: 0% 0, 190% 0; \}/);
  assert.match(preview, /to \{ background-position: -190% 0, 0% 0; \}/);
  assert.match(preview, /cardBorderGlowTravel 11\.5s linear infinite/);
  assert.match(preview, /drop-shadow\(0 0 \$\{6\.5 \+ rarity \* \.9\}px rgba\(255,184,34,\.7\)\)/);
  assert.match(preview, /showSparkles && rarity === 5/);
  assert.match(preview, /data-testid="card-border-sparkles"/);
  assert.match(preview, /animationDuration: "3\.2s"/);
  assert.match(preview, /CARD_BORDER_GLINT_POINTS\.length \* 3\.2/);
  assert.match(preview, /cardBorderGlint/);
  assert.match(preview, /data-card-title-rarity=\{highRarityTitle \? rarity : undefined\}/);
  assert.match(preview, /cardTitleHologoldSweep/);
  assert.doesNotMatch(preview, /cardTitleFiveStarPulse/);
  assert.doesNotMatch(preview, /cardTitleHologoldSweep 6\.6s[^;]*cardTitleFiveStarPulse/);
  assert.match(preview, /background-clip: text/);
  assert.match(preview, /prefers-reduced-motion: reduce/);
  assert.match(preview, /inset: depth3d \? "12% 7%" : "12% 10%"/);
  assert.match(preview, /inset 0 0 24px 8px/);
  assert.match(preview, /transform: depth3d \? "translateZ\(22px\)" : undefined/);
  assert.doesNotMatch(preview, /isName \? 26 : 22/);
  assert.match(preview, /DETAIL_TITLE_Y_NUDGE[\s\S]*?2:\s*\.75[\s\S]*?3:\s*\.9/);
  assert.match(preview, /isName && textSize === "detail"/);
  assert.match(preview, /top: `\$\{metrics\.y \+ detailTitleYNudge\}%`/);
});

test("card collection keeps the cleaner open layout and text heading", () => {
  assert.match(collection, /DecorDivider\.png/);
  assert.match(collection, />\s*Cards\s*<\/h1>/);
  assert.doesNotMatch(collection, /CardTitle\.png/);
  assert.doesNotMatch(collection, /CardPageDecor\.png/);
  assert.doesNotMatch(collection, />\s*PARA PETS\s*</);
  assert.doesNotMatch(collection, /inset: "8px 7px 18px"/);
  assert.doesNotMatch(collection, /border: "1px solid rgba\(216,176,74,\.2\)"/);
  assert.match(collection, /data-testid="card-collection-progress-overlay"/);
  assert.match(collection, /fontSize: "clamp\(39px, 10\.5vw, 52px\)"/);
  assert.match(collection, /width: 40[\s\S]*?height: 40/);
  assert.match(collection, /width: "108%"/);
  assert.match(collection, /width: "min\(82%, 342px\)"/);
  assert.match(collection, /columnGap: "clamp\(8px, 2\.4vw, 12px\)"/);
  assert.match(collection, /rowGap: "clamp\(8px, 2\.4vw, 12px\)"/);
  assert.match(collection, /rewardNeedsClearance = !card\.firstRewardClaimed/);
  assert.doesNotMatch(collection, /className="relative min-w-0 pb-8"/);
});

test("card turn queues visual updates per frame and preserves fast swipe lore", () => {
  assert.match(detail, /data-testid="card-turn-surface"/);
  assert.match(detail, /requestAnimationFrame/);
  assert.match(detail, /cancelAnimationFrame/);
  assert.match(detail, /ref=\{turnCardRef\}/);
  assert.doesNotMatch(detail, /setTurnAngle/);
  assert.match(detail, /velocity >= 0\.35/);
  assert.match(detail, /gesture\.width \* 0\.1/);
  assert.doesNotMatch(detail, />Drag left or right to turn the card\. Swipe quickly to read more\.</);
  assert.doesNotMatch(detail, /onDescriptionClick=/);
});
