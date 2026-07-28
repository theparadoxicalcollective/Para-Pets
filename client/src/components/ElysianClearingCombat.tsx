import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { queryClient } from "@/lib/queryClient";
import { ELYSIAN_CLEARING_COMBAT_CONFIG as CFG } from "@/lib/elysianClearingCombatConfig";
import type { PetWalkPos } from "@/hooks/usePetWalkController";
import { Sword } from "lucide-react";
import skullUrl from "@assets/Photoroom_20260705_103527_PM_1783308939570.png";
import { clampPoint, pixelDelta, pixelDistance, stepToward, type WorldPixels } from "@/lib/elysianClearingCombatMath";
import { useClearingGroundDrops } from "@/hooks/useClearingGroundDrops";
import { useClearingEquipment } from "@/hooks/useClearingEquipment";
import ClearingGroundDropLayer from "@/components/ClearingGroundDropLayer";
import ClearingEquipmentModal from "@/components/ClearingEquipmentModal";
import type { ClearingGroundDrop } from "@shared/clearingEquipment";
import type { ClearingCurrencyDrop } from "@shared/clearingEquipment";
import { useClearingCurrencyDrops } from "@/hooks/useClearingCurrencyDrops";
import ClearingCurrencyDropLayer from "@/components/ClearingCurrencyDropLayer";
import { ClearingInventoryPanel } from "@/components/ClearingEquipmentPanels";
import { currencyAssets } from "@/lib/currencyAssets";
import fallbackPet from "@assets/logo_parapets.png";
import { usePlayerCurrencyBalances } from "@/hooks/usePlayerCurrencyBalances";
import { enemyFlipScale, nextEnemyFacing } from "@shared/clearingCombat";
import type { ClearingLoadout } from "@shared/clearingEquipment";
import ClearingAttackEffect from "@/components/ClearingAttackEffect";
import { CLEARING_SWORD_TIMING, type ClearingAttackPhase } from "@/lib/clearingWeaponVisuals";
import { clearingWeaponOrigin } from "@/lib/clearingPetPresentation";

type EnemyState = "spawning" | "roaming" | "pursuing" | "windup" | "recovering" | "returning" | "defeated" | "respawning";
type Enemy = { instanceId:string; slot:number; maxHealth:number; health:number; attack:number; x:number; y:number; targetX:number; targetY:number; state:EnemyState; facingLeft:boolean; nextActionAt:number };
type EnemyDeathEffect = { effectId:string; enemyInstanceId:string; x:number; y:number };
type Session = { sessionId:string; loadout:ClearingLoadout; pet:{inventoryId:string;maxHealth:number;attack:number}; enemies:Array<Omit<Enemy,"x"|"y"|"targetX"|"targetY"|"state"|"facingLeft"|"nextActionAt">> };

const randomBetween = (a:number,b:number) => a + Math.random()*(b-a);

