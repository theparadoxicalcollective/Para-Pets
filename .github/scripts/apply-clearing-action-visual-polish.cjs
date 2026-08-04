const fs = require('node:fs');

const combatPath = 'client/src/components/ElysianClearingCombat.tsx';
const weaponPath = 'client/src/components/ClearingAttackEffect.tsx';
const scenePath = 'client/src/components/WalkAroundScene.tsx';
const testPath = 'test/elysianClearingActionVisualPolish.test.ts';

let combat = fs.readFileSync(combatPath, 'utf8');
let scene = fs.readFileSync(scenePath, 'utf8');

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`Missing expected source for ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Expected one source match for ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function replaceRegexOnce(text, pattern, after, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const matches = [...text.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`Expected one regex match for ${label}; found ${matches.length}`);
  return text.replace(pattern, after);
}

combat = replaceOnce(
  combat,
  'export default function ElysianClearingCombat({ activePetInventoryId, petPos, petSize, activePet, facingLeft, aimDirection, onReturnToWorld, worldPixels, hudElement, onGameplayBlockedChange, onEnemiesReady, isAdmin=false }: { activePetInventoryId:string; petPos:PetWalkPos; petSize:number; activePet?:any; facingLeft:boolean; aimDirection:{dx:number;dy:number}; onReturnToWorld:()=>void; worldPixels:WorldPixels; hudElement:HTMLElement|null; onGameplayBlockedChange:(blocked:boolean)=>void; onEnemiesReady:()=>void; isAdmin?:boolean }) {',
  'export default function ElysianClearingCombat({ activePetInventoryId, petPos, petSize, activePet, facingLeft, aimDirection, onReturnToWorld, worldPixels, hudElement, onGameplayBlockedChange, onEnemiesReady, onSpecialReadyChange, isAdmin=false }: { activePetInventoryId:string; petPos:PetWalkPos; petSize:number; activePet?:any; facingLeft:boolean; aimDirection:{dx:number;dy:number}; onReturnToWorld:()=>void; worldPixels:WorldPixels; hudElement:HTMLElement|null; onGameplayBlockedChange:(blocked:boolean)=>void; onEnemiesReady:()=>void; onSpecialReadyChange:(ready:boolean)=>void; isAdmin?:boolean }) {',
  'special-ready callback prop',
);

combat = replaceOnce(
  combat,
  '  const [recentlyDamaged,setRecentlyDamaged] = useState(false); const recentDamageTimer=useRef<ReturnType<typeof setTimeout>|null>(null);',
  '  const [recentlyDamaged,setRecentlyDamaged] = useState(false); const recentDamageTimer=useRef<ReturnType<typeof setTimeout>|null>(null);\n  const revealPetHealthBar=useCallback(()=>{setRecentlyDamaged(true);if(recentDamageTimer.current)clearTimeout(recentDamageTimer.current);recentDamageTimer.current=setTimeout(()=>{setRecentlyDamaged(false);recentDamageTimer.current=null;},CFG.recentDamageDisplayMs);},[]);',
  'shared health-bar reveal helper',
);

combat = replaceOnce(
  combat,
  'setPetHealth(hp);setRecentlyDamaged(true);if(recentDamageTimer.current)clearTimeout(recentDamageTimer.current);recentDamageTimer.current=setTimeout(()=>{setRecentlyDamaged(false);recentDamageTimer.current=null;},CFG.recentDamageDisplayMs);invulnerableUntil.current=now+CFG.petInvulnerabilityMs;',
  'setPetHealth(hp);revealPetHealthBar();invulnerableUntil.current=now+CFG.petInvulnerabilityMs;',
  'damage health-bar display',
);

combat = combat
  .replaceAll('setFeedback(["No enemy nearby"])', 'setFeedback([])')
  .replaceAll('setFeedback(["Target lost"])', 'setFeedback([])')
  .replaceAll('setFeedback(["Move closer"])', 'setFeedback([])')
  .replaceAll('setFeedback([sessionState==="loading"?"Combat loading…":"Combat paused"])', 'setFeedback([])');

combat = replaceRegexOnce(
  combat,
  /setFeedback\(\[data\.boss\?`Boss defeated · \+\$\{data\.expAwarded\} EXP`:`Enemy defeated · \+\$\{data\.expAwarded\} EXP`,data\.eggDrop\?"A special egg appeared":"Treasure chest appeared"\]\)/,
  'setFeedback([])',
  'defeat success feedback',
);

combat = replaceOnce(
  combat,
  'setFeedback([body.alreadyClaimed?"Rewards already collected":"Rewards collected"]);setTimeout(()=>setFeedback([]),1600);',
  'setFeedback([]);',
  'chest collection success feedback',
);

combat = replaceOnce(
  combat,
  'setEggDrops(current=>current.filter(item=>item.id!==drop.id));setFeedback([`${drop.name} egg collected`]);await queryClient.invalidateQueries({queryKey:["/api/inventory"]});',
  'setEggDrops(current=>current.filter(item=>item.id!==drop.id));setFeedback([]);await queryClient.invalidateQueries({queryKey:["/api/inventory"]});',
  'egg collection success feedback',
);

combat = replaceOnce(
  combat,
  'const mutateLoadout=async(action:()=>Promise<unknown>)=>{try{await action();setFeedback(["Clearing loadout updated"]);setTimeout(()=>setFeedback([]),1800)}catch{setFeedback(["Equipment update failed"]);}};',
  'const mutateLoadout=async(action:()=>Promise<unknown>)=>{try{await action();setFeedback([]);}catch{setFeedback(["Equipment update failed"]);setTimeout(()=>setFeedback([]),1800);}};',
  'loadout success feedback',
);

combat = replaceOnce(
  combat,
  'if(Number(body.manaAmount)>0&&hasSpecialSkill){const mana=Math.min(maxMana,petManaRef.current+Number(body.manaAmount));petManaRef.current=mana;setPetMana(mana);}setFeedback([Number(body.healAmount)>0?`Restored ${body.healAmount} health`:`Restored ${body.manaAmount} mana`]);setTimeout(()=>setFeedback([]),1600);',
  'if(Number(body.manaAmount)>0&&hasSpecialSkill){const mana=Math.min(maxMana,petManaRef.current+Number(body.manaAmount));petManaRef.current=mana;setPetMana(mana);}if(Number(body.healAmount)>0)revealPetHealthBar();setFeedback([]);',
  'potion success presentation',
);

combat = replaceRegexOnce(
  combat,
  /  const useSpecialSkill=\(event:React\.PointerEvent\)=>\{[\s\S]*?\n  const portalVisible=/,
  '  const useSpecialSkill=(event:React.PointerEvent)=>{if(!hasSpecialSkill||petManaRef.current<maxMana)return;const kind=resolveClearingSpecialKind(activePet);petManaRef.current=0;setPetMana(0);setFeedback([]);if(kind==="heal"){const before=petHealthRef.current,healed=Math.min(petMaxHealthRef.current,before+clearingSpecialHeal(petMaxHealthRef.current));petHealthRef.current=healed;setPetHealth(healed);revealPetHealthBar();return;}specialCastingRef.current=true;attack(event);const timer=setTimeout(()=>{specialCastingRef.current=false;timers.current.delete(timer);},CLEARING_SWORD_TIMING.totalMs+300);timers.current.add(timer);};\n  useEffect(()=>{const ready=hasSpecialSkill&&petMana>=maxMana;onSpecialReadyChange(ready);return()=>onSpecialReadyChange(false);},[hasSpecialSkill,petMana,onSpecialReadyChange]);\n  const portalVisible=',
  'special skill presentation and original-pet glow callback',
);

combat = replaceOnce(
  combat,
  '  const liveFacingLeft=visualTargetEnemy?visualTargetEnemy.x<petPos.x:facingLeft;\n  const petCombatCenter=clearingWeaponOrigin(petPos,petSize,worldPixels,attackPhase==="idle"?liveFacingLeft:attackDirection.facingLeft);',
  '  const petCombatCenter=clearingWeaponOrigin(petPos,petSize,worldPixels,facingLeft);',
  'fixed weapon anchor',
);

combat = replaceRegexOnce(
  combat,
  /\{hasSpecialSkill&&petMana>=maxMana&&<button type="button" data-interactive data-testid="clearing-pet-special-ready"[\s\S]*?<\/button>\}/,
  '{hasSpecialSkill&&petMana>=maxMana&&<button type="button" data-interactive data-testid="clearing-pet-special-ready" aria-label={`Use ${activePet?.specialSkill||activePet?.specialSkillType||activePet?.skillType||"pet special skill"}`} onPointerDown={useSpecialSkill} className="absolute pointer-events-auto clearing-special-ready-hitbox" style={{left:`${petPos.x*100}%`,top:`${petPos.y*100}%`,width:petSize,height:petSize,transform:`translate(-50%,-${CLEARING_PET_PRESENTATION.feetAnchor*100}%)`,zIndex:worldYToDepth(petPos.y,3),touchAction:"none"}} />}',
  'special-ready transparent hitbox',
);

combat = replaceOnce(
  combat,
  'data-enemy-rank={e.isBoss?"boss":"regular"} className="absolute pointer-events-none"',
  'data-enemy-rank={e.isBoss?"boss":"regular"} data-enemy-state={e.state} className="absolute pointer-events-none"',
  'enemy state marker',
);

combat = replaceOnce(
  combat,
  '<img src={url} onError={event=>{event.currentTarget.src=fallbackPet}} alt={e.name||CFG.enemyName} className="w-full h-full object-contain" draggable={false}/>',
  '<img src={url} onError={event=>{event.currentTarget.src=fallbackPet}} alt={e.name||CFG.enemyName} className={`w-full h-full object-contain clearing-enemy-art ${["roaming","pursuing","returning"].includes(e.state)?"is-moving":""}`} style={{animationDelay:`-${(e.slot%5)*73}ms`}} draggable={false}/>',
  'moving enemy artwork class',
);

combat = replaceOnce(
  combat,
  'phase={attackPhase} angleRadians={weaponAngle} targetDistance={attackDirection.distance} x={weaponPointer.x} y={weaponPointer.y} sizePixels={CFG.weaponPointerSizePixels} playerY={petPos.y}/>',
  'phase={attackPhase} angleRadians={weaponAngle} targetDistance={attackDirection.distance} x={weaponPointer.x} y={weaponPointer.y} sizePixels={CFG.weaponPointerSizePixels} playerY={petPos.y} facingLeft={facingLeft}/>',
  'static weapon facing prop',
);

combat = replaceOnce(
  combat,
  '@keyframes clearing-sparkle{0%,65%,100%{opacity:0;transform:scale(.4)}75%{opacity:1;transform:scale(1)}}@media(prefers-reduced-motion:reduce){.animate-clearing-skull,.animate-clearing-chest-open,.clearing-chest-drop{animation:none}',
  '@keyframes clearing-sparkle{0%,65%,100%{opacity:0;transform:scale(.4)}75%{opacity:1;transform:scale(1)}}.clearing-special-ready-hitbox{background:transparent;border:0;padding:0}.clearing-pet-presentation.is-special-ready{filter:drop-shadow(0 0 4px #fff7ae) drop-shadow(0 0 10px #fde047);animation:clearing-special-ready-pulse 900ms ease-in-out infinite alternate}.clearing-enemy-art.is-moving{transform-origin:50% 100%;animation:clearing-enemy-walk-squish 440ms ease-in-out infinite}@keyframes clearing-special-ready-pulse{from{filter:drop-shadow(0 0 3px #fff7ae) drop-shadow(0 0 7px #fde047)}to{filter:drop-shadow(0 0 6px #fff7ae) drop-shadow(0 0 13px #facc15)}}@keyframes clearing-enemy-walk-squish{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(1.5px) scaleY(.96)}}@media(prefers-reduced-motion:reduce){.animate-clearing-skull,.animate-clearing-chest-open,.clearing-chest-drop,.clearing-pet-presentation.is-special-ready,.clearing-enemy-art.is-moving{animation:none}',
  'Clearing motion and glow styles',
);

scene = replaceOnce(
  scene,
  '  const [gameplayBlocked, setGameplayBlocked] = useState(false);',
  '  const [gameplayBlocked, setGameplayBlocked] = useState(false);\n  const [specialReady, setSpecialReady] = useState(false);',
  'scene special-ready state',
);

scene = replaceOnce(
  scene,
  '    setClearingReady(false);\n    setLoadingComplete(false);',
  '    setClearingReady(false);\n    setLoadingComplete(false);\n    setSpecialReady(false);',
  'special-ready reset on active pet change',
);

scene = replaceOnce(
  scene,
  '          <div className={`clearing-pet-presentation ${isMoving ? "is-moving" : ""}`} style={{transform:`scaleX(${facingLeft !== naturalFacingLeft ? -1 : 1})`}}>',
  '          <div className={`clearing-pet-presentation ${isMoving ? "is-moving" : ""} ${specialReady ? "is-special-ready" : ""}`} style={{transform:`scaleX(${facingLeft !== naturalFacingLeft ? -1 : 1})`}}>',
  'original pet ready glow class',
);

scene = replaceOnce(
  scene,
  'onGameplayBlockedChange={setGameplayBlocked} onEnemiesReady={() => setClearingReady(true)} isAdmin={isAdmin}',
  'onGameplayBlockedChange={setGameplayBlocked} onEnemiesReady={() => setClearingReady(true)} onSpecialReadyChange={setSpecialReady} isAdmin={isAdmin}',
  'special-ready callback wiring',
);

const weapon = `import { useEffect, useState } from "react";
import { Sword, Sparkles } from "lucide-react";
import type { ClearingInventoryItem } from "@shared/clearingEquipment";
import { resolveClearingAttackStyle } from "@shared/clearingCombat";
import { worldYToDepth } from "@/lib/clearingWorldPresentation";
import { type ClearingAttackPhase, weaponRarityFilter } from "@/lib/clearingWeaponVisuals";

