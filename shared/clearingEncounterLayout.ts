export const CLEARING_ENCOUNTER_HOMES = [
  { x: .28, y: .24 }, { x: .48, y: .58 }, { x: .43, y: .82 },
  { x: .68, y: .28 }, { x: .25, y: .72 }, { x: .14, y: .52 },
  { x: .35, y: .43 }, { x: .63, y: .72 }, { x: .86, y: .64 },
  { x: .72, y: .48 },
] as const;

type ClearingHome = { x: number; y: number };
type ClusterPlacement = { base: ClearingHome; rotation: number; jitterX: number; jitterY: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const randomUnit = (random: () => number) => clamp(Number(random()) || 0, 0, .999999);

function shuffledHomes(random: () => number) {
  const homes = CLEARING_ENCOUNTER_HOMES.map(home => ({ ...home }));
  for (let index = homes.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(randomUnit(random) * (index + 1));
    [homes[index], homes[swapIndex]] = [homes[swapIndex], homes[index]];
  }
  return homes;
}

/**
 * Keeps same-species enemies in readable mini-packs, but changes which part of
 * the Clearing each pack occupies and adds restrained per-session scatter.
 * Supplying a seeded random function keeps tests and replays deterministic.
 */
export function layoutClearingEncounter(templates: Array<{ enemy_id?: string } | undefined>, random: () => number = Math.random) {
  const placements = new Map<string, ClusterPlacement>();
  const homes = shuffledHomes(random);
  let nextAnchor = 0;
  const runByIndex:{clusterId:string;member:number;size:number}[]=[];
  const runCounts=new Map<string,number>();
  for(let start=0;start<templates.length;){const key=templates[start]?.enemy_id??"fallback";let end=start+1;while(end<templates.length&&(templates[end]?.enemy_id??"fallback")===key)end++;const run=runCounts.get(key)??0;runCounts.set(key,run+1);for(let index=start;index<end;index++)runByIndex[index]={clusterId:`${key}:${run}`,member:index-start,size:end-start};start=end;}

  return templates.map((template,index) => {
    const key = template?.enemy_id ?? "fallback";
    const {clusterId,member,size}=runByIndex[index]??{clusterId:`${key}:0`,member:0,size:1};

    if (!placements.has(clusterId)) {
      placements.set(clusterId, {
        base: homes[nextAnchor++ % homes.length] ?? { x: .5, y: .55 },
        rotation: randomUnit(random) * Math.PI * 2,
        jitterX: (randomUnit(random) - .5) * .07,
        jitterY: (randomUnit(random) - .5) * .05,
      });
    }

    const placement = placements.get(clusterId)!;
    const angle = placement.rotation + member * Math.PI * 2 / Math.max(1,size);
    const radius = member === 0 ? randomUnit(random) * 9 : 18 + size*2 + randomUnit(random) * 14;
    return {
      x: clamp(placement.base.x + placement.jitterX + Math.cos(angle) * radius / 400, .10, .90),
      y: clamp(placement.base.y + placement.jitterY + Math.sin(angle) * radius / 800, .09, .91),
    };
  });
}
