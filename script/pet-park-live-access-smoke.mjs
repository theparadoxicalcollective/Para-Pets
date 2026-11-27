import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';

// Exercise the real admin form and player scene in separate browser sessions.
// Only the shared server responses are mocked; client cache/timers are real.
const fixtureId='/__park-live-access-fixture.tsx';
const fixture=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {getQueryFn} from '@/lib/queryClient';
import {TooltipProvider} from '@/components/ui/tooltip';
import {Toaster} from '@/components/ui/toaster';
import PetParkPage from '@/pages/PetParkPage';
import PetParkAdminPanel from '@/components/PetParkAdminPanel';
import '@/index.css';
const client=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:'returnNull'}),retry:false,staleTime:Infinity,refetchOnWindowFocus:false}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><TooltipProvider>{location.pathname==='/admin'?<div style={{height:'100%',overflow:'auto'}}><PetParkAdminPanel mode="settings"/></div>:<PetParkPage/>}<Toaster/></TooltipProvider></QueryClientProvider>);
`;
const server=await createServer({server:{host:'127.0.0.1',port:4197,strictPort:true},plugins:[{
 name:'park-live-access-fixture',resolveId:id=>id===fixtureId?id:null,load:id=>id===fixtureId?fixture:null,
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(!req.headers.accept?.includes('text/html'))return next();
  res.setHeader('Content-Type','text/html');
  res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
 });}
}]});
await server.listen();
const browser=await chromium.launch({headless:true});
try{
 for(const [name,width,height] of [['phone',390,844],['tablet',834,1194]]){
  const adminContext=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const playerContext=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const admin=await adminContext.newPage(), player=await playerContext.newPage();
  await player.clock.install();
  const errors=[]; for(const page of [admin,player])page.on('pageerror',error=>errors.push(error.message));
  let settings={enabledForPlayers:false,enabledForModerators:false,coinsPerHour:0,essencePerHour:0,petXpPerHour:0};
  const art='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="40" y="20" width="120" height="120" fill="#c2ad74"/></svg>').toString('base64');
  let building={id:'cottage',name:'Fixture Cottage',imageUrl:art,interiorImageUrl:null,xPct:.5,yPct:.5,size:400,flipped:false,layer:0,maxPets:10,interiorEffects:[]};
  const changes=[];let rejectNext=false, sceneReads=0;
  for(const page of [admin,player])await page.route('**/api/**',route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(path==='/api/admin/pet-park/settings')return route.fulfill({json:settings});
   if(path==='/api/admin/pet-park/availability'){
    const body=req.postDataJSON();
    changes.push([req.method(),body]);
    if(rejectNext){rejectNext=false;return route.fulfill({status:500,json:{message:'Fixture save failed'}});}
    if(body.enabledForPlayers&&!settings.enabledForPlayers&&!settings.coinsPerHour&&!settings.essencePerHour&&!settings.petXpPerHour)
      settings={...settings,coinsPerHour:60,essencePerHour:24,petXpPerHour:300};
    settings={...settings,...body};
    return route.fulfill({json:settings});
   }
   if(path==='/api/admin/pet-park/reward-rates'){
    const body=req.postDataJSON();changes.push([req.method(),body]);settings={...settings,...body};
    return route.fulfill({json:settings});
   }
   if(path==='/api/pet-park/scene'){
    sceneReads++;
    return route.fulfill({json:{enabledForPlayers:settings.enabledForPlayers,canEnterPark:settings.enabledForPlayers,canEditPark:false,preview:false,backgroundUrl:null,groundLevel:1,groundTheme:'grass',items:[],deposits:[],sharedPets:[],unlockedSlots:1,buildings:settings.enabledForPlayers?[building]:[],rates:settings}});
   }
   if(path==='/api/inventory')return route.fulfill({json:[]});
   if(path==='/api/pet-park/garden')return route.fulfill({json:{plots:[]}});
   return route.fulfill({json:{}});
  });
  await admin.goto('http://127.0.0.1:4197/admin',{waitUntil:'commit'});
  const players=admin.getByRole('switch',{name:'Open Pet Park to players'});
  const moderators=admin.getByRole('switch',{name:'Open Pet Park to moderators'});
  await admin.waitForFunction(()=>document.querySelector('[role="switch"]')?.disabled===false,{},{timeout:30000});
  assert.equal(await players.getAttribute('aria-checked'),'false');
  await player.goto('http://127.0.0.1:4197/player',{waitUntil:'commit'});
  await player.getByText('Pet Park — Under Construction',{exact:true}).waitFor({timeout:30000});
  await moderators.click();
  await admin.waitForFunction(()=>document.querySelector('[aria-labelledby="park-access-moderators"]')?.getAttribute('aria-checked')==='true');
  assert.deepEqual(changes,[['PATCH',{enabledForModerators:true}]]);
  assert.equal(await players.getAttribute('aria-checked'),'false');
  await players.click();
  await admin.waitForFunction(()=>document.querySelector('[aria-labelledby="park-access-players"]')?.getAttribute('aria-checked')==='true');
  assert.equal(await admin.getByRole('spinbutton',{name:'coinsPerHour'}).inputValue(),'60');
  assert.equal(await admin.getByRole('spinbutton',{name:'essencePerHour'}).inputValue(),'24');
  assert.equal(await admin.getByRole('spinbutton',{name:'petXpPerHour'}).inputValue(),'300');
  assert.equal(await admin.getByRole('button',{name:/publish/i}).count(),0);
  assert.deepEqual(changes[1],['PATCH',{enabledForPlayers:true}]);
  await player.bringToFront();
  await player.clock.fastForward(31000);
  await player.getByRole('button',{name:'Enter Fixture Cottage'}).waitFor({timeout:15000});
  await player.getByText('Pet Park — Under Construction',{exact:true}).waitFor({state:'hidden'});
  const oldReads=sceneReads;
  building={...building,name:'Updated Cottage'}; // saved edit, not a publish operation
  await player.clock.fastForward(31000);
  await player.getByRole('button',{name:'Enter Updated Cottage'}).waitFor({timeout:15000});
  assert.ok(sceneReads>oldReads,name+': saved scene update arrives via automatic polling');
  await admin.getByRole('spinbutton',{name:'coinsPerHour'}).fill('77');
  rejectNext=true;
  await players.click();
  await admin.getByText('Could not save',{exact:true}).waitFor();
  assert.equal(await players.getAttribute('aria-checked'),'true',name+': failed save must not show closed');
  await players.click();
  await admin.waitForFunction(()=>document.querySelector('[aria-labelledby="park-access-players"]')?.getAttribute('aria-checked')==='false');
  assert.deepEqual(changes.at(-1),['PATCH',{enabledForPlayers:false}]);
  assert.equal(settings.coinsPerHour,60,name+': draft rates do not affect access switches');
  await player.bringToFront();
  await player.clock.fastForward(31000);
  await player.getByText('Pet Park — Under Construction',{exact:true}).waitFor({timeout:15000});
  await admin.getByRole('button',{name:'Save reward rates'}).click();
  await admin.getByText('Pet Park reward rates saved.',{exact:true}).waitFor();
  assert.deepEqual(changes.at(-1),['PUT',{coinsPerHour:77,essencePerHour:24,petXpPerHour:300}]);
  assert.deepEqual(errors,[],name+': JS errors');
  await playerContext.close();await adminContext.close();
  console.log('PASS '+name+': independent live access, base rates, direct scene polling, rejected saves and separate rates');
 }
}finally{await browser.close();await server.close();}
