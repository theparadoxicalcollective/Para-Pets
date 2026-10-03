import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("profile Pet Home action opens the existing visitor route instead of Coming Soon", () => {
  const panel = read("client/src/components/PlayerDetailPanel.tsx");

  assert.match(panel, /navigate\(\`\/visit\/\$\{userId\}\`\)/);
  assert.match(panel, /data-testid="button-visit-pethouse"/);
  assert.doesNotMatch(panel, /Pet Home visits are under construction/);
  assert.doesNotMatch(panel, /setComingSoon/);
});

test("visitor pets expose the actual game coin and reuse Pet Care hearts", () => {
  const visit = read("client/src/pages/VisitPetHousePage.tsx");
  const cue = read("client/src/components/PetHomeVisitRewardCue.tsx");
  const heart = read("client/src/components/PetHeartParticle.tsx");
  const care = read("client/src/features/pet-care/FeedingOverlay.tsx");

  assert.match(cue, /@assets\/icon_coin\.webp/);
  assert.match(cue, /para-visit-pet-coin-spin/);
  assert.match(cue, /PetHeartParticle/);
  assert.match(heart, /feed-heart-rise/);
  assert.match(care, /import PetHeartParticle from "@\/components\/PetHeartParticle"/);
  assert.match(care, /<PetHeartParticle/);

  assert.match(visit, /<PetHomeVisitRewardCue/);
  assert.match(visit, /visitRewardAvailable/);
  assert.match(visit, /visitRewardAmount/);
});

test("collecting a visitor pet reward is server-backed and updates the authoritative coin cache", () => {
  const visit = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(visit, /apiRequest\("POST", \`\/api\/users\/\$\{userId\}\/pets\/\$\{pet\.inventoryId\}\/visit-reward\`/);
  assert.match(visit, /visitRewardMutation/);
  assert.match(visit, /visitRewardAvailable: false/);
  assert.match(visit, /qc\.setQueryData\(\["\/api\/auth\/me"\]/);
  assert.match(visit, /coins: data\.coins/);
  assert.match(visit, /invalidateQueries\(\{ queryKey: \["\/api\/auth\/me"\] \}\)/);
});

test("outdoor and indoor reward clicks use the petted closed-eye expression and shared heart reaction", () => {
  const visit = read("client/src/pages/VisitPetHousePage.tsx");

  const pettedExpressions = visit.match(/expression=\{isRewardReacting \? "petted" : undefined\}/g) ?? [];
  assert.equal(pettedExpressions.length, 2);
  assert.match(visit, /className=\{isRewardReacting \? "pet-care-squish-bounce" : undefined\}/);
  assert.match(visit, /reactingPetId === pet\.inventoryId/);
  assert.match(visit, /setReactingPetId\(pet\.inventoryId\)/);
  assert.match(visit, /2100/);
});

test("Pet Home visitor reward ledger enforces one claim per visitor pet and UTC day", () => {
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const storage = read("server/storage.ts");
  const routes = read("server/routes/petHouseVisitor.routes.ts");

  assert.match(schema, /petHouseVisitRewards = pgTable\("pet_house_visit_rewards"/);
  assert.match(schema, /uniqueIndex\("pet_house_visit_rewards_daily_uidx"\)\.on\(t\.visitorId, t\.petInventoryId, t\.claimDay\)/);
  assert.match(boot, /CREATE UNIQUE INDEX IF NOT EXISTS pet_house_visit_rewards_daily_uidx/);
  assert.match(storage, /\.onConflictDoNothing\(\)/);
  assert.match(storage, /innerJoin\([\s\S]*petHousePositions/);
  assert.match(storage, /eq\(userInventory\.isHatched, true\)/);
  assert.match(storage, /eq\(shopItems\.type, "pet"\)/);
  assert.match(routes, /const PET_HOME_VISIT_REWARD_COINS = 10/);
  assert.match(routes, /toISOString\(\)\.slice\(0, 10\)/);
  assert.match(routes, /visitor\.id === ownerId/);
});

test("only placed pets advertise the visitor reward", () => {
  const routes = read("server/routes/petHouseVisitor.routes.ts");

  assert.match(routes, /posMap\.has\(r\.inventory\.id\)/);
  assert.match(routes, /const rewardEligible = !!pos/);
  assert.match(routes, /visitRewardAvailable: rewardEligible && !claimedSet\.has\(r\.inventory\.id\)/);
  assert.match(routes, /visitRewardAmount: rewardEligible \? PET_HOME_VISIT_REWARD_COINS : 0/);
});
