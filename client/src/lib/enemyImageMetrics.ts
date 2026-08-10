export type AlphaBounds={left:number;top:number;right:number;bottom:number;width:number;height:number};
export type EnemyImageMetrics={canvasWidth:number;canvasHeight:number;visibleWidth:number;visibleHeight:number;centerOffsetX:number;centerOffsetY:number;feetOffsetX:number;feetOffsetY:number;widthRatio:number;heightRatio:number;leftRatio:number;topRatio:number};

const cache=new Map<string,Promise<EnemyImageMetrics>>();
export const FALLBACK_ENEMY_IMAGE_METRICS:EnemyImageMetrics={canvasWidth:1,canvasHeight:1,visibleWidth:1,visibleHeight:1,centerOffsetX:0,centerOffsetY:0,feetOffsetX:0,feetOffsetY:.5,widthRatio:1,heightRatio:1,leftRatio:0,topRatio:0};
export const ENEMY_IMAGE_METRICS_TIMEOUT_MS=2000;

export function resolveEnemyImageMetrics(
  pending:Promise<EnemyImageMetrics>,
  timeoutMs=ENEMY_IMAGE_METRICS_TIMEOUT_MS,
):Promise<EnemyImageMetrics>{
  return new Promise(resolve=>{
    let settled=false;
    const finish=(metrics:EnemyImageMetrics)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(metrics);};
    const timer=setTimeout(()=>finish(FALLBACK_ENEMY_IMAGE_METRICS),timeoutMs);
    pending.then(finish,()=>finish(FALLBACK_ENEMY_IMAGE_METRICS));
  });
}

export function findAlphaBounds(alpha:ArrayLike<number>,width:number,height:number,threshold=8):AlphaBounds|null{
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if((alpha[(y*width+x)*4+3]??0)>threshold){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  return right<0?null:{left,top,right,bottom,width:right-left+1,height:bottom-top+1};
}
export function metricsFromBounds(canvasWidth:number,canvasHeight:number,bounds:AlphaBounds|null):EnemyImageMetrics{
  if(!bounds||canvasWidth<=0||canvasHeight<=0)return FALLBACK_ENEMY_IMAGE_METRICS;
  const centerX=(bounds.left+bounds.right+1)/2,centerY=(bounds.top+bounds.bottom+1)/2,feetX=centerX,feetY=bounds.bottom+1;
  return{canvasWidth,canvasHeight,visibleWidth:bounds.width,visibleHeight:bounds.height,centerOffsetX:centerX-canvasWidth/2,centerOffsetY:centerY-canvasHeight/2,feetOffsetX:feetX-canvasWidth/2,feetOffsetY:feetY-canvasHeight/2,widthRatio:bounds.width/canvasWidth,heightRatio:bounds.height/canvasHeight,leftRatio:bounds.left/canvasWidth,topRatio:bounds.top/canvasHeight};
}
export function loadEnemyImageMetrics(url:string):Promise<EnemyImageMetrics>{
  const existing=cache.get(url);if(existing)return existing;
  const pending=new Promise<EnemyImageMetrics>(resolve=>{const image=new Image();image.crossOrigin="anonymous";image.onload=()=>{try{const max=256,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight)),w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale)),canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error("canvas unavailable");ctx.drawImage(image,0,0,w,h);resolve(metricsFromBounds(w,h,findAlphaBounds(ctx.getImageData(0,0,w,h).data,w,h)));}catch{resolve(FALLBACK_ENEMY_IMAGE_METRICS);}};image.onerror=()=>resolve(FALLBACK_ENEMY_IMAGE_METRICS);image.src=url;});
  cache.set(url,pending);return pending;
}
export function loadEnemyImageMetricsWithTimeout(url:string,timeoutMs=ENEMY_IMAGE_METRICS_TIMEOUT_MS):Promise<EnemyImageMetrics>{return resolveEnemyImageMetrics(loadEnemyImageMetrics(url),timeoutMs);}
export function clearEnemyImageMetricsCache(){cache.clear();}
export function enemyImageMetricsCacheSize(){return cache.size;}
