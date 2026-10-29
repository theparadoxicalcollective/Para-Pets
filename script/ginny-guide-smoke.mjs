import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';

// Real Ginny quest component with isolated, player-specific API fixtures.
// No live account, mini-pet inventory, rewards, or database state is changed.
const fixtureId='/__ginny-guide-fixture.tsx';
const fixture="import React, {useEffect} from 'react';\nimport {createRoot} from 'react-dom/client';\nimport {createPortal} from 'react-dom';\nimport {QueryClient,QueryClientProvider} from '@tanstack/react-query';\nimport {useLocation} from 'wouter';\nimport {readStageViewportLayout} from '@/lib/stageViewport';\nimport GinnyQuestOverlay from '@/components/GinnyQuestOverlay';\nimport '@/index.css';\nconst client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});\nfunction Fixture(){\n const [pathname]=useLocation();\n const layout=readStageViewportLayout(pathname);\n useEffect(()=>{\n  const stage=document.getElementById('game-stage');\n  Object.assign(stage.style,{position:'absolute',left:layout.left+'px',top:layout.top+'px',\n   width:layout.designWidth+'px',height:layout.designHeight+'px',overflow:'hidden'});\n },[layout.left,layout.top,layout.designWidth,layout.designHeight]);\n return <>\n  {pathname.startsWith('/world/haunted_woods')&&createPortal(\n   <div data-testid=\"location-ginny\" style={{position:'absolute',left:'35%',top:'30%',\n    width:95,height:110,pointerEvents:'auto'}} />,\n   document.getElementById('game-viewport-scene'))}\n  <button data-testid=\"button-floating-nav\" type=\"button\" style={{position:'absolute',\n   right:20,bottom:50,width:70,height:60,background:'#27452e',color:'#f4dc8e',\n   pointerEvents:'auto',zIndex:200}}>Menu</button>\n  <GinnyQuestOverlay />\n </>;\n}\ncreateRoot(document.getElementById('root')).render(\n <QueryClientProvider client={client}><Fixture/></QueryClientProvider>\n);";
const server=await createServer({
 server:{host:'127.0.0.1',port:4178,strictPort:true},
 plugins:[{
  name:'isolated-ginny-guide-fixture',
  resolveId:id=>id===fixtureId?id:null,
  load:id=>id===fixtureId?fixture:null,
  configureServer(server){
   server.middlewares.use(async(req,res,next)=>{
    if(!req.headers.accept?.includes('text/html'))return next();
    res.setHeader('Content-Type','text/html');
    res.end(await server.transformIndexHtml(req.url,
     '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
     '<div id="game-stage" data-coordinate-owner="viewport" style="position:fixed;inset:0;overflow:hidden">'+
     '<div id="game-viewport-scene" style="position:absolute;inset:0;pointer-events:none;z-index:30"></div>'+
     '<div id="root" style="position:absolute;inset:0;z-index:15"></div>'+
     '<div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:40"></div></div>'+
     '<script type="module" src="/@vite/client"></script><script type="module" src="'+fixtureId+'"></script></body></html>'
    ));
   });
  }
 }]
});
await server.listen();
const browser=await chromium.launch({headless:true});
const url='http://127.0.0.1:4178/world/haunted_woods';
try{
 for(const [name,width,height,touch] of [
  ['compact phone',320,568,true],
  ['Android phone',360,800,true],
  ['tablet',834,1194,true],
  ['desktop portrait frame',1440,900,false],
 ]){
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let player='player-a';
  const states={
   'player-a':{status:'available',miniPetInventoryId:null},
   'player-b':{status:'accepted',miniPetInventoryId:'mini-b'},
  };
  const quest=()=>({
   key:'ginny-mini-pet',worldId:'haunted_woods',npcName:'Ginny',
   title:"Ginny's Little Companion",description:'Choose and equip your companion',
   rewardCoins:500,options:[
    {choice:'bat',shopItemId:'bat-shop',name:'Bat Mini Pet',imageUrl:null,rarity:3},
    {choice:'ghost',shopItemId:'ghost-shop',name:'Ghost Mini Pet',imageUrl:null,rarity:3},
   ],
   selected:states[player].status==='available'?null:{
    choice:'bat',shopItemId:'bat-shop',name:'Bat Mini Pet',imageUrl:null,rarity:3,
   },
   activePetId:'hatched-a',activePetIsHatched:true,canEquipNow:true,...states[player],
  });
  let choiceCount=0;
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/auth/me')return route.fulfill({json:{id:player,isAdmin:false}});
   if(path==='/api/quests/ginny-mini-pet'&&route.request().method()==='GET')
    return route.fulfill({json:quest()});
   if(path==='/api/quests/ginny-mini-pet/choose'){
    assert.deepEqual(route.request().postDataJSON(),{choice:'bat'});
    choiceCount++;
    states[player]={status:'accepted',miniPetInventoryId:'mini-a'};
    return route.fulfill({json:quest()});
   }
   if(path==='/api/world/haunted_woods/locations')
    return route.fulfill({json:[{id:'ginny',worldId:'haunted_woods',
     name:'Ginny',type:'npc',iconUrl:null}]});
   return route.fulfill({json:[]});
  });
  const activate=async locator=>touch?locator.tap():locator.click();
  const guide=page.getByTestId('ginny-guide-copy');
  const marker=page.getByTestId('ginny-quest-marker');
  const key=id=>'para:ginny-mini-pet-guide:'+id;
  const getKey=async id=>page.evaluate(k=>sessionStorage.getItem(k),key(id));

  await page.goto(url);
  await marker.waitFor({state:'visible'});
  assert.equal(await guide.count(),0,name+': no guide before choosing a Mini Pet');
  await activate(marker);
  await activate(page.getByTestId('button-ginny-choose-bat'));
  await guide.waitFor({state:'visible'});
  assert.equal(choiceCount,1,name+': choose once');
  assert.equal(await getKey('player-a'),'1');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('para:ginny-mini-pet-guide')),null);

  await page.reload();
  await guide.waitFor({state:'visible'});
  assert.equal(await getKey('player-a'),'1',name+': A resumes after reload');

  // Even a leftover unscoped flag from an old deployment must not be
  // mistaken for player B's saved instruction state.
  await page.evaluate(()=>sessionStorage.setItem('para:ginny-mini-pet-guide','1'));
  // Player B has an accepted quest too, but must not inherit A's opt-in guide.
  player='player-b';
  await page.reload();
  await marker.waitFor({state:'visible'});
  await page.waitForTimeout(500);
  assert.equal(await guide.count(),0,name+': B does not inherit A guide');
  assert.equal(await getKey('player-b'),null);
  await activate(marker);
  await activate(page.getByTestId('button-ginny-resume-guide'));
  await guide.waitFor({state:'visible'});
  assert.equal(await getKey('player-b'),'1',name+': B explicitly resumes own guide');

  player='player-a';
  await page.reload();
  await guide.waitFor({state:'visible'});
  assert.equal(await getKey('player-a'),'1',name+': A still resumes');

  player='player-b';states[player]={status:'completed',miniPetInventoryId:'mini-b'};
  await page.reload();
  await marker.waitFor({state:'visible'});
  await page.waitForFunction(k=>sessionStorage.getItem(k)===null,key('player-b'));
  assert.equal(await guide.count(),0,name+': completed B guide stops');
  assert.equal(await getKey('player-a'),'1',name+': completing B preserves A guide');
  assert.deepEqual(errors,[],name+': no browser errors');
  console.log('PASS '+name+': real Ginny guide choose/resume/reload and two-account isolation');
  await context.close();
 }
}finally{
 await browser.close();
 await server.close();
}