export default function ClearingAttackEffect({ weapon, phase, angleRadians, targetDistance, x, y, sizePixels, playerY, facingLeft }: {
  weapon: ClearingInventoryItem | null; phase: ClearingAttackPhase;
  angleRadians: number; targetDistance: number; x: number; y: number; sizePixels: number; playerY: number; facingLeft: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [weapon?.imageUrl]);
  useEffect(() => { if (import.meta.env.DEV && weapon) console.debug("Clearing equipped weapon reached attack renderer", { inventoryId:weapon.inventoryId, shopItemId:weapon.shopItemId, stableKey:weapon.stableKey, name:weapon.name, imageUrl:weapon.imageUrl, stars:weapon.stars, attackStyle:weapon.attackStyle, attackBonus:weapon.atkBonus }); }, [weapon]);
  const style = resolveClearingAttackStyle(weapon ? { attackStyle: weapon.attackStyle, name: weapon.name } : undefined);
  const size = `${Math.max(28, Math.min(42, sizePixels))}px`;
  const showRealWeapon = Boolean(weapon?.imageUrl) && !imageFailed;
  const depth = worldYToDepth(playerY, 3);
  return <>
    <div data-testid="clearing-equipped-weapon-pointer" data-phase={phase} data-attack-style={style}
      className="absolute pointer-events-none overflow-visible clearing-player-weapon-foreground"
      style={{ left:`${x*100}%`, top:`${y*100}%`, width:size, height:size, zIndex:depth, transform:`translate(-50%, -50%) scaleX(${facingLeft ? -1 : 1})` }}>
      {showRealWeapon ? <img data-testid="clearing-equipped-weapon-image" src={weapon!.imageUrl!} alt="" draggable={false}
        className="h-full w-full object-contain"
        style={{ filter:weaponRarityFilter(weapon?.stars ?? 1) }}
        onError={() => { if (import.meta.env.DEV) console.warn("Clearing equipped weapon image failed to load", { imageUrl:weapon?.imageUrl, shopItemId:weapon?.shopItemId }); setImageFailed(true); }}/>
        : style==="staff_orb"?<Sparkles data-testid="clearing-staff-fallback" aria-hidden className="h-full w-full text-cyan-200" style={{filter:weaponRarityFilter(weapon?.stars ?? 1)}}/>:<Sword data-testid="clearing-weapon-fallback" aria-hidden className="h-full w-full text-amber-100" style={{ filter:weaponRarityFilter(weapon?.stars ?? 1) }}/>} 
    </div>
    {phase!=="idle"&&<div data-testid="clearing-attack-vfx" className="absolute pointer-events-none overflow-visible" style={{left:`${x*100}%`,top:`${y*100}%`,width:size,height:size,zIndex:depth+1,transform:`translate(-50%, -50%) rotate(${angleRadians}rad)`}}>
      {style==="sword_slash"&&phase==="impact"&&<span data-testid="clearing-sword-slash" className="absolute -inset-2 rounded-[50%] border-t-[3px] border-amber-100 opacity-90" style={{filter:`drop-shadow(0 0 ${3+Math.min(5,weapon?.stars??1)}px #fbbf24)`}}/>}
      {style==="staff_orb"&&phase==="impact"&&<span data-testid="clearing-staff-orb" className="absolute top-1/2 h-3 w-3 rounded-full bg-cyan-100 shadow-[0_0_10px_4px_#67e8f9] animate-clearing-orb-target" style={{"--clearing-projectile-distance":`${Math.max(0,targetDistance)}px`} as React.CSSProperties}/>}
      {style==="default_melee"&&phase==="impact"&&!showRealWeapon&&<span data-testid="clearing-default-impact" className="absolute inset-2 rounded-full border-2 border-white/70"/>}
    </div>}
    <style>{`@keyframes clearing-orb-target{to{transform:translateX(var(--clearing-projectile-distance));opacity:0}}.animate-clearing-orb-target{animation:clearing-orb-target 240ms linear forwards}@media(prefers-reduced-motion:reduce){.animate-clearing-orb-target{animation-duration:1ms}}`}</style>
  </>;
}
`;

const tests = `import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const combat = readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
const scene = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");
const weapon = readFileSync("client/src/components/ClearingAttackEffect.tsx", "utf8");

