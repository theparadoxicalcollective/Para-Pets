import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Isolated interaction fixture: real discovery/spotlight components and viewport
// layout, synthetic navigation/hotspots and API responses. No player or backend.
const fixtureId = "/__npc-discovery-fixture.tsx";
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import NpcQuestDiscoveryGuide from '@/components/NpcQuestDiscoveryGuide';
import { bjUsePlayer, bjSetStep } from '@/lib/beginJourney';
import { readStageViewportLayout } from '@/lib/stageViewport';
import '@/index.css';
const user = { id: 'isolated-guide-fixture', tutorial_quest_completed: true };
bjUsePlayer(user.id); bjSetStep('done');
window.fixtureCounts = { quests: 0, unrelated: 0, pans: 0 };
const layout = readStageViewportLayout('/map');
const stage = document.getElementById('game-stage');
Object.assign(stage.style, {position:'absolute', left:layout.left+'px', top:'0',
  width:layout.designWidth+'px', height:layout.designHeight+'px', overflow:'hidden'});
function Fixture() {
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [panned, setPanned] = useState(false);
  const [modal, setModal] = useState(false);
  const scene = document.getElementById('game-viewport-scene');
  const hud = document.getElementById('game-viewport-hud');
  const style = (left, top) => ({position:'absolute', left, top, width:80, height:80, pointerEvents:'auto'});
  const clickNpc = () => window.fixtureCounts.quests++;
  const npcs = location === '/world/haunted_woods' ? ['ginny'] : ['janson', 'lonelle'];
  window.fixtureSetModal = setModal;
  return <>
    {createPortal(<div data-quest-guide-pan-surface style={{position:'absolute',inset:0,pointerEvents:'auto'}}
      onPointerDown={event => { event.currentTarget.dataset.startX = String(event.clientX); }}
      onPointerUp={event => {if(Math.abs(event.clientX-Number(event.currentTarget.dataset.startX))>30) {setPanned(true);window.fixtureCounts.pans++;}}}>
      <button data-testid="unrelated" style={style(5,5)} onClick={() => window.fixtureCounts.unrelated++}>Other</button>
      {location === '/map' && ['haunted_woods','swamp'].map((world,i) => <button key={world}
        data-testid={'button-location-'+world} style={style(80+i*100,200)}
        onClick={() => {setPanned(false);navigate('/world/'+world);}}>{world}</button>)}
      {location.startsWith('/world/') && npcs.map((npc,i) => <div key={npc} data-testid={'location-'+npc}
        style={style(panned ? 80+i*100 : layout.designWidth+100+i*100,220)}>
        <div style={{position:'absolute',inset:0,pointerEvents:'none'}}><button
          data-testid={'player-location-hotspot-'+npc} style={{width:'100%',height:'100%',pointerEvents:'auto'}}
          onClick={clickNpc}>{npc}</button></div></div>)}
    </div>,scene)}
    {createPortal(<div style={{pointerEvents:'auto'}}>
      <button data-testid="button-floating-nav" style={{...style(layout.designWidth-85,layout.designHeight-85),zIndex:9999}}
        onClick={() => setOpen(!open)}>Menu</button>
      <button data-testid="nav-item-map" style={{...style(layout.designWidth-180,layout.designHeight-85),
        opacity:open?1:0,pointerEvents:open?'auto':'none',zIndex:9999}}
        onClick={() => {navigate('/map');setOpen(false);}}>Map</button>
      {modal && <div aria-modal="true" style={{position:'absolute',inset:0,pointerEvents:'auto',zIndex:10000}}>Modal</div>}
    </div>,hud)}
    <NpcQuestDiscoveryGuide user={user}/>
  </>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><Fixture/></QueryClientProvider>);
