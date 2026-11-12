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
const requiredClothing = ["top","bottom","face"].map(category=>({
  category,inventoryId:"required-"+category,shopItemId:"catalog-"+category,
  name:"Starter "+category,imageUrl:art,quantity:1,isListed:false,compatible:true,
  universal:true,segments:[{
    partType:category==="bottom"?"left_leg":category==="face"?"head":"top",
    imageUrl:art,fit:{xPct:50,yPct:50,widthPct:85,
      pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:1},
    renderPlane:"with_part",
  }],
}));
const base = {id:"published-base",name:"Forest Character",
  publishedAt:"2026-11-09T00:00:00.000Z",parts};
const playerPet = {inventoryId:"pet-owned",id:"pet-owned",shopItemId:"pet-template",
  name:"Original Companion",type:"pet",rarity:4,starRarity:4,isHatched:true,
  isListed:false,petTemplateId:null,hatchTime:3,hatchStartedAt:null,
  eggImageUrl:art,hatchedImageUrl:art,imageUrl:art,petTemplateId:"pet-template",
  petNickname:"Flora",
  petLevel:11,petLevelPoints:270,petHp:12,petAtk:5,petDef:3,quantity:1,
  itemsUsedThisLevel:0,petHealth:12,petAtk:5,petDef:3};
