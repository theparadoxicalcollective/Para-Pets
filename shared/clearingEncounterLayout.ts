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
  const counts = new Map<string, number>();
  const placements = new Map<string, ClusterPlacement>();
  const homes = shuffledHomes(random);
  let nextAnchor = 0;

  return templates.map(template => {
    const key = template?.enemy_id ?? "fallback";
    const occurrence = counts.get(key) ?? 0;
    const clusterId = `${key}:${Math.floor(occurrence / 3)}`;
    counts.set(key, occurrence + 1);

    if (!placements.has(clusterId)) {
      placements.set(clusterId, {
        base: homes[nextAnchor++ % homes.length] ?? { x: .5, y: .55 },
        rotation: randomUnit(random) * Math.PI * 2,
        jitterX: (randomUnit(random) - .5) * .07,
        jitterY: (randomUnit(random) - .5) * .05,
      });
    }

    const placement = placements.get(clusterId)!;
    const member = occurrence % 3;
    const angle = placement.rotation + member * Math.PI * 2 / 3;
    const radius = member === 0 ? randomUnit(random) * 9 : 21 + randomUnit(random) * 18;
    return {
      x: clamp(placement.base.x + placement.jitterX + Math.cos(angle) * radius / 400, .10, .90),
      y: clamp(placement.base.y + placement.jitterY + Math.sin(angle) * radius / 800, .09, .91),
    };
  });
}
