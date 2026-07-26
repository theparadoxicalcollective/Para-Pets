import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { queryClient } from "@/lib/queryClient";
import { ELYSIAN_CLEARING_COMBAT_CONFIG as CFG } from "@/lib/elysianClearingCombatConfig";
import type { PetWalkPos } from "@/hooks/usePetWalkController";
import { Sword } from "lucide-react";
import skullUrl from "@assets/Photoroom_20260705_103527_PM_1783308939570.png";
import { clampPoint, pixelDelta, pixelDistance, stepToward, type WorldPixels } from "@/lib/elysianClearingCombatMath";

type EnemyState = "spawning" | "roaming" | "pursuing" | "windup" | "recovering" | "returning" | "defeated" | "respawning";
type Enemy = { instanceId:string; slot:number; maxHealth:number; health:number; attack:number; x:number; y:number; targetX:number; targetY:number; state:EnemyState; facingLeft:boolean; nextActionAt:number };
type EnemyDeathEffect = { effectId:string; enemyInstanceId:string; x:number; y:number };
type Session = { sessionId:string; pet:{inventoryId:string;maxHealth:number;attack:number}; enemies:Array<Omit<Enemy,"x"|"y"|"targetX"|"targetY"|"state"|"facingLeft"|"nextActionAt">> };

const randomBetween = (a:number,b:number) => a + Math.random()*(b-a);

