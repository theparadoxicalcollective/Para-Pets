import assert from "node:assert/strict";
import test from "node:test";
import { parkArtworkShadow } from "../client/src/components/PetParkGroundShadow";

test("park contact shadows follow padded visible art without moving or rescaling it", () => {
  const bounds={left:40,top:20,right:160,bottom:140,width:120,height:120,centerX:100,centerY:80};
  const square=parkArtworkShadow({sourceWidth:200,sourceHeight:200,bounds});
  assert.equal(square.left,0.5);
  assert.ok(Math.abs(square.top-0.685)<1e-8);
  assert.ok(Math.abs(square.width-0.54)<1e-8);
  const wide=parkArtworkShadow({sourceWidth:400,sourceHeight:200,bounds:{...bounds,left:80,right:320,width:240,centerX:200}});
  assert.equal(wide.left,0.5);
  assert.ok(Math.abs(wide.top-0.5925)<1e-8,"object-contain letterboxing must be included");
});