await server.listen();
const browser=await chromium.launch({headless:true});
try {
  const scenarios=[
    {name:"first-time compact phone",width:320,height:568,created:false,zeroXp:true},
    {name:"first-time phone",width:390,height:844,created:false,zeroXp:true},
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
    const errors=[],writes=[],xpAnchorWrites=[];
    let savedXpAnchor=null;
    let currentTeamIds=["pet-owned"];
    page.on("pageerror",e=>errors.push(e.message));
    page.setDefaultTimeout(18000);
    const user={id:"home-avatar-fixture",username:"QA",email:"qa@example.invalid",
      coins:1200,isAdmin:true,isModerator:true,emailVerified:true,profileImage:null,
      activePetId:"pet-owned"};
    let avatar={created:sc.created,revision:sc.created?1:null,base,
      skinTone:sc.created?"#855238":null,
      ownedClothing:sc.created?[]:requiredClothing,
       equipped:sc.created?[hat]:[],unavailableEquipmentSlots:[]};
    const fulfill=(route,json,status=200)=>route.fulfill({status,json});
    await page.route("**/api/**",async route=>{
      const path=new URL(route.request().url()).pathname;
      const method=route.request().method();
      if(path==="/api/auth/me")return fulfill(route,user);
      if(path==="/api/settings/home-xp-anchor" && method==="GET")
        return fulfill(route,{anchor:savedXpAnchor});
      if(path==="/api/admin/settings/home-xp-anchor" && method==="PUT"){
        const anchor=route.request().postDataJSON().anchor;
        if(anchor!==null)
          assert.ok(anchor.xPct>=0 && anchor.xPct<=1 && anchor.yPct>=0 && anchor.yPct<=1,
            sc.name+": XP admin position stored relative to background artwork");
        xpAnchorWrites.push(anchor);
        savedXpAnchor=anchor;
        return fulfill(route,{anchor});
      }
      if(path==="/api/inventory")return fulfill(route,[
        playerPet,
        {...playerPet,inventoryId:"pet-second",id:"pet-second",petTemplateId:null,
          name:"Second Companion",petNickname:"Luna",rarity:3,starRarity:3},
      ]);
      if(path==="/api/player/progression")
        return fulfill(route,sc.zeroXp
          ? {level:1,totalXp:0,cycleXp:0,stars:1,nextLevelTotalXp:80,xpToNextLevel:80}
          : {level:3,totalXp:240,cycleXp:240,stars:1,nextLevelTotalXp:330,xpToNextLevel:90});
      if(path==="/api/player/pet-team"){
        if(method==="PUT"){
          const next=route.request().postDataJSON().petInventoryIds;
          assert.ok(Array.isArray(next),sc.name+": team save keeps the shared ID list");
          currentTeamIds=[...next];
          // A real delayed write exposes the saving state in which the row
          // previously jumped as status text added height beneath it.
          await new Promise(resolve=>setTimeout(resolve,350));
        }
        return fulfill(route,{petInventoryIds:currentTeamIds,attackPower:100});
      }
      if(path==="/api/pet-template-parts/pet-template" && method==="GET")
        return fulfill(route,{
          facing:"front",canFly:false,
          parts:[
            {id:"fixture-body",templateId:"pet-template",partType:"body",
              view:"front",imageUrl:art,posX:340,posY:340,
              width:320,height:320,zIndex:30,pivotX:50,pivotY:50,rotation:0},
            {id:"fixture-eyes",templateId:"pet-template",partType:"eyes",
              view:"front",imageUrl:art,posX:400,posY:410,
              width:100,height:32,zIndex:40,pivotX:50,pivotY:50,rotation:0},
            {id:"fixture-closed-eyes",templateId:"pet-template",partType:"eyes_closed",
              view:"front",imageUrl:art,posX:400,posY:410,
              width:100,height:32,zIndex:41,pivotX:50,pivotY:50,rotation:0},
          ],
        });
      if(path==="/api/pet/pet-owned/costumes" && method==="GET")
        return fulfill(route,{equipped:[],extraSlots:0,isEvolved:false});
      if(path==="/api/pet/pet-owned/mini-pet" && method==="GET")
        return fulfill(route,{equipped:{
          inventoryId:"mini-fixture",shopItemId:"mini-shop",name:"Tiny companion",
          imageUrl:art,rarity:2,atkBoost:0,healthBoost:0,defBoost:0,
          animationStyle:"float",parts:[],
        }});
      if(path==="/api/player-avatar" && method==="GET") {
        if(sc.apiError)return fulfill(route,{message:"Service unavailable"},503);
        if(sc.malformed)return fulfill(route,[]);
        return fulfill(route,avatar);
      }
      if(path==="/api/player-avatar/create" && method==="POST"){
        const body=route.request().postDataJSON();
        assert.equal(body.baseId,"published-base");
        assert.deepEqual(Object.keys(body.outfit).sort(),["bottom","face","top"],
          sc.name+": required first-save outfit is present");
        writes.push(body);
        avatar={...avatar,created:true,revision:0,skinTone:body.skinTone??null,
          equipped:Object.entries(body.outfit).map(([category,selected])=>{
            const item=requiredClothing.find(x=>x.inventoryId===selected.inventoryId);
            return {...item,category};
          })};
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
        watcherArt: rect('[data-testid="home-watcher-art"]'),
        watcherDock: rect('[data-testid="viewport-hud-watcher-dock"]'),
        xpTextCount: document.querySelectorAll('svg [data-testid="home-player-total-xp"]').length,
        playerLevel: rect('[data-testid="home-player-level"]'),
        levelCurve: rect('.home-player-hud__level-curved'),
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
    await page.getByTestId("home-player-team-composite-1").waitFor({state:"visible"});
    await page.getByTestId("home-player-team-composite-1")
      .locator('[data-testid="pet-animator"] img').first().waitFor({state:"visible"});
    await page.getByTestId("equipped-mini-pet").waitFor({state:"visible"});
    const composite=page.getByTestId("home-player-team-composite-1");
    assert.ok(await composite.locator('[data-testid="pet-animator"] img').count()>=3,
      sc.name+": compact companion uses layered body and blinking eye art");
    const animBounds=await composite.locator('[data-testid="pet-animator"]').first().boundingBox();
    const slotBounds=await page.getByTestId("home-player-team-slot-1").boundingBox();
    assert.ok(animBounds && slotBounds && animBounds.width<=slotBounds.width*1.5,
      sc.name+": enlarged pet art is allowed to extend beyond its shadow oval: "+
        JSON.stringify({animBounds,slotBounds}));
    assert.equal(await page.getByTestId("equipped-mini-pet").getAttribute("data-mini-pet-motion"),"animated",
      sc.name+": equipped Mini Pet uses its current looping idle animation");
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
    assert.ok(homeLayout.progress.top >= homeLayout.actor.bottom-24,
      sc.name+": semicircular XP stays near the avatar's feet");
    assert.ok(homeLayout.xp.height>=52 && homeLayout.xp.height<=210 &&
      homeLayout.xp.width<=Math.min(350,sc.width-24),
      sc.name+": semicircular XP arc fits the mobile viewport");
    const xpArc=await page.getByTestId("home-player-xp-track").evaluate(el=>({
      paths:el.querySelectorAll("svg path").length,
      curve:el.querySelector(".home-player-hud__xp-arc-rim")?.getAttribute("d"),
      innerTrack: getComputedStyle(el.querySelector(".home-player-hud__xp-arc-track")).stroke,
      rimWidth: parseFloat(getComputedStyle(el.querySelector(".home-player-hud__xp-arc-rim")).strokeWidth),
      fillCount:el.querySelectorAll(".home-player-hud__xp-arc-fill").length,
      value:Number(el.getAttribute("aria-valuenow")),
      text:document.querySelector('[data-testid="home-player-total-xp"]')?.textContent,
    }));
    assert.ok(xpArc.paths>=(sc.zeroXp?4:5) && xpArc.curve?.includes(" C "),
      sc.name+": one rounded cubic U curves the glowing XP groove under the avatar");
    assert.ok(xpArc.innerTrack.includes("18, 59, 39") && xpArc.rimWidth>=9,
      sc.name+": XP has a thick gold glowing rim and recessed green track: "+JSON.stringify(xpArc));
    assert.equal(xpArc.fillCount,sc.zeroXp?0:1,
      sc.name+": 0 XP has NO painted fill; earned XP paints the proportional fill");
    if(sc.zeroXp){
      assert.equal(xpArc.value,0,sc.name+": empty XP progress has zero value");
      assert.equal(homeLayout.xpTextCount,0,
        sc.name+": visual XP count is hidden; accessible progressbar label retains it");
    } else {
      assert.ok(xpArc.value>0 && xpArc.value<100,sc.name+": partial XP stays partially filled");
    }
    assert.ok(homeLayout.party.top >= homeLayout.progress.bottom-42,
      sc.name+": the deeper curved rim stays near the pet row without covering its controls");
    if(sc.name==="saved character phone"){
      assert.equal(await page.getByTestId("button-home-adjust-xp").count(), 0,
        sc.name+": XP cannot be moved by dragging after anchoring to the artwork");
      const bar=page.locator(".home-player-hud__progress");
      const before=await bar.boundingBox();
      assert.ok(before);
      await page.getByTestId("button-home-edit-xp-curve").click();
      const curve=page.getByTestId("input-home-xp-curve");
      const originalShape=await page.locator(".home-player-hud__xp-arc-rim").getAttribute("d");
      const depthSaved=page.waitForResponse(r=>
        r.url().endsWith("/api/admin/settings/home-xp-anchor") &&
        r.request().method()==="PUT");
      await curve.focus();
      await curve.press("End");
      await depthSaved;
      assert.ok(savedXpAnchor && savedXpAnchor.curveDepth===220,
        sc.name+": admin can still adjust curvature without dragging the bar");
      const fixedAnchor={xPct:savedXpAnchor.xPct,yPct:savedXpAnchor.yPct};
      const adjustedShape=await page.locator(".home-player-hud__xp-arc-rim").getAttribute("d");
      assert.notEqual(adjustedShape,originalShape,
        sc.name+": curvature changes the actual XP path");
      const flatSaved=page.waitForResponse(r=>
        r.url().endsWith("/api/admin/settings/home-xp-anchor") &&
        r.request().method()==="PUT");
      await curve.press("Home");
      await flatSaved;
      assert.equal(savedXpAnchor.curveDepth,20);
      assert.deepEqual({xPct:savedXpAnchor.xPct,yPct:savedXpAnchor.yPct},fixedAnchor,
        sc.name+": changing curve preserves the exact saved background-relative placement");
      const after=await bar.boundingBox();
      assert.ok(after && Math.abs(after.x-before.x)<2 && Math.abs(after.y-before.y)<2,
        sc.name+": level bar stays at the same background point");
      assert.equal(xpAnchorWrites.length,2,sc.name+": only explicit curve changes save XP settings");
      await page.getByTestId("button-home-edit-xp-curve").click();
    }
    assert.ok(homeLayout.profile && homeLayout.headerName &&
      homeLayout.coins && homeLayout.essence && homeLayout.playerLevel,
      sc.name+": top profile/resources and level labels all render");
    assert.ok(homeLayout.headerName.left >= homeLayout.profile.right - 5,
      sc.name+": player name is to the right of the profile");
    // Player name precedes the smaller Watcher below it beside the portrait.
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
      homeLayout.shopIcon.width <= 44,
      sc.name+": small Coin Bundles shortcut is centered: "+JSON.stringify(homeLayout));
    assert.ok(homeLayout.watcher && homeLayout.watcherDock &&
      homeLayout.watcher.height >= 40 && homeLayout.watcher.height <= 44 &&
      homeLayout.watcher.left >= homeLayout.profile.right - 5 &&
      homeLayout.watcher.top >= homeLayout.headerName.bottom - 5 &&
      homeLayout.watcherArt && homeLayout.watcherArt.width <= 37,
      sc.name+": smaller Watcher is below the player name with a full touch target: "+JSON.stringify(homeLayout));
    const partyChrome = await page.locator(".home-player-hud__party-panel").evaluate(el => ({
      border: getComputedStyle(el).borderStyle,
      background: getComputedStyle(el).backgroundColor,
      pointerEvents: getComputedStyle(el).pointerEvents,
    }));
    assert.equal(partyChrome.border, "none",
      sc.name+": companion portraits no longer live in a rectangle");
    assert.equal(partyChrome.pointerEvents, "none",
      sc.name+": empty space between pets does not block scene taps");
    const miniOutline=await page.getByTestId("home-player-team-mini-1").evaluate(el=>
      getComputedStyle(el).filter);
    assert.ok(!miniOutline.includes("1px 0px 0px") && !miniOutline.includes("-1px 0px 0px"),
      sc.name+": Home mini pet no longer has extra hard gold outlines");
    const teamSlot = await page.getByTestId("home-player-team-slot-1").boundingBox();
    const centerSlot = await page.getByTestId("home-player-team-slot-3").boundingBox();
    assert.ok(teamSlot && centerSlot && teamSlot.width >= 83,
      sc.name+": outer companions are substantially larger than the old thumbnails");
    const nearLeft = await page.getByTestId("home-player-team-slot-2").boundingBox();
    const nearRight = await page.getByTestId("home-player-team-slot-4").boundingBox();
    const farRight = await page.getByTestId("home-player-team-slot-5").boundingBox();
    assert.ok(nearLeft && nearRight && farRight && centerSlot.width > nearLeft.width + 22 &&
      nearLeft.width > teamSlot.width + 12 && Math.abs(nearRight.width - nearLeft.width) <= 1 &&
      Math.abs(farRight.width - teamSlot.width) <= 1,
      sc.name+": center > near pair > outer pair: "+
      JSON.stringify({center:centerSlot.width,near:nearLeft.width,outer:teamSlot.width}));
    assert.ok(centerSlot.bottom > nearLeft.bottom + 16 && nearLeft.bottom > teamSlot.bottom + 13,
      sc.name+": center oval is closest to the bottom; side pets ascend in layers");
    assert.ok(teamSlot.y < centerSlot.y,
      sc.name+": pet silhouettes form a descending arc around the center");

    if(sc.name==="saved character phone"){
      const beforeTeam=[...currentTeamIds];
      const center=await page.getByTestId("home-player-team-slot-3").boundingBox();
      assert.ok(center);
      await page.mouse.move(center.x+center.width/2,center.y+center.height/2);
      await page.mouse.down();
      await page.mouse.move(center.x+center.width/2-76,center.y+center.height/2,{steps:6});
      await page.mouse.up();
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="home-player-team-slot-3"]')
          ?.getAttribute("data-visual-position")==="1");
      assert.equal(await page.getByTestId("home-player-team-picker").count(),0,
        sc.name+": swiping pets does not accidentally open the team editor");
      assert.deepEqual(currentTeamIds,beforeTeam,
        sc.name+": circular swipes never overwrite PvP/Raid team roster");
      await page.getByTestId("home-player-team-slots").press("ArrowLeft");
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="home-player-team-slot-3"]')
          ?.getAttribute("data-visual-position")==="2");
      assert.deepEqual(currentTeamIds,beforeTeam);
    }
    const slotChrome = await page.getByTestId("home-player-team-slot-1").evaluate(el=>({
      border:getComputedStyle(el).borderStyle,
      oval:getComputedStyle(el,"::before").borderRadius,
      ovalBorder:getComputedStyle(el,"::before").borderColor,
    }));
    assert.equal(slotChrome.border,"none",sc.name+": pet art has no circular frame");
    assert.equal(slotChrome.oval,"50%",sc.name+": small shadow oval anchors each pet");
    assert.ok(slotChrome.ovalBorder.includes("204, 181, 115"),
      sc.name+": companion oval has a readable muted gold edge");
    assert.ok(await page.getByTestId("home-player-team-slot-4").locator(".home-player-hud__slot-placeholder img").count(),
      sc.name+": empty slot contains a greyed-out pet image");
    assert.equal((await page.getByTestId("home-player-team-slot-4").textContent()).trim(),"+",
      sc.name+": empty slot only shows a plus");
    assert.ok(homeLayout.avatarStarSize >= 32,
      sc.name+": player stars enlarged over the avatar");
    assert.equal(homeLayout.xpTextCount,0,
      sc.name+": Home shows no visual XP numbers while retaining progression aria label");
    assert.ok(homeLayout.levelCurve &&
      homeLayout.levelCurve.width >= 24 && homeLayout.levelCurve.height >= 10,
      sc.name+": level label is curved, not inside an old rectangular pill");
    assert.ok(Math.abs(homeLayout.playerLevel.centerX - homeLayout.xp.centerX) < 12,
      sc.name+": player level follows the center under the arc");
    assert.ok(homeLayout.levelCurve.bottom <= homeLayout.party.top + 35,
      sc.name+": curved player level stays near the platform and above the companion art");
    if(sc.name==="saved character phone" || sc.name==="saved character tablet"){
      // Profile settings are opened from the existing portrait and retain
      // every control while switching the sheet's paint to forest and gold.
      await page.getByTestId("button-profile").tap();
      const panel=page.getByTestId("player-settings-panel");
      await panel.waitFor({state:"visible"});
      const theme=await panel.evaluate(el=>{
        const style=getComputedStyle(el);
        const rect=el.getBoundingClientRect();
        return {gradient:style.backgroundImage,border:style.borderColor,
          right:rect.right,left:rect.left};
      });
      assert.ok(theme.gradient.includes("40, 81, 58") &&
        theme.border.includes("235, 203, 125"),
        sc.name+": settings popup has forest green surfaces and gold trim: "+JSON.stringify(theme));
      assert.ok(theme.left>=-2 && theme.right<=sc.width+2,
        sc.name+": settings popup stays inside mobile/tablet viewport");
      for(const id of ["button-save-username","profile-time-zone-settings",
        "button-toggle-change-password","button-toggle-feedback","button-logout"])
        assert.equal(await page.getByTestId(id).count(),1,sc.name+": settings keeps "+id);
      await page.getByTestId("button-close-profile").tap();
      await panel.waitFor({state:"detached"});
    }
    if(sc.name==="saved character phone"){
      const slots=page.locator('[data-testid^="home-player-team-slot-"]');
      const positions=async()=>slots.evaluateAll(nodes=>
        nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top};}));
      const beforeSwap=await positions();
      await page.getByTestId("home-player-team-slot-1").tap();
      await page.getByTestId("home-player-picker-pet-pet-second").tap();
      await page.getByText("Saving your team…",{exact:true}).waitFor({state:"visible"});
      const duringSwap=await positions();
      const maxMovement=(a,b)=>Math.max(...a.map((x,i)=>
        Math.abs(x.top-b[i].top)+Math.abs(x.left-b[i].left)));
      assert.ok(maxMovement(beforeSwap,duringSwap)<1,
        sc.name+": showing the saving message does not move any pet space");
      await page.waitForFunction(()=>document.querySelector(
        '[data-testid="home-player-team-slot-1"]')?.getAttribute("aria-label")?.includes("Luna") &&
        !document.querySelector(".home-player-hud__status")?.textContent?.includes("Saving"));
      const afterSwap=await positions();
      assert.ok(maxMovement(beforeSwap,afterSwap)<1,
        sc.name+": new pet replaces only slot content without moving the row");
    }
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

    // The three moved routes are persistent, one-tap Home shortcuts beside
    // the main emblem, outside the account/resource and companion areas.
    const quickIds=["map","quest","pvp"];
    assert.equal(await page.getByTestId("home-realm-shortcuts").isVisible(),true,
      sc.name+": Home shows the relocated quick destinations");
    const quickButtons=await page.evaluate(()=>{
      return Array.from(document.querySelectorAll('[data-testid^="home-shortcut-"]'))
        .map(el=>{
          const r=el.getBoundingClientRect();
          const front=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          return {name:el.getAttribute("data-testid"),left:r.left,right:r.right,
            top:r.top,bottom:r.bottom,hit:front===el||el.contains(front)};
        });
    });
    assert.deepEqual(quickButtons.map(q=>q.name),quickIds.map(id=>"home-shortcut-"+id),
      sc.name+": Map, Quest and PvP appear in shortcut order");
    for(const q of quickButtons){
      assert.ok(q.left>=sc.width-100 && q.right<=sc.width+1 &&
        q.top>=homeLayout.navButton.bottom+5 && q.bottom<=sc.height-6,
        sc.name+": Home shortcut stays in the right-hand free space: "+JSON.stringify(q));
      assert.ok(q.hit,sc.name+": shortcut is actually tappable: "+q.name);
    }
    for(let i=1;i<quickButtons.length;i++)
      assert.ok(quickButtons[i].top>=quickButtons[i-1].bottom-1,
        sc.name+": vertical shortcuts don't cover one another");
    await page.getByTestId("home-shortcut-quest").tap();
    await page.getByTestId("quest-log-viewport-overlay").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("home-realm-shortcuts").count(),0,
      sc.name+": shortcuts disappear while Quest is open");
    await page.getByTestId("quest-log-viewport-backdrop").tap({position:{x:4,y:4}});
    await page.getByTestId("home-realm-shortcuts").waitFor({state:"visible"});

    // Main now shows the ten remaining routes in frequency-first order,
    // five columns over two rows. Support is still the very last tile.
    const mainNav = page.getByTestId("button-floating-nav");
    await mainNav.tap();
    await page.getByTestId("home-realm-nav-panel").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("home-realm-shortcuts").count(),0,
      sc.name+": relocated shortcut buttons are not duplicated inside open menu");
    await page.waitForTimeout(240);
    const panelGeometry = await page.getByTestId("home-realm-nav-panel").evaluate(el => {
      const r = el.getBoundingClientRect(), style=getComputedStyle(el);
      return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,
        background:style.backgroundImage,color:style.backgroundColor };
    });
    assert.ok(panelGeometry.left >= -1 && panelGeometry.right <= sc.width + 1 &&
      panelGeometry.top >= homeLayout.navButton.bottom + 6 && panelGeometry.bottom <= sc.height - 8,
      sc.name+": icon rail fits below main nav and within viewport: "+JSON.stringify(panelGeometry));
    assert.ok(panelGeometry.background.includes("rgba(21, 63, 40, 0.52)"),
      sc.name+": Home navigation is genuinely translucent over the forest");
    const iconChrome = await page.getByTestId("nav-item-home").locator(".home-realm-nav__icon").evaluate(el=>({
      border:getComputedStyle(el).borderStyle,
      radius:getComputedStyle(el).borderRadius,
      filter:getComputedStyle(el.querySelector("img")).filter,
    }));
    assert.equal(iconChrome.border,"none",
      sc.name+": nav icons have no individual circular frames");
    assert.ok(iconChrome.radius==="0px" && iconChrome.filter.includes("drop-shadow("),
      sc.name+": nav gold outline follows the image's opaque artwork");
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
    assert.equal(navigation.length,10,sc.name+": nine common destinations plus Support remain");
    assert.equal(new Set(navigation.map(item=>item.id)).size,10,
      sc.name+": no duplicated destinations");
    assert.deepEqual(navigation.map(item=>item.id),[
      "nav-item-home","nav-item-inventory","nav-item-bag","nav-item-keepers",
      "nav-item-pethouse","nav-item-market","nav-item-aquarium",
      "nav-item-cards","nav-item-badges","nav-item-support",
    ],sc.name+": frequently used actions lead and Support remains last");
    assert.equal(navigation[navigation.length-1].id,"nav-item-support",
      sc.name+": Support is always the last navigation action");
    const columns=[...new Set(navigation.map(item=>Math.round(item.left)))].sort((x,y)=>x-y);
    const rows=[...new Set(navigation.map(item=>Math.round(item.top)))].sort((x,y)=>x-y);
    assert.equal(columns.length,5,sc.name+": five horizontal icon columns");
    assert.equal(rows.length,2,sc.name+": two compact rows");
    assert.ok(Math.abs(navigation[0].left - panelGeometry.left)<=19,
      sc.name+": first navigation icon starts on the left");
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
    assert.ok(Math.abs(support.right - Math.max(...navigation.map(item=>item.right)))<=2,
      sc.name+": Support remains last at the lower-right of the new grid");
    await page.getByTestId("nav-item-support").tap();
    await page.getByTestId("button-close-support-modal").waitFor({state:"visible"});
    await page.getByTestId("button-close-support-modal").tap();
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="button-floating-nav"]')?.getAttribute("aria-expanded") === "false");
    await page.getByTestId("home-realm-shortcuts").waitFor({state:"visible"});
    // Map and PvP use the original navigation handlers without adding duplicate
    // dialogs or new route logic. The isolated fixture exposes their path changes.
    for(const id of ["map","pvp"]){
      await page.getByTestId("home-shortcut-"+id).tap();
      await page.waitForURL("**/"+id,{timeout:9000});
      assert.equal(new URL(page.url()).pathname,"/"+id,
        sc.name+": relocated "+id+" shortcut opens the original route");
      await page.goBack({waitUntil:"domcontentloaded"});
      await page.waitForURL(url=>url.pathname==="/",{timeout:9000});
      await page.getByTestId("home-realm-shortcuts").waitFor({state:"visible"});
    }
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
      assert.equal(await page.getByTestId("avatar-create-button").isDisabled(),true,
        sc.name+": first save requires the three clothing categories");
      for(const category of ["top","bottom","face"]){
        await page.getByTestId("avatar-category-"+category).tap();
        await page.getByTestId("avatar-clothing-required-"+category).tap();
      }
      assert.equal(await page.getByTestId("avatar-create-button").isEnabled(),true,
        sc.name+": selections unlock the initial save");
      await page.getByTestId("avatar-create-button").tap();
      await firstSave;
      assert.equal(avatar.skinTone,"#d39a71",sc.name+": first save stores player-selected skin");
      assert.equal(writes.length,1,sc.name+": only the explicit wardrobe Save creates");
      // Server-confirmed save shows a forest-green/gold reward celebration,
      // then returns to the live Home actor without another save step.
      await page.getByTestId("avatar-save-celebration").waitFor({state:"visible"});
      await page.getByRole("dialog",{name:"Character Saved!"}).waitFor({state:"visible"});
      await page.getByTestId("home-avatar-character").waitFor({state:"visible",timeout:9000});
      assert.equal(await page.getByTestId("player-avatar-page").count(),0,
        sc.name+": successful first save closes editor after the celebration");
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
