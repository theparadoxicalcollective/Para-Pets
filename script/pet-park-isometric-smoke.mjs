import assert from 'node:assert/strict';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';

// Real terrain painter, brush and depth calculations. Sprite rectangles and
// API responses are isolated fixtures; no production placements are changed.
const fixtureId='/__park-iso-fixture.tsx';
const fixture=`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import PetParkTerrain from '@/components/PetParkTerrain';
import PetParkTerrainBrush from '@/components/PetParkTerrainBrush';
import {parkDepthIndex} from '@/lib/petParkDepth';
import '@/index.css';
function Fixture(){
 const [painting,setPainting]=useState(false),[petY,setPetY]=useState(.53);
 const [scale,setScale]=useState(.8);
 const width=window.innerWidth,height=window.innerHeight;
 const panX=width/2-900*scale,panY=height/2-1350*scale;
 window.fixtureScale=setScale;window.fixturePetY=setPetY;
 return <div style={{position:'fixed',inset:0,overflow:'hidden'}}>
  <PetParkTerrain viewportWidth={width} viewportHeight={height} worldWidth={1800} worldHeight={2700} scale={scale} panX={panX} panY={panY} dirtPatches={[{xPct:.5,yPct:.5,size:200}]}/>
  {!painting&&<>
   <div data-testid="depth-building" style={{position:'absolute',left:width/2-100*scale,top:height/2-100*scale,width:200*scale,height:200*scale,background:'#4c7850',zIndex:parkDepthIndex({yPct:.5,worldHeight:2700,size:200,kind:'building',contact:.7,layer:10000})}}/>
   <div data-testid="depth-pet" style={{position:'absolute',left:width/2-70*scale,top:petY*2700*scale+panY-165*.75*scale,width:140*scale,height:165*scale,background:'#e5c474',zIndex:parkDepthIndex({yPct:petY,worldHeight:2700,size:165,kind:'pet'})}}/>
  </>}
  <button data-testid="paint" style={{position:'absolute',top:4,left:4,zIndex:9000000}} onClick={()=>setPainting(true)}>Paint</button>
  {painting&&<PetParkTerrainBrush viewportWidth={width} viewportHeight={height} sceneWidth={1800*scale} sceneHeight={2700*scale} worldWidth={1800} worldHeight={2700} panX={panX} panY={panY} scale={scale} raised={false} onSaved={()=>{}} onExit={()=>setPainting(false)}/>}
 </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const server=await createServer({configFile:false,optimizeDeps:{include:['react','react-dom/client','react/jsx-runtime','@tanstack/react-query']},root:path.resolve('client'),resolve:{alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}},plugins:[react(),{
 name:'park-iso-fixture',resolveId:id=>id===fixtureId?id:null,load:id=>id===fixtureId?fixture:null,
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(!req.headers.accept?.includes('text/html'))return next();
  res.setHeader('Content-Type','text/html');
  res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
 });}
}],server:{host:'127.0.0.1',port:4181,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true});
try{
 for(const [name,width,height,touch] of [['phone',390,844,true],['tablet',834,1194,true],['desktop',600,900,false]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const strokes=[];
  await page.route('**/api/admin/pet-park/terrain-strokes',route=>{strokes.push(route.request().postDataJSON());return route.fulfill({status:201,json:{items:[]}});});
  await page.goto('http://127.0.0.1:4181/fixture');
  await page.getByTestId('depth-pet').waitFor({state:'visible'});
  const hit=()=>page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.getAttribute('data-testid'),{x:width/2,y:height/2+4});
  assert.equal(await hit(),'depth-pet',name+': pet below an object must appear in front despite its old layer');
  await page.evaluate(()=>window.fixturePetY(.49));
  await page.waitForFunction(({x,y})=>document.elementFromPoint(x,y)?.getAttribute('data-testid')==='depth-building',{x:width/2,y:height/2+4});
  await page.getByTestId('paint').click();
  for(const scale of [.65,1.2]){
   await page.evaluate(s=>window.fixtureScale(s),scale);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
   const samples=await page.getByTestId('pet-park-painterly-terrain').evaluate((canvas,{width,height,scale})=>{
    const ctx=canvas.getContext('2d');
    const pixel=(x,y)=>Array.from(ctx.getImageData(Math.round(x*canvas.width/width),Math.round(y*canvas.height/height),1,1).data);
    return [pixel(width/2,height/2),pixel(width/2+90*scale,height/2-40*scale)];
   },{width,height,scale});
   assert.ok(samples[0][0]>samples[0][1],name+': diamond center is dirt');
   assert.ok(samples[1][1]>samples[1][0],name+': bounding-box corner stays grass, not a rectangle');
  }
  await page.evaluate(()=>window.fixtureScale(.8));
  const from={x:width*.18,y:height*.22},to={x:width*.76,y:height*.22+width*.58*.5};
  const cdp=touch?await context.newCDPSession(page):null;
  if(cdp){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
   for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8,id:1}]});
  }else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});}
  const tile=page.locator('[data-testid="pet-park-brush-mode"] > div.opacity-80').first();
  await tile.waitFor({state:'visible'});const box=await tile.boundingBox();
  assert.ok(Math.abs(box.width-2*box.height)<1);
  assert.match(await tile.locator('[aria-hidden="true"]').evaluate(el=>el.style.clipPath),/polygon/);
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  await page.waitForFunction(()=>!document.body.textContent.includes('Saving terrain…'));
  assert.equal(strokes.length,1);assert.ok(strokes[0].points.length>1);
  const p=strokes[0].points;
  for(let i=1;i<p.length;i++){
   const dx=(p[i].xPct-p[i-1].xPct)*1800,dy=(p[i].yPct-p[i-1].yPct)*2700;
   assert.ok(Math.abs(Math.abs(dx)-75)<1e-6&&Math.abs(Math.abs(dy)-37.5)<1e-6,'150-unit adjacent diamonds must share a slanted edge');
  }
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/park-isometric-'+name+'.png'});
  console.log('PASS '+name+': isometric pixels and previews, angled touch/mouse snapping, automatic front/back pet overlap');
  await context.close();
 }
}finally{await browser.close();await server.close();}
