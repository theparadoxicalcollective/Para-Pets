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
 * wide screens. The braking curve prevents point-to-point roaming from snapping
 * to a stop when an enemy reaches its idle destination. */
export function smoothEnemyMotion(body:EnemyMotionBody,target:{x:number;y:number},maxSpeedPixels:number,accelerationPixels:number,dt:number,world:{width:number;height:number}){
  const width=Number.isFinite(world.width)&&world.width>0?world.width:1,height=Number.isFinite(world.height)&&world.height>0?world.height:1,safeDt=Math.max(0,Math.min(.05,Number(dt)||0));
  const deltaX=(target.x-body.x)*width,deltaY=(target.y-body.y)*height,distance=Math.hypot(deltaX,deltaY),speed=Math.hypot(body.velocityX,body.velocityY);
  if(distance<=.75&&speed<3)return{x:target.x,y:target.y,velocityX:0,velocityY:0,arrived:true};
  const acceleration=Math.max(1,accelerationPixels),brakingSpeed=Math.sqrt(Math.max(0,2*acceleration*distance)),desiredSpeed=Math.min(Math.max(0,maxSpeedPixels),brakingSpeed);
  const targetVelocityX=distance?deltaX/distance*desiredSpeed:0,targetVelocityY=distance?deltaY/distance*desiredSpeed:0;
  const changeX=targetVelocityX-body.velocityX,changeY=targetVelocityY-body.velocityY,changeLength=Math.hypot(changeX,changeY),maxChange=acceleration*safeDt,changeScale=changeLength?Math.min(1,maxChange/changeLength):0;
  const velocityX=body.velocityX+changeX*changeScale,velocityY=body.velocityY+changeY*changeScale;
  const x=body.x+velocityX*safeDt/width,y=body.y+velocityY*safeDt/height,nextDistance=Math.hypot((target.x-x)*width,(target.y-y)*height);
  if(nextDistance<=1.25&&Math.hypot(velocityX,velocityY)<4)return{x:target.x,y:target.y,velocityX:0,velocityY:0,arrived:true};
  return{x,y,velocityX,velocityY,arrived:false};
}

export function resolveEnemyPairs(enemies:SimEnemy[],world:{width:number;height:number}){let pairs=0;for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){pairs++;const a=enemies[i],b=enemies[j],rawX=(b.x-a.x)*world.width,rawY=(b.y-a.y)*world.height,d=Math.hypot(rawX,rawY),dx=d?rawX:1,dy=d?rawY:0,min=enemyMinimumSeparation(a,b);if(d<min){const correction=(min-d)/2;a.x-=dx/Math.max(1,d)*correction/world.width;a.y-=dy/Math.max(1,d)*correction/world.height;b.x+=dx/Math.max(1,d)*correction/world.width;b.y+=dy/Math.max(1,d)*correction/world.height;}}return pairs;}
export function clusterHomes<T extends {templateId?:string;imageUrl?:string|null;name?:string;slot:number}>(enemies:T[],homes:readonly {x:number;y:number}[]){
  const counts=new Map<string,number>(),anchors=new Map<string,number>();let nextAnchor=0;
  return enemies.map(enemy=>{const key=enemy.templateId||`${enemy.imageUrl||""}|${enemy.name||"enemy"}`,n=counts.get(key)||0,cluster=Math.floor(n/3),clusterId=`${key}:${cluster}`;counts.set(key,n+1);if(!anchors.has(clusterId))anchors.set(clusterId,nextAnchor++);const base=homes[(anchors.get(clusterId)??0)%homes.length]||homes[0]||{x:.5,y:.5},member=n%3,angle=member*Math.PI*2/3-Math.PI/2,r=member===0?0:26;return{homeX:base.x+Math.cos(angle)*r/400,homeY:base.y+Math.sin(angle)*r/800,clusterId};});
}
