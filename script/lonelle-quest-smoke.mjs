import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';

// Run the real Lonelle overlay through saved-quest-state transitions. The
// isolated API fixtures never alter production users, monsters, or rewards.
const fixtureId='/__lonelle-quest-fixture.tsx';
const fixture = "import React, { useEffect } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { createPortal } from 'react-dom';\nimport { QueryClient, QueryClientProvider } from '@tanstack/react-query';\nimport { getQueryFn } from '@/lib/queryClient';\nimport { useLocation } from 'wouter';\nimport { readStageViewportLayout } from '@/lib/stageViewport';\nimport LonelleQuestOverlay from '@/components/LonelleQuestOverlay';\nimport '@/index.css';\nconst client = new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:'returnNull'}),retry:false,refetchOnWindowFocus:false}}});\nfunction Fixture(){\n  const [pathname]=useLocation();\n  const layout=readStageViewportLayout(pathname);\n  useEffect(()=>{\n    const stage=document.getElementById('game-stage');\n    Object.assign(stage.style,{position:'absolute',left:layout.left+'px',top:layout.top+'px',\n      width:layout.designWidth+'px',height:layout.designHeight+'px',overflow:'hidden'});\n  },[layout.left,layout.top,layout.designWidth,layout.designHeight]);\n  return <>\n    {pathname.startsWith('/world/swamp') && createPortal(<div data-testid=\"location-lonelle\"\n      style={{position:'absolute',left:'38%',top:'28%',width:96,height:102,pointerEvents:'auto',\n        background:'rgba(36,78,41,.4)'}} />,document.getElementById('game-viewport-scene'))}\n    <LonelleQuestOverlay />\n  </>;\n}\ncreateRoot(document.getElementById('root')).render(\n  <QueryClientProvider client={client}><Fixture/></QueryClientProvider>\n);";

const server=await createServer({
  server:{host:'127.0.0.1',port:4177,strictPort:true},
  plugins:[{
    name:'isolated-lonelle-quest-fixture',
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
          '<div id="root" style="position:absolute;inset:0;pointer-events:none;z-index:15"></div>'+
          '<div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:40"></div></div>'+
          '<script type="module" src="/@vite/client"></script><script type="module" src="'+fixtureId+'"></script></body></html>'
        ));
      });
    }
  }]
});
await server.listen();
const browser=await chromium.launch({headless:true});
try{
 for(const [name,width,height,touch] of [
  ['compact phone',320,568,true],
  ['Android phone',360,800,true],
  ['tablet',834,1194,true],
  ['desktop portrait frame',1440,900,false],
 ]){
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
  const page=await context.newPage(); page.setDefaultTimeout(12000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const counts={starts:0,takes:0,claims:0};
  let state={
    status:'available', kills:0, requiredKills:5, scarfInventoryId:null,
    scarfOwned:false, scarfEquipped:false, scarf:{name:"Lonelle's Scarf",imageUrl:null},
    reward:{name:'Firefly Cluster',imageUrl:null,coins:300},
    configured:true,npcImageUrl:null,npcPhases:{},
  };
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/me')return route.fulfill({json:{id:'lonelle-fixture',username:'QA'}});
    if(path==='/api/quests/lonelle-lost-adornment'&&route.request().method()==='GET')
      return route.fulfill({json:state});
    if(path==='/api/quests/lonelle-lost-adornment/start'){
      counts.starts++;
      state={...state,status:'accepted'};
      return route.fulfill({json:state});
    }
    if(path==='/api/quests/lonelle-lost-adornment/take'){
      counts.takes++;
      assert.equal(state.status,'found','scarf can only be collected after Clearing completion');
      state={...state,status:'taken',scarfInventoryId:'scarf-qa',scarfOwned:true};
      return route.fulfill({json:state});
    }
    if(path==='/api/quests/lonelle-lost-adornment/claim'){
      counts.claims++;
      assert.equal(state.scarfEquipped,true,'only an equipped scarf may be claimed');
      state={...state,status:'claimed'};
      return route.fulfill({json:{alreadyClaimed:false,coinsGranted:300,reward:{name:'Firefly Cluster',imageUrl:null}}});
    }
    if(path==='/api/world/swamp/locations')return route.fulfill({json:[{id:'lonelle',name:'Lonelle',type:'npc',iconUrl:null}]});
    return route.fulfill({json:[]});
  });
  const activate=async locator=>touch?locator.tap():locator.click();
  await page.goto('http://127.0.0.1:4177/world/swamp');
  await activate(page.getByTestId('button-talk-lonelle'));
  const dialog=page.getByTestId('lonelle-quest-dialog');
  await dialog.waitFor({state:'visible'});
  await activate(page.getByTestId('button-accept-lonelle-quest'));
  await dialog.waitFor({state:'hidden'});
  assert.equal(counts.starts,1,name+': accepting quest is one request');

  // Five Clearing kills are recorded by the server, not by this UI.
  state={...state,status:'found',kills:5};
  const clearing='http://127.0.0.1:4177/explore/elysian-bayou-clearing';
  await page.goto(clearing);
  await activate(page.getByTestId('button-take-lonelle-scarf'));
  await page.getByTestId('button-lonelle-return-home').waitFor({state:'visible'});
  assert.equal(counts.takes,1,name+': scarf collected once');

  // Reload while standing in the Clearing. The old local React flag resets
  // here and strands the player, so this assertion must exercise a new mount.
  await page.reload({waitUntil:'domcontentloaded'});
  const returnHome=page.getByTestId('button-lonelle-return-home');
  await returnHome.waitFor({state:'visible'});
  const dimensions=await returnHome.evaluate(el=>{
    const button=el.getBoundingClientRect(), hud=document.getElementById('game-viewport-hud').getBoundingClientRect();
    return {top:button.top,bottom:button.bottom,hudTop:hud.top,hudBottom:hud.bottom};
  });
  assert.ok(dimensions.top>=dimensions.hudTop-1&&dimensions.bottom<=dimensions.hudBottom+1,
    name+': Return Home action remains inside the actual gameplay viewport');
  await activate(returnHome);
  await page.waitForURL('http://127.0.0.1:4177/');

  // The Closet action belongs to HomePage. Only simulate the server-side
  // equipment confirmation here, then exercise the real Lonelle claim UI.
  state={...state,scarfEquipped:true};
  await page.goto('http://127.0.0.1:4177/world/swamp');
  await activate(page.getByTestId('button-talk-lonelle'));
  await activate(page.getByTestId('button-claim-lonelle-quest'));
  await page.getByTestId('lonelle-quest-rewards').waitFor({state:'visible'});
  await activate(page.getByTestId('button-close-lonelle-rewards'));
  assert.equal(counts.claims,1,name+': exactly one final claim');
  assert.deepEqual(errors,[],name+': no uncaught browser errors');
  console.log('PASS '+name+': Lonelle accept, Clearing pickup, reload-proof Return Home, and reward claim');
  await context.close();
 }
}finally{
 await browser.close();
 await server.close();
}
