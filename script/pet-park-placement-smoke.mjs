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
  let scene={enabledForPlayers:false,canEditPark:true,preview:true,backgroundUrl:null,groundLevel:1,groundTheme:"grass",items:[{id:'decor',kind:'decor',effectType:null,imageUrl:art,xPct:0.72,yPct:0.58,size:100,flipped:false,layer:0}],deposits:[],sharedPets:[],unlockedSlots:1,buildings:[{id:'cottage',name:'Fixture Cottage',imageUrl:art,interiorImageUrl:null,xPct:0.5,yPct:0.5,size:400,flipped:false,layer:0,maxPets:10,interiorEffects:[]}]};
  const strokes=[],patches=[],decorPatches=[],groundUpdates=[],shopSaves=[];
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/pet-park/scene')return route.fulfill({json:scene});
   if(path==='/api/admin/pet-park/items/overlap-flower'){
    const body=route.request().postDataJSON();
    decorPatches.push(body);
    scene={...scene,items:scene.items.map(item=>item.id==='overlap-flower'?{...item,...body}:item)};
    return route.fulfill({json:scene.items.find(item=>item.id==='overlap-flower')});
   }
   if(path==='/api/admin/pet-park/buildings/cottage'){
    const body=route.request().postDataJSON();
    if (Object.prototype.hasOwnProperty.call(body,'isShop')) shopSaves.push(body);
    else patches.push(body);
    scene={...scene,buildings:[{...scene.buildings[0],...body}]};
    return route.fulfill({json:scene.buildings[0]});
   }
   if(path==='/api/admin/pet-park/ground-theme'){
    const body=route.request().postDataJSON();
    groundUpdates.push(body.groundTheme);
    scene={...scene,groundTheme:body.groundTheme};
    return route.fulfill({json:{groundTheme:body.groundTheme}});
   }
   if(path==='/api/admin/pet-park/terrain-strokes'){
    const body=route.request().postDataJSON();strokes.push(body);
    const items=body.points.map((p,i)=>({...p,id:'tile-'+strokes.length+'-'+i,kind:'terrain',effectType:body.type,size:body.size,imageUrl:null,flipped:false,layer:0}));
    scene={...scene,items:[...scene.items,...items]};
    return route.fulfill({status:201,json:{items}});
   }
   return route.fulfill({json:{}});
  });
  // Vite's cold dependency optimization can delay the load event on CI.
  // Navigation commits first; the actual gameplay readiness assertion below
  // still requires the real building control to render before interactions.
  await page.goto('http://127.0.0.1:4180/park-fixture',{waitUntil:'commit',timeout:30000});
  const cottage=page.getByRole('button',{name:'Enter Fixture Cottage',exact:true});
  await cottage.waitFor({state:'visible',timeout:30000});
  assert.equal(await page.getByTestId('pet-park-contact-shadow').count(),0,name+': buildings and decor must have no added ground shadows');
  assert.equal(patches.length,0,'loading must never move saved objects');

  // Place a small decoration where a large foreground building's transparent
  // top-right PNG padding covers it in the browser's rectangular hit layer.
  // Actual artwork alpha says the smaller flower should receive the tap.
  const buildingBounds=await cottage.boundingBox();
  const worldBounds=await page.locator('[data-park-world-artwork]').boundingBox();
  const flowerPoint={x:buildingBounds.x+buildingBounds.width*.90,
                     y:buildingBounds.y+buildingBounds.height*.12};
  const flowerPlacement={xPct:(flowerPoint.x-worldBounds.x)/worldBounds.width,
                         yPct:(flowerPoint.y-worldBounds.y)/worldBounds.height};
  assert.ok(flowerPlacement.xPct>0 && flowerPlacement.xPct<1 &&
    flowerPlacement.yPct>0 && flowerPlacement.yPct<1,
    name+': overlap fixture fits inside park world');
  scene={...scene,items:[...scene.items,{
    id:'overlap-flower',kind:'decor',effectType:null,imageUrl:art,
    ...flowerPlacement,size:80,flipped:false,layer:0,
  }]};
  await page.reload({waitUntil:'commit'});
  const small=page.locator('[data-park-object-id="overlap-flower"]');
  await small.waitFor({state:'visible'});
  const newCottage=page.getByRole('button',{name:'Enter Fixture Cottage',exact:true});
  const smallBounds=await small.boundingBox();
  const flowerTap={x:smallBounds.x+smallBounds.width/2,y:smallBounds.y+smallBounds.height/2};
  const browserTopObject=await page.evaluate(point=>
    document.elementFromPoint(point.x,point.y)?.closest('[data-park-object-id]')?.getAttribute('data-park-object-id'),
    flowerTap);
  assert.equal(browserTopObject,'cottage',name+': topmost rectangle really blocks small flower without alpha selection');
  await page.mouse.click(flowerTap.x,flowerTap.y);
  await page.getByTestId('park-decoration-artwork-editor').waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:'Edit building'}).count(),0,
    name+': transparent foreground building does not steal smaller decor selection');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.mouse.click(flowerTap.x,flowerTap.y);
  await page.mouse.click(flowerTap.x,flowerTap.y);
  await page.getByText('Move armed · drag artwork').waitFor({state:'visible'});
  const beforeDecorDrag=await small.boundingBox();
  const dragStart={x:beforeDecorDrag.x+beforeDecorDrag.width/2,y:beforeDecorDrag.y+beforeDecorDrag.height/2};
  await page.mouse.move(dragStart.x,dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x+27,dragStart.y+22,{steps:6});
  await page.mouse.up();
  await page.waitForFunction(()=>!document.body.textContent.includes('Saving…'));
  assert.equal(decorPatches.length,1,name+': dragging a small hidden-behind-padding decor saves its own placement');
  assert.ok(decorPatches[0].xPct>flowerPlacement.xPct && decorPatches[0].yPct>flowerPlacement.yPct);
  assert.equal(patches.length,0,name+': moving the flower does not move its overlapping building');
  await page.getByRole('button',{name:'Done',exact:true}).click();

  // One drag may pan the camera or select, but must NOT move admin objects.
  const box=await newCottage.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height*.4);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+30,box.y+box.height*.4+20,{steps:6});await page.mouse.up();
  assert.equal(patches.length,0,name+': single drag cannot move a building');

  // A double-tap on the visible artwork arms a subsequent drag; remeasure
  // after camera panning instead of assuming the object stayed in one place.
  await page.waitForTimeout(440);
  const armedBox=await newCottage.boundingBox();
  const x=armedBox.x+armedBox.width/2,y=armedBox.y+armedBox.height*.4;
  await page.mouse.click(x,y);
  await page.mouse.click(x,y);
  await page.getByText('Move armed · drag artwork').waitFor({state:'visible'});
  const movedBox=await newCottage.boundingBox();
  await page.mouse.move(movedBox.x+movedBox.width/2,movedBox.y+movedBox.height*.4);
  await page.mouse.down();
  await page.mouse.move(movedBox.x+movedBox.width/2+30,movedBox.y+movedBox.height*.4+20,{steps:6});
  await page.mouse.up();
  await page.waitForFunction(()=>!document.body.textContent.includes('Saving…'));
  assert.equal(patches.length,1,name+': armed double-tap drag uses the existing placement PATCH');
  assert.ok(patches[0].xPct>0.5&&patches[0].yPct>0.5);
  // Shop status is visible and persists immediately, including on re-entry.
  await page.getByRole('button',{name:'Edit building'}).click();
  const details=page.getByTestId('pet-park-building-details');
  await details.waitFor({state:'visible'});
  const shop=details.getByRole('switch',{name:'Is Shop building'});
  const status=details.getByTestId('pet-park-shop-status');
  assert.equal(await shop.isChecked(),false,name+': regular building is visibly OFF');
  await status.getByText('OFF · Regular building').waitFor({state:'visible'});
  const sceneAfterShopOn=page.waitForResponse(response=>response.url().includes('/api/pet-park/scene')&&response.request().method()==='GET');
  await shop.click();
  await sceneAfterShopOn;
  await status.getByText('ON · Shop enabled').waitFor({state:'visible'});
  assert.deepEqual(shopSaves,[{isShop:true}],name+': switch immediately persists ON');
  assert.equal(scene.buildings[0].isShop,true);
  await details.getByRole('button',{name:'Close'}).click();
  await page.getByRole('button',{name:'Edit building'}).click();
  await details.waitFor({state:'visible'});
  assert.equal(await shop.isChecked(),true,name+': reopening reads saved Shop ON');
  const sceneAfterShopOff=page.waitForResponse(response=>response.url().includes('/api/pet-park/scene')&&response.request().method()==='GET');
  await shop.click();
  await sceneAfterShopOff;
  await status.getByText('OFF · Regular building').waitFor({state:'visible'});
  assert.deepEqual(shopSaves,[{isShop:true},{isShop:false}],name+': switch immediately persists OFF');
  await details.getByRole('button',{name:'Close'}).click();

  // The transparent corner of the SVG must not select or drag the building.
  const after=await newCottage.boundingBox();
  await page.mouse.move(after.x+3,after.y+3);await page.mouse.down();
  await page.mouse.move(after.x+33,after.y+23,{steps:6});await page.mouse.up();
  assert.equal(patches.length,1,name+': transparent image padding cannot move an object');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:/layer|Apply exact values/i}).count(),0,name+': no manual layer controls');
  await page.getByRole('button',{name:'Paint terrain',exact:true}).click();
  const surface=page.getByTestId('pet-park-terrain-brush-surface');await surface.waitFor({state:'visible'});
  const palette=page.getByTestId('pet-park-terrain-brush-palette');
  const toggleTools=page.getByRole('button',{name:'Choose terrain brush'});
  assert.equal(await palette.count(),0,name+': compact toolbar does not cover painting until requested');
  assert.equal(await toggleTools.getAttribute('aria-expanded'),'false');
  await toggleTools.click();
  await palette.waitFor({state:'visible'});
  await toggleTools.click();
  await palette.waitFor({state:'hidden'});
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
  // The park-wide base is independent of painted paths. Switching themes must
  // update the REAL viewport canvas but never move authored decor/buildings.
  await toggleTools.click();
  const groundButtons=page.getByRole('group',{name:'Pet Park ground style'});
  assert.equal(await groundButtons.getByRole('button').count(),5,name+': five themed base grounds');
  for(const [index,[theme,rgb]] of [['snow','rgb(201, 214, 211)'],['volcanic','rgb(51, 45, 49)'],['grass','rgb(44, 73, 52)']].entries()){
    if(index>0)await toggleTools.click();
    const label=theme.charAt(0).toUpperCase()+theme.slice(1);
    const saved=page.waitForResponse(response=>response.url().includes('/api/admin/pet-park/ground-theme'));
    await groundButtons.getByRole('button',{name:label,exact:true}).click();
    await saved;
    await page.waitForFunction(expected=>document.querySelector('[data-testid="pet-park-painterly-terrain"]')?.style.backgroundColor===expected,rgb);
    // Options collapse when a choice is made. Reopen briefly to inspect
    // the authoritative selected ground without leaving a large menu up.
    await toggleTools.click();
    assert.equal(await groundButtons.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true');
    await toggleTools.click();
  }
  assert.deepEqual(groundUpdates,['snow','volcanic','grass']);
  assert.equal(patches.length,1,name+': changing base ground cannot mutate saved buildings');
  // Drive the real mobile pointer handlers for each new connected material.
  for(const [material,label] of [['stone_path','Stone Path'],['water_path','Water']]){
    await toggleTools.click();
    await page.getByRole('button',{name:label,exact:true}).click();
    const response=page.waitForResponse(response=>response.url().includes('/api/admin/pet-park/terrain-strokes'));
    if(session){
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
      for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8,id:1}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await page.mouse.move(from.x,from.y);await page.mouse.down();
      await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
    }
    await response;
    assert.equal(strokes.at(-1).type,material,name+': saved connected '+material);
    assert.equal(strokes.at(-1).size,150);
    const pathPoints=strokes.at(-1).points;
    assert.ok(pathPoints.length>1,name+': continuous isometric '+material);
    assert.ok(pathPoints.every(p=>Math.abs((p.xPct-pathPoints[0].xPct)*1800-2*(p.yPct-pathPoints[0].yPct)*2700)<1e-6),
      name+': '+material+' shares the existing dirt isometric grid');
  }
  assert.equal(strokes.length,3);
  // Garden plots must use the SAME touch/mouse world-to-grid stroke handler
  // as stone/dirt paths, not a new scene or admin input surface.
  await toggleTools.click();
  await page.getByRole('button',{name:'Garden Plot',exact:true}).click();
  const gardenSave=page.waitForResponse(response=>response.url().includes('/api/admin/pet-park/terrain-strokes'));
  if(session){
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
    for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8,id:1}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await page.mouse.move(from.x,from.y);await page.mouse.down();
    await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
  }
  await gardenSave;
  assert.equal(strokes.length,4,name+': garden plot stroke must be saved exactly once');
  assert.equal(strokes.at(-1).type,'garden_plot');
  assert.equal(strokes.at(-1).size,150);
  assert.ok(strokes.at(-1).points.every(p=>p.xPct>=0&&p.xPct<=1&&p.yPct>=0&&p.yPct<=1));
  assert.equal(patches.length,1,name+': painting plots never repositions buildings');
  const controls=await page.getByLabel('Pet Park terrain brush controls',{exact:true}).boundingBox();
  assert.ok(controls.y>=60&&controls.y+controls.height<height*.6,
    name+': compact painter tools stay near the top without hiding the world');
  assert.ok(controls.height<90,name+': collapsed brush controls are not a bulky popup');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/park-'+name.replaceAll(' ','-')+'.png'});
  console.log('PASS '+name+': original admin gestures, three snapped dirt/stone/water paths and five persistent ground options with zero placement changes');
  await context.close();
 }
}finally{await browser.close();await server.close();}
