import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';

// Real park, brush, canvas and contact shadows; isolated API responses only.
const fixtureId='/__park-placement-fixture.tsx';
const fixture=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {getQueryFn} from '@/lib/queryClient';
import {TooltipProvider} from '@/components/ui/tooltip';
import PetParkPage from '@/pages/PetParkPage';
import '@/index.css';
const client=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:'returnNull'}),retry:false,refetchOnWindowFocus:false}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><TooltipProvider><PetParkPage/></TooltipProvider></QueryClientProvider>);
`;
const server=await createServer({server:{host:'127.0.0.1',port:4180,strictPort:true},plugins:[{
 name:'park-placement-fixture',resolveId:id=>id===fixtureId?id:null,load:id=>id===fixtureId?fixture:null,
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(!req.headers.accept?.includes('text/html'))return next();
  res.setHeader('Content-Type','text/html');
  res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
 });}
}]});
await server.listen();
const browser=await chromium.launch({headless:true});
try{
 for(const [name,width,height,touch] of [['phone',390,844,true],['tablet',834,1194,true],['desktop frame',600,900,false]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const art='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="40" y="20" width="120" height="120" fill="#c2ad74"/></svg>').toString('base64');
  let scene={enabledForPlayers:false,canEditPark:true,preview:true,backgroundUrl:null,groundLevel:1,items:[{id:'decor',kind:'decor',effectType:null,imageUrl:art,xPct:0.72,yPct:0.58,size:100,flipped:false,layer:0}],deposits:[],sharedPets:[],unlockedSlots:1,buildings:[{id:'cottage',name:'Fixture Cottage',imageUrl:art,interiorImageUrl:null,xPct:0.5,yPct:0.5,size:400,flipped:false,layer:0,maxPets:10,interiorEffects:[]}]};
  const strokes=[],patches=[];
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/pet-park/scene')return route.fulfill({json:scene});
   if(path==='/api/admin/pet-park/buildings/cottage'){
    const body=route.request().postDataJSON();patches.push(body);
    scene={...scene,buildings:[{...scene.buildings[0],...body}]};
    return route.fulfill({json:scene.buildings[0]});
   }
   if(path==='/api/admin/pet-park/terrain-strokes'){
    const body=route.request().postDataJSON();strokes.push(body);
    const items=body.points.map((p,i)=>({...p,id:'tile-'+strokes.length+'-'+i,kind:'terrain',effectType:body.type,size:body.size,imageUrl:null,flipped:false,layer:0}));
    scene={...scene,items:[...scene.items,...items]};
    return route.fulfill({status:201,json:{items}});
   }
   return route.fulfill({json:{}});
  });
  await page.goto('http://127.0.0.1:4180/park-fixture');
  const cottage=page.getByRole('button',{name:'Enter Fixture Cottage',exact:true});
  await cottage.waitFor({state:'visible'});
  assert.equal(await page.getByTestId('pet-park-contact-shadow').count(),0,name+': buildings and decor must have no added ground shadows');
  assert.equal(patches.length,0,'loading must never move saved objects');
  const box=await cottage.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height*.4);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+30,box.y+box.height*.4+20,{steps:6});await page.mouse.up();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:/layer|Apply exact values/i}).count(),0,name+': no manual layer controls');
  assert.equal(patches.length,1,name+': one drag uses the existing placement PATCH');
  assert.ok(patches[0].xPct>0.5&&patches[0].yPct>0.5);
  await page.getByRole('button',{name:'Paint terrain',exact:true}).click();
  const surface=page.getByTestId('pet-park-terrain-brush-surface');await surface.waitFor({state:'visible'});
  const from={x:width*.18,y:height*.22},to={x:width*.82,y:height*.22+width*.64*.5};
  const session=touch?await context.newCDPSession(page):null;
  if(session){
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
   for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8,id:1}]});
  }else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});}
  const previews=page.locator('[data-testid="pet-park-brush-mode"] > div.opacity-80');
  await previews.first().waitFor({state:'visible'});
  const preview=await previews.first().boundingBox();assert.ok(Math.abs(preview.width-preview.height*2)<1,name+': preview must be an isometric diamond');
  if(session)await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  await page.waitForFunction(()=>!document.body.textContent.includes('Saving terrain…'));
  assert.equal(strokes.length,1);assert.equal(strokes[0].type,'dirt_path');
  const points=strokes[0].points;assert.ok(points.length>1);
  assert.ok(points.every(p=>Math.abs((p.xPct-points[0].xPct)*1800-2*(p.yPct-points[0].yPct)*2700)<1e-6),name+': path must follow the ground diagonal');
  for(let i=1;i<points.length;i++)assert.ok(Math.abs((points[i].xPct-points[i-1].xPct)*1800-strokes[0].size/2)<1e-6,name+': tiles meet edge to edge');
  const controls=await page.getByLabel('Pet Park terrain brush controls',{exact:true}).boundingBox();
  assert.ok(controls.y+controls.height<=height-60,name+': brush controls must clear the preview status banner');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/park-'+name.replaceAll(' ','-')+'.png'});
  console.log('PASS '+name+': shadow-free buildings/decor, unchanged saved placement, object drag, diamond preview, snapped touch/mouse path and one save');
  await context.close();
 }
}finally{await browser.close();await server.close();}
