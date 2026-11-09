import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { playerProgressionResponse } from "../shared/playerProgression";
import { cleanPetTeam, eligiblePetIds, PLAYER_PET_TEAM_MAX } from "../client/src/lib/playerPetTeam";

const read = (path: string) => readFileSync(path, "utf8");
const hud = read("client/src/components/HomePlayerHud.tsx");
const css = read("client/src/components/HomePlayerHud.css");
const home = read("client/src/pages/HomePage.tsx");

test("account HUD uses the existing progression and shared team endpoints, not pet XP", () => {
  assert.match(hud, /fetch\("\/api\/player\/progression", \{ credentials: "include", signal, cache: "no-store" \}\)/);
  assert.match(hud, /usePlayerPetTeam\(userId\)/);
  assert.match(hud, /\["\/api\/player\/progression", userId\]/);
  assert.match(hud, /queryFn: \(\{ signal \}\) => fetchHomePlayerProgression\(signal\)/);
  assert.match(hud, /player\.totalXp\.toLocaleString\(\)/);
  assert.doesNotMatch(hud, /petLevelPoints|petLevel\b|petRarity|activePetId|playerXpAward|localStorage/);
  const noCurve = playerProgressionResponse({ level: 3, totalXp: 175 });
  assert.deepEqual([noCurve.level, noCurve.totalXp, noCurve.nextLevelTotalXp, noCurve.xpToNextLevel], [3,175,null,null]);
  assert.match(hud, /XP progress not yet available; level threshold is not defined/);
  assert.doesNotMatch(hud, /\(player\.totalXp\s*\/\s*\d+\)|progression\.data\?\.level \* \d+/);
});

test("five independently editable slots reuse the one server-authoritative roster", () => {
  assert.equal(PLAYER_PET_TEAM_MAX, 5);
  assert.match(hud, /Array\.from\(\{ length: PLAYER_PET_TEAM_MAX \}/);
  assert.match(hud, /data-testid=\{`home-player-team-slot-\$\{index \+ 1\}\`\}/);
  assert.match(hud, /usePlayerPetTeam\(userId\)/);
  assert.match(hud, /saveTeam\(next\)/);
  assert.match(hud, /<ViewportModalPortal>/);
  assert.match(hud, /selectedPetIds\.some\(\(id, index\) =>/);
  assert.match(hud, /current\.splice\(pickerSlot, 1\)/);
  assert.match(hud, /const next = cleanPetTeam\(current, eligibleIds\)/);
  assert.match(hud, /if \(saveTeam\(next\)\) setPickerSlot\(null\)/);
  const inventory = [
    { inventoryId: "ready", type: "pet", isHatched: true, isListed: false },
    { inventoryId: "egg", type: "pet", isHatched: false },
    { inventoryId: "listed", type: "pet", isHatched: true, isListed: true },
    { inventoryId: "item", type: "potion", isHatched: true },
  ];
  assert.deepEqual(eligiblePetIds(inventory), ["ready"]);
  assert.deepEqual(cleanPetTeam(["ready", "egg", "ready", "listed"], ["ready"]), ["ready"]);
});

test("unearned account stars remain unfilled even if the current pet has high rarity", () => {
  assert.match(hud, /data-testid="home-player-empty-stars"/);
  assert.match(hud, /Array\.from\(\{ length: 5 \}/);
  assert.match(hud, /src=\{cardStarImg\}/);
  assert.match(css, /opacity: \.25/);
  assert.doesNotMatch(hud, /\.rarity/);
});

test("Home mounts the account HUD on the existing viewport portal without replacing pets prematurely", () => {
  assert.match(home, /import HomePlayerHud from/);
  assert.match(home, /<ViewportHudPortal>\s*<HomePlayerHud/);
  assert.match(home, /inventory=\{inventory\}/);
  assert.match(home, /inventoryLoading=\{inventoryLoading\}/);
  assert.match(home, /!showPetStats && !showProfile/);
  assert.match(home, /<ActivePetPlacement templateId=\{activePet\.petTemplateId\}/);
  assert.match(home, /data-testid="active-pet-name-level-anchor"/);
  assert.match(home, /data-testid="button-open-pet-menu"/);
  assert.match(home, /data-testid="display-pet-rarity-stars"/);
  assert.doesNotMatch(hud, /PlayerCharacterRenderer|PetAnimator|\/api\/player-avatar/);
});

test("viewport UI supports small phones, long usernames, tablets, and error/loading states", () => {
  assert.match(css, /bottom: calc\(85px \+ env\(safe-area-inset-bottom/);
  assert.match(css, /width: min\(calc\(100vw - 28px\), 350px\)/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /text-overflow: ellipsis/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(hud, /progression\.isError \? "XP unavailable"/);
  assert.match(hud, /isLoading \|\| inventoryLoading \? "Loading your team/);
  assert.match(hud, /saveError \? <span role="alert">/);
  assert.match(hud, /data-testid="home-player-team-picker"/);
  assert.match(hud, /aria-modal="true"/);
  assert.doesNotMatch(hud + css, /390px|844px|390\s*[x×]\s*844|clientToStage|DESIGN_W/);
});
