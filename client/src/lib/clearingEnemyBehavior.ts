export type SimEnemy={instanceId:string;templateId?:string;imageUrl?:string|null;name?:string;isBoss:boolean;state:string;engagedByPlayer:boolean;x:number;y:number;homeX:number;homeY:number;visibleHalfWidth:number};
export const enemySpeciesKey=(e:Pick<SimEnemy,"templateId"|"imageUrl"|"name">)=>e.templateId||`${e.imageUrl||""}|${e.name||"enemy"}`;
/** Enemies share roughly the same footprint as the player's Clearing pet. A
 * boss is only a little taller; its aura/nameplate provide the visual emphasis
 * instead of an oversized sprite. */
export const enemyVisibleHeight=(boss:boolean)=>boss?54:44;
export const enemyMinimumSeparation=(a:Pick<SimEnemy,"templateId"|"imageUrl"|"name"|"visibleHalfWidth">,b:Pick<SimEnemy,"templateId"|"imageUrl"|"name"|"visibleHalfWidth">)=>a.visibleHalfWidth+b.visibleHalfWidth+(enemySpeciesKey(a)===enemySpeciesKey(b)?-4:10);
export function engageConfirmedEnemy(enemies:SimEnemy[],id:string){const enemy=enemies.find(e=>e.instanceId===id);if(enemy){enemy.engagedByPlayer=true;enemy.state="pursuing";}return enemies;}
export function resetEnemyPassive(enemy:SimEnemy){enemy.engagedByPlayer=false;enemy.state="roaming";}
export function resolveEnemyPairs(enemies:SimEnemy[],world:{width:number;height:number}){let pairs=0;for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){pairs++;const a=enemies[i],b=enemies[j],rawX=(b.x-a.x)*world.width,rawY=(b.y-a.y)*world.height,d=Math.hypot(rawX,rawY),dx=d?rawX:1,dy=d?rawY:0,min=enemyMinimumSeparation(a,b);if(d<min){const correction=(min-d)/2;a.x-=dx/Math.max(1,d)*correction/world.width;a.y-=dy/Math.max(1,d)*correction/world.height;b.x+=dx/Math.max(1,d)*correction/world.width;b.y+=dy/Math.max(1,d)*correction/world.height;}}return pairs;}
export function clusterHomes<T extends {templateId?:string;imageUrl?:string|null;name?:string;slot:number}>(enemies:T[],homes:readonly {x:number;y:number}[]){
  const counts=new Map<string,number>(),anchors=new Map<string,number>();let nextAnchor=0;
  return enemies.map(enemy=>{const key=enemy.templateId||`${enemy.imageUrl||""}|${enemy.name||"enemy"}`,n=counts.get(key)||0,cluster=Math.floor(n/3),clusterId=`${key}:${cluster}`;counts.set(key,n+1);if(!anchors.has(clusterId))anchors.set(clusterId,nextAnchor++);const base=homes[(anchors.get(clusterId)??0)%homes.length]||homes[0]||{x:.5,y:.5},member=n%3,angle=member*Math.PI*2/3-Math.PI/2,r=member===0?0:26;return{homeX:base.x+Math.cos(angle)*r/400,homeY:base.y+Math.sin(angle)*r/800,clusterId};});
}
