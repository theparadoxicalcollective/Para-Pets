import test from "node:test";
import assert from "node:assert/strict";
import { fishArtFacingScale, fishRarityScale, fishSchoolKey, fishSeed } from "../client/src/lib/fishSwimMotion";
import { planWorldFishMotion } from "../client/src/lib/worldFishMotion";
import { aquariumFishBounds, aquariumFishSize, confineAquariumFish, makeSwimmer, stepAquariumFish, type AqFishEntry } from "../client/src/lib/aquariumFishMotion";
import type { WorldFishCatalogEntry } from "../shared/worlds/worldSwimAreas";

const entry = (id: string, starRarity: number, zone = "full", facing = "right"): WorldFishCatalogEntry => ({
  id, name: id, imageUrl: "/fish.png", starRarity, fishSwimZone: zone, facingDirection: facing,
});
const aquariumEntry = (id: string, species: WorldFishCatalogEntry, hasParts = false): AqFishEntry => ({ ...species, shopItemId: species.id, id, hasParts });
const catalog = new Map([
  entry("minnow", 1, "full", "left"), entry("goldfish", 2), entry("rare", 3, "bottom", "left"), entry("large", 4),
  entry("huge", 5, "bottom"), entry("loach", 1, "bottom", "left"),
].map(f => [f.id, f]));
const placed = (id: string, fishId: string, x = .3, y = .4) => ({id, fishId, x, y});
const fixedRandom = () => .5;

test("both renderers use original artwork direction, catalog species and a shared rarity ladder", () => {
  assert.equal(fishArtFacingScale("left", true), -1);
  assert.equal(fishArtFacingScale("left", false), 1);
  assert.equal(fishArtFacingScale("right", true), 1);
  assert.equal(fishArtFacingScale(null, false), -1);
  assert.equal(fishSchoolKey("one", {starRarity: 2}), "one:full");
  assert.equal(fishSchoolKey("one", {starRarity: 1, fishSwimZone: "bottom"}), "one:bottom");
  for (const rarity of [3,4,5]) assert.equal(fishSchoolKey("one", {starRarity: rarity}), null);
  const scale = [1,2,3,4,5].map(fishRarityScale);
  assert.equal(scale[0],scale[1]);
  for(let i=2;i<scale.length;i++) assert.ok(scale[i]>scale[i-1]);
});

test("world tracks are reproducible, have varied routes and orient with every horizontal segment", () => {
  const input = [placed("first","minnow",.1,.25),placed("second","minnow",.9,.7),
    placed("rare1","rare",.2,.2),placed("rare2","rare",.8,.8),placed("third","goldfish")];
  const tracks = planWorldFishMotion(input,catalog,400,240,1);
  assert.deepEqual(tracks,planWorldFishMotion(input,catalog,400,240,1));
  for(const track of tracks) {
    assert.deepEqual(track.points[0],track.points[8]); // seamless repeat
    assert.ok(track.points.some(p=>p.x!==track.points[0].x));
    for(let i=0;i<8;i++){
      const dx=track.points[i+1].x-track.points[i].x;
      if(dx!==0) assert.equal(track.facing[i],fishArtFacingScale(track.entry.facingDirection,dx>0));
    }
  }
  const [a,b,r,s,c]=tracks;
  assert.notDeepEqual(a.points.slice(0,3), b.points.slice(0,3));
  assert.equal(a.duration,b.duration);
  for(let i=3;i<=5;i++) {
    assert.ok(Math.abs(a.points[i].x-b.points[i].x)<65);
    assert.ok(Math.abs(a.points[i].y-b.points[i].y)<45);
  }
  assert.equal(Math.sign(a.points[5].x-a.points[3].x),Math.sign(b.points[5].x-b.points[3].x));
  assert.notDeepEqual(a.points.slice(6),b.points.slice(6));
  assert.notEqual(r.duration,s.duration);
  assert.notDeepEqual(r.points,s.points);
  assert.notEqual(a.duration,c.duration);
});

test("all world waypoints stay in their area, with bottom dwelling anchors at 90–100%", () => {
  const inputStart = [...catalog.keys()].map((id,i)=>placed("f"+i,id,i%2, i%2));
  for(const [w,h,scale] of [[400,240,1],[48,24,.3],[20,300,.5],[320,35,.6]]) {
    const tracks=planWorldFishMotion(inputStart,catalog,w,h,scale);
    const sizes=Object.fromEntries(tracks.map(t=>[t.entry.id,t.size]));
    assert.equal(sizes.minnow,sizes.goldfish);
    assert.ok(sizes.rare>sizes.minnow && sizes.large>sizes.rare && sizes.huge>sizes.large);
    for(const t of tracks) for(const p of t.points){
      assert.ok(p.x>=0&&p.x+t.size<=w+1e-8&&p.y>=0&&p.y+t.size<=h+1e-8);
      if(t.entry.fishSwimZone==="bottom") assert.ok(p.y+t.size>=h*.9-1e-8);
    }
  }
});

