import { useCallback, useEffect, useRef, useState } from "react";
import ElysianClearingEnemy from "./elysian-clearing/ElysianClearingEnemy";
import ElysianClearingHud from "./elysian-clearing/ElysianClearingHud";
import { nearestAttackTarget, worldDistance } from "./elysian-clearing/combatMath";
import type { Enemy, EnemyState, Session, SessionState } from "./elysian-clearing/types";
import { queryClient } from "@/lib/queryClient";
import { ELYSIAN_CLEARING_COMBAT_CONFIG as CFG } from "@/lib/elysianClearingCombatConfig";
import type { PetWalkPos } from "@/hooks/usePetWalkController";

const randomBetween = (a:number,b:number) => a + Math.random()*(b-a);

export default function ElysianClearingCombat({ petPos, facingLeft, onRespawn, world }: { petPos:PetWalkPos; facingLeft:boolean; onRespawn:()=>void; world:{width:number;height:number;transform:string} }) {
  const petPosRef = useRef(petPos); petPosRef.current = petPos;
  const [session, setSession] = useState<Session|null>(null);
  const [sessionState,setSessionState]=useState<SessionState>("loading");
  const onRespawnRef=useRef(onRespawn); onRespawnRef.current=onRespawn;
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const [petHealth,setPetHealth] = useState(1); const [petMaxHealth,setPetMaxHealth] = useState(1);
  const petHealthRef=useRef(1); const invulnerableUntil=useRef(0); const defeatedUntil=useRef(0);
  const lastAttack=useRef(0); const [swinging,setSwinging]=useState(false); const [feedback,setFeedback]=useState(""); const [cooling,setCooling]=useState(false); const feedbackTimer=useRef<ReturnType<typeof setTimeout>>();

  useEffect(()=>{ let alive=true; let createdId="";
    fetch("/api/explore/elysian-clearing/session",{method:"POST",credentials:"include"}).then(r=>{if(!r.ok)throw new Error("combat session failed");return r.json()}).then((data:Session)=>{
      if(!alive)return; createdId=data.sessionId; setSession(data); setSessionState("ready"); setPetHealth(data.pet.maxHealth); setPetMaxHealth(data.pet.maxHealth); petHealthRef.current=data.pet.maxHealth;
      const now=performance.now(); const built=data.enemies.slice(0,CFG.maxEnemies).map((e,i)=>{const h=CFG.homes[i];return {...e,x:h.x,y:h.y,targetX:h.x,targetY:h.y,state:"spawning" as EnemyState,facingLeft:false,nextActionAt:now+CFG.initialSpawnDelayMs[i]}}); enemiesRef.current=built;setEnemies(built);
    }).catch((error)=>{if(!alive)return;setSessionState("error");setFeedback("Combat session could not start");console.error("[Elysian Clearing] session start failed",error instanceof Error?error.message:"unknown error");});
    return()=>{alive=false;clearTimeout(feedbackTimer.current);if(createdId)fetch(`/api/explore/elysian-clearing/session/${createdId}`,{method:"DELETE",credentials:"include",keepalive:true});};
  },[]);

  useEffect(()=>{let raf=0,last=performance.now(),lastPaint=0;
    const tick=(now:number)=>{const dt=Math.min((now-last)/1000,.05);last=now; const pet=petPosRef.current;
      for(const e of enemiesRef.current){
        if(e.state==="defeated"||e.state==="respawning"){if(now>=e.nextActionAt){const h=CFG.homes[e.slot];e.x=h.x;e.y=h.y;e.health=e.maxHealth;e.state="spawning";e.nextActionAt=now+500;}continue;}
        if(e.state==="spawning"){if(now>=e.nextActionAt){e.state="roaming";e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}continue;}
        const d=worldDistance(e,pet,world); const unit=Math.min(world.width,world.height);
        if(defeatedUntil.current<=now && (e.state==="roaming"||e.state==="returning") && d<CFG.aggroRadius*unit)e.state="pursuing";
        if((e.state==="pursuing"||e.state==="windup"||e.state==="recovering")&&d>CFG.disengageRadius*unit){e.state="returning";e.targetX=CFG.homes[e.slot].x;e.targetY=CFG.homes[e.slot].y;}
        if(e.state==="roaming"&&now>=e.nextActionAt){const h=CFG.homes[e.slot],ang=Math.random()*Math.PI*2,r=Math.random()*CFG.roamRadius;e.targetX=h.x+Math.cos(ang)*r;e.targetY=h.y+Math.sin(ang)*r;e.nextActionAt=Infinity;}
        if(e.state==="pursuing"&&d<=CFG.attackRange*unit){e.state="windup";e.nextActionAt=now+CFG.attackWindupMs;}
        else if(e.state==="windup"&&now>=e.nextActionAt){if(d<=CFG.attackRange*unit&&now>=invulnerableUntil.current&&defeatedUntil.current<=now){const hp=Math.max(0,petHealthRef.current-e.attack);petHealthRef.current=hp;setPetHealth(hp);invulnerableUntil.current=now+CFG.petInvulnerabilityMs;if(hp===0){defeatedUntil.current=now+1400;invulnerableUntil.current=defeatedUntil.current+CFG.respawnProtectionMs;setTimeout(()=>{onRespawnRef.current();petHealthRef.current=petMaxHealth;setPetHealth(petMaxHealth);},1400);}}e.state="recovering";e.nextActionAt=now+CFG.attackCooldownMs;}
        else if(e.state==="recovering"&&now>=e.nextActionAt)e.state="pursuing";
        let tx=e.targetX,ty=e.targetY;let speed:number=CFG.roamSpeed;
        if(e.state==="pursuing"){tx=pet.x;ty=pet.y;speed=CFG.pursuitSpeed;} else if(e.state==="returning"){tx=CFG.homes[e.slot].x;ty=CFG.homes[e.slot].y;speed=CFG.roamSpeed;}
        if(e.state==="roaming"||e.state==="pursuing"||e.state==="returning"){const dx=tx-e.x,dy=ty-e.y,lenPx=Math.hypot(dx*world.width,dy*world.height);if(lenPx>3){e.x+=(dx*world.width/lenPx)*speed*dt;e.y+=(dy*world.height/lenPx)*speed*dt;e.facingLeft=dx<0;}else if(e.state==="returning"){e.state="roaming";e.nextActionAt=now+1000;}else if(e.state==="roaming"&&e.nextActionAt===Infinity)e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}
      }
      if(now-lastPaint>50){setEnemies(enemiesRef.current.map(e=>({...e})));lastPaint=now;}raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[world.height,world.width]);

  const showFeedback=useCallback((message:string,ms=1200)=>{clearTimeout(feedbackTimer.current);setFeedback(message);feedbackTimer.current=setTimeout(()=>setFeedback(""),ms);},[]);
  const attack=useCallback(async(e:React.PointerEvent)=>{e.preventDefault();e.stopPropagation();const now=performance.now();if(sessionState!=="ready"||!session){showFeedback("Combat session unavailable");return;}if(now<defeatedUntil.current)return;if(now-lastAttack.current<CFG.petAttackCooldownMs){showFeedback("Attack cooling down");return;}lastAttack.current=now;setCooling(true);setTimeout(()=>setCooling(false),CFG.petAttackCooldownMs);setSwinging(true);setTimeout(()=>setSwinging(false),220);
    const target=nearestAttackTarget(enemiesRef.current,petPosRef.current,facingLeft,world,CFG.petAttackRange*Math.min(world.width,world.height),CFG.petAttackArcDot);if(!target){showFeedback("Swing missed — move closer");return;}showFeedback("Swing!");
    try{const r=await fetch("/api/explore/elysian-clearing/attack",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,enemyInstanceId:target.instanceId})});if(!r.ok){const body=await r.json().catch(()=>({}));throw new Error(body.message||`attack failed (${r.status})`);}const data=await r.json();target.health=data.health;if(data.defeated){target.state="defeated";target.nextActionAt=performance.now()+randomBetween(CFG.respawnDelayMs.min,CFG.respawnDelayMs.max);if(data.nextEnemy){target.instanceId=data.nextEnemy.instanceId;target.health=data.nextEnemy.health;}showFeedback(`Hit! +${data.reward.coins} coins · +${data.reward.exp} EXP`,1800);queryClient.invalidateQueries({queryKey:["/api/inventory"]});queryClient.invalidateQueries({queryKey:["/api/user"]});}else{target.state="pursuing";showFeedback("Hit!");}setEnemies(enemiesRef.current.map(x=>({...x})));}catch(error){setCooling(false);lastAttack.current=0;showFeedback("Attack failed — try again");console.error("[Elysian Clearing] attack rejected",error instanceof Error?error.message:"unknown error");}
  },[facingLeft,session,sessionState,showFeedback,world]);

  return <>
    <div className="absolute left-0 top-0 pointer-events-none will-change-transform" style={{width:world.width,height:world.height,transform:world.transform}}>{enemies.map(enemy=><ElysianClearingEnemy key={enemy.instanceId} enemy={enemy}/>)}{swinging&&<div className="absolute text-4xl" style={{left:`${petPos.x*100}%`,top:`${petPos.y*100}%`,transform:`translate(${facingLeft?'-110%':'10%'},-100%) scaleX(${facingLeft?-1:1})`,zIndex:9}}>◜</div>}</div>
    <ElysianClearingHud health={petHealth} maxHealth={petMaxHealth} status={sessionState} feedback={feedback} cooling={cooling} onAttack={attack}/>
  </>;
}
