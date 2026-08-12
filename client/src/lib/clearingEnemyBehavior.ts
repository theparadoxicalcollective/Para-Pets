export type SimEnemy={instanceId:string;templateId?:string;imageUrl?:string|null;name?:string;isBoss:boolean;state:string;engagedByPlayer:boolean;x:number;y:number;homeX:number;homeY:number;visibleHalfWidth:number};
export type EnemyMotionBody={x:number;y:number;velocityX:number;velocityY:number};
export const enemySpeciesKey=(e:Pick<SimEnemy,"templateId"|"imageUrl"|"name">)=>e.templateId||`${e.imageUrl||""}|${e.name||"enemy"}`;
/** Keep one canonical visible-art height for every enemy renderer. These values
 * match the Clearing combat configuration rather than applying a second scale. */
export const enemyVisibleHeight=(boss:boolean)=>boss?38:28;
export const enemyMinimumSeparation=(a:Pick<SimEnemy,"templateId"|"imageUrl"|"name"|"visibleHalfWidth">,b:Pick<SimEnemy,"templateId"|"imageUrl"|"name"|"visibleHalfWidth">)=>a.visibleHalfWidth+b.visibleHalfWidth+(enemySpeciesKey(a)===enemySpeciesKey(b)?-3:8);
export function engageConfirmedEnemy(enemies:SimEnemy[],id:string){const enemy=enemies.find(e=>e.instanceId===id);if(enemy){enemy.engagedByPlayer=true;enemy.state="pursuing";}return enemies;}
export function resetEnemyPassive(enemy:SimEnemy){enemy.engagedByPlayer=false;enemy.state="roaming";}

/** Accelerates and brakes in pixel space so motion stays consistent on tall and
 * wide screens. A small settle radius deliberately absorbs sub-pixel steering
 * corrections near the destination so enemies do not rock back and forth. */
export function smoothEnemyMotion(body:EnemyMotionBody,target:{x:number;y:number},maxSpeedPixels:number,accelerationPixels:number,dt:number,world:{width:number;height:number}){
  const width=Number.isFinite(world.width)&&world.width>0?world.width:1,height=Number.isFinite(world.height)&&world.height>0?world.height:1,safeDt=Math.max(0,Math.min(.04,Number(dt)||0));
  const deltaX=(target.x-body.x)*width,deltaY=(target.y-body.y)*height,distance=Math.hypot(deltaX,deltaY),speed=Math.hypot(body.velocityX,body.velocityY);
  if(distance<=2.25&&speed<5.5)return{x:target.x,y:target.y,velocityX:0,velocityY:0,arrived:true};
  const acceleration=Math.max(1,accelerationPixels),brakingSpeed=Math.sqrt(Math.max(0,2*acceleration*distance)),desiredSpeed=Math.min(Math.max(0,maxSpeedPixels),brakingSpeed);
  const targetVelocityX=distance?deltaX/distance*desiredSpeed:0,targetVelocityY=distance?deltaY/distance*desiredSpeed:0;
  const changeX=targetVelocityX-body.velocityX,changeY=targetVelocityY-body.velocityY,changeLength=Math.hypot(changeX,changeY),maxChange=acceleration*safeDt,changeScale=changeLength?Math.min(1,maxChange/changeLength):0;
  const velocityX=body.velocityX+changeX*changeScale,velocityY=body.velocityY+changeY*changeScale;
  const x=body.x+velocityX*safeDt/width,y=body.y+velocityY*safeDt/height,nextDistance=Math.hypot((target.x-x)*width,(target.y-y)*height);
  // If a nearly-settled body would cross its destination this frame, finish the
  // move instead of allowing an overshoot/correct/overshoot oscillation.
  if((nextDistance<=2.25&&Math.hypot(velocityX,velocityY)<6)||(distance<=4.5&&nextDistance>distance))return{x:target.x,y:target.y,velocityX:0,velocityY:0,arrived:true};
  return{x,y,velocityX,velocityY,arrived:false};
}

/** Soft positional separation. Roaming packs get enough room to remain readable,
 * while enemies converging on the player receive gentler corrections so the
 * separation pass does not visually fight their pursuit steering. */
export function resolveEnemyPairs(enemies:SimEnemy[],world:{width:number;height:number}){let pairs=0;const deadZone=2;for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){pairs++;const a=enemies[i],b=enemies[j],rawX=(b.x-a.x)*world.width,rawY=(b.y-a.y)*world.height,d=Math.hypot(rawX,rawY),dx=d?rawX:((i+j)%2?1:-1),dy=d?rawY:0,min=enemyMinimumSeparation(a,b),overlap=min-d-deadZone;if(overlap>0){const combatPair=!['roaming','returning'].includes(a.state)||!['roaming','returning'].includes(b.state),maximumStep=combatPair?.45:.9,fraction=combatPair?.08:.14,correction=Math.min(maximumStep,overlap*fraction);a.x-=dx/Math.max(1,d)*correction/world.width;a.y-=dy/Math.max(1,d)*correction/world.height;b.x+=dx/Math.max(1,d)*correction/world.width;b.y+=dy/Math.max(1,d)*correction/world.height;}}return pairs;}
export function clusterHomes<T extends {templateId?:string;imageUrl?:string|null;name?:string;slot:number}>(enemies:T[],homes:readonly {x:number;y:number}[]){
  const counts=new Map<string,number>(),anchors=new Map<string,number>();let nextAnchor=0;
  return enemies.map(enemy=>{const key=enemy.templateId||`${enemy.imageUrl||""}|${enemy.name||"enemy"}`,n=counts.get(key)||0,packSize=[1,2,3,4,5][Math.abs(key.length+enemy.slot)%5],cluster=Math.floor(n/packSize),clusterId=`${key}:${cluster}`;counts.set(key,n+1);if(!anchors.has(clusterId))anchors.set(clusterId,nextAnchor++);const base=homes[(anchors.get(clusterId)??0)%homes.length]||homes[0]||{x:.5,y:.5},member=n%packSize,angle=member*Math.PI*2/Math.max(1,packSize)-Math.PI/2,r=member===0?0:24+packSize*2;return{homeX:base.x+Math.cos(angle)*r/400,homeY:base.y+Math.sin(angle)*r/800,clusterId};});
}
