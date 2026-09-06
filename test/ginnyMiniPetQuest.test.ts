import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  GINNY_MINI_PET_CHOICES,
  GINNY_NPC_NAME,
  GINNY_REWARD_COINS,
  GINNY_WORLD_ID,
  isGinnyNpcName,
  parseGinnyMiniPetChoice,
} from "../server/ginnyQuestRules";

const routePath = new URL("../server/routes/ginnyQuest.routes.ts", import.meta.url);
const migrationPath = new URL("../server/startup/migrations/ensureGinnyQuest.ts", import.meta.url);
const startupPath = new URL("../server/startup/runStartup.ts", import.meta.url);
const overlayPath = new URL("../client/src/components/GinnyQuestOverlay.tsx", import.meta.url);
const rootPath = new URL("../client/src/RootEntry.tsx", import.meta.url);

test("Ginny quest identity, reward, and choice rules are stable", () => {
  assert.equal(GINNY_WORLD_ID, "haunted_woods");
  assert.equal(GINNY_NPC_NAME, "Ginny");
  assert.equal(GINNY_REWARD_COINS, 500);
  assert.deepEqual(GINNY_MINI_PET_CHOICES, ["bat", "ghost"]);
  assert.equal(parseGinnyMiniPetChoice(" BAT "), "bat");
  assert.equal(parseGinnyMiniPetChoice("ghost"), "ghost");
  assert.equal(parseGinnyMiniPetChoice("dragon"), null);
  assert.equal(isGinnyNpcName("Ginny"), true);
  assert.equal(isGinnyNpcName("Ginny NPC"), true);
  assert.equal(isGinnyNpcName("Not Ginny"), false);
});

test("Ginny quest persistence is once per player and cannot claim before completion", async () => {
  const source = await readFile(migrationPath, "utf8");
  assert.match(source, /user_id VARCHAR PRIMARY KEY REFERENCES users\(id\)/);
  assert.match(source, /choice IN \('bat', 'ghost'\)/);
  assert.match(source, /reward_claimed_at IS NULL OR completed_at IS NOT NULL/);
  assert.match(source, /mini_pet_inventory_id VARCHAR NOT NULL REFERENCES user_inventory\(id\)/);
});

test("Ginny quest routes are authenticated, server-authoritative, and idempotent", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /app\.get\("\/api\/quests\/ginny-mini-pet", requireAuthenticated/);
  assert.match(source, /app\.post\("\/api\/quests\/ginny-mini-pet\/choose", requireAuthenticated/);
  assert.match(source, /app\.post\("\/api\/quests\/ginny-mini-pet\/claim", requireAuthenticated/);
  assert.match(source, /SELECT id FROM users WHERE id = \$\{user\.id\} FOR UPDATE/);
  assert.match(source, /Your Ginny quest choice is already locked in/);
  assert.match(source, /si\.type = 'mini_pet'/);
  assert.match(source, /INNER JOIN mini_pet_definitions/);
  assert.match(source, /INSERT INTO user_inventory \(user_id, shop_item_id, quantity\)/);
  assert.match(source, /FROM pet_equipped_mini_pets equipped/);
  assert.match(source, /reward_claimed_at IS NULL/);
  assert.match(source, /SET coins = coins \+ \$\{GINNY_REWARD_COINS\}/);
  assert.match(source, /total_coins_earned = total_coins_earned \+ \$\{GINNY_REWARD_COINS\}/);
  assert.match(source, /alreadyClaimed: true/);
});

test("Ginny schema and focused routes are ready before legacy route registration", async () => {
  const source = await readFile(startupPath, "utf8");
  const ensureIndex = source.indexOf("await ensureGinnyQuestSchema()");
  const registerIndex = source.indexOf("registerGinnyQuestRoutes(app)");
  const legacyIndex = source.indexOf("await registerRoutes(httpServer, app)");
  assert.ok(ensureIndex >= 0);
  assert.ok(registerIndex > ensureIndex);
  assert.ok(legacyIndex > registerIndex);
});

test("Ginny quest UI attaches to the placed NPC and guides through stable cross-device targets", async () => {
  const source = await readFile(overlayPath, "utf8");
  assert.match(source, /GINNY_WORLD_ID = "haunted_woods"/);
  assert.match(source, /location\.type === "npc" && isGinnyName\(location\.name\)/);
  assert.match(source, /data-testid="ginny-quest-marker"/);
  assert.match(source, /button-ginny-choose-\$\{choice\}/);
  assert.match(source, /button-floating-nav/);
  assert.match(source, /nav-item-home/);
  assert.match(source, /button-open-pet-actions/);
  assert.match(source, /button-action-equip-accessories/);
  assert.match(source, /button-open-mini-pets/);
  assert.match(source, /mini-pet-option-/);
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /window\.visualViewport/);
  assert.match(source, /orientationchange/);
  assert.match(source, /prefers-reduced-motion/);
});

test("Ginny quest card is integrated without modifying the large quest/nav component", async () => {
  const overlay = await readFile(overlayPath, "utf8");
  const root = await readFile(rootPath, "utf8");
  assert.match(overlay, /quest-card-ginny-mini-pet/);
  assert.match(overlay, /button-ginny-quest-claim/);
  assert.match(overlay, /node\.textContent\?\.trim\(\) === "QUESTS"/);
  assert.match(root, /<GinnyQuestOverlay \/>/);
  assert.match(root, /QueryClientProvider client=\{queryClient\}/);
});
