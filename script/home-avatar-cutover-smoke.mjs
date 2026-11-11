import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Exercise actual Home and Avatar page components in isolated maintenance-admin
// fixture accounts. No Railway requests or live character creation.
const fixtureId = "/__avatar10-home-fixture.tsx";
const fixture = [
  'import React,{useEffect} from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {useLocation} from "wouter";',
  'import {QueryClientProvider,useQuery} from "@tanstack/react-query";',
  'import {queryClient} from "@/lib/queryClient";',
  'import {useStageViewportLayout,publishStageViewportCss} from "@/lib/stageViewport";',
  'import HomePage from "@/pages/HomePage";',
  'import PlayerAvatarPage from "@/pages/PlayerAvatarPage";',
  'import FloatingNav from "@/components/FloatingNav";',
  'import {TooltipProvider} from "@/components/ui/tooltip";',
  'import {Toaster} from "@/components/ui/toaster";',
  'import "@/index.css";',
  'queryClient.setDefaultOptions({queries:{...queryClient.getDefaultOptions().queries,retry:false,refetchOnWindowFocus:false}});',
  'window.__homeAvatarFixtureCache=queryClient;',
  'function Fixture(){',
  ' const [location]=useLocation();',
  ' const layout=useStageViewportLayout(location);',
  ' const {data:user}=useQuery({queryKey:["/api/auth/me"]});',
  ' useEffect(()=>{',
  '  publishStageViewportCss(layout);',
  '  Object.assign(document.getElementById("game-stage").style,{position:"absolute",left:layout.left+"px",top:layout.top+"px",width:layout.designWidth+"px",height:layout.designHeight+"px",overflow:"hidden"});',
  ' },[layout]);',
  ' if(!user)return null;',
  ' return <><div style={{position:"absolute",inset:0,pointerEvents:"auto"}}>',
  '   {location.startsWith("/player-avatar")?<PlayerAvatarPage userId={user.id}/>:<HomePage user={user}/>}</div>',
  '  <FloatingNav user={user}/><Toaster/></>;',
  '}',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={queryClient}><TooltipProvider><Fixture/></TooltipProvider></QueryClientProvider>);',
].join("\n");

const server = await createServer({
  server: { host:"127.0.0.1",port:4199,strictPort:true },
  plugins: [{
    name:"isolated-avatar10-home",
    resolveId:id=>id===fixtureId?id:null,
    load:id=>id===fixtureId?fixture:null,
    configureServer(server) {
      server.middlewares.use(async(req,res,next)=>{
        if(!req.headers.accept?.includes("text/html"))return next();
        res.setHeader("Content-Type","text/html");
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
          '<div class="game-stage-shell" style="position:fixed;inset:0;overflow:hidden">'+
          '<div id="game-stage" data-coordinate-owner="viewport">'+
          '<div id="game-viewport-page" style="position:absolute;inset:0;pointer-events:none;z-index:20"></div>'+
          '<div id="game-viewport-backdrop" style="position:absolute;inset:0;pointer-events:none;z-index:17"></div>'+
          '<div id="game-viewport-scene" style="position:absolute;inset:0;pointer-events:none;z-index:30"></div>'+
          '<div id="root" style="position:absolute;inset:0;z-index:15"></div>'+
          '<div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:40"></div>'+
          '</div></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
      });
    },
  }],
});
const art = "data:image/svg+xml;base64,"+Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><ellipse cx="70" cy="70" rx="45" ry="55" fill="#d8b876"/></svg>'
).toString("base64");
const parts = ["head","top","left_arm","right_arm","left_leg","right_leg","left_foot","right_foot"].map((partType,i)=>({
  partType,imageUrl:art,
  xPct:50+(i%3-1)*6,yPct:25+i*8,widthPct:24+(i===1?18:0),
  pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:i+10,
}));
const hat = {category:"head",inventoryId:"hat-owned",shopItemId:"hat-item",
  name:"Golden Hat",imageUrl:art,segments:[{partType:"head",imageUrl:art,
  fit:{xPct:50,yPct:50,widthPct:85,pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:1},
  renderPlane:"in_front_of_character"}]};