export default function ElysianClearingCombat({ petPos, petSize, facingLeft, onRespawn, worldPixels, hudElement }: { petPos:PetWalkPos; petSize:number; facingLeft:boolean; onRespawn:()=>void; worldPixels:WorldPixels; hudElement:HTMLElement|null }) {
  const petPosRef = useRef(petPos); petPosRef.current = petPos;
  const [session, setSession] = useState<Session|null>(null);
  const [sessionState,setSessionState]=useState<"loading"|"ready"|"error">("loading");
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const [petHealth,setPetHealth] = useState(1); const [petMaxHealth,setPetMaxHealth] = useState(1);
  const [recentlyDamaged,setRecentlyDamaged] = useState(false); const recentDamageTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [deathEffects,setDeathEffects] = useState<EnemyDeathEffect[]>([]); const effectSequence=useRef(0);
  const petHealthRef=useRef(1); const petMaxHealthRef=useRef(1); const invulnerableUntil=useRef(0); const defeatedUntil=useRef(0); const timers=useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastAttack=useRef(0); const [swinging,setSwinging]=useState(false); const [feedback,setFeedback]=useState<string[]>([]);

  useEffect(()=>{ let alive=true; let createdId="";
    fetch("/api/explore/elysian-clearing/session",{method:"POST",credentials:"include"}).then(r=>{if(!r.ok)throw new Error("combat session failed");return r.json()}).then((data:Session)=>{
      if(!alive)return; createdId=data.sessionId; setSession(data); setSessionState("ready"); setPetHealth(data.pet.maxHealth); setPetMaxHealth(data.pet.maxHealth); petHealthRef.current=data.pet.maxHealth; petMaxHealthRef.current=data.pet.maxHealth;
      const now=performance.now(); const built=data.enemies.slice(0,CFG.maxEnemies).map((e,i)=>{const h=CFG.homes[i];return {...e,x:h.x,y:h.y,targetX:h.x,targetY:h.y,state:"spawning" as EnemyState,facingLeft:false,nextActionAt:now+CFG.initialSpawnDelayMs[i]}}); enemiesRef.current=built;setEnemies(built);
    }).catch((error)=>{if(alive){setSessionState("error");setFeedback(["Combat unavailable"]);} console.error("Elysian Clearing session failed", error instanceof Error ? error.message : "Unknown error");});
    return()=>{alive=false;timers.current.forEach(clearTimeout);timers.current.clear();if(recentDamageTimer.current)clearTimeout(recentDamageTimer.current);if(createdId)void fetch(`/api/explore/elysian-clearing/session/${createdId}`,{method:"DELETE",credentials:"include",keepalive:true}).catch(error=>console.error("Elysian Clearing cleanup failed",error instanceof Error?error.message:"Unknown error"));};
  },[]);

  useEffect(()=>{let raf=0,last=performance.now(),lastPaint=0;
    const tick=(now:number)=>{const dt=Math.min((now-last)/1000,.05);last=now; const pet=petPosRef.current;
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
        if(e.state==="roaming"||e.state==="pursuing"||e.state==="returning"){const delta=pixelDelta(e,{x:tx,y:ty},worldPixels),len=Math.hypot(delta.dx,delta.dy);if(len>2){Object.assign(e,clampPoint(stepToward(e,{x:tx,y:ty},speed*dt,worldPixels),CFG.worldBounds));e.facingLeft=delta.dx<0;}else if(e.state==="returning"){e.state="roaming";e.nextActionAt=now+1000;}else if(e.state==="roaming"&&e.nextActionAt===Infinity)e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}
      }
      if(now-lastPaint>50){setEnemies(enemiesRef.current.map(e=>({...e})));lastPaint=now;}raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[onRespawn,worldPixels.width,worldPixels.height]);

  const attack=useCallback(async(e:React.PointerEvent)=>{e.preventDefault();e.stopPropagation();const now=performance.now();if(sessionState!=="ready"||!session){setFeedback([sessionState==="loading"?"Combat loading…":"Combat unavailable"]);return;}if(now<defeatedUntil.current)return;if(now-lastAttack.current<CFG.petAttackCooldownMs){setFeedback(["Cooling down"]);return;}lastAttack.current=now;setSwinging(true);setTimeout(()=>setSwinging(false),220);
    const p=petPosRef.current,dir=facingLeft?-1:1;const target=enemiesRef.current.filter(x=>!['defeated','respawning','spawning'].includes(x.state)).map(x=>{const d=pixelDistance(x,p,worldPixels),delta=pixelDelta(p,x,worldPixels);return{x,d,dot:(delta.dx*dir)/Math.max(.001,d)}}).filter(v=>v.d<=CFG.petAttackRangePixels&&v.dot>=CFG.petAttackArcDot).sort((a,b)=>a.d-b.d)[0]?.x;if(!target){setFeedback(["Miss"]);return;}
    try{const r=await fetch("/api/explore/elysian-clearing/attack",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,enemyInstanceId:target.instanceId})});if(!r.ok)throw new Error(`Attack rejected (${r.status})`);const data=await r.json();target.health=data.health;if(data.defeated){const defeated={effectId:`${target.instanceId}-${++effectSequence.current}`,enemyInstanceId:target.instanceId,x:target.x,y:target.y};setDeathEffects(current=>[...current,defeated]);const effectTimer=setTimeout(()=>{setDeathEffects(current=>current.filter(effect=>effect.effectId!==defeated.effectId));timers.current.delete(effectTimer);},CFG.deathEffect.durationMs);timers.current.add(effectTimer);target.state="defeated";target.nextActionAt=performance.now()+randomBetween(CFG.respawnDelayMs.min,CFG.respawnDelayMs.max);if(data.nextEnemy){target.instanceId=data.nextEnemy.instanceId;target.health=data.nextEnemy.health;}const lines=["Enemy defeated",`+${data.reward.coins} coins · +${data.reward.exp} EXP`];setFeedback(lines);setTimeout(()=>setFeedback([]),1800);queryClient.invalidateQueries({queryKey:["/api/inventory"]});queryClient.invalidateQueries({queryKey:["/api/user"]});}else{target.state="pursuing";setFeedback(["Hit"]);}setEnemies(enemiesRef.current.map(x=>({...x})));}catch(error){setFeedback(["Attack failed"]);console.error("Elysian Clearing attack failed",error instanceof Error?error.message:"Unknown error");}
  },[session,sessionState,facingLeft,worldPixels]);

  const threatened = enemies.some(enemy => enemy.health > 0 && ["pursuing", "windup", "recovering"].includes(enemy.state));
  const healthPercent = Math.max(0, Math.min(100, 100 * petHealth / Math.max(1, petMaxHealth)));
  const healthColor = healthPercent <= 25 ? "#ef4444" : healthPercent <= 50 ? "#eab308" : "#22c55e";
  const fixedHud = <>
    {feedback.length>0&&<div className="absolute left-1/2 top-1/4 -translate-x-1/2 text-center font-bold text-yellow-200 pointer-events-none" style={{zIndex:20,textShadow:"0 2px 4px #000"}}>{feedback.map(x=><div key={x}>{x}</div>)}</div>}
    <button disabled={sessionState!=="ready"||petHealth<=0} data-interactive data-testid="button-clearing-attack" aria-label="Sword attack" onPointerDown={attack} className="absolute pointer-events-auto rounded-full active:scale-90 disabled:opacity-50 text-white border-2 border-amber-200 flex items-center justify-center" style={{right:"max(20px, env(safe-area-inset-right))",bottom:"max(20px, env(safe-area-inset-bottom))",width:CFG.attackButtonSize,height:CFG.attackButtonSize,zIndex:15,touchAction:"none",background:"#294b35",boxShadow:"0 3px 12px #000"}}><Sword aria-hidden size={28}/></button>
  </>;

  return <>
    {(threatened||recentlyDamaged)&&<div data-testid="clearing-pet-health-bar" className="absolute pointer-events-none" style={{left:`${petPos.x*100}%`,top:`${petPos.y*100}%`,width:CFG.petHealthBar.width,height:CFG.petHealthBar.height,transform:`translate(-50%, -${Math.max(CFG.petHealthBar.offset,petSize*.9)}px)`,zIndex:8,border:"1px solid rgba(255,255,255,.45)",borderRadius:999,background:"rgba(0,0,0,.7)",overflow:"hidden"}}><div className="h-full transition-[width]" style={{width:`${healthPercent}%`,background:healthColor}} /></div>}
    {enemies.map(e=>!["spawning","defeated","respawning"].includes(e.state)&&<div key={e.instanceId} className="absolute pointer-events-none" style={{left:`${e.x*100}%`,top:`${e.y*100}%`,width:CFG.spriteSize,height:CFG.spriteSize,transform:`translate(-50%,-75%) scaleX(${e.facingLeft?-1:1})`,zIndex:6,filter:e.state==="windup"?"drop-shadow(0 0 9px #ff3b30) brightness(1.25)":"none"}}><img src={CFG.enemyImageUrl} alt={CFG.enemyName} className="w-full h-full object-contain" draggable={false}/>{(e.health<e.maxHealth||e.state!=="roaming")&&<div className="absolute -top-1 left-2 right-2 h-1.5 rounded bg-black/70 overflow-hidden"><div className="h-full bg-red-500" style={{width:`${100*e.health/e.maxHealth}%`}}/></div>}</div>)}
    {deathEffects.map(effect=><div key={effect.effectId} data-enemy-instance-id={effect.enemyInstanceId} data-testid="clearing-enemy-death-effect" className="absolute pointer-events-none" style={{left:`${effect.x*100}%`,top:`${effect.y*100}%`,width:CFG.deathEffect.size,height:CFG.deathEffect.size,transform:"translate(-50%,-75%)",zIndex:9}}><img src={skullUrl} alt="" className="h-full w-full object-contain animate-clearing-skull" draggable={false}/></div>)}
    {swinging&&<div className="absolute pointer-events-none text-4xl" style={{left:`${petPos.x*100}%`,top:`${petPos.y*100}%`,transform:`translate(${facingLeft?'-110%':'10%'},-100%) scaleX(${facingLeft?-1:1})`,zIndex:9}}>◜</div>}
    <style>{`@keyframes clearing-skull-defeat{0%{opacity:0;transform:translateY(4px) scale(.7)}18%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-${CFG.deathEffect.risePixels}px) scale(1)}}.animate-clearing-skull{animation:clearing-skull-defeat ${CFG.deathEffect.durationMs}ms ease-out forwards}`}</style>
    {hudElement&&createPortal(fixedHud,hudElement)}
  </>;
}