test("routine Clearing actions use bars and world effects instead of central text", () => {
  assert.match(combat, /const revealPetHealthBar=useCallback/);
  assert.match(combat, /if\(Number\(body\.healAmount\)>0\)revealPetHealthBar\(\)/);
  assert.match(combat, /revealPetHealthBar\(\);return;/);
  assert.doesNotMatch(combat, /Restored \$\{body\.healAmount\} health/);
  assert.doesNotMatch(combat, /Clearing loadout updated/);
  assert.doesNotMatch(combat, /Enemy defeated ·/);
  assert.doesNotMatch(combat, /Rewards collected/);
  assert.match(combat, /Equipment update failed/);
  assert.match(combat, /Combat temporarily unavailable/);
});

test("special readiness lights the original pet without rendering a duplicate pet image", () => {
  const start = combat.indexOf('data-testid="clearing-pet-special-ready"');
  const end = combat.indexOf('/>}', start);
  const specialControl = combat.slice(start, end + 3);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(specialControl, /<img/);
  assert.match(specialControl, /clearing-special-ready-hitbox/);
  assert.match(scene, /specialReady \? "is-special-ready" : ""/);
  assert.match(scene, /onSpecialReadyChange=\{setSpecialReady\}/);
  assert.equal(scene.match(/<PetAnimator/g)?.length, 1);
});