const base = {id:"published-base",name:"Forest Character",
  publishedAt:"2026-11-09T00:00:00.000Z",parts};
const playerPet = {inventoryId:"pet-owned",id:"pet-owned",shopItemId:"pet-template",
  name:"Original Companion",type:"pet",rarity:4,starRarity:4,isHatched:true,
  isListed:false,petTemplateId:null,hatchTime:3,hatchStartedAt:null,
  eggImageUrl:art,hatchedImageUrl:art,imageUrl:art,petNickname:"Flora",
  petLevel:11,petLevelPoints:270,petHp:12,petAtk:5,petDef:3,quantity:1,
  itemsUsedThisLevel:0,petHealth:12,petAtk:5,petDef:3};
await server.listen();
const browser=await chromium.launch({headless:true});
try {
  const scenarios=[
    {name:"first-time compact phone",width:320,height:568,created:false},
    {name:"first-time phone",width:390,height:844,created:false},
    {name:"saved character phone",width:390,height:844,created:true},
    {name:"saved character tablet",width:834,height:1194,created:true},
    {name:"avatar API unavailable",width:390,height:844,created:false,apiError:true},
    {name:"avatar API malformed",width:360,height:800,created:false,malformed:true},
  ];
  for(const sc of scenarios){
    const context=await browser.newContext({
      viewport:{width:sc.width,height:sc.height},isMobile:true,hasTouch:true,
    });
    const page=await context.newPage();
    const errors=[],writes=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.setDefaultTimeout(18000);
    const user={id:"home-avatar-fixture",username:"QA",email:"qa@example.invalid",
      coins:1200,isAdmin:true,isModerator:true,emailVerified:true,profileImage:null,
      activePetId:"pet-owned"};
    let avatar={created:sc.created,revision:sc.created?1:null,base,
      skinTone:sc.created?"#855238":null,
      ownedClothing:[],equipped:sc.created?[hat]:[],unavailableEquipmentSlots:[]};
    const fulfill=(route,json,status=200)=>route.fulfill({status,json});
    await page.route("**/api/**",async route=>{
      const path=new URL(route.request().url()).pathname;
      const method=route.request().method();
      if(path==="/api/auth/me")return fulfill(route,user);
      if(path==="/api/inventory")return fulfill(route,[playerPet]);
      if(path==="/api/player/progression")
        return fulfill(route,{level:4,totalXp:240,nextLevelTotalXp:null,xpToNextLevel:null});
      if(path==="/api/player/pet-team")
        return fulfill(route,{petInventoryIds:["pet-owned"],attackPower:100});
      if(path==="/api/player-avatar" && method==="GET") {
        if(sc.apiError)return fulfill(route,{message:"Service unavailable"},503);
        if(sc.malformed)return fulfill(route,[]);
        return fulfill(route,avatar);
      }
      if(path==="/api/player-avatar/create" && method==="POST"){
        const body=route.request().postDataJSON();
        assert.equal(body.baseId,"published-base");
        writes.push(body);
        avatar={...avatar,created:true,revision:0,skinTone:body.skinTone??null};
        return fulfill(route,avatar);
      }
      if(path.startsWith("/api/tutorial/"))return fulfill(route,{message:"retired"},410);
      if(path.includes("pet-page-placement"))return fulfill(route,{x:0,y:0,scale:1});
      if(path==="/api/active-pet-anchor")return fulfill(route,{x:0,y:0});
      if(path==="/api/quests/daily" || path==="/api/quests/janson")
        return fulfill(route,{quests:[]});
      if(path==="/api/quests/ginny-mini-pet")return fulfill(route,{status:"available"});
      if(path==="/api/friends/requests/count")return fulfill(route,{count:0});
      return fulfill(route,[]);
    });
    await page.goto("http://127.0.0.1:4199/",{waitUntil:"domcontentloaded",timeout:30000});
    await page.getByTestId("home-avatar-stage").waitFor({state:"visible",timeout:30000});
    await page.getByTestId("home-player-hud").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("button-open-pet-menu").count(),0,
      sc.name+": retired Home Pet Menu is absent");
    assert.equal(await page.getByTestId("active-pet-placement-stage").count(),0,
      sc.name+": active pet is not the Home actor");
    assert.equal(await page.getByTestId("display-pet-rarity-stars").count(),0,
      sc.name+": old pet rarity stars are gone");
    const bounds=await page.getByTestId("home-avatar-stage").evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    });
    assert.ok(bounds.left>=-2 && bounds.right<=sc.width+2 && bounds.top>=0 &&
      bounds.bottom<sc.height-90,sc.name+": centered Home actor fits above HUD/nav");
    // Screenshot-driven Home layout: profile frame without duplicate name,
    // curved player stars over the actor, larger XP below, separated team panel.
    await page.getByTestId("home-player-xp-track").waitFor({state:"visible"});
    await page.getByTestId("home-player-team-stars-1").waitFor({state:"visible"});
    await page.waitForFunction(() =>
      document.querySelector('.home-player-hud__status')?.textContent?.trim() === "");
    const homeLayout = await page.evaluate(() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom,
          centerX:r.left+r.width/2, width:r.width, height:r.height };
      };
      const actor = rect('[data-testid="home-avatar-stage"]');
      const stars = rect('[data-testid="home-player-empty-stars"]');
      const progress = rect('.home-player-hud__progress');
      const party = rect('.home-player-hud__party-panel');
      const xp = rect('[data-testid="home-player-xp-track"]');
      return {
        actor, stars, progress, party, xp,
        profile: rect('[data-testid="button-profile"]'),
        accountHeader: rect('[data-testid="home-account-header"]'),
        headerName: rect('[data-testid="home-header-player-name"]'),
        shopIcon: rect('[data-testid="button-coin-bag"]'),
        coins: rect('[data-testid="display-coin-balance"]'),
        essence: rect('[data-testid="display-essence"]'),
        watcher: rect('[data-testid="button-open-world-chat"]'),
        watcherDock: rect('[data-testid="viewport-hud-watcher-dock"]'),
        xpText: rect('[data-testid="home-player-total-xp"]'),
        playerLevel: rect('[data-testid="home-player-level"]'),
        levelPill: rect('.home-player-hud__level-pill'),
        navButton: rect('[data-testid="button-floating-nav"]'),
        avatarStarSize: rect('.home-player-hud__stars img')?.height,
        equippedDots: document.querySelectorAll('.home-player-hud__slot-dot').length,
        profileNameplate: !!document.querySelector('[data-testid="text-username"]'),
        partyHint: document.querySelector('.home-player-hud__status')?.textContent?.trim(),
        petRarityStars: document.querySelectorAll('[data-testid="home-player-team-stars-1"] img').length,
        teamSlots: document.querySelectorAll('[data-testid^="home-player-team-slot-"]').length,
      };
    });
    assert.equal(homeLayout.profileNameplate,false,sc.name+": no second username below profile picture");
    assert.equal(homeLayout.partyHint,"",sc.name+": no party helper caption");
    assert.equal(homeLayout.petRarityStars,4,sc.name+": selected four-star pet displays four rarity stars");
    assert.equal(homeLayout.teamSlots,5,sc.name+": still five editable pet slots");
    assert.ok(homeLayout.actor && homeLayout.stars && homeLayout.progress && homeLayout.party && homeLayout.xp,
      sc.name+": avatar, player progress and party surfaces all render");
    assert.ok(Math.abs(homeLayout.stars.centerX-homeLayout.actor.centerX)<6,
      sc.name+": player stars centered above actor");
    // The avatar's rendered ring begins inside its layout square. Keep the
    // enlarged star arc close to its top rather than floating far above it.
    assert.ok(homeLayout.stars.top >= homeLayout.actor.top - 25 &&
      homeLayout.stars.top < homeLayout.actor.top + 30,
      sc.name+": player stars arc frames the avatar top");
    assert.ok(Math.abs(homeLayout.progress.centerX-homeLayout.actor.centerX)<6,
      sc.name+": player XP centered below actor");
    assert.ok(homeLayout.progress.top >= homeLayout.actor.bottom-3,
      sc.name+": player name and XP below avatar");
    assert.ok(homeLayout.xp.height>=12,
      sc.name+": XP bar enlarged");
    assert.ok(homeLayout.party.top >= homeLayout.progress.bottom-8,
      sc.name+": team panel not overlapping player XP");
    assert.ok(homeLayout.profile && homeLayout.headerName &&
      homeLayout.coins && homeLayout.essence && homeLayout.xpText && homeLayout.playerLevel,
      sc.name+": top profile/resources and level labels all render");
    assert.ok(homeLayout.headerName.left >= homeLayout.profile.right - 5,
      sc.name+": player name is to the right of the profile");
    // Name is deliberately a little lower and smaller than before; the
    // Watcher occupies the row directly above it, beside the portrait.
    assert.ok(homeLayout.accountHeader && homeLayout.headerName &&
      homeLayout.headerName.top > homeLayout.profile.top + 10 &&
      homeLayout.headerName.top < homeLayout.profile.bottom + 36,
      sc.name+": player name is lowered beside the portrait: "+
        JSON.stringify({name:homeLayout.headerName,header:homeLayout.accountHeader,profile:homeLayout.profile}));
    assert.ok(homeLayout.shopIcon, sc.name+": a compact coin shortcut exists under the resource bars");
    const coinStyle = await page.getByTestId("button-coin-bag").evaluate(el => ({
      radius: getComputedStyle(el).borderRadius,
      border: getComputedStyle(el).borderStyle,
      background: getComputedStyle(el).backgroundColor,
      outline: getComputedStyle(el.querySelector("img")).filter,
    }));
    assert.equal(coinStyle.border, "none",
      sc.name+": no enclosing circle around coin-bundle artwork");
    assert.ok(coinStyle.outline.includes("drop-shadow("),
      sc.name+": coin artwork itself receives the gold silhouette outline");
    assert.ok(homeLayout.essence.top >= homeLayout.profile.bottom - 6,
      sc.name+": resource bars sit under the portrait: "+JSON.stringify(homeLayout));
    assert.ok(homeLayout.coins.top > homeLayout.essence.top,
      sc.name+": Coins are beneath Essence");
    assert.ok(homeLayout.shopIcon.top >= homeLayout.coins.bottom,
      sc.name+": Coin Bundles shortcut sits beneath Coins");
    assert.ok(Math.abs(homeLayout.shopIcon.centerX - homeLayout.coins.centerX) < 8 &&
      homeLayout.shopIcon.width <= 42,
      sc.name+": small Coin Bundles shortcut is centered: "+JSON.stringify(homeLayout));
    assert.ok(homeLayout.watcher && homeLayout.watcherDock &&
      homeLayout.watcher.height >= 40 && homeLayout.watcher.height <= 44 &&
      homeLayout.watcher.left >= homeLayout.profile.right - 5 &&
      homeLayout.watcher.bottom <= homeLayout.headerName.top + 4,
      sc.name+": Watcher is above the player name and right of the portrait: "+JSON.stringify(homeLayout));
    const partyChrome = await page.locator(".home-player-hud__party-panel").evaluate(el => ({
      border: getComputedStyle(el).borderStyle,
      background: getComputedStyle(el).backgroundColor,
      pointerEvents: getComputedStyle(el).pointerEvents,
    }));
    assert.equal(partyChrome.border, "none",
      sc.name+": companion portraits no longer live in a rectangle");
    assert.equal(partyChrome.pointerEvents, "none",
      sc.name+": empty space between pets does not block scene taps");
    const teamSlot = await page.getByTestId("home-player-team-slot-1").boundingBox();
    assert.ok(teamSlot && teamSlot.width >= (sc.height <= 690 ? 48 : 56),
      sc.name+": pet portraits enlarged without losing the five slots");
    assert.ok(homeLayout.avatarStarSize >= 32,
      sc.name+": player stars enlarged over the avatar");
    assert.ok(homeLayout.xpText.top >= homeLayout.xp.bottom - 3,
      sc.name+": XP label is below progress bar");
    assert.ok(homeLayout.xpText.right < homeLayout.playerLevel.centerX,
      sc.name+": XP amount is left of centered player level");
    assert.ok(Math.abs(homeLayout.playerLevel.centerX - homeLayout.xp.centerX) < 7,
      sc.name+": player level centered directly below the progress bar");
    assert.ok(homeLayout.levelPill &&
      homeLayout.levelPill.width >= 77 && homeLayout.levelPill.height >= 24,
      sc.name+": centered player level is readable inside a compact pill "+JSON.stringify(homeLayout.levelPill));
    assert.ok(homeLayout.levelPill.bottom <= homeLayout.party.top + 8,
      sc.name+": lowered XP and level pill do not block pet selection");
    assert.ok(homeLayout.navButton && homeLayout.navButton.width === 52,
      sc.name+": Home navigation launcher maintains its tap area");
    const navStyle = await page.getByTestId("button-floating-nav").evaluate(el => ({
      border: getComputedStyle(el).borderStyle,
      filter: getComputedStyle(el.querySelector("img")).filter,
    }));
    assert.equal(navStyle.border, "none",
      sc.name+": navigation no longer has an outer circular frame");
    assert.ok(navStyle.filter.includes("drop-shadow("),
      sc.name+": contour accent follows the nontransparent nav icon");
    assert.ok((homeLayout.navButton.left >= homeLayout.headerName.right + 6 ||
        homeLayout.navButton.top >= homeLayout.headerName.bottom + 6) &&
      homeLayout.navButton.top < homeLayout.actor.top - 14,
      sc.name+": main nav stays separate from the account name and above avatar stars");
    assert.ok(homeLayout.navButton.left >= sc.width - 88 &&
      homeLayout.navButton.right <= sc.width,
      sc.name+": Home navigation is aligned to the right viewport edge");

    // Main opens independent right-edge icons. Once the vertical space is
    // filled, remaining items wrap into columns to the left, never a folio box.
    const mainNav = page.getByTestId("button-floating-nav");
    await mainNav.tap();
    await page.getByTestId("home-realm-nav-panel").waitFor({state:"visible"});
    await page.waitForTimeout(240);
    const panelGeometry = await page.getByTestId("home-realm-nav-panel").evaluate(el => {
      const r = el.getBoundingClientRect(), style=getComputedStyle(el);
      return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,
        background:style.backgroundImage,color:style.backgroundColor };
    });
    assert.ok(panelGeometry.left >= -1 && panelGeometry.right <= sc.width + 1 &&
      panelGeometry.top >= homeLayout.navButton.bottom + 6 && panelGeometry.bottom <= sc.height - 8,
      sc.name+": icon rail fits below main nav and within viewport: "+JSON.stringify(panelGeometry));
    assert.equal(panelGeometry.background,"none",sc.name+": no boxed navigation background");
    assert.ok(panelGeometry.color==="rgba(0, 0, 0, 0)" || panelGeometry.color==="transparent",
      sc.name+": floating icons have no panel fill");
    assert.equal(await page.getByTestId("home-realm-nav-panel").locator("section").count(),0,
      sc.name+": obsolete boxed category sections are removed");
    assert.equal(await page.getByTestId("nav-item-coins").count(),0,
      sc.name+": Coin Bundles stays under the coin balance");
    const navigation = await page.evaluate(() => {
      const elements=Array.from(document.querySelectorAll('[data-testid^="nav-item-"]'));
      return elements.map(el=>{
        const r=el.getBoundingClientRect();
        const atCenter=document.elementFromPoint(r.left + r.width/2,r.top + r.height/2);
        return {id:el.getAttribute("data-testid"),left:r.left,right:r.right,
          top:r.top,bottom:r.bottom,hit:el===atCenter||el.contains(atCenter)};
      });
    });
    assert.equal(navigation.length,13,sc.name+": twelve original routes and Support remain");
    assert.equal(new Set(navigation.map(item=>item.id)).size,13,
      sc.name+": no duplicated destinations");
    assert.equal(navigation[0].id,"nav-item-home",sc.name+": Main is first priority");
    assert.equal(navigation[navigation.length-1].id,"nav-item-support",
      sc.name+": Support is always the last navigation action");
    const columns=[...new Set(navigation.map(item=>Math.round(item.left)))].sort((x,y)=>y-x);
    assert.ok(columns.length >= (sc.height<=844 ? 2 : 1) && columns.length <= 4,
      sc.name+": compact screens flow excess icons left: "+JSON.stringify(columns));
    assert.ok(Math.abs(navigation[0].right - homeLayout.navButton.right)<=2,
      sc.name+": first icons align with the right edge of the main nav button");
    for(const item of navigation){
      assert.ok(item.left>=-1 && item.right<=sc.width+1 &&
        item.top>=homeLayout.navButton.bottom+5 && item.bottom<=sc.height-8,
        sc.name+": navigation icon remains on screen: "+JSON.stringify(item));
      assert.ok(item.hit,sc.name+": floating icon remains tappable: "+item.id);
    }
    for(let i=0;i<navigation.length;i++)for(let j=i+1;j<navigation.length;j++){
      const a=navigation[i],b=navigation[j];
      assert.ok(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=0 ||
        Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=0,
        sc.name+": no overlapping icon hit targets: "+a.id+" / "+b.id);
    }
    const support=navigation[navigation.length-1];
    assert.ok(Math.abs(support.bottom - Math.max(...navigation.map(item=>item.bottom))) <= 2,
      sc.name+": Support is at the bottom of the navigation rail");
    assert.ok(Math.abs(support.left - Math.min(...navigation.map(item=>item.left)))<=2,
      sc.name+": overflow columns grow toward the left with Support last");
    await page.getByTestId("nav-item-support").tap();
    await page.getByTestId("button-close-support-modal").waitFor({state:"visible"});
    await page.getByTestId("button-close-support-modal").tap();
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="button-floating-nav"]')?.getAttribute("aria-expanded") === "false");
    assert.equal(homeLayout.equippedDots,0,
      sc.name+": selected party pets have no duplicate dot indicators");
    await page.getByTestId("display-coin-balance").tap();
    assert.equal(new URL(page.url()).pathname,"/",
      sc.name+": clicking the balance does not open the coin shop");

    // Real Watcher Home UI: initial history is quiet, only bot messages
    // speak, mute is account-scoped and reversible from the existing chat.
    await page.waitForFunction(() =>
      Array.isArray(window.__homeAvatarFixtureCache?.getQueryData(["/api/world-chat"])));
    await page.waitForTimeout(60);
    assert.equal(await page.getByTestId("watcher-announcement-bubble").count(),0,
      sc.name+": historical Watcher posts do not speak on initial render");
    await page.evaluate(() => window.__homeAvatarFixtureCache.setQueryData(
      ["/api/world-chat"],[{id:"player-new",isBot:false,message:"hello",username:"player"}]));
    assert.equal(await page.getByTestId("watcher-announcement-bubble").count(),0,
      sc.name+": other players never trigger Watcher speech");
    await page.evaluate(() => window.__homeAvatarFixtureCache.setQueryData(
      ["/api/world-chat"],[
        {id:"player-new",isBot:false,message:"hello",username:"player"},
        {id:"watcher-one",isBot:true,message:"A new realm announcement",username:"Watcher",createdAt:new Date().toISOString()},
      ]));
    await page.getByTestId("watcher-announcement-bubble").waitFor({state:"visible"});
    const watcherBubble=await page.getByTestId("watcher-announcement-bubble").evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    });
    assert.ok(watcherBubble.left >= homeLayout.watcher.right - 1 &&
      watcherBubble.right <= sc.width - 2 &&
      watcherBubble.bottom <= sc.height + 0.5,
      sc.name+": speech oval is right of Watcher and on-screen: "+JSON.stringify(watcherBubble));
    await page.getByTestId("button-silence-watcher-announcements").tap();
    assert.equal(await page.getByTestId("watcher-announcement-bubble").count(),0,
      sc.name+": silence hides the speech oval");
    assert.equal(await page.evaluate(() =>
      window.localStorage.getItem("para-pets:watcher-bubble-muted:home-avatar-fixture")),"true");
    await page.evaluate(() => window.__homeAvatarFixtureCache.setQueryData(
      ["/api/world-chat"],[
        {id:"watcher-one",isBot:true,message:"A new realm announcement",username:"Watcher"},
        {id:"watcher-two",isBot:true,message:"Muted message",username:"Watcher"},
      ]));
    assert.equal(await page.getByTestId("watcher-announcement-bubble").count(),0,
      sc.name+": muted messages stay silent");
    await page.getByTestId("button-open-world-chat").tap();
    await page.getByTestId("panel-world-chat").waitFor({state:"visible"});
    await page.getByTestId("button-toggle-watcher-announcement-bubbles").tap();
    await page.getByTestId("button-close-world-chat").tap();
    assert.equal(await page.evaluate(() =>
      window.localStorage.getItem("para-pets:watcher-bubble-muted:home-avatar-fixture")),"false");
    await page.evaluate(() => window.__homeAvatarFixtureCache.setQueryData(
      ["/api/world-chat"],[
        {id:"watcher-two",isBot:true,message:"Muted message",username:"Watcher"},
        {id:"watcher-three",isBot:true,message:"Another realm announcement",username:"Watcher"},
      ]));
    await page.getByTestId("watcher-announcement-bubble").waitFor({state:"visible"});
    await page.getByTestId("button-open-watcher-announcement").tap();
    await page.getByTestId("panel-world-chat").waitFor({state:"visible"});
    await page.getByTestId("button-close-world-chat").tap();


    if(sc.apiError||sc.malformed){
      await page.getByTestId("home-avatar-error").waitFor({state:"visible"});
      assert.equal(await page.getByTestId("home-design-character").count(),0,
        sc.name+": network/malformed failure cannot be treated as uncreated");
    }else if(!sc.created){
      const invitation=page.getByTestId("home-design-character");
      await invitation.waitFor({state:"visible"});
      assert.equal(writes.length,0,sc.name+": Home never auto-creates player account");
      await invitation.tap();
      await page.getByTestId("player-avatar-page").waitFor({state:"visible"});
      const firstSave = page.waitForResponse(r =>
        r.url().endsWith("/api/player-avatar/create") && r.request().method()==="POST");
      await page.getByTestId("avatar-skin-picker-toggle").tap();
      await page.getByTestId("avatar-skin-warm").tap();
      await page.getByTestId("avatar-create-button").tap();
      await firstSave;
      assert.equal(avatar.skinTone,"#d39a71",sc.name+": first save stores player-selected skin");
      assert.equal(writes.length,1,sc.name+": only the explicit wardrobe Save creates");
      await page.getByTestId("avatar-save-confirmation").waitFor({state:"visible"});
      await page.getByTestId("avatar-save-confirmation-close").tap();
      await page.getByRole("button",{name:"Back to Home"}).tap();
      await page.getByTestId("home-avatar-character").waitFor({state:"visible"});
      assert.equal(await page.locator('.home-avatar-stage [data-testid="avatar-skin-tint"]').count(),8,
        sc.name+": saved skin color renders on the Home avatar");
      assert.equal(await page.getByTestId("home-design-character").count(),0,
        sc.name+": confirmed save replaces gold prompt");
    }else{
      await page.getByTestId("home-avatar-character").waitFor({state:"visible"});
      assert.equal(await page.locator('.home-avatar-stage [data-testid="avatar-skin-tint"]').count(),8,
        sc.name+": existing saved color displays on Home");
      assert.equal(await page.locator('[data-clothing-part="head"]').count(),1,
        sc.name+": equipped clothing displays over the shared rig");
      await page.getByTestId("home-avatar-character").tap();
      await page.getByRole("button",{name:"Back to Home"}).waitFor({state:"visible"});
      assert.equal(await page.getByTestId("avatar-skin-tone-picker").count(),0,
        sc.name+": existing character opens with compact color selector");
      await page.getByRole("button",{name:"Back to Home"}).tap();
      await page.getByTestId("home-avatar-character").waitFor({state:"visible"});
    }
    assert.deepEqual(errors,[],sc.name+": no React runtime errors");
    console.log("PASS "+sc.name+": created-state, Home actor, wardrobe route and retired pet chrome");
    await context.close();
  }
}finally{await browser.close();await server.close();}
