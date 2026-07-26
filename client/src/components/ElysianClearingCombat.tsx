import { useCallback, useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { ELYSIAN_CLEARING_COMBAT_CONFIG as CFG } from "@/lib/elysianClearingCombatConfig";
import type { PetWalkPos } from "@/hooks/usePetWalkController";

type EnemyState = "spawning" | "roaming" | "pursuing" | "windup" | "recovering" | "returning" | "defeated" | "respawning";
type Enemy = { instanceId:string; slot:number; maxHealth:number; health:number; attack:number; x:number; y:number; targetX:number; targetY:number; state:EnemyState; facingLeft:boolean; nextActionAt:number };
type Session = { sessionId:string; pet:{inventoryId:string;maxHealth:number;attack:number}; enemies:Array<Omit<Enemy,"x"|"y"|"targetX"|"targetY"|"state"|"facingLeft"|"nextActionAt">> };

const distance = (a:{x:number;y:number}, b:{x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y);
const randomBetween = (a:number,b:number) => a + Math.random()*(b-a);

export default function ElysianClearingCombat({ petPos, facingLeft, onRespawn }: { petPos:PetWalkPos; facingLeft:boolean; onRespawn:()=>void }) {
  const petPosRef = useRef(petPos); petPosRef.current = petPos;
  const [session, setSession] = useState<Session|null>(null);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const [petHealth,setPetHealth] = useState(1); const [petMaxHealth,setPetMaxHealth] = useState(1);
  const petHealthRef=useRef(1); const invulnerableUntil=useRef(0); const defeatedUntil=useRef(0);
  const lastAttack=useRef(0); const [swinging,setSwinging]=useState(false); const [feedback,setFeedback]=useState<string[]>([]);

  useEffect(()=>{ let alive=true; let createdId="";
    fetch("/api/explore/elysian-clearing/session",{method:"POST",credentials:"include"}).then(r=>{if(!r.ok)throw new Error("combat session failed");return r.json()}).then((data:Session)=>{
      if(!alive)return; createdId=data.sessionId; setSession(data); setPetHealth(data.pet.maxHealth); setPetMaxHealth(data.pet.maxHealth); petHealthRef.current=data.pet.maxHealth;
      const now=performance.now(); const built=data.enemies.slice(0,CFG.maxEnemies).map((e,i)=>{const h=CFG.homes[i];return {...e,x:h.x,y:h.y,targetX:h.x,targetY:h.y,state:"spawning" as EnemyState,facingLeft:false,nextActionAt:now+CFG.initialSpawnDelayMs[i]}}); enemiesRef.current=built;setEnemies(built);
    }).catch(()=>{});
    return()=>{alive=false;if(createdId)fetch(`/api/explore/elysian-clearing/session/${createdId}`,{method:"DELETE",credentials:"include",keepalive:true});};
  },[]);

  useEffect(()=>{let raf=0,last=performance.now(),lastPaint=0;
    const tick=(now:number)=>{const dt=Math.min((now-last)/1000,.05);last=now; const pet=petPosRef.current;
      for(const e of enemiesRef.current){
        if(e.state==="defeated"||e.state==="respawning"){if(now>=e.nextActionAt){const h=CFG.homes[e.slot];e.x=h.x;e.y=h.y;e.health=e.maxHealth;e.state="spawning";e.nextActionAt=now+500;}continue;}
        if(e.state==="spawning"){if(now>=e.nextActionAt){e.state="roaming";e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}continue;}
        const d=distance(e,pet);
        if(defeatedUntil.current<=now && (e.state==="roaming"||e.state==="returning") && d<CFG.aggroRadius)e.state="pursuing";
        if((e.state==="pursuing"||e.state==="windup"||e.state==="recovering")&&d>CFG.disengageRadius){e.state="returning";e.targetX=CFG.homes[e.slot].x;e.targetY=CFG.homes[e.slot].y;}
        if(e.state==="roaming"&&now>=e.nextActionAt){const h=CFG.homes[e.slot],ang=Math.random()*Math.PI*2,r=Math.random()*CFG.roamRadius;e.targetX=h.x+Math.cos(ang)*r;e.targetY=h.y+Math.sin(ang)*r;e.nextActionAt=Infinity;}
        if(e.state==="pursuing"&&d<=CFG.attackRange){e.state="windup";e.nextActionAt=now+CFG.attackWindupMs;}
        else if(e.state==="windup"&&now>=e.nextActionAt){if(d<=CFG.attackRange&&now>=invulnerableUntil.current&&defeatedUntil.current<=now){const hp=Math.max(0,petHealthRef.current-e.attack);petHealthRef.current=hp;setPetHealth(hp);invulnerableUntil.current=now+CFG.petInvulnerabilityMs;if(hp===0){defeatedUntil.current=now+1400;invulnerableUntil.current=defeatedUntil.current+CFG.respawnProtectionMs;setTimeout(()=>{onRespawn();petHealthRef.current=petMaxHealth;setPetHealth(petMaxHealth);},1400);}}e.state="recovering";e.nextActionAt=now+CFG.attackCooldownMs;}
        else if(e.state==="recovering"&&now>=e.nextActionAt)e.state="pursuing";
        let tx=e.targetX,ty=e.targetY;let speed:number=CFG.roamSpeed;
        if(e.state==="pursuing"){tx=pet.x;ty=pet.y;speed=CFG.pursuitSpeed;} else if(e.state==="returning"){tx=CFG.homes[e.slot].x;ty=CFG.homes[e.slot].y;speed=CFG.roamSpeed;}
        if(e.state==="roaming"||e.state==="pursuing"||e.state==="returning"){const dx=tx-e.x,dy=ty-e.y,len=Math.hypot(dx,dy);if(len>.006){e.x+=dx/len*speed*dt;e.y+=dy/len*speed*dt;e.facingLeft=dx<0;}else if(e.state==="returning"){e.state="roaming";e.nextActionAt=now+1000;}else if(e.state==="roaming"&&e.nextActionAt===Infinity)e.nextActionAt=now+randomBetween(CFG.roamPauseMs.min,CFG.roamPauseMs.max);}
      }
      if(now-lastPaint>50){setEnemies(enemiesRef.current.map(e=>({...e})));lastPaint=now;}raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[petMaxHealth,onRespawn]);

  const attack=useCallback(async(e:React.PointerEvent)=>{e.preventDefault();e.stopPropagation();const now=performance.now();if(!session||now<defeatedUntil.current||now-lastAttack.current<CFG.petAttackCooldownMs)return;lastAttack.current=now;setSwinging(true);setTimeout(()=>setSwinging(false),220);
    const p=petPosRef.current,dir=facingLeft?-1:1;const target=enemiesRef.current.filter(x=>!['defeated','respawning','spawning'].includes(x.state)).map(x=>({x,d:distance(x,p),dot:((x.x-p.x)*dir)/Math.max(.001,distance(x,p))})).filter(v=>v.d<=CFG.petAttackRange&&v.dot>=CFG.petAttackArcDot).sort((a,b)=>a.d-b.d)[0]?.x;if(!target)return;
    try{const r=await fetch("/api/explore/elysian-clearing/attack",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,enemyInstanceId:target.instanceId})});if(!r.ok)return;const data=await r.json();target.health=data.health;if(data.defeated){target.state="defeated";target.nextActionAt=performance.now()+randomBetween(CFG.respawnDelayMs.min,CFG.respawnDelayMs.max);if(data.nextEnemy){target.instanceId=data.nextEnemy.instanceId;target.health=data.nextEnemy.health;}const lines=[`+${data.reward.coins} coins`,`+${data.reward.exp} EXP`];setFeedback(lines);setTimeout(()=>setFeedback([]),1800);queryClient.invalidateQueries({queryKey:["/api/inventory"]});queryClient.invalidateQueries({queryKey:["/api/user"]});}else target.state="pursuing";setEnemies(enemiesRef.current.map(x=>({...x})));}catch{}
  },[session,facingLeft]);

  return <>
    <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{top:"max(42px, env(safe-area-inset-top))",zIndex:12,width:180}}><div className="text-center text-xs text-white font-bold">{petHealth<=0?"Defeated — recovering…":`HP ${petHealth} / ${petMaxHealth}`}</div><div className="h-2 rounded bg-black/60 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{width:`${100*petHealth/petMaxHealth}%`}}/></div></div>
    {enemies.map(e=>!['spawning','defeated','respawning'].includes(e.state)&&<div key={e.instanceId} className="absolute pointer-events-none" style={{left:`${e.x*100}%`,top:`${e.y*100}%`,width:CFG.spriteSize,height:CFG.spriteSize,transform:`translate(-50%,-75%) scaleX(${e.facingLeft?-1:1})`,zIndex:6,filter:e.state==="windup"?"drop-shadow(0 0 9px #ff3b30) brightness(1.25)":"none"}}><img src={CFG.enemyImageUrl} alt={CFG.enemyName} className="w-full h-full object-contain" draggable={false}/>{(e.health<e.maxHealth||e.state!=="roaming")&&<div className="absolute -top-1 left-2 right-2 h-1.5 rounded bg-black/70 overflow-hidden"><div className="h-full bg-red-500" style={{width:`${100*e.health/e.maxHealth}%`}}/></div>}</div>)}
    {feedback.length>0&&<div className="absolute left-1/2 top-1/4 -translate-x-1/2 text-center font-bold text-yellow-200 pointer-events-none" style={{zIndex:20,textShadow:"0 2px 4px #000"}}>{feedback.map(x=><div key={x}>{x}</div>)}</div>}
    {swinging&&<div className="absolute pointer-events-none text-4xl" style={{left:`${petPos.x*100}%`,top:`${petPos.y*100}%`,transform:`translate(${facingLeft?'-110%':'10%'},-100%) scaleX(${facingLeft?-1:1})`,zIndex:9}}>◜</div>}
    <button data-interactive data-testid="button-clearing-attack" aria-label="Sword attack" onPointerDown={attack} className="absolute right-5 bottom-6 w-20 h-20 rounded-full active:scale-95 font-black text-white border-2 border-amber-200" style={{zIndex:15,touchAction:"none",background:"radial-gradient(circle,#b94730,#542014)",boxShadow:"0 3px 12px #000"}}><span className="text-2xl">⚔</span><span className="block text-xs">ATK</span></button>
  </>;
}
