import type { PetWalkPos } from "@/hooks/usePetWalkController";
import type { Enemy } from "./types";

export function worldDistance(a:{x:number;y:number}, b:{x:number;y:number}, world:{width:number;height:number}) {
  return Math.hypot((a.x-b.x)*world.width, (a.y-b.y)*world.height);
}
export function nearestAttackTarget(enemies:Enemy[], pet:PetWalkPos, facingLeft:boolean, world:{width:number;height:number}, rangePx:number, arcDot:number) {
  const direction=facingLeft?-1:1;
  return enemies.filter(enemy=>!["defeated","respawning","spawning"].includes(enemy.state)).map(enemy=>{
    const distance=worldDistance(enemy,pet,world);
    const horizontal=(enemy.x-pet.x)*world.width;
    return {enemy,distance,dot:(horizontal*direction)/Math.max(1,distance)};
  }).filter(candidate=>candidate.distance<=rangePx&&candidate.dot>=arcDot).sort((a,b)=>a.distance-b.distance)[0]?.enemy;
}
