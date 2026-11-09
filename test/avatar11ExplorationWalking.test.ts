import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { worldYToDepth } from "../client/src/lib/clearingWorldPresentation";
import { persistentAimDirection } from "../client/src/hooks/usePetWalkController";
import { wardrobeLayers, type PlayerAvatarState } from "../client/src/lib/playerAvatarWardrobe";

const read = (path: string) => readFileSync(path, "utf8");
const scene = read("client/src/components/WalkAroundScene.tsx");
const page = read("client/src/pages/ElysianBayouClearingPage.tsx");
const controller = read("client/src/hooks/usePetWalkController.ts");
const combat = read("client/src/components/ElysianClearingCombat.tsx");

test("the live explore scene renders the same account-owned 8-part avatar used on Home", () => {
  assert.match(page, /<WalkAroundScene/);
  assert.match(page, /userId=\{user\.id\}/);
  assert.match(scene, /<PlayerCharacterRenderer/);
  assert.match(scene, /parts=\{walkingAvatar\.base\.parts\}/);
  assert.match(scene, /clothingLayers=\{equippedLayers\}/);
  assert.match(scene, /motion=\{isMoving \? "walk" : "idle"\}/);
  assert.match(scene, /wardrobeLayers\(walkingAvatar\)/);
  assert.match(scene, /fetchPlayerAvatar\(signal\)/);
  assert.match(scene, /queryKey: \[\.\.\.PLAYER_AVATAR_QUERY_KEY, userId\]/);
  assert.match(scene, /avatarQuery\.data\?\.created === true/);
  assert.match(scene, /avatarQuery\.data\.base\.parts\.length === 8/);
  assert.match(scene, /data-testid="walk-avatar-actor"/);
  assert.match(scene, /data-walk-actor=\{walkingAvatar \? "avatar" : "pet"\}/);
  assert.doesNotMatch(scene, /writePlayerAvatar|player-avatar\/create|localStorage\.setItem/);
});

test("avatar and pet use exactly one existing movement/camera/bounds controller", () => {
  assert.equal((scene.match(/usePetWalkController\(/g) ?? []).length, 1);
  assert.match(scene, /petPos,/);
  assert.match(scene, /bounds: movementBounds/);
  assert.match(scene, /speed:  config\.movementSpeed/);
  assert.match(scene, /enabled: !gameplayBlocked/);
  assert.match(scene, /left: `\$\{petPos\.x \* 100\}%`/);
  assert.match(scene, /top: `\$\{petPos\.y \* 100\}%`/);
  assert.match(scene, /worldYToDepth\(petPos\.y\)/);
  assert.match(scene, /cameraTarget\(petPos, world, viewport\)/);
  assert.match(scene, /onJoystickPointerDown\(e/);
  assert.match(scene, /onPointerMove=\{onJoystickPointerMove\}/);
  assert.match(scene, /onPointerCancel=\{onJoystickPointerUp\}/);
  assert.match(scene, /Math\.max\(1, window\.innerWidth\)/);
  assert.match(scene, /Math\.max\(1, window\.innerHeight\)/);
  assert.doesNotMatch(scene, /clientToStage|390\s*\*\s*844|const AVATAR_WORLD_WIDTH/);
  assert.ok(worldYToDepth(.8) > worldYToDepth(.35));
  assert.deepEqual(persistentAimDirection({dx:1,dy:0},0,0),{dx:1,dy:0});
  assert.match(controller, /requestAnimationFrame\(tick\)/);
});

test("combat sessions retain the featured pet as the canonical combat actor", () => {
  assert.match(scene, /const activePetInventoryId: string \| null = typeof activePet\?\.inventoryId/);
  assert.match(scene, /config\.features\.combat && petTemplateId && activePetInventoryId/);
  assert.match(scene, /<ElysianClearingCombat key=\{activePetInventoryId\}/);
  assert.match(scene, /activePetInventoryId=\{activePetInventoryId\}/);
  assert.match(scene, /petPos=\{petPos\}/);
  assert.match(scene, /activePet=\{activePet\}/);
  assert.match(scene, /aimDirection=\{aimDirection\}/);
  assert.match(scene, /onGameplayBlockedChange=\{setGameplayBlocked\}/);
  assert.match(combat, /data\.pet\.inventoryId!==activePetInventoryId/);
  assert.match(combat, /session\.pet\.inventoryId!==activePetInventoryId/);
  assert.doesNotMatch(combat, /playerAvatar|PlayerCharacterRenderer/);
});

test("uncreated or failed-avatar read safely falls back to legacy pet without a fake avatar", () => {
  assert.match(scene, /const showLegacyPet = !userId \|\| avatarQuery\.isError/);
  assert.match(scene, /avatarQuery\.isSuccess && !walkingAvatar/);
  assert.match(scene, /showLegacyPet && !!petTemplateId/);
  assert.match(scene, /<PetAnimator petTemplateId=\{petTemplateId\}/);
  assert.match(scene, /data-testid="walk-pet-sprite"/);
  assert.match(scene, /!activePetInventoryId \|\| !petTemplateId/);
  assert.match(scene, /data-testid="clearing-featured-pet-notice"/);
  assert.match(scene, /Choose a hatched Featured Companion in Bag/);
  assert.match(scene, /!loadingComplete && activePetInventoryId && petTemplateId/);
});

test("wardrobe layers remain separate per category and follow individual limbs", () => {
  const fit = { xPct:50,yPct:50,widthPct:100,pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:1 };
  const segment=(partType:"head"|"left_leg"|"right_leg")=>({partType,imageUrl:"/api/media/art",fit,renderPlane:"with_part" as const});
  const equipped:PlayerAvatarState["equipped"]=[
    { category:"head",inventoryId:"hat",shopItemId:"hat",name:"Hat",imageUrl:null,segments:[segment("head")] },
    { category:"hair",inventoryId:"hair",shopItemId:"hair",name:"Hair",imageUrl:null,segments:[segment("head")] },
    { category:"bottom",inventoryId:"pants",shopItemId:"pants",name:"Pants",imageUrl:null,segments:[segment("left_leg"),segment("right_leg")] },
  ];
  const layers=wardrobeLayers({created:true,revision:2,base:null,ownedClothing:[],equipped,unavailableEquipmentSlots:[]});
  assert.deepEqual(layers.map(l=>l.inventoryId),["hat","hair","pants"]);
  assert.deepEqual(layers.find(l=>l.inventoryId==="pants")?.segments.map(s=>s.partType),["left_leg","right_leg"]);
});

test("only existing publicly live Clearing uses walking; unpublished world drafts and PC remain untouched", () => {
  const roadmap=read("docs/PLAYER_AVATAR_ROADMAP.md");
  assert.match(roadmap, /11\/12/);
  assert.match(page, /ELY SIAN|ELYSIAN_BAYOU_CLEARING_ID/);
  assert.match(page, /cameraMode: "device-viewport"/);
  assert.doesNotMatch(scene, /\/api\/admin\/world-scene|worldSceneDraft|publishWorld/);
  assert.doesNotMatch(page, /\.isAdmin\s*=\s*true/);
});
