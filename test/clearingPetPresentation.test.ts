import assert from "node:assert/strict";
import test from "node:test";
import { clearingPetHurtboxRadius, clearingPetSize, clearingProjectileOrigin, clearingWeaponOrigin, CLEARING_PET_PRESENTATION } from "../client/src/lib/clearingPetPresentation";
import { insetMovementBounds } from "../client/src/lib/elysianClearingCombatMath";

test("Clearing pet is noticeably smaller on portrait phones without affecting enemy geometry", () => {
  for (const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932}]) assert.equal(clearingPetSize(viewport),47.6);
  assert.equal(clearingPetSize({width:900,height:1200}),53.2);
  assert.equal(CLEARING_PET_PRESENTATION.petEnemyVisualRatio,.68);
  assert.ok(clearingPetSize({width:390,height:844})<CLEARING_PET_PRESENTATION.standardEnemyVisibleHeight);
});

test("scaled pet uses intentional feet, hurtbox, and edge geometry", () => {
  const size=144.3, world={width:560,height:844};
  const bounds=insetMovementBounds({xMin:.18,xMax:.82,yMin:.08,yMax:.9},world,size,CLEARING_PET_PRESENTATION.feetAnchor,CLEARING_PET_PRESENTATION.visualHalfWidthRatio);
  assert.ok(bounds.xMin>.18&&bounds.xMax<.82&&bounds.yMin>.08&&bounds.yMax<.9);
  assert.equal(clearingPetHurtboxRadius(size),26);
  assert.equal(clearingPetHurtboxRadius(96),clearingPetHurtboxRadius(198));
  assert.ok(clearingPetHurtboxRadius(size)<size*.25);
});

test("invalid first-frame geometry stays finite and inside ordered bounds",()=>{
  const bounds=insetMovementBounds({xMin:.18,xMax:.82,yMin:.08,yMax:.9},{width:1,height:1},198);
  assert.ok(bounds.xMin<bounds.xMax&&bounds.yMin<bounds.yMax);
  const origin=clearingWeaponOrigin({x:Number.NaN,y:Number.POSITIVE_INFINITY},Number.NaN,{width:0,height:Number.NaN},false);
  assert.ok(Number.isFinite(origin.x)&&Number.isFinite(origin.y));
});

test("weapon anchor mirrors outside the pet's face while keeping the same vertical level", () => {
  const pet={x:.5,y:.7},world={width:500,height:800};
  const right=clearingWeaponOrigin(pet,150,world,false),left=clearingWeaponOrigin(pet,150,world,true);
  assert.ok(right.x>pet.x);
  assert.ok(left.x<pet.x);
  assert.equal(left.y,right.y);
  assert.ok(Math.abs((right.x-pet.x)-(pet.x-left.x))<1e-12);
  assert.ok(clearingProjectileOrigin(pet,150,world,false).x>right.x);
  assert.ok(clearingProjectileOrigin(pet,150,world,true).x<left.x);
});