`;

const server = await createServer({
  server: { host: "127.0.0.1", port: 4174, strictPort: true },
  plugins: [{ name: "isolated-npc-guide-fixture", resolveId: id => id === fixtureId ? id : null,
    load: id => id === fixtureId ? fixture : null,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.headers.accept?.includes('text/html')) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="game-stage"><div id="game-viewport-scene" style="position:absolute;inset:0;pointer-events:none;z-index:30"></div><div id="root" style="pointer-events:none;z-index:15"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:40"></div></div><script type="module" src="/@vite/client"></script><script type="module" src="'+fixtureId+'"></script></body></html>'));
      });
    },
  }],
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const [name,width,height,touch] of [
    ['compact phone',320,568,true], ['Android phone',360,800,true],
    ['iPhone size',390,844,true], ['large phone',430,932,true],
    ['Android tablet',800,1280,true], ['tablet',834,1194,true],
    ['desktop portrait frame',1440,900,false],
  ]) {
    const context = await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const locations = path.includes('haunted_woods') ? [{id:'ginny',name:'Ginny',type:'npc'}]
        : [{id:'janson',name:'Janson',type:'npc'},{id:'lonelle',name:'Lonelle',type:'npc'}];
      return route.fulfill({json:locations});
    });
    const activate = async locator => touch ? locator.tap() : locator.click();
    const expectPointer = async () => {
      const pointer = page.getByTestId('npc-discovery-spotlight');
      await pointer.waitFor({state:'attached',timeout:5000});
      const ring = page.locator('#game-viewport-hud span[aria-hidden="true"]').first();
      await ring.waitFor({state:'visible'});
      await page.waitForFunction(() => Array.from(document.querySelectorAll('#game-viewport-hud img'))
        .some(image => image.complete && image.naturalWidth > 0));
      const box = await ring.boundingBox();
      const hud = await page.getByTestId('game-viewport-hud').count() ? page.getByTestId('game-viewport-hud') : page.locator('#game-viewport-hud');
      const frame = await hud.boundingBox();
      assert.ok(box && frame && box.x >= frame.x-30 && box.x+box.width <= frame.x+frame.width+30, name+': ring must stay inside portrait frame');
    };
    await page.goto('http://127.0.0.1:4174/__guide-test');
    await page.getByTestId('npc-discovery-guide').waitFor({state:'visible'});
    // The fixture URL is treated as the initial non-map route by wouter.
    await expectPointer();
    // Real modal blockers still suspend the guide, even inside a HUD host
    // with pointer-events:none. Resume without resetting the player's step.
    await page.evaluate(() => window.fixtureSetModal(true));
    await page.getByTestId('npc-discovery-spotlight').waitFor({state:'detached'});
    await page.evaluate(() => window.fixtureSetModal(false));
    await expectPointer();
    // The fix must not make disabled targets or visually hidden hosts ready.
    await page.getByTestId('button-floating-nav').evaluate(node => node.style.pointerEvents='none');
    await page.getByTestId('npc-discovery-spotlight').waitFor({state:'detached'});
    await page.getByTestId('button-floating-nav').evaluate(node => node.style.pointerEvents='auto');
    await expectPointer();
    await page.locator('#game-viewport-hud').evaluate(node => node.style.opacity='0');
    await page.getByTestId('npc-discovery-spotlight').waitFor({state:'detached'});
    await page.locator('#game-viewport-hud').evaluate(node => node.style.opacity='1');
    await expectPointer();
    await activate(page.getByTestId('button-floating-nav'));
    await page.waitForFunction(() => document.querySelector('[data-testid="npc-discovery-guide"]')?.textContent.includes('Tap World Map.'));
    await expectPointer();
    await activate(page.getByTestId('nav-item-map'));
    for (const [world,npc,next] of [['haunted_woods','ginny',1],['swamp','janson',2],['swamp','lonelle',3]]) {
      if (new URL(page.url()).pathname === '/map') {
        await expectPointer();
        await activate(page.getByTestId('button-location-'+world));
      }
      // Offscreen targets retain an edge cue; real pointer gestures remain live.
      const frame = await page.locator('#game-viewport-scene').boundingBox();
      if(npc !== 'lonelle') {
        await page.waitForFunction(npc => document.querySelector('[data-testid="npc-discovery-guide"]')?.textContent.toLowerCase().includes('find '+npc),npc);
        await page.mouse.move(frame.x+frame.width*.8,frame.y+150);
        await page.mouse.down(); await page.mouse.move(frame.x+40,frame.y+150,{steps:8}); await page.mouse.up();
      }
      await page.waitForFunction(() => document.querySelector('[data-testid="npc-discovery-spotlight"]')?.getAttribute('role') === 'button');
      await expectPointer();
      // Tap unrelated scenery: never advance or invoke another control.
      await page.mouse.click(frame.x+20,frame.y+110);
      assert.equal(await page.evaluate(() => Number(localStorage.getItem('bj_npc_tour_v1:isolated-guide-fixture'))),next-1);
      const target = await page.getByTestId('player-location-hotspot-'+npc).boundingBox();
      assert.ok(target);
      if(touch) await page.touchscreen.tap(target.x+target.width/2,target.y+target.height/2);
      else await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
      await page.waitForFunction(next => Number(localStorage.getItem('bj_npc_tour_v1:isolated-guide-fixture')) === next,next);
      // Android delayed click must not open the quest or skip the next NPC.
      await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
      assert.equal(await page.evaluate(() => window.fixtureCounts.quests),0);
      if(next===1) {
        await activate(page.getByTestId('button-floating-nav'));
        await page.waitForFunction(() => document.querySelector('[data-testid="npc-discovery-guide"]')?.textContent.includes('Tap World Map.'));
        await activate(page.getByTestId('nav-item-map'));
      }
    }
    await page.getByTestId('npc-discovery-guide').waitFor({state:'detached'});
    const counts = await page.evaluate(() => window.fixtureCounts);
    assert.equal(counts.quests,0); assert.equal(counts.unrelated,0); assert.ok(counts.pans>=2);
    await page.reload();
    await page.waitForTimeout(500);
    assert.equal(await page.getByTestId('npc-discovery-guide').count(),0,'completed tour must stay complete on reload');
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+': menu/map pointers, modal/hidden-target suppression, world pan, all three NPC taps, read-only/ghost-click protection, completion reload');
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
