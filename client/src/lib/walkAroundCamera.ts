export interface CameraMetrics { x:number; y:number; worldWidth:number; worldHeight:number }
export function calculateFollowCamera(pet:{x:number;y:number}, viewport:{width:number;height:number}, worldSize:{width:number;height:number}):CameraMetrics {
 const worldWidth=viewport.width*worldSize.width, worldHeight=viewport.height*worldSize.height;
 return {x:Math.max(0,Math.min(worldWidth-viewport.width,pet.x*worldWidth-viewport.width/2)),y:Math.max(0,Math.min(worldHeight-viewport.height,pet.y*worldHeight-viewport.height/2)),worldWidth,worldHeight};
}
