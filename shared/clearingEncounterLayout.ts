export const CLEARING_ENCOUNTER_HOMES = [
  { x: .28, y: .24 }, { x: .48, y: .58 }, { x: .43, y: .82 },
  { x: .68, y: .28 }, { x: .25, y: .72 }, { x: .14, y: .52 },
  { x: .35, y: .43 }, { x: .63, y: .72 }, { x: .86, y: .64 },
  { x: .72, y: .48 },
] as const;

export function layoutClearingEncounter(templates: Array<{ enemy_id?: string } | undefined>) {
  const counts = new Map<string, number>(), anchors = new Map<string, number>();
  let nextAnchor = 0;
  return templates.map(template => {
    const key = template?.enemy_id ?? "fallback", occurrence = counts.get(key) ?? 0;
    const clusterId = `${key}:${Math.floor(occurrence / 3)}`;
    counts.set(key, occurrence + 1);
    if (!anchors.has(clusterId)) anchors.set(clusterId, nextAnchor++);
    const base = CLEARING_ENCOUNTER_HOMES[(anchors.get(clusterId) ?? 0) % CLEARING_ENCOUNTER_HOMES.length];
    const member = occurrence % 3, angle = member * Math.PI * 2 / 3 - Math.PI / 2, radius = member === 0 ? 0 : 26;
    return { x: base.x + Math.cos(angle) * radius / 400, y: base.y + Math.sin(angle) * radius / 800 };
  });
}
