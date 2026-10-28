import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real player-facing components; isolated API fixtures, never live player data.
const fixtureId = "/__begin-journey-fixture.tsx";
const fixture = `
import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {useLocation} from 'wouter';
import {QueryClientProvider,useQuery} from '@tanstack/react-query';
import {queryClient} from '@/lib/queryClient';
import {bjUsePlayer,bjGetStep,bjSetStep} from '@/lib/beginJourney';
import {useStageViewportLayout,publishStageViewportCss} from '@/lib/stageViewport';
import HomePage from '@/pages/HomePage';
import PetInventoryPage from '@/pages/PetInventoryPage';
import FloatingNav from '@/components/FloatingNav';
import BeginJourneyOverlay from '@/components/BeginJourneyOverlay';
import NpcQuestDiscoveryGuide from '@/components/NpcQuestDiscoveryGuide';
import {TooltipProvider} from '@/components/ui/tooltip';
import {Toaster} from '@/components/ui/toaster';
import '@/index.css';
window.fixtureInventory=()=>queryClient.getQueryData(['/api/inventory']);
queryClient.setDefaultOptions({queries:{...queryClient.getDefaultOptions().queries,retry:false,refetchOnWindowFocus:false}});
function Fixture(){
 const [location]=useLocation();
 const layout=useStageViewportLayout(location);
 const {data:user}=useQuery({queryKey:['/api/auth/me']});
 useEffect(()=>{
   publishStageViewportCss(layout);
   Object.assign(document.getElementById('game-stage').style,{position:'absolute',left:layout.left+'px',top:layout.top+'px',width:layout.designWidth+'px',height:layout.designHeight+'px',overflow:'hidden'});
 },[layout]);
 useEffect(()=>{
   if(!user)return;
   if(user.tutorial_quest_completed)bjSetStep('done');
   else if(bjGetStep()===null){
     const seed=new URLSearchParams(window.location.search).get('seed');
     if(seed){localStorage.setItem('bj_starter_inventory_id:'+user.id,'starter-owned');bjSetStep(Number(seed));}
     else bjSetStep(0);
   }
 },[user?.id,user?.tutorial_quest_completed]);
 if(!user)return null;
 bjUsePlayer(user.id);
 return <><div style={{position:'absolute',inset:0,pointerEvents:'auto'}}>
   {location==='/pets'?<PetInventoryPage/>:<HomePage user={user}/>}</div>
   <FloatingNav user={user}/><BeginJourneyOverlay user={user}/><NpcQuestDiscoveryGuide user={user}/><Toaster/></>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><TooltipProvider><Fixture/></TooltipProvider></QueryClientProvider>);
`;
const server=await createServer({server:{host:'127.0.0.1',port:4175,strictPort:true},plugins:[{
 name:'isolated-begin-journey-fixture',resolveId:id=>id===fixtureId?id:null,load:id=>id===fixtureId?fixture:null,
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
   if(!req.headers.accept?.includes('text/html'))return next();
   res.setHeader('Content-Type','text/html');
   res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="game-stage-shell" style="position:fixed;inset:0;overflow:hidden"><div id="game-stage" data-coordinate-owner="viewport"><div id="game-viewport-page" style="position:absolute;inset:0;pointer-events:none;z-index:20"></div><div id="game-viewport-backdrop" style="position:absolute;inset:0;pointer-events:none;z-index:17"></div><div id="game-viewport-scene" style="position:absolute;inset:0;pointer-events:none;z-index:30"></div><div id="root" style="position:absolute;inset:0;z-index:15"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:40"></div></div></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
 });}
}]});
await server.listen();
const browser=await chromium.launch({headless:true});
const art='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><ellipse cx="100" cy="100" rx="70" ry="90" fill="#f1cf70"/></svg>').toString('base64');
const profiles=[['compact phone',320,568,true],['Android phone',360,800,true],['iPhone size',390,844,true],['large phone',430,932,true],['Android tablet',800,1280,true],['tablet',834,1194,true],['desktop portrait',1440,900,false]];
const probe=process.argv.includes('--probe');
const recoveryOnly=process.argv.includes('--recovery-only');
try{
for(const [name,width,height,touch] of probe?[profiles[1]]:recoveryOnly?[profiles[1],profiles[6]]:profiles){
 const recovery=!probe && (width===360 || !touch);
 const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
 const user={id:'journey-fixture',username:'QA',email:'qa@example.invalid',coins:0,isAdmin:false,isModerator:false,emailVerified:true,profileImage:null,activePetId:probe?'starter-owned':null,tutorial_quest_completed:false,tutorial_reward_claimed:false};
 const pet=id=>({inventoryId:id,id,shopItemId:'starter',name:id,type:'pet',rarity:3,starRarity:3,isHatched:false,hatchTime:3,hatchStartedAt:null,eggImageUrl:art,imageUrl:art,hatchedImageUrl:art,petTemplateId:null,petLevel:1,petHp:10,petAtk:1,petDef:1,quantity:1});
 let inventory=[pet('other-owned')];
 if(probe)inventory.push(pet('starter-owned'),{inventoryId:'potions',type:'special',specialType:'hatch_time',specialAmount:60,name:'Hatching Potion',imageUrl:art,quantity:3});
 const counts={grants:0,potionGrants:0,useAttempts:0,uses:0,complete:0,claims:0,activations:0};
 const failures={catalog:recovery?1:0,starterGrant:0,grant:0,activation:0,inventory:0,use:0,complete:0,claim:0};
 const fulfill=(route,json,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,body=req.postDataJSON()??{};
  const fail=key=>{if(failures[key]>0){failures[key]--;return true}return false};
  if(path==='/api/auth/me')return fulfill(route,user);
  if(path==='/api/inventory')return fail('inventory')?fulfill(route,{message:'Inventory temporarily unavailable'},503):fulfill(route,inventory);
  if(path==='/api/tutorial/starter-pets'){if(fail('catalog'))return fulfill(route,{message:'Catalog temporarily unavailable'},503);return fulfill(route,Array.from({length:16},(_,i)=>({id:'starter-'+i,name:'Companion '+i,imageUrl:art})));}
  if(path==='/api/tutorial/grant-starter-egg'){
    assert.equal(body.petId,'starter-15');
    counts.grants++;if(fail('starterGrant'))return fulfill(route,{message:'Try choosing again'},503);
    if(!inventory.some(p=>p.inventoryId==='starter-owned'))inventory.push(pet('starter-owned'));
    return fulfill(route,{inventoryId:'starter-owned'});
  }
  if(path==='/api/user/active-pet'){
    counts.activations++;await new Promise(resolve=>setTimeout(resolve,150));
    if(fail('activation'))return fulfill(route,{message:'Try activation again'},503);
    assert.equal(body.activePetId,'starter-owned');user.activePetId=body.activePetId;return fulfill(route,user);
  }
  if(path==='/api/tutorial/grant-hatch-potions'){
    counts.potionGrants++;
    if(fail('grant'))return fulfill(route,{message:'Potions temporarily unavailable'},503);
    if(!inventory.some(p=>p.inventoryId==='potions'))inventory.push({inventoryId:'potions',type:'special',specialType:'hatch_time',specialAmount:60,name:'Hatching Potion',imageUrl:art,quantity:3});
    return fulfill(route,{status:'granted',grantedQuantity:3});
  }
  if(path==='/api/pet/starter-owned/use-special'){
    counts.useAttempts++;await new Promise(resolve=>setTimeout(resolve,500));
    if(fail('use'))return fulfill(route,{message:'Potion request interrupted'},503);
    assert.equal(body.itemInventoryId,'potions');assert.equal(body.tutorialFill,true);
    counts.uses++;const egg=inventory.find(p=>p.inventoryId==='starter-owned');
    egg.hatchStartedAt=new Date(Date.now()-counts.uses*3600000-100).toISOString();
    inventory=inventory.map(p=>p.inventoryId==='potions'?{...p,quantity:3-counts.uses}:p).filter(p=>p.quantity!==0);
    return fulfill(route,{hatchStartedAt:egg.hatchStartedAt});
  }
  if(path==='/api/pet/starter-owned/hatch-check'){
    const egg=inventory.find(p=>p.inventoryId==='starter-owned');egg.isHatched=counts.uses===3;return fulfill(route,{isHatched:egg.isHatched});
  }
  if(path==='/api/tutorial/complete'){
    counts.complete++;if(fail('complete'))return fulfill(route,{message:'Completion temporarily unavailable'},503);
    assert.equal(inventory.find(p=>p.inventoryId==='starter-owned').isHatched,true);user.tutorial_quest_completed=true;return fulfill(route,{tutorialCompleted:true});
  }
  if(path==='/api/tutorial/claim-reward'){
    counts.claims++;if(fail('claim'))return fulfill(route,{message:'Claim temporarily unavailable'},503);
    assert.equal(user.tutorial_quest_completed,true);if(!user.tutorial_reward_claimed){user.coins+=1500;user.tutorial_reward_claimed=true;}
    return fulfill(route,{coins:1500,newBalance:user.coins,coinBalance:user.coins});
  }
  if(path==='/api/quests/daily'||path==='/api/quests/janson')return fulfill(route,{quests:[]});
  if(path==='/api/quests/ginny-mini-pet')return fulfill(route,{status:'available'});
  if(path==='/api/friends/requests/count')return fulfill(route,{count:0});
  if(path.includes('pet-page-placement'))return fulfill(route,{x:0,y:0,scale:1});
  if(path==='/api/active-pet-anchor')return fulfill(route,{x:0,y:0});
  // Real NPC discovery starts after tutorial completion. Supply each world
  // with its actual tour NPCs: missing-data recovery has its own dedicated smoke.
  if(path==='/api/world/haunted_woods/locations')return fulfill(route,[{id:'ginny',name:'Ginny',type:'npc'}]);
  if(path==='/api/world/swamp/locations')return fulfill(route,[{id:'janson',name:'Janson',type:'npc'},{id:'lonelle',name:'Lonelle',type:'npc'}]);
  return fulfill(route,[]);
 });
 const step=async n=>page.waitForFunction(n=>localStorage.getItem('bj_step:journey-fixture')===String(n),n);
 const activate=async locator=>touch?locator.tap():locator.click();
 const spotlightClick=async(target,double=false)=>{
  await target.waitFor({state:'visible'});
  const selector=await target.evaluate(node=>node.dataset.inventoryId?'[data-inventory-id="'+node.dataset.inventoryId+'"]':'[data-testid="'+node.dataset.testid+'"]');
  await page.waitForFunction(selector=>{const target=document.querySelector(selector)?.getBoundingClientRect(),forward=document.querySelector('[data-testid="begin-journey-forwarder"]')?.getBoundingClientRect();return target&&forward&&Math.hypot(target.x+target.width/2-forward.x-forward.width/2,target.y+target.height/2-forward.y-forward.height/2)<3},selector);
  const rect=await target.boundingBox();assert.ok(rect);
  if(touch)await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);
  else await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
  if(double){
    if(touch)await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);
    else await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
  }
 };
 await page.goto('http://127.0.0.1:4175/'+(probe?'?seed=5':''),{waitUntil:'domcontentloaded'});
 if(probe){
  const potion=page.getByTestId('button-speedup-tutorial');await potion.waitFor({state:'visible'});
  assert.equal(await potion.evaluate(node=>getComputedStyle(node).pointerEvents),'auto','potion must accept input through the HUD');
  console.log('PASS potion input probe');await context.close();continue;
 }
 await step(0);
 if(recovery){
   await activate(page.getByTestId('button-retry-starter-pets'));
   failures.starterGrant=1;
   await activate(page.getByTestId('button-choose-starter-starter-15'));
   await page.getByText('Your egg could not be selected.').waitFor({state:'visible'});
   failures.activation=1;
 }
 await activate(page.getByTestId('button-choose-starter-starter-15'));
 await step(1);await spotlightClick(page.getByTestId('button-floating-nav'));
 await step(2);await spotlightClick(page.getByTestId('nav-item-inventory'));
 await step(3);await spotlightClick(page.locator('[data-inventory-id="starter-owned"]'),recovery);
 if(recovery){
   await page.waitForTimeout(5200);
   assert.equal(user.activePetId,null,'failed activation must not advance or choose a different pet');
   assert.equal(counts.activations,1,'double taps must not duplicate pending activation');
   await step(3);await spotlightClick(page.locator('[data-inventory-id="starter-owned"]'));
   failures.grant=1;
 }
 await step(4);assert.equal(user.activePetId,'starter-owned');
 await spotlightClick(page.getByTestId('button-egg-tap'));await step(5);
 if(recovery)await activate(page.getByTestId('button-retry-journey-items'));
 const potion=page.getByTestId('button-speedup-tutorial');await potion.waitFor({state:'visible'});
 assert.equal(await potion.evaluate(node=>getComputedStyle(node).pointerEvents),'auto');
 if(recovery){
   // A desktop window resize changes portrait HUD offsets; the potion must
   // remain inside the current HUD rather than the physical browser window.
   const resized=touch?{width:412,height:915}:{width:1366,height:768};
   await page.setViewportSize(resized);
   await page.waitForFunction(height=>Math.abs(document.getElementById('game-viewport-hud').getBoundingClientRect().height-height)<1,resized.height);
   const bounds=await potion.boundingBox(),hud=await page.locator('#game-viewport-hud').boundingBox();
   assert.ok(bounds.x>=hud.x && bounds.x+bounds.width<=hud.x+hud.width && bounds.y+bounds.height<=hud.y+hud.height);
   await page.setViewportSize({width,height});
   await page.waitForFunction(height=>Math.abs(document.getElementById('game-viewport-hud').getBoundingClientRect().height-height)<1,height);
 }
 const frame=await page.locator('#game-viewport-hud').boundingBox(),card=await potion.boundingBox();
 assert.ok(card.x>=frame.x && card.x+card.width<=frame.x+frame.width && card.y>=frame.y && card.y+card.height<=frame.y+frame.height,'potion card must stay within HUD');
 const touchSession=touch?await context.newCDPSession(page):null;
 const drag=async(target,cancel=false)=>{
  const from=await potion.boundingBox();assert.ok(from);
  if(touchSession){
    const start={x:from.x+from.width/2,y:from.y+from.height/2};
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
    for(let i=1;i<=8;i++)await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(target.x-start.x)*i/8,y:start.y+(target.y-start.y)*i/8,id:1}]});
    await touchSession.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  }else{
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
    await page.mouse.move(target.x,target.y,{steps:8});
    if(cancel)await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
    await page.mouse.up();
  }
 };
 const egg=await page.getByTestId('button-egg-tap').boundingBox();assert.ok(egg);
 await drag({x:frame.x+5,y:frame.y+5});
 await page.waitForTimeout(300);assert.equal(counts.uses,0,'a wrong drop must not consume a potion');
 await activate(potion);await page.waitForTimeout(100);assert.equal(counts.useAttempts,0,'a tap must not consume a potion');
 await drag({x:egg.x+egg.width/2,y:egg.y+egg.height/2},true);
 await page.waitForTimeout(100);assert.equal(counts.useAttempts,0,'cancelled drag must not use a potion');
 assert.equal(await page.getByTestId('tutorial-potion-drag-preview').count(),0);
 if(recovery){
   failures.use=1;
   await drag({x:egg.x+egg.width/2,y:egg.y+egg.height/2});
   await page.getByText('Hatching potion could not be used',{exact:true}).waitFor({state:'visible'});
   assert.equal(counts.uses,0);
 }
 for(let n=1;n<=3;n++){
  const attemptsBefore=counts.useAttempts;
  await drag({x:egg.x+egg.width/2,y:egg.y+egg.height/2});
  if(recovery && n===1)await drag({x:egg.x+egg.width/2,y:egg.y+egg.height/2});
  await page.waitForFunction(n=>(window.fixtureInventory()?.find(p=>p.inventoryId==='potions')?.quantity??0)===3-n,n);
  assert.equal(counts.uses,n);
  assert.equal(counts.useAttempts,attemptsBefore+1,'pending potion use must not send a duplicate request');
  if(recovery && n===1){
    const grantsBefore=counts.potionGrants;
    failures.inventory=1;
    await page.reload({waitUntil:'domcontentloaded'});await step(5);
    await activate(page.getByTestId('button-retry-journey-items'));
    await potion.waitFor({state:'visible'});
    assert.equal(counts.potionGrants,grantsBefore,'reload must reuse remaining potions');
  }
 }
 if(recovery)failures.complete=1;
 await page.getByText('Your egg is ready — tap it to hatch!').waitFor({state:'visible'});
 await activate(page.getByTestId('button-egg-tap'));await step('done');
 assert.equal(user.tutorial_quest_completed,true);
 assert.equal(counts.complete,recovery?2:1,'failed completion must retry even when inventory does not change');
 const npcGuide=page.getByTestId('npc-discovery-guide');
 await npcGuide.waitFor({state:'visible'});
 assert.match(await npcGuide.textContent(), /Explore quests\s*·\s*1\/3/,
   'Begin Journey handoff must load the complete Ginny, Janson and Lonelle tour');
 await activate(page.getByTestId('button-skip-npc-guide'));
 await activate(page.getByTestId('button-floating-nav'));
 await activate(page.getByTestId('nav-item-quest'));
 if(recovery){
   failures.claim=1;
   await activate(page.getByTestId('button-begin-journey-claim'));
   await page.getByText('Failed to claim reward',{exact:true}).waitFor({state:'visible'});
   assert.equal(user.coins,0);
 }
 await activate(page.getByTestId('button-begin-journey-claim'));
 await page.waitForTimeout(250);assert.equal(user.coins,1500);assert.equal(counts.claims,recovery?2:1);
 await page.reload({waitUntil:'domcontentloaded'});await step('done');
 assert.equal(await page.getByTestId('button-speedup-tutorial').count(),0);
 if(recovery){
   // Restore an interrupted finishing step before hatch confirmation. This is
   // local fixture state only; server completion must not be manufactured.
   user.tutorial_quest_completed=false;user.tutorial_reward_claimed=false;
   inventory.find(p=>p.inventoryId==='starter-owned').isHatched=false;
   inventory.find(p=>p.inventoryId==='starter-owned').hatchStartedAt=null;
   const completionsBefore=counts.complete;
   await page.evaluate(()=>localStorage.setItem('bj_step:journey-fixture','6'));
   await page.reload({waitUntil:'domcontentloaded'});await step(5);
   assert.equal(counts.complete,completionsBefore,'an unhatched egg cannot complete the tutorial');
   // Another account on this browser must not inherit the first account's step.
   user.id='other-fixture';user.username='Other QA';user.activePetId=null;
   inventory=[pet('other-account-pet')];
   await page.reload({waitUntil:'domcontentloaded'});
   await page.getByTestId('button-choose-starter-starter-0').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>localStorage.getItem('bj_step:other-fixture')),'0');
   assert.equal(await page.evaluate(()=>localStorage.getItem('bj_starter_inventory_id:other-fixture')),null);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS '+name+': real starter/nav/collection/potion/hatch/claim flow, touch/mouse drops and reload'+(recovery?', request retries, duplicate/cancel guards, interrupted completion and account isolation':''));
 await context.close();
}
}finally{await browser.close();await server.close();}
