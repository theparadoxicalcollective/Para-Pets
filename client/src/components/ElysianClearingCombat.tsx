import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { queryClient } from "@/lib/queryClient";
import { ELYSIAN_CLEARING_COMBAT_CONFIG as CFG } from "@/lib/elysianClearingCombatConfig";
import type { PetWalkPos } from "@/hooks/usePetWalkController";
import { Sword } from "lucide-react";
import skullUrl from "@assets/Photoroom_20260705_103527_PM_1783308939570.png";
import { clampPoint, pixelDelta, pixelDistance, stepToward, type WorldPixels } from "@/lib/elysianClearingCombatMath";
import { useClearingEquipment } from "@/hooks/useClearingEquipment";
import ClearingEquipmentModal from "@/components/ClearingEquipmentModal";
import { ClearingInventoryPanel } from "@/components/ClearingEquipmentPanels";
import { currencyAssets } from "@/lib/currencyAssets";
import fallbackPet from "@assets/logo_parapets.png";
import { usePlayerCurrencyBalances } from "@/hooks/usePlayerCurrencyBalances";
import { enemyFlipScale, nextEnemyFacing } from "@shared/clearingCombat";
import type { ClearingLoadout } from "@shared/clearingEquipment";
import ClearingAttackEffect from "@/components/ClearingAttackEffect";
import { CLEARING_SWORD_TIMING, type ClearingAttackPhase } from "@/lib/clearingWeaponVisuals";
import { clearingWeaponOrigin } from "@/lib/clearingPetPresentation";
import type { ClearingCurrencyDrop, ClearingRewardChest } from "@shared/clearingEquipment";
import { useClearingCurrencyDrops } from "@/hooks/useClearingCurrencyDrops";
import ClearingCurrencyDropLayer from "@/components/ClearingCurrencyDropLayer";
import { ClearingChestLayer, ClearingChestModal } from "@/components/ClearingRewardChests";
import { CLEARING_WORLD_LAYERS, worldYToDepth } from "@/lib/clearingWorldPresentation";

type EnemyState = "spawning" | "roaming" | "pursuing" | "windup" | "recovering" | "returning" | "defeated" | "respawning";
type Enemy = { instanceId:string; slot:number; maxHealth:number; health:number; attack:number; x:number; y:number; targetX:number; targetY:number; state:EnemyState; facingLeft:boolean; nextActionAt:number };
type EnemyDeathEffect = { effectId:string; enemyInstanceId:string; x:number; y:number; exp:number };
type Session = { sessionId:string; loadout:ClearingLoadout; pet:{inventoryId:string;maxHealth:number;attack:number}; enemies:Array<Omit<Enemy,"x"|"y"|"targetX"|"targetY"|"state"|"facingLeft"|"nextActionAt">>; chests:ClearingRewardChest[]; currencyDrops:ClearingCurrencyDrop[] };

