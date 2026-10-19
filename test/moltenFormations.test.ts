import test from "node:test";
import assert from "node:assert/strict";
import { MOLTEN_FORMATIONS, MOLTEN_FORMATION_WEIGHTS, makeMoltenFormationBag, moltenFormationCells, rotateMoltenFormation } from "../client/src/lib/moltenFormations.ts";

test("all custom formations are connected, rotate four times and fit the board", () => {
  for (const [name, rotations] of Object.entries(MOLTEN_FORMATIONS)) {
    assert.equal(rotations.length,4);
    const original = rotations[0];
    const count = original.flat().filter(Boolean).length;
    assert.ok(count>=2 && count<=7, name);
    for (const matrix of rotations) {
      assert.equal(matrix.flat().filter(Boolean).length,count,name);
      assert.ok(matrix.length<=10 && matrix[0].length<=10,name);
      const occupied = matrix.flatMap((row,r)=>row.flatMap((value,c)=>value?[[r,c]]:[]));
      const visited=new Set<string>();
      const queue=[occupied[0]];
      while(queue.length) {
        const [r,c]=queue.pop()!;
        const key=r+","+c;
        if(visited.has(key))continue;
        visited.add(key);
        for(const [rr,cc] of occupied) if(Math.abs(rr-r)+Math.abs(cc-c)===1 && !visited.has(rr+","+cc))queue.push([rr,cc]);
      }
      assert.equal(visited.size,count,name+" disconnected");
    }
    let rotated=original;
    for(let i=0;i<4;i++)rotated=rotateMoltenFormation(rotated);
    assert.deepEqual(rotated,original,name);
  }
});
test("two-cell Ember Pair and three-cell Ember Hook help repair crowded rows",()=>{
  assert.equal(moltenFormationCells("K"),4);
  assert.deepEqual(MOLTEN_FORMATIONS.K[0],[[1,1,1,1]]);
  assert.equal(moltenFormationCells("Z"),4);
  assert.deepEqual(MOLTEN_FORMATIONS.Z[0],[[1,1,1],[0,1]]);
  assert.equal(moltenFormationCells("T"),3);
  assert.deepEqual(MOLTEN_FORMATIONS.T[0],[[0,1],[1,1]]);
  assert.equal(moltenFormationCells("I"),2);
  assert.deepEqual(MOLTEN_FORMATIONS.I[0],[[1,1]]);
  const bag=makeMoltenFormationBag(()=>0.5);
  assert.equal(bag.filter(x=>x==="I").length,MOLTEN_FORMATION_WEIGHTS.I);
  assert.equal(bag.length,Object.values(MOLTEN_FORMATION_WEIGHTS).reduce((a,b)=>a+b,0));
  assert.ok(bag.filter(x=>x==="I").length>bag.filter(x=>x==="J").length);
});