test("aquarium schools converge, travel in the same direction and disperse; rare species never join", () => {
  const minnow=catalog.get("minnow")!, rare=catalog.get("rare")!;
  const a={...makeSwimmer(aquariumEntry("one",minnow),65,45,fixedRandom),vx:.06,targetVx:.06,baseSpeed:.06,stateTimer:10_000};
  const b={...makeSwimmer(aquariumEntry("two",minnow),15,29,fixedRandom),vx:-.05,targetVx:-.05,baseSpeed:.05,stateTimer:10_000};
  const r={...makeSwimmer(aquariumEntry("rare-one",rare),35,94,fixedRandom),stateTimer:10_000};
  const s={...makeSwimmer(aquariumEntry("rare-two",rare),45,98,fixedRandom),stateTimer:10_000};
  let fish=[a,b,r,s];
  // Start at the beginning of the species-specific schooling window.
  const tick=(1600-fishSeed(fishSchoolKey("minnow",minnow)!)%1600)%1600;
  let aligned=false;
  for(let i=0;i<850;i++){
    const previous=fish;
    fish=stepAquariumFish(fish,tick+i,390,844,fixedRandom);
    assert.equal(fish[0].schooling,true);assert.equal(fish[1].schooling,true);
    assert.equal(fish[2].schooling,false);assert.equal(fish[3].schooling,false);
    for(let j=0;j<fish.length;j++){
      const dx=fish[j].x-previous[j].x;
      if(dx!==0) assert.equal(fish[j].facingRight,dx>0);
    }
    if(i>200 && Math.abs(fish[0].x-fish[1].x)<15 &&
      Math.abs(fish[0].y-fish[1].y)<7 && fish[0].facingRight===fish[1].facingRight) aligned=true;
  }
  assert.ok(aligned,"school members must actually converge and travel together");
  fish=stepAquariumFish(fish,tick+850,390,844,fixedRandom);
  assert.ok(fish.every(f=>!f.schooling));
  assert.ok(Math.abs(fish[1].targetVx)<=fish[1].baseSpeed+1e-8);
});

test("aquarium bottom fish stay in the floor band even when chasing or fleeing, and sizes respect phone/tablet bounds", () => {
  for(const [w,h] of [[320,700],[834,1194],[900,320]]) {
    const fish=[1,2,3,4,5].map((star,i)=>aquariumEntry("fish"+i,entry("spec"+i,star,"bottom",i%2?"left":"right"),true));
    const sizes=fish.map(f=>aquariumFishSize(f,w,h));
    assert.equal(sizes[0],sizes[1]);
    for(let i=2;i<5;i++) assert.ok(sizes[i]>sizes[i-1]);
    let swimmers=fish.map((f,i)=>confineAquariumFish(makeSwimmer(f,i*30,40,fixedRandom),w,h));
    swimmers[4]={...swimmers[4],state:"chasing",chaseTargetId:swimmers[0].id,stateTimer:300};
    swimmers[0]={...swimmers[0],state:"fleeing",chaseTargetId:swimmers[4].id,stateTimer:300};
    for(let i=0;i<2000;i++){
      swimmers=stepAquariumFish(swimmers,i,w,h,fixedRandom);
      for(const f of swimmers){
        const bounds=aquariumFishBounds(f,w,h);
        assert.ok(f.x>=bounds.left&&f.x<=bounds.right&&f.y>=90&&f.y<=100);
        assert.ok(f.y*h/100-aquariumFishSize(f,w,h)>=0);
      }
    }
    const changed=confineAquariumFish({...swimmers[0],fishSwimZone:"full"},w,h);
    assert.equal(changed.y,71);
  }
});

test("world free swimmers slow down, and floor dwellers crawl close to placement, schooling only nearby", () => {
  const tracks = planWorldFishMotion([
    placed("free", "minnow", .25, .5),
    placed("near-a", "loach", .28, .99), placed("near-b", "loach", .30, .97),
    placed("far", "loach", .8, .99), placed("rare", "rare", .5, .96),
  ], catalog, 500, 240, 1);
  assert.ok(tracks[0].duration >= 68);
  const [_, nearA, nearB, far, rare] = tracks;
  assert.equal(nearA.duration, nearB.duration);
  assert.notEqual(nearA.duration, far.duration);
  assert.ok(Math.abs(nearA.points[3].x - nearB.points[3].x) <= 25);
  assert.equal(Math.sign(nearA.points[5].x - nearA.points[3].x), Math.sign(nearB.points[5].x - nearB.points[3].x));
  for (const track of [nearA, nearB, far, rare]) {
    for (const p of track.points) {
      assert.ok(Math.abs(p.x - track.points[0].x) <= 500 * .11 + 1e-8);
      assert.ok(Math.abs(p.y - track.points[0].y) <= 240 * .013 + 1e-8);
    }
    assert.ok(track.duration >= 65);
  }
});

test("aquarium floor dwellers creep slowly within their home area, even during schooling", () => {
  const loach=catalog.get("loach")!;
  const make=(id:string,x:number)=>confineAquariumFish(makeSwimmer(aquariumEntry(id,loach),x,97,fixedRandom),390,844);
  let fish=[make("a",50),make("b",52),make("distant",85)];
  const tick=(1600-fishSeed(fishSchoolKey("loach",loach)!)%1600)%1600;
  let moved=false;
  for(let i=0;i<1600;i++){
    const before=fish;
    fish=stepAquariumFish(fish,tick+i,390,844,fixedRandom);
    assert.equal(fish[0].schooling,i<850);
    assert.equal(fish[1].schooling,i<850);
    assert.equal(fish[2].schooling,false);
    fish.forEach((f,j)=>{
      assert.equal(f.state,"normal");
      assert.ok(Math.abs(f.x-before[j].x)<=.035+1e-8);
      assert.ok(Math.abs(f.x-f.floorHomeX!)<=6+1e-8);
      assert.ok(Math.abs(f.y-f.floorHomeY!)<=1.25+1e-8);
      if (Math.abs(f.x-f.floorHomeX!)>1) moved=true;
    });
  }
  assert.ok(moved,"floor fish do not freeze in place");
});
