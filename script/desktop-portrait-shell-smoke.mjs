import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Visual geometry smoke: import the real layout functions and apply the real
// shell stylesheet. No authenticated user or production data is required.
const browser=await chromium.launch({headless:true});
try{
 for(const [name,width,height,touch] of [
  ['phone',390,844,true],
  ['tablet',834,1194,true],
  ['laptop',1366,768,false],
  ['desktop',1440,900,false],
  ['full HD',1920,1080,false],
  ['large desktop',2560,1440,false],
 ]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  await page.goto('http://127.0.0.1:4173/privacy');
  await page.addStyleTag({url:'http://127.0.0.1:4173/client/src/tabletStageShell.css'});
  const result=await page.evaluate(async({width,height,touch})=>{
   const {calculateStageLayout}=await import('/client/src/lib/stage.ts');
   const {desktopPortraitGameplayLayout}=await import('/client/src/lib/stageViewport.ts');
   const native=calculateStageLayout(width,height,0,0,{viewportSurface:true});
   const layout=desktopPortraitGameplayLayout(native,'/world/haunted_woods',touch);
   const portrait=layout.designWidth<layout.viewportWidth;
   const shell=document.createElement('div');
   shell.className='game-stage-shell';
   shell.dataset.stageCoordinateOwner='viewport';
   shell.dataset.desktopPortrait=portrait?'true':'false';
   Object.assign(shell.style,{position:'fixed',inset:'0',zIndex:'999999',pointerEvents:'none'});
   shell.style.setProperty('--stage-surrounding-image','linear-gradient(115deg, rgb(12, 48, 30), rgb(29, 18, 54))');
   const stage=document.createElement('div');
   stage.id='desktop-shell-test-stage';
   Object.assign(stage.style,{position:'absolute',left:layout.left+'px',top:layout.top+'px',
     width:layout.designWidth+'px',height:layout.designHeight+'px',background:'rgb(10, 14, 22)'});
   shell.appendChild(stage);
   document.body.appendChild(shell);
   shell.dataset.viewportSceneActive='true';
   const sceneBackground=getComputedStyle(shell).backgroundImage;
   shell.dataset.viewportSceneActive='false';
   shell.dataset.viewportBackdropActive='true';
   const backdropBackground=getComputedStyle(shell).backgroundImage;
   shell.dataset.viewportBackdropActive='false';
   const stageBounds=stage.getBoundingClientRect(),shellBounds=shell.getBoundingClientRect();
   const shellBackground=getComputedStyle(shell).backgroundImage;
   shell.remove();
   return {portrait,layout:{designWidth:layout.designWidth,designHeight:layout.designHeight,left:layout.left,scale:layout.scale},
     stageBounds:{left:stageBounds.left,width:stageBounds.width,height:stageBounds.height},
     shellWidth:shellBounds.width,sceneBackground,backdropBackground,shellBackground};
  },{width,height,touch});
  const expectPortrait=!touch&&width>=1024&&width>height;
  assert.equal(result.portrait,expectPortrait,name+': only desktop landscape browsers get centered portrait gameplay');
  assert.equal(result.layout.scale,1,name+': never rescale world/admin coordinates');
  assert.equal(result.stageBounds.height,height,name+': gameplay height matches available viewport');
  if(expectPortrait){
   assert.equal(result.stageBounds.width,Math.round(height*.72),name+': native portrait stage width preserved');
   assert.ok(Math.abs(result.stageBounds.left-(width-result.stageBounds.width)/2)<=1,name+': stage stays centered');
   assert.ok(result.stageBounds.width<result.shellWidth,name+': room remains for decorative side surroundings');
   assert.match(result.sceneBackground,/linear-gradient/i,name+': themed surroundings survive scene portal');
   assert.match(result.backdropBackground,/linear-gradient/i,name+': themed surroundings survive backdrop portal');
  }else{
   assert.equal(result.stageBounds.width,width,name+': touch devices keep full device viewport');
   if(width>=768) {
    assert.equal(result.sceneBackground,'none',name+': full-device scene suppresses duplicate shell artwork');
    assert.equal(result.backdropBackground,'none',name+': full-device backdrop suppresses duplicate shell artwork');
   }
  }
  console.log('PASS '+name+': centered PC portrait keeps themed surroundings; touch viewport unchanged');
  await context.close();
 }
}finally{await browser.close();}
