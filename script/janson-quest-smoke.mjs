import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Runs the REAL Janson overlay with isolated quest/world/auth fixtures.
// No production account, database, inventory or fishing records are modified.
const fixtureId = '/__janson-quest-fixture.tsx';
const fixture = "import React, { useEffect } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { createPortal } from 'react-dom';\nimport { QueryClient, QueryClientProvider } from '@tanstack/react-query';\nimport { useLocation } from 'wouter';\nimport { readStageViewportLayout } from '@/lib/stageViewport';\nimport JansonQuestOverlay from '@/components/JansonQuestOverlay';\nimport '@/index.css';\n\nconst client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });\nwindow.fixtureRefetchJanson = () => client.invalidateQueries({ queryKey: ['/api/quests/janson'] });\nfunction Fixture() {\n  const [location] = useLocation();\n  const layout = readStageViewportLayout(location);\n  useEffect(() => {\n    const stage = document.getElementById('game-stage');\n    Object.assign(stage.style, {\n      position: 'absolute', left: layout.left + 'px', top: layout.top + 'px',\n      width: layout.designWidth + 'px', height: layout.designHeight + 'px', overflow: 'hidden',\n    });\n  }, [layout.left, layout.top, layout.designWidth, layout.designHeight]);\n  return <>\n    {createPortal(<div data-testid=\"location-janson\" style={{\n      position: 'absolute', left: '37%', top: '26%', width: 100, height: 104, pointerEvents: 'auto',\n    }}><div style={{ position: 'absolute', inset: 0, background: '#355d3a' }} /></div>,\n      document.getElementById('game-viewport-scene'))}\n    <JansonQuestOverlay />\n  </>;\n}\ncreateRoot(document.getElementById('root')).render(\n  <QueryClientProvider client={client}><Fixture /></QueryClientProvider>,\n);";

const server = await createServer({
  server: {host:'127.0.0.1',port:4176,strictPort:true},
  plugins: [{
    name:'isolated-janson-quest-fixture',
    resolveId:id=>id===fixtureId?id:null,
    load:id=>id===fixtureId?fixture:null,
    configureServer(server) {
      server.middlewares.use(async(req,res,next)=>{
        if(!req.headers.accept?.includes('text/html'))return next();
        res.setHeader('Content-Type','text/html');
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>'+
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
const browser = await chromium.launch({ headless:true });
const quest = (questKey,status,title) => ({
  questKey,title,status,description:'Catch and sell fish to help Janson.',
  progress:0,targetCount:3,coinReward:500,rewardItemName:null,rewardItemQuantity:0,
});
try {
  for(const [name,width,height,touch] of [
    ['compact phone',320,568,true],
    ['Android phone',360,800,true],
    ['tablet',834,1194,true],
    ['desktop portrait frame',1440,900,false],
  ]) {
    const context = await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    let state={
      quests:[quest('catch_fish','available','Gone Fishing'),quest('sell_fish','locked','Sell Fish')],
      dailyQuest:quest('daily_catch_fish','locked','Daily Gone Fishing'),marketUnlocked:false,
    };
    const counts={starts:0,claims:0};
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/auth/me')return route.fulfill({json:{id:'janson-qa',isAdmin:false,coins:0}});
      if(path==='/api/quests/janson'&&route.request().method()==='GET')return route.fulfill({json:state});
      if(path==='/api/quests/janson/catch_fish/start'){
        counts.starts++;
        state={...state,quests:state.quests.map(q=>q.questKey==='catch_fish'?{...q,status:'accepted'}:q)};
        return route.fulfill({json:state});
      }
      if(path==='/api/quests/janson/catch_fish/claim'){
        counts.claims++;
        state={...state,quests:state.quests.map(q=>q.questKey==='catch_fish'?{...q,status:'claimed'}:{...q,status:'available'})};
        return route.fulfill({json:{...state,newCoinBalance:500,coinsGranted:500,itemGranted:null}});
      }
      if(path==='/api/world/swamp/locations')return route.fulfill({json:[{id:'janson',name:'Janson',type:'npc'}]});
      if(path==='/api/shop/__npc_catalog__')return route.fulfill({json:[]});
      return route.fulfill({json:[]});
    });
    const activate=async target=>touch?target.tap():target.click();
    await page.goto('http://127.0.0.1:4176/world/swamp');
    const talk=page.getByTestId('button-talk-janson');
    await talk.waitFor({state:'visible'});
    await activate(talk);
    const dialog=page.getByTestId('janson-quest-dialog');
    await dialog.waitFor({state:'visible'});
    const layout=await dialog.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const hud=document.getElementById('game-viewport-hud').getBoundingClientRect();
      const style=getComputedStyle(el);
      return {top:rect.top,bottom:rect.bottom,height:rect.height,
        hudTop:hud.top,hudBottom:hud.bottom,hudHeight:hud.height,
        overflowY:style.overflowY,maxHeight:parseFloat(style.maxHeight)};
    });
    assert.equal(layout.overflowY,'auto',name+': Janson dialog must be scrollable');
    assert.ok(layout.maxHeight<=layout.hudHeight-47,name+': dialog maxHeight must use HUD height');
    assert.ok(layout.top>=layout.hudTop-1&&layout.bottom<=layout.hudBottom+1,name+': dialog must fit game HUD');
    // Test actual interaction when quest copy/errors exceed the available height.
    // The synthetic overflow is confined to this isolated browser fixture.
    await dialog.evaluate(el=>{
      const extra=document.createElement('p');
      extra.textContent='Long translated quest guidance. '.repeat(120);
      el.insertBefore(extra,el.lastElementChild);
    });
    const overflow=await dialog.evaluate(el=>({scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}));
    assert.ok(overflow.scrollHeight>overflow.clientHeight,name+': dialog must scroll long content');
    await activate(page.getByTestId('button-start-janson-catch_fish'));
    await dialog.waitFor({state:'hidden'});
    assert.equal(counts.starts,1,name+': first quest must start once');
    // Simulate the server confirming catch progress; use the SAME query
    // invalidation the live UI receives, not a fake DOM/state transition.
    state={...state,quests:state.quests.map(q=>q.questKey==='catch_fish'?{...q,status:'completed',progress:3}:q)};
    await page.evaluate(()=>window.fixtureRefetchJanson());
    await activate(talk);
    await page.getByTestId('button-claim-janson-at-npc-catch_fish').waitFor({state:'visible'});
    await activate(page.getByTestId('button-claim-janson-at-npc-catch_fish'));
    await page.getByText(/Reward claimed!/).waitFor({state:'visible'});
    assert.equal(counts.claims,1,name+': first reward must be claimed exactly once');
    assert.deepEqual(errors,[],name+': no React/browser errors');
    console.log('PASS '+name+': real Janson dialog fits HUD, scrolls long copy, starts fishing and claims reward');
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