const randomBetween = (a:number,b:number) => a + Math.random()*(b-a);
let activeClearingLoops = 0;

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
  const equipment=useClearingEquipment();const balances=usePlayerCurrencyBalances();
  const currency=useClearingCurrencyDrops(session?.sessionId??null); const collectingDrops=useRef(new Set<string>());
  const [chests,setChests]=useState<ClearingRewardChest[]>([]);const [selectedChest,setSelectedChest]=useState<ClearingRewardChest|null>(null);const [openingChestId,setOpeningChestId]=useState<string|null>(null);const chestControlRef=useRef<HTMLButtonElement|null>(null);const [claimingChest,setClaimingChest]=useState(false);const [chestError,setChestError]=useState<string|null>(null);
  const [equipmentOpen,setEquipmentOpen]=useState(false);const [inventoryOpen,setInventoryOpen]=useState(false);
  const gameplayState: "loading"|"running"|"menu-paused"|"defeated" = sessionState!=="ready" ? "loading" : equipmentOpen||inventoryOpen||Boolean(selectedChest)||Boolean(openingChestId) ? "menu-paused" : petHealth<=0 ? "defeated" : "running";
  const gameplayStateRef=useRef(gameplayState);gameplayStateRef.current=gameplayState;
  const pausedAt=useRef<number|null>(null);
  const sessionStartedAt=useRef(performance.now());
  const onRespawnRef=useRef(onRespawn);onRespawnRef.current=onRespawn;

  useEffect(() => {
    onGameplayBlockedChange(equipmentOpen||inventoryOpen||Boolean(selectedChest)||Boolean(openingChestId));
    return () => onGameplayBlockedChange(false);
  }, [equipmentOpen,inventoryOpen,selectedChest,openingChestId,onGameplayBlockedChange]);

  useEffect(()=>{const now=performance.now();if(gameplayState==="menu-paused"&&pausedAt.current===null)pausedAt.current=now;else if(gameplayState==="running"&&pausedAt.current!==null){const duration=now-pausedAt.current;for(const enemy of enemiesRef.current)if(Number.isFinite(enemy.nextActionAt))enemy.nextActionAt+=duration+250;lastAttack.current+=duration;pausedAt.current=null;}},[gameplayState]);

  useEffect(()=>{ let alive=true; let createdId=""; setSessionState("loading");
    fetch("/api/explore/elysian-clearing/session",{method:"POST",credentials:"include"}).then(async r=>{const body=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(body.message||"combat session failed"),{code:body.code||`HTTP_${r.status}`,status:r.status});return body}).then((data:Session)=>{
      if(!alive)return; createdId=data.sessionId; setSession(data);setChests(data.chests??[]);queryClient.setQueryData([`/api/clearing/currency-drops?sessionId=${data.sessionId}`],data.currencyDrops??[]); queryClient.setQueryData(["/api/clearing/loadout"],data.loadout);void Promise.all([queryClient.invalidateQueries({queryKey:["/api/clearing/inventory"]}),queryClient.invalidateQueries({queryKey:["/api/clearing/loadout"]})]); setSessionState("ready"); setPetHealth(data.pet.maxHealth); setPetMaxHealth(data.pet.maxHealth); petHealthRef.current=data.pet.maxHealth; petMaxHealthRef.current=data.pet.maxHealth;
      const now=performance.now();sessionStartedAt.current=now; const built=data.enemies.slice(0,CFG.maxEnemies).map((e,i)=>{const h=CFG.homes[i]??CFG.homes[0];return {...e,slot:i,x:h.x,y:h.y,targetX:h.x,targetY:h.y,state:"spawning" as EnemyState,facingLeft:false,nextActionAt:now+(CFG.initialSpawnDelayMs[i]??500)}}); enemiesRef.current=built;setEnemies(built);
    }).catch((error:any)=>{if(alive){const code=String(error?.code||(error?.status===401?"CLEARING_AUTH_REQUIRED":"CLEARING_TEMPORARILY_UNAVAILABLE"));setSessionState("error");setFeedback([code==="CLEARING_ACTIVE_PET_REQUIRED"?"Choose an active hatched pet":code==="CLEARING_AUTH_REQUIRED"||code==="HTTP_401"?"Please sign in again":code==="CLEARING_MIGRATION_REQUIRED"?"Clearing update required":"Combat temporarily unavailable"]);} console.error("Elysian Clearing session failed",{code:error?.code??"unknown",status:error?.status});});
    return()=>{alive=false;timers.current.forEach(clearTimeout);timers.current.clear();if(recentDamageTimer.current)clearTimeout(recentDamageTimer.current);if(createdId)void fetch(`/api/explore/elysian-clearing/session/${createdId}`,{method:"DELETE",credentials:"include",keepalive:true}).catch(error=>console.error("Elysian Clearing cleanup failed",error instanceof Error?error.message:"Unknown error"));};
  },[sessionAttempt]);

  useEffect(()=>{if(!session)return;const timer=setInterval(()=>{void fetch("/api/explore/elysian-clearing/position",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,x:petPosRef.current.x,y:petPosRef.current.y})});},500);return()=>clearInterval(timer)},[session]);

  useEffect(()=>{let raf=0,last=performance.now(),lastPaint=0;activeClearingLoops++;if(import.meta.env.DEV&&activeClearingLoops>1)console.warn("More than one Clearing simulation loop is active",{activeClearingLoops});
    const tick=(now:number)=>{const rawDelta=(now-last)/1000,dt=Math.min(Math.max(rawDelta,0),.05);if(import.meta.env.DEV&&rawDelta>.25)console.warn("Clearing frame delta clamped",{rawDelta});last=now;if(document.visibilityState!=="visible"||gameplayStateRef.current!=="running"){raf=requestAnimationFrame(tick);return;} const pet=petPosRef.current;
      let activeAttackers=enemiesRef.current.filter(enemy=>["pursuing","windup","recovering"].includes(enemy.state)).length;
      for(const e of enemiesRef.current){
        if(e.state==="defeated"||e.state==="respawning"){if(now>=e.nextActionAt){const h=CFG.homes[e.slot];e.x=h.x;e.y=h.y;e.health=e.maxHealth;e.state="spawning";e.nextActionAt=now+500;}continue;}
        if(e.state==="spawning"){if(now>=e.nextActionAt){e.state="roaming";e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}continue;}
        const d=pixelDistance(e,pet,worldPixels);
        if(now-sessionStartedAt.current>=CFG.playerEntryGraceMs&&defeatedUntil.current<=now && e.state==="roaming" && d<CFG.aggroRadiusPixels&&activeAttackers<CFG.maxSimultaneousAttackers){e.state="pursuing";activeAttackers++;}
        if((e.state==="pursuing"||e.state==="windup"||e.state==="recovering")&&d>CFG.disengageRadiusPixels){e.state="returning";e.targetX=CFG.homes[e.slot].x;e.targetY=CFG.homes[e.slot].y;}
        if(e.state==="roaming"&&now>=e.nextActionAt){const h=CFG.homes[e.slot],ang=Math.random()*Math.PI*2,r=Math.random()*CFG.roamRadiusPixels;e.targetX=h.x+Math.cos(ang)*r/worldPixels.width;e.targetY=h.y+Math.sin(ang)*r/worldPixels.height;Object.assign(e,clampPoint(e,CFG.worldBounds));const target=clampPoint({x:e.targetX,y:e.targetY},CFG.worldBounds);e.targetX=target.x;e.targetY=target.y;e.nextActionAt=Infinity;}
        if(e.state==="pursuing"&&d<=CFG.attackRangePixels){e.state="windup";e.nextActionAt=now+CFG.attackWindupMs;}
        else if(e.state==="windup"&&now>=e.nextActionAt){if(d<=CFG.attackRangePixels&&now>=invulnerableUntil.current&&defeatedUntil.current<=now){const hp=Math.max(0,petHealthRef.current-e.attack);petHealthRef.current=hp;setPetHealth(hp);setRecentlyDamaged(true);if(recentDamageTimer.current)clearTimeout(recentDamageTimer.current);recentDamageTimer.current=setTimeout(()=>{setRecentlyDamaged(false);recentDamageTimer.current=null;},CFG.recentDamageDisplayMs);invulnerableUntil.current=now+CFG.petInvulnerabilityMs;if(hp===0){defeatedUntil.current=now+1400;invulnerableUntil.current=defeatedUntil.current+CFG.respawnProtectionMs;const timer=setTimeout(()=>{onRespawnRef.current();const full=petMaxHealthRef.current;petHealthRef.current=full;setPetHealth(full);setRecentlyDamaged(false);if(recentDamageTimer.current){clearTimeout(recentDamageTimer.current);recentDamageTimer.current=null;}timers.current.delete(timer);},1400);timers.current.add(timer);}}e.state="recovering";e.nextActionAt=now+CFG.attackCooldownMs;}
        else if(e.state==="recovering"&&now>=e.nextActionAt)e.state="pursuing";
        let tx=e.targetX,ty=e.targetY;let speed:number=CFG.roamSpeedPixels;
        if(e.state==="pursuing"){tx=pet.x;ty=pet.y;speed=CFG.pursuitSpeedPixels;} else if(e.state==="returning"){tx=CFG.homes[e.slot].x;ty=CFG.homes[e.slot].y;speed=CFG.roamSpeedPixels;}
        if(e.state==="roaming"||e.state==="pursuing"||e.state==="returning"){const delta=pixelDelta(e,{x:tx,y:ty},worldPixels),len=Math.hypot(delta.dx,delta.dy);if(len>2){Object.assign(e,clampPoint(stepToward(e,{x:tx,y:ty},speed*dt,worldPixels),CFG.worldBounds));e.facingLeft=nextEnemyFacing(e.facingLeft?"left":"right",delta.dx,CFG.facingDeadZonePixels)==="left";}else if(e.state==="returning"){e.state="roaming";e.nextActionAt=now+1000;}else if(e.state==="roaming"&&e.nextActionAt===Infinity)e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}
        for(const other of enemiesRef.current){if(other===e||["defeated","respawning","spawning"].includes(other.state))continue;const gap=pixelDelta(other,e,worldPixels),distance=Math.hypot(gap.dx,gap.dy);if(distance>0&&distance<CFG.enemySeparationPixels){const push=(CFG.enemySeparationPixels-distance)*.35*dt;e.x+=gap.dx/distance*push/worldPixels.width;e.y+=gap.dy/distance*push/worldPixels.height;Object.assign(e,clampPoint(e,CFG.worldBounds));}}
      }
      if(import.meta.env.DEV&&enemiesRef.current.some(entity=>!Number.isFinite(entity.x)||!Number.isFinite(entity.y)))console.warn("Clearing rejected a non-finite entity coordinate");
      if(now-lastPaint>50){setEnemies(enemiesRef.current.map(e=>({...e})));lastPaint=now;}raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(raf);activeClearingLoops=Math.max(0,activeClearingLoops-1);};
  },[worldPixels.width,worldPixels.height]);

  useEffect(()=>{if(gameplayState!=="running")return;for(const drop of currency.drops.data??[]){if(collectingDrops.current.has(drop.dropId)||pixelDistance({x:drop.worldX,y:drop.worldY},petPos,worldPixels)>CFG.pickupRadiusPixels)continue;collectingDrops.current.add(drop.dropId);currency.collect.mutate(drop.dropId,{onSettled:()=>collectingDrops.current.delete(drop.dropId)});}},[petPos,worldPixels,gameplayState,currency.drops.data]);

  const attack=useCallback((e:React.PointerEvent)=>{e.preventDefault();e.stopPropagation();const now=performance.now();if(gameplayStateRef.current!=="running"||!session){setFeedback([sessionState==="loading"?"Combat loading…":"Combat paused"]);return;}if(now<defeatedUntil.current)return;if(attackPhaseRef.current!=="idle"||now-lastAttack.current<CFG.petAttackCooldownMs){setFeedback(["Cooling down"]);return;}lastAttack.current=now;const slashFacesLeft=facingLeft;setAttackFacingLeft(slashFacesLeft);setAttackPhase("windup");
    const impactTimer=setTimeout(async()=>{setAttackPhase("impact");const p=petPosRef.current,dir=slashFacesLeft?-1:1;const target=enemiesRef.current.filter(x=>!['defeated','respawning','spawning'].includes(x.state)).map(x=>{const d=pixelDistance(x,p,worldPixels),delta=pixelDelta(p,x,worldPixels);return{x,d,dot:(delta.dx*dir)/Math.max(.001,d)}}).filter(v=>v.d<=CFG.petAttackRangePixels&&v.dot>=CFG.petAttackArcDot).sort((a,b)=>a.d-b.d)[0]?.x;
      if(!target){setFeedback(["Miss"]);return;}
      try{const r=await fetch("/api/explore/elysian-clearing/attack",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,enemyInstanceId:target.instanceId,targetPosition:{x:target.x,y:target.y}})});if(!r.ok)throw new Error(`Attack rejected (${r.status})`);const data=await r.json();target.health=data.health;if(data.defeated){const defeated={effectId:`${target.instanceId}-${++effectSequence.current}`,enemyInstanceId:target.instanceId,x:target.x,y:target.y,exp:Number(data.expAwarded||0)};setDeathEffects(current=>[...current,defeated]);const effectTimer=setTimeout(()=>{setDeathEffects(current=>current.filter(effect=>effect.effectId!==defeated.effectId));timers.current.delete(effectTimer);},CFG.deathEffect.durationMs);timers.current.add(effectTimer);target.state="defeated";target.nextActionAt=performance.now()+randomBetween(CFG.respawnDelayMs.min,CFG.respawnDelayMs.max);if(data.currencyDrop)queryClient.setQueryData<ClearingCurrencyDrop[]>([`/api/clearing/currency-drops?sessionId=${session.sessionId}`],current=>current?.some(drop=>drop.dropId===data.currencyDrop.dropId)?current:[...(current??[]),data.currencyDrop]);if(data.chest)setChests(current=>current.some(chest=>chest.chestId===data.chest.chestId)?current:[...current,data.chest]);if(data.nextEnemy){target.instanceId=data.nextEnemy.instanceId;target.health=data.nextEnemy.health;}setFeedback(["Enemy defeated",data.chest?"Equipment chest appeared":data.currencyDrop?"Currency dropped":""] .filter(Boolean));setTimeout(()=>setFeedback([]),1800);}else{target.state="pursuing";setFeedback(["Hit"]);}setEnemies(enemiesRef.current.map(x=>({...x})));}catch(error){setFeedback(["Attack failed"]);console.error("Elysian Clearing attack failed",error instanceof Error?error.message:"Unknown error");}
    },CLEARING_SWORD_TIMING.windupMs);timers.current.add(impactTimer);
    const recoveryTimer=setTimeout(()=>setAttackPhase("recovery"),CLEARING_SWORD_TIMING.windupMs+CLEARING_SWORD_TIMING.impactMs);timers.current.add(recoveryTimer);
    const idleTimer=setTimeout(()=>setAttackPhase("idle"),CLEARING_SWORD_TIMING.totalMs);timers.current.add(idleTimer);
  },[session,sessionState,facingLeft,worldPixels]);

  const collectChest=async()=>{if(!selectedChest||claimingChest)return;setClaimingChest(true);setChestError(null);try{const response=await fetch(`/api/explore/elysian-clearing/chests/${selectedChest.chestId}/claim`,{method:"POST",credentials:"include"});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||"Unable to collect rewards");setChests(current=>current.filter(chest=>chest.chestId!==selectedChest.chestId));setSelectedChest(null);setFeedback([body.alreadyClaimed?"Rewards already collected":"Rewards collected"]);setTimeout(()=>setFeedback([]),1600);await Promise.all([queryClient.invalidateQueries({queryKey:["/api/inventory"]}),queryClient.invalidateQueries({queryKey:["/api/clearing/inventory"]}),queryClient.invalidateQueries({queryKey:["/api/clearing/loadout"]}),queryClient.invalidateQueries({queryKey:["/api/auth/me"]})]);void balances.query.refetch();}catch(error){setChestError(error instanceof Error?error.message:"Unable to collect rewards");}finally{setClaimingChest(false);}};

  const openChest=(chest:ClearingRewardChest,control:HTMLButtonElement)=>{if(openingChestId||selectedChest)return;chestControlRef.current=control;setChestError(null);setOpeningChestId(chest.chestId);const timer=setTimeout(()=>{setOpeningChestId(null);setSelectedChest(chest);timers.current.delete(timer);},180);timers.current.add(timer);};

  const threatened = enemies.some(enemy => enemy.health > 0 && ["pursuing", "windup", "recovering"].includes(enemy.state));
  const healthPercent = Math.max(0, Math.min(100, 100 * petHealth / Math.max(1, petMaxHealth)));
  const weaponOrigin = clearingWeaponOrigin(petPos,petSize,worldPixels,attackFacingLeft);
  if(import.meta.env.DEV&&(!Number.isFinite(weaponOrigin.x)||!Number.isFinite(weaponOrigin.y)))console.warn("Clearing weapon origin is invalid",weaponOrigin);
  const healthColor = healthPercent <= 25 ? "#ef4444" : healthPercent <= 50 ? "#eab308" : "#22c55e";
  const mutateLoadout=async(action:()=>Promise<unknown>)=>{try{await action();setFeedback(["Clearing Loadout updated","New equipment will apply when you re-enter the Clearing."]);setTimeout(()=>setFeedback([]),3000)}catch{setFeedback(["Equipment update failed"]);}};
  const fixedHud = <>
    <div className="absolute pointer-events-auto flex gap-2" style={{left:14,top:"max(58px, calc(env(safe-area-inset-top, 0px) + 58px))",zIndex:18}}><button data-interactive data-testid="button-clearing-equipment" aria-label="Open pet equipment" onClick={()=>setEquipmentOpen(true)} className="h-12 w-12 overflow-hidden rounded-full border-2 border-amber-300 bg-emerald-950 shadow-lg"><img src={activePet?.hatchedImageUrl||activePet?.imageUrl||fallbackPet} onError={e=>{e.currentTarget.src=fallbackPet}} alt="Active pet" className="h-full w-full object-contain"/></button></div>
    <div data-testid="clearing-currency-display" aria-live="polite" className="absolute right-3 pointer-events-none flex gap-2 rounded-xl border border-amber-500/70 bg-emerald-950/90 px-2 py-1 text-xs font-bold text-amber-100 shadow-lg" style={{top:"max(58px, calc(env(safe-area-inset-top, 0px) + 58px))",zIndex:17}}><span className="flex items-center gap-1"><img src={currencyAssets.essenceToken} alt="Essence" className="h-5 w-5 object-contain"/>{balances.loading?"…":balances.error?"—":balances.formattedEssence}</span><span className="flex items-center gap-1"><img src={currencyAssets.coin} alt="Coins" className="h-5 w-5 object-contain"/>{balances.loading?"…":balances.error?"—":balances.formattedCoin}</span></div>
    <ClearingEquipmentModal open={equipmentOpen} onOpenChange={setEquipmentOpen} onOpenInventory={()=>setInventoryOpen(true)} inventory={equipment.inventory.data} loadout={equipment.loadout.data} onUnequip={slot=>void mutateLoadout(()=>equipment.unequip.mutateAsync(slot))} onEquip={id=>void mutateLoadout(()=>equipment.equip.mutateAsync(id))}/>
    <ClearingInventoryPanel open={inventoryOpen} onOpenChange={setInventoryOpen} items={equipment.inventory.data} loadout={equipment.loadout.data} onEquip={id=>void mutateLoadout(()=>equipment.equip.mutateAsync(id))} onSell={ids=>equipment.sell.mutateAsync(ids)}/>

    {feedback.length>0&&<div className="absolute left-1/2 top-1/4 -translate-x-1/2 text-center font-bold text-yellow-200 pointer-events-none" style={{zIndex:20,textShadow:"0 2px 4px #000"}}>{feedback.map(x=><div key={x}>{x}</div>)}</div>}
    {sessionState==="error"&&<button data-interactive data-testid="button-clearing-retry" type="button" className="absolute left-1/2 top-[32%] -translate-x-1/2 rounded-lg border border-amber-300 bg-emerald-950 px-4 py-2 font-bold text-amber-100" style={{zIndex:21}} onClick={()=>{setFeedback([]);setSessionAttempt(v=>v+1)}}>Retry</button>}
    <button disabled={sessionState!=="ready"||petHealth<=0} data-interactive data-testid="button-clearing-attack" aria-label="Sword attack" onPointerDown={attack} className="absolute pointer-events-auto rounded-full active:scale-90 disabled:opacity-50 text-white border-2 border-amber-200 flex items-center justify-center" style={{right:"max(20px, env(safe-area-inset-right))",bottom:"max(20px, env(safe-area-inset-bottom))",width:CFG.attackButtonSize,height:CFG.attackButtonSize,zIndex:15,touchAction:"none",background:"#294b35",boxShadow:"0 3px 12px #000"}}><Sword aria-hidden size={28}/></button>
  </>;

  return <>
    <ClearingCurrencyDropLayer drops={currency.drops.data??[]} collecting={collectingDrops.current}/>
    <ClearingChestLayer chests={chests} openingChestId={openingChestId} openedChestId={selectedChest?.chestId??null} onOpen={openChest}/>
    {(threatened||recentlyDamaged)&&<div data-testid="clearing-pet-health-bar" className="absolute pointer-events-none" style={{left:`${petPos.x*100}%`,top:`${petPos.y*100}%`,width:CFG.petHealthBar.width,height:CFG.petHealthBar.height,transform:`translate(-50%, -${Math.max(CFG.petHealthBar.offset,petSize*.9)}px)`,zIndex:8,border:"1px solid rgba(255,255,255,.45)",borderRadius:999,background:"rgba(0,0,0,.7)",overflow:"hidden"}}><div className="h-full transition-[width]" style={{width:`${healthPercent}%`,background:healthColor}} /></div>}
    {enemies.map(e=>!["spawning","defeated","respawning"].includes(e.state)&&<div key={e.instanceId} className="absolute pointer-events-none" style={{left:`${e.x*100}%`,top:`${e.y*100}%`,width:CFG.spriteSize,height:CFG.spriteSize,transform:`translate(-50%,-75%) scaleX(${enemyFlipScale(e.facingLeft?"left":"right",CFG.naturalFacing)})`,zIndex:worldYToDepth(e.y),filter:e.state==="windup"?"drop-shadow(0 0 9px #ff3b30) brightness(1.25)":"none"}}><img src={CFG.enemyImageUrl} onError={event=>{event.currentTarget.src=fallbackPet}} alt={CFG.enemyName} className="w-full h-full object-contain" draggable={false}/>{(e.health<e.maxHealth||e.state!=="roaming")&&<div className="absolute -top-1 left-2 right-2 h-1.5 rounded bg-black/70 overflow-hidden"><div className="h-full bg-red-500" style={{width:`${100*e.health/e.maxHealth}%`}}/></div>}</div>)}
    {deathEffects.map(effect=><div key={effect.effectId} data-enemy-instance-id={effect.enemyInstanceId} data-testid="clearing-enemy-death-effect" className="absolute pointer-events-none" style={{left:`${effect.x*100}%`,top:`${effect.y*100}%`,width:CFG.deathEffect.size,height:CFG.deathEffect.size,transform:"translate(-50%,-75%)",zIndex:worldYToDepth(effect.y,CLEARING_WORLD_LAYERS.effectOffset)}}><img src={skullUrl} alt="" className="h-full w-full object-contain animate-clearing-skull" draggable={false}/>{effect.exp>0&&<span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-xs font-black text-sky-100 drop-shadow">+{effect.exp} EXP</span>}</div>)}
    <ClearingAttackEffect weapon={session?.loadout.weapon??equipment.loadout.data?.weapon??null} phase={attackPhase} facingLeft={attackFacingLeft} x={weaponOrigin.x} y={weaponOrigin.y} petSize={petSize} playerY={petPos.y}/>
    <style>{`.clearing-reward-tile{display:flex;min-height:96px;align-items:center;justify-content:center;flex-direction:column;gap:4px;border-radius:12px;border:1px solid rgba(245,158,11,.35);background:rgba(2,44,34,.65);padding:8px}.clearing-chest-shadow{position:absolute;left:8px;right:8px;bottom:5px;height:9px;border-radius:50%;background:rgba(0,0,0,.38);filter:blur(3px)}@keyframes clearing-chest-open{0%{transform:scale(1)}45%{transform:scale(.9) translateY(2px)}100%{transform:scale(1)}}.animate-clearing-chest-open{animation:clearing-chest-open 180ms ease-out}@keyframes clearing-skull-defeat{0%{opacity:0;transform:translateY(4px) scale(.7)}18%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-${CFG.deathEffect.risePixels}px) scale(1)}}.animate-clearing-skull{animation:clearing-skull-defeat ${CFG.deathEffect.durationMs}ms ease-out forwards}.clearing-chest-sparkles{position:absolute;inset:-4px;pointer-events:none;color:#c4b5fd}.clearing-chest-sparkles-epic{color:#e879f9}.clearing-chest-sparkles-legendary{color:#fde047}.clearing-chest-sparkles i{position:absolute;width:5px;height:5px;background:currentColor;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:clearing-sparkle 1.8s ease-in-out infinite}.clearing-chest-sparkles i:nth-child(1){left:4px;top:9px}.clearing-chest-sparkles i:nth-child(2){right:3px;top:18px;animation-delay:.6s}.clearing-chest-sparkles i:nth-child(3){left:25px;top:0;animation-delay:1.1s}@keyframes clearing-sparkle{0%,65%,100%{opacity:0;transform:scale(.4)}75%{opacity:1;transform:scale(1)}}@media(prefers-reduced-motion:reduce){.animate-clearing-skull,.animate-clearing-chest-open{animation:none}.clearing-chest-sparkles i{animation:none;opacity:.65}}`}</style>
    <ClearingChestModal chest={selectedChest} claiming={claimingChest} error={chestError} onClose={()=>{if(!claimingChest)setSelectedChest(null)}} onClaim={()=>void collectChest()} restoreFocus={chestControlRef.current}/>
    {hudElement&&createPortal(fixedHud,hudElement)}
  </>;
}