export default function ElysianClearingCombat({ petPos, petSize, activePet, facingLeft, onRespawn, worldPixels, hudElement, onGameplayBlockedChange }: { petPos:PetWalkPos; petSize:number; activePet?:any; facingLeft:boolean; onRespawn:()=>void; worldPixels:WorldPixels; hudElement:HTMLElement|null; onGameplayBlockedChange:(blocked:boolean)=>void }) {
  const petPosRef = useRef(petPos); petPosRef.current = petPos;
  const [session, setSession] = useState<Session|null>(null);
  const [sessionState,setSessionState]=useState<"loading"|"ready"|"error">("loading");
  const [sessionAttempt,setSessionAttempt]=useState(0);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const [petHealth,setPetHealth] = useState(1); const [petMaxHealth,setPetMaxHealth] = useState(1);
  const [recentlyDamaged,setRecentlyDamaged] = useState(false); const recentDamageTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [deathEffects,setDeathEffects] = useState<EnemyDeathEffect[]>([]); const effectSequence=useRef(0);
  const petHealthRef=useRef(1); const petMaxHealthRef=useRef(1); const invulnerableUntil=useRef(0); const defeatedUntil=useRef(0); const timers=useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastAttack=useRef(0); const attackPhaseRef=useRef<ClearingAttackPhase>("idle"); const [attackPhase,setAttackPhaseState]=useState<ClearingAttackPhase>("idle"); const setAttackPhase=(phase:ClearingAttackPhase)=>{attackPhaseRef.current=phase;setAttackPhaseState(phase)}; const [attackFacingLeft,setAttackFacingLeft]=useState(false); const [feedback,setFeedback]=useState<string[]>([]);
  const ground=useClearingGroundDrops(session?.sessionId??null); const equipment=useClearingEquipment();const currency=useClearingCurrencyDrops(session?.sessionId??null);const balances=usePlayerCurrencyBalances();
  const [collecting,setCollecting]=useState(new Set<string>()); const [confirmations,setConfirmations]=useState<ClearingGroundDrop[]>([]);
  const [equipmentOpen,setEquipmentOpen]=useState(false);const [inventoryOpen,setInventoryOpen]=useState(false);const [currencyCollecting,setCurrencyCollecting]=useState(new Set<string>());const [currencyConfirm,setCurrencyConfirm]=useState<ClearingCurrencyDrop|null>(null);
  const gameplayState: "loading"|"running"|"menu-paused"|"defeated" = sessionState!=="ready" ? "loading" : equipmentOpen||inventoryOpen ? "menu-paused" : petHealth<=0 ? "defeated" : "running";
  const gameplayStateRef=useRef(gameplayState);gameplayStateRef.current=gameplayState;
  const pausedAt=useRef<number|null>(null);

  useEffect(() => {
    onGameplayBlockedChange(equipmentOpen||inventoryOpen);
    return () => onGameplayBlockedChange(false);
  }, [equipmentOpen,inventoryOpen, onGameplayBlockedChange]);

  useEffect(()=>{const now=performance.now();if(gameplayState==="menu-paused"&&pausedAt.current===null)pausedAt.current=now;else if(gameplayState==="running"&&pausedAt.current!==null){const duration=now-pausedAt.current;for(const enemy of enemiesRef.current)if(Number.isFinite(enemy.nextActionAt))enemy.nextActionAt+=duration+250;lastAttack.current+=duration;pausedAt.current=null;}},[gameplayState]);

  useEffect(()=>{ let alive=true; let createdId=""; setSessionState("loading");
    fetch("/api/explore/elysian-clearing/session",{method:"POST",credentials:"include"}).then(async r=>{const body=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(body.message||"combat session failed"),{code:body.code||`HTTP_${r.status}`,status:r.status});return body}).then((data:Session)=>{
      if(!alive)return; createdId=data.sessionId; setSession(data); queryClient.setQueryData(["/api/clearing/loadout"],data.loadout);void Promise.all([queryClient.invalidateQueries({queryKey:["/api/clearing/inventory"]}),queryClient.invalidateQueries({queryKey:["/api/clearing/loadout"]})]); setSessionState("ready"); setPetHealth(data.pet.maxHealth); setPetMaxHealth(data.pet.maxHealth); petHealthRef.current=data.pet.maxHealth; petMaxHealthRef.current=data.pet.maxHealth;
      const now=performance.now(); const built=data.enemies.slice(0,CFG.maxEnemies).map((e,i)=>{const h=CFG.homes[i];return {...e,x:h.x,y:h.y,targetX:h.x,targetY:h.y,state:"spawning" as EnemyState,facingLeft:false,nextActionAt:now+CFG.initialSpawnDelayMs[i]}}); enemiesRef.current=built;setEnemies(built);
    }).catch((error:any)=>{if(alive){const code=String(error?.code||(error?.status===401?"CLEARING_AUTH_REQUIRED":"CLEARING_TEMPORARILY_UNAVAILABLE"));setSessionState("error");setFeedback([code==="CLEARING_ACTIVE_PET_REQUIRED"?"Choose an active hatched pet":code==="CLEARING_AUTH_REQUIRED"||code==="HTTP_401"?"Please sign in again":code==="CLEARING_MIGRATION_REQUIRED"?"Clearing update required":"Combat temporarily unavailable"]);} console.error("Elysian Clearing session failed",{code:error?.code??"unknown",status:error?.status});});
    return()=>{alive=false;timers.current.forEach(clearTimeout);timers.current.clear();if(recentDamageTimer.current)clearTimeout(recentDamageTimer.current);if(createdId)void fetch(`/api/explore/elysian-clearing/session/${createdId}`,{method:"DELETE",credentials:"include",keepalive:true}).catch(error=>console.error("Elysian Clearing cleanup failed",error instanceof Error?error.message:"Unknown error"));};
  },[sessionAttempt]);

  useEffect(()=>{if(!session)return;const timer=setInterval(()=>{void fetch("/api/explore/elysian-clearing/position",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,x:petPosRef.current.x,y:petPosRef.current.y})});},500);return()=>clearInterval(timer)},[session]);

  useEffect(()=>{if(!session)return;for(const drop of ground.drops.data??[]){if(collecting.has(drop.dropId))continue;if(pixelDistance(petPos,{x:drop.worldX,y:drop.worldY},worldPixels)>CFG.pickupRadiusPixels)continue;setCollecting(current=>new Set(current).add(drop.dropId));ground.collect.mutate(drop.dropId,{onSuccess:(result:any)=>{setCollecting(current=>{const next=new Set(current);next.delete(drop.dropId);return next});if(!result.alreadyCollected){setConfirmations(q=>[...q,drop]);setTimeout(()=>setConfirmations(q=>q.filter(x=>x.dropId!==drop.dropId)),2400)}},onError:(error:any)=>{setTimeout(()=>setCollecting(current=>{const next=new Set(current);next.delete(drop.dropId);return next}),800);if(/expired|not found|another session/i.test(String(error)))void ground.drops.refetch();}});break;}},[petPos.x,petPos.y,session,ground.drops.data,collecting,worldPixels]);

  useEffect(()=>{if(!session)return;for(const drop of currency.drops.data??[]){if(currencyCollecting.has(drop.dropId)||pixelDistance(petPos,{x:drop.worldX,y:drop.worldY},worldPixels)>CFG.pickupRadiusPixels)continue;setCurrencyCollecting(v=>new Set(v).add(drop.dropId));currency.collect.mutate(drop.dropId,{onSuccess:(result:any)=>{setCurrencyCollecting(v=>{const n=new Set(v);n.delete(drop.dropId);return n});if(!result.alreadyCollected){setCurrencyConfirm(drop);setTimeout(()=>setCurrencyConfirm(null),1800)}},onError:()=>setTimeout(()=>setCurrencyCollecting(v=>{const n=new Set(v);n.delete(drop.dropId);return n}),700)});break;}},[petPos.x,petPos.y,session,currency.drops.data,currencyCollecting,worldPixels]);

  useEffect(()=>{let raf=0,last=performance.now(),lastPaint=0;
    const tick=(now:number)=>{const dt=Math.min((now-last)/1000,.05);last=now;if(gameplayStateRef.current!=="running"){raf=requestAnimationFrame(tick);return;} const pet=petPosRef.current;
      for(const e of enemiesRef.current){
        if(e.state==="defeated"||e.state==="respawning"){if(now>=e.nextActionAt){const h=CFG.homes[e.slot];e.x=h.x;e.y=h.y;e.health=e.maxHealth;e.state="spawning";e.nextActionAt=now+500;}continue;}
        if(e.state==="spawning"){if(now>=e.nextActionAt){e.state="roaming";e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}continue;}
        const d=pixelDistance(e,pet,worldPixels);
        if(defeatedUntil.current<=now && (e.state==="roaming"||e.state==="returning") && d<CFG.aggroRadiusPixels)e.state="pursuing";
        if((e.state==="pursuing"||e.state==="windup"||e.state==="recovering")&&d>CFG.disengageRadiusPixels){e.state="returning";e.targetX=CFG.homes[e.slot].x;e.targetY=CFG.homes[e.slot].y;}
        if(e.state==="roaming"&&now>=e.nextActionAt){const h=CFG.homes[e.slot],ang=Math.random()*Math.PI*2,r=Math.random()*CFG.roamRadiusPixels;e.targetX=h.x+Math.cos(ang)*r/worldPixels.width;e.targetY=h.y+Math.sin(ang)*r/worldPixels.height;Object.assign(e,clampPoint(e,CFG.worldBounds));const target=clampPoint({x:e.targetX,y:e.targetY},CFG.worldBounds);e.targetX=target.x;e.targetY=target.y;e.nextActionAt=Infinity;}
        if(e.state==="pursuing"&&d<=CFG.attackRangePixels){e.state="windup";e.nextActionAt=now+CFG.attackWindupMs;}
        else if(e.state==="windup"&&now>=e.nextActionAt){if(d<=CFG.attackRangePixels&&now>=invulnerableUntil.current&&defeatedUntil.current<=now){const hp=Math.max(0,petHealthRef.current-e.attack);petHealthRef.current=hp;setPetHealth(hp);setRecentlyDamaged(true);if(recentDamageTimer.current)clearTimeout(recentDamageTimer.current);recentDamageTimer.current=setTimeout(()=>{setRecentlyDamaged(false);recentDamageTimer.current=null;},CFG.recentDamageDisplayMs);invulnerableUntil.current=now+CFG.petInvulnerabilityMs;if(hp===0){defeatedUntil.current=now+1400;invulnerableUntil.current=defeatedUntil.current+CFG.respawnProtectionMs;const timer=setTimeout(()=>{onRespawn();const full=petMaxHealthRef.current;petHealthRef.current=full;setPetHealth(full);setRecentlyDamaged(false);if(recentDamageTimer.current){clearTimeout(recentDamageTimer.current);recentDamageTimer.current=null;}timers.current.delete(timer);},1400);timers.current.add(timer);}}e.state="recovering";e.nextActionAt=now+CFG.attackCooldownMs;}
        else if(e.state==="recovering"&&now>=e.nextActionAt)e.state="pursuing";
        let tx=e.targetX,ty=e.targetY;let speed:number=CFG.roamSpeedPixels;
        if(e.state==="pursuing"){tx=pet.x;ty=pet.y;speed=CFG.pursuitSpeedPixels;} else if(e.state==="returning"){tx=CFG.homes[e.slot].x;ty=CFG.homes[e.slot].y;speed=CFG.roamSpeedPixels;}
        if(e.state==="roaming"||e.state==="pursuing"||e.state==="returning"){const delta=pixelDelta(e,{x:tx,y:ty},worldPixels),len=Math.hypot(delta.dx,delta.dy);if(len>2){Object.assign(e,clampPoint(stepToward(e,{x:tx,y:ty},speed*dt,worldPixels),CFG.worldBounds));e.facingLeft=nextEnemyFacing(e.facingLeft?"left":"right",delta.dx,CFG.facingDeadZonePixels)==="left";}else if(e.state==="returning"){e.state="roaming";e.nextActionAt=now+1000;}else if(e.state==="roaming"&&e.nextActionAt===Infinity)e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}
      }
      if(now-lastPaint>50){setEnemies(enemiesRef.current.map(e=>({...e})));lastPaint=now;}raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[onRespawn,worldPixels.width,worldPixels.height]);

  const attack=useCallback((e:React.PointerEvent)=>{e.preventDefault();e.stopPropagation();const now=performance.now();if(gameplayStateRef.current!=="running"||!session){setFeedback([sessionState==="loading"?"Combat loading…":"Combat paused"]);return;}if(now<defeatedUntil.current)return;if(attackPhaseRef.current!=="idle"||now-lastAttack.current<CFG.petAttackCooldownMs){setFeedback(["Cooling down"]);return;}lastAttack.current=now;const slashFacesLeft=facingLeft;setAttackFacingLeft(slashFacesLeft);setAttackPhase("windup");
    const impactTimer=setTimeout(async()=>{setAttackPhase("impact");const p=petPosRef.current,dir=slashFacesLeft?-1:1;const target=enemiesRef.current.filter(x=>!['defeated','respawning','spawning'].includes(x.state)).map(x=>{const d=pixelDistance(x,p,worldPixels),delta=pixelDelta(p,x,worldPixels);return{x,d,dot:(delta.dx*dir)/Math.max(.001,d)}}).filter(v=>v.d<=CFG.petAttackRangePixels&&v.dot>=CFG.petAttackArcDot).sort((a,b)=>a.d-b.d)[0]?.x;
      if(!target){setFeedback(["Miss"]);return;}
      try{const r=await fetch("/api/explore/elysian-clearing/attack",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,enemyInstanceId:target.instanceId,targetPosition:{x:target.x,y:target.y},defeatPosition:{x:target.x,y:target.y}})});if(!r.ok)throw new Error(`Attack rejected (${r.status})`);const data=await r.json();target.health=data.health;if(data.defeated){const defeated={effectId:`${target.instanceId}-${++effectSequence.current}`,enemyInstanceId:target.instanceId,x:target.x,y:target.y};setDeathEffects(current=>[...current,defeated]);const effectTimer=setTimeout(()=>{setDeathEffects(current=>current.filter(effect=>effect.effectId!==defeated.effectId));timers.current.delete(effectTimer);},CFG.deathEffect.durationMs);timers.current.add(effectTimer);target.state="defeated";target.nextActionAt=performance.now()+randomBetween(CFG.respawnDelayMs.min,CFG.respawnDelayMs.max);if(data.nextEnemy){target.instanceId=data.nextEnemy.instanceId;target.health=data.nextEnemy.health;}setFeedback(["Enemy defeated",`+${data.reward.exp} EXP · Currency dropped`]);setTimeout(()=>setFeedback([]),1800);queryClient.invalidateQueries({queryKey:["/api/inventory"]});if(data.equipmentDrop)void ground.drops.refetch();if(data.currencyDrop)void currency.drops.refetch();}else{target.state="pursuing";setFeedback(["Hit"]);}setEnemies(enemiesRef.current.map(x=>({...x})));}catch(error){setFeedback(["Attack failed"]);console.error("Elysian Clearing attack failed",error instanceof Error?error.message:"Unknown error");}
    },CLEARING_SWORD_TIMING.windupMs);timers.current.add(impactTimer);
    const recoveryTimer=setTimeout(()=>setAttackPhase("recovery"),CLEARING_SWORD_TIMING.windupMs+CLEARING_SWORD_TIMING.impactMs);timers.current.add(recoveryTimer);
    const idleTimer=setTimeout(()=>setAttackPhase("idle"),CLEARING_SWORD_TIMING.totalMs);timers.current.add(idleTimer);
  },[session,sessionState,facingLeft,worldPixels,ground.drops,currency.drops]);

  const threatened = enemies.some(enemy => enemy.health > 0 && ["pursuing", "windup", "recovering"].includes(enemy.state));
  const healthPercent = Math.max(0, Math.min(100, 100 * petHealth / Math.max(1, petMaxHealth)));
  const weaponOrigin = clearingWeaponOrigin(petPos,petSize,worldPixels,attackFacingLeft);
  const healthColor = healthPercent <= 25 ? "#ef4444" : healthPercent <= 50 ? "#eab308" : "#22c55e";
  const mutateLoadout=async(action:()=>Promise<unknown>)=>{try{await action();setFeedback(["Clearing Loadout updated","New equipment will apply when you re-enter the Clearing."]);setTimeout(()=>setFeedback([]),3000)}catch{setFeedback(["Equipment update failed"]);}};
  const fixedHud = <>
    <div className="absolute pointer-events-auto flex gap-2" style={{left:14,top:"max(58px, calc(env(safe-area-inset-top, 0px) + 58px))",zIndex:18}}><button data-interactive data-testid="button-clearing-equipment" aria-label="Open pet equipment" onClick={()=>setEquipmentOpen(true)} className="h-12 w-12 overflow-hidden rounded-full border-2 border-amber-300 bg-emerald-950 shadow-lg"><img src={activePet?.isHatched?(activePet.hatchedImageUrl||activePet.imageUrl||fallbackPet):(activePet?.eggImageUrl||fallbackPet)} onError={e=>{e.currentTarget.src=fallbackPet}} alt="Active pet" className="h-full w-full object-contain"/></button></div>
    <div data-testid="clearing-currency-display" aria-live="polite" className="absolute right-3 pointer-events-none flex gap-2 rounded-xl border border-amber-500/70 bg-emerald-950/90 px-2 py-1 text-xs font-bold text-amber-100 shadow-lg" style={{top:"max(58px, calc(env(safe-area-inset-top, 0px) + 58px))",zIndex:17}}><span className="flex items-center gap-1"><img src={currencyAssets.essenceToken} alt="Essence" className="h-5 w-5 object-contain"/>{balances.loading?"…":balances.error?"—":balances.formattedEssence}</span><span className="flex items-center gap-1"><img src={currencyAssets.coin} alt="Coins" className="h-5 w-5 object-contain"/>{balances.loading?"…":balances.error?"—":balances.formattedCoin}</span></div>
    {confirmations.length>0&&<div data-testid="clearing-pickup-confirmation" className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full border border-amber-300 bg-emerald-950/95 px-4 py-2 text-sm text-amber-100 shadow-xl">Equipment Collected · {confirmations[0].name} {"★".repeat(confirmations[0].stars)}</div>}
    <ClearingEquipmentModal open={equipmentOpen} onOpenChange={setEquipmentOpen} onOpenInventory={()=>setInventoryOpen(true)} inventory={equipment.inventory.data} loadout={equipment.loadout.data} onUnequip={slot=>void mutateLoadout(()=>equipment.unequip.mutateAsync(slot))} onEquip={id=>void mutateLoadout(()=>equipment.equip.mutateAsync(id))}/>
    <ClearingInventoryPanel open={inventoryOpen} onOpenChange={setInventoryOpen} items={equipment.inventory.data} loadout={equipment.loadout.data} onEquip={id=>void mutateLoadout(()=>equipment.equip.mutateAsync(id))} onSell={ids=>equipment.sell.mutateAsync(ids)}/>
    {currencyConfirm&&<div className="absolute left-1/2 top-28 -translate-x-1/2 rounded-full border border-amber-300 bg-emerald-950/95 px-3 py-1 text-sm text-amber-100">+{currencyConfirm.amount} {currencyConfirm.currency}</div>}

    {feedback.length>0&&<div className="absolute left-1/2 top-1/4 -translate-x-1/2 text-center font-bold text-yellow-200 pointer-events-none" style={{zIndex:20,textShadow:"0 2px 4px #000"}}>{feedback.map(x=><div key={x}>{x}</div>)}</div>}
    {sessionState==="error"&&<button data-interactive data-testid="button-clearing-retry" type="button" className="absolute left-1/2 top-[32%] -translate-x-1/2 rounded-lg border border-amber-300 bg-emerald-950 px-4 py-2 font-bold text-amber-100" style={{zIndex:21}} onClick={()=>{setFeedback([]);setSessionAttempt(v=>v+1)}}>Retry</button>}
    <button disabled={sessionState!=="ready"||petHealth<=0} data-interactive data-testid="button-clearing-attack" aria-label="Sword attack" onPointerDown={attack} className="absolute pointer-events-auto rounded-full active:scale-90 disabled:opacity-50 text-white border-2 border-amber-200 flex items-center justify-center" style={{right:"max(20px, env(safe-area-inset-right))",bottom:"max(20px, env(safe-area-inset-bottom))",width:CFG.attackButtonSize,height:CFG.attackButtonSize,zIndex:15,touchAction:"none",background:"#294b35",boxShadow:"0 3px 12px #000"}}><Sword aria-hidden size={28}/></button>
  </>;

  return <>
    <ClearingGroundDropLayer drops={ground.drops.data??[]} collecting={collecting}/>
    <ClearingCurrencyDropLayer drops={currency.drops.data??[]} collecting={currencyCollecting}/>
    {(threatened||recentlyDamaged)&&<div data-testid="clearing-pet-health-bar" className="absolute pointer-events-none" style={{left:`${petPos.x*100}%`,top:`${petPos.y*100}%`,width:CFG.petHealthBar.width,height:CFG.petHealthBar.height,transform:`translate(-50%, -${Math.max(CFG.petHealthBar.offset,petSize*.9)}px)`,zIndex:8,border:"1px solid rgba(255,255,255,.45)",borderRadius:999,background:"rgba(0,0,0,.7)",overflow:"hidden"}}><div className="h-full transition-[width]" style={{width:`${healthPercent}%`,background:healthColor}} /></div>}
    {enemies.map(e=>!["spawning","defeated","respawning"].includes(e.state)&&<div key={e.instanceId} className="absolute pointer-events-none" style={{left:`${e.x*100}%`,top:`${e.y*100}%`,width:CFG.spriteSize,height:CFG.spriteSize,transform:`translate(-50%,-75%) scaleX(${enemyFlipScale(e.facingLeft?"left":"right",CFG.naturalFacing)})`,zIndex:6,filter:e.state==="windup"?"drop-shadow(0 0 9px #ff3b30) brightness(1.25)":"none"}}><img src={CFG.enemyImageUrl} alt={CFG.enemyName} className="w-full h-full object-contain" draggable={false}/>{(e.health<e.maxHealth||e.state!=="roaming")&&<div className="absolute -top-1 left-2 right-2 h-1.5 rounded bg-black/70 overflow-hidden"><div className="h-full bg-red-500" style={{width:`${100*e.health/e.maxHealth}%`}}/></div>}</div>)}
    {deathEffects.map(effect=><div key={effect.effectId} data-enemy-instance-id={effect.enemyInstanceId} data-testid="clearing-enemy-death-effect" className="absolute pointer-events-none" style={{left:`${effect.x*100}%`,top:`${effect.y*100}%`,width:CFG.deathEffect.size,height:CFG.deathEffect.size,transform:"translate(-50%,-75%)",zIndex:9}}><img src={skullUrl} alt="" className="h-full w-full object-contain animate-clearing-skull" draggable={false}/></div>)}
    <ClearingAttackEffect weapon={session?.loadout.weapon??equipment.loadout.data?.weapon??null} phase={attackPhase} facingLeft={attackFacingLeft} x={weaponOrigin.x} y={weaponOrigin.y} petSize={petSize}/>
    <style>{`@keyframes clearing-skull-defeat{0%{opacity:0;transform:translateY(4px) scale(.7)}18%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-${CFG.deathEffect.risePixels}px) scale(1)}}.animate-clearing-skull{animation:clearing-skull-defeat ${CFG.deathEffect.durationMs}ms ease-out forwards}@keyframes clearing-drop-float{0%,100%{margin-top:0}50%{margin-top:-4px}}.animate-clearing-drop{animation:clearing-drop-float 1.8s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.animate-clearing-drop,.animate-clearing-skull{animation:none}}`}</style>
    {hudElement&&createPortal(fixedHud,hudElement)}
  </>;
}
