import { ELYSIAN_CLEARING_COMBAT_CONFIG as CFG } from "@/lib/elysianClearingCombatConfig";
import type { Enemy } from "./types";
export default function ElysianClearingEnemy({enemy}:{enemy:Enemy}) {
 if(["spawning","defeated","respawning"].includes(enemy.state)) return null;
 return <div className="absolute pointer-events-none" style={{left:`${enemy.x*100}%`,top:`${enemy.y*100}%`,width:CFG.enemyVisibleSize,height:CFG.enemyVisibleSize,transform:`translate(-50%,-75%) scaleX(${enemy.facingLeft?-1:1})`,zIndex:6,filter:enemy.state==="windup"?"drop-shadow(0 0 9px #ff3b30) brightness(1.25)":"none"}}><img src={CFG.enemyImageUrl} alt={CFG.enemyName} className="w-full h-full object-contain" draggable={false}/>{(enemy.health<enemy.maxHealth||enemy.state!=="roaming")&&<div className="absolute -top-1 left-2 right-2 h-1.5 rounded bg-black/70 overflow-hidden"><div className="h-full bg-red-500" style={{width:`${100*enemy.health/enemy.maxHealth}%`}}/></div>}</div>;
}