test("equipped weapon stays fixed and only flips with the pet while attack VFX aim separately", () => {
  assert.doesNotMatch(weapon, /weaponAttackTransform/);
  assert.match(weapon, /scaleX\(\$\{facingLeft \? -1 : 1\}\)/);
  assert.match(weapon, /data-testid="clearing-attack-vfx"/);
  assert.match(weapon, /rotate\(\$\{angleRadians\}rad\)/);
  assert.equal(weapon.match(/data-testid="clearing-equipped-weapon-image"/g)?.length, 1);
  assert.match(combat, /clearingWeaponOrigin\(petPos,petSize,worldPixels,facingLeft\)/);
});

test("moving enemies use a grounded CSS squish with reduced-motion support", () => {
  assert.match(combat, /data-enemy-state=\{e\.state\}/);
  assert.match(combat, /\["roaming","pursuing","returning"\]\.includes\(e\.state\)/);
  assert.match(combat, /clearing-enemy-art\.is-moving/);
  assert.match(combat, /transform-origin:50% 100%/);
  assert.match(combat, /scaleY\(\.96\)/);
  assert.match(combat, /prefers-reduced-motion:reduce/);
  assert.match(combat, /clearing-enemy-art\.is-moving\{animation:none\}/);
  assert.doesNotMatch(combat, /setInterval\(/);
});
`;

fs.writeFileSync(combatPath, combat);
fs.writeFileSync(scenePath, scene);
fs.writeFileSync(weaponPath, weapon);
fs.writeFileSync(testPath, tests);
