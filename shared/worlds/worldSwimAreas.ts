import { isParkGroundLevel, parkGroundSize, parkExpandedCoordinate } from "../petParkGround";

export type SwimPoint = { x: number; y: number };
export type SwimBounds = SwimPoint & { width: number; height: number };
export type WorldSwimFish = SwimPoint & { id: string; fishId: string };
export type WorldSwimArea = SwimBounds & {
  id: string; buildingId: string | null; groundLevel: number; fish: WorldSwimFish[];
};
export type WorldFishCatalogEntry = {
  id: string; name: string; imageUrl: string | null; facingDirection: string | null;
  starRarity: number | null; fishSwimZone: string | null;
};
export type WorldSwimScene = { swimAreas: WorldSwimArea[]; swimFish: WorldFishCatalogEntry[] };
export const SWIM_AREA_LIMIT = 40;
export const SWIM_FISH_LIMIT = 80;
export const SWIM_FISH_PER_AREA = 12;
const id = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const fraction = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function validSwimAreas(value: unknown): value is WorldSwimArea[] {
  if (!Array.isArray(value) || value.length > SWIM_AREA_LIMIT) return false;
  const seen = new Set<string>();
  let total = 0;
  for (const a of value) {
    if (!record(a) || !id(a.id) || seen.has(a.id) || !(a.buildingId === null || id(a.buildingId)) ||
      !isParkGroundLevel(a.groundLevel) || !fraction(a.x) || !fraction(a.y) ||
      !fraction(a.width) || !fraction(a.height) || a.width < .005 || a.height < .005 ||
      a.x + a.width > 1 + 1e-9 || a.y + a.height > 1 + 1e-9 ||
      !Array.isArray(a.fish) || a.fish.length > SWIM_FISH_PER_AREA) return false;
    seen.add(a.id);
    for (const f of a.fish) {
      if (!record(f) || !id(f.id) || seen.has(f.id) || !id(f.fishId) || !fraction(f.x) || !fraction(f.y)) return false;
      seen.add(f.id);
      if (++total > SWIM_FISH_LIMIT) return false;
    }
  }
  return true;
}
export function readSwimAreas(value: string | undefined): WorldSwimArea[] {
  try { const parsed: unknown = JSON.parse(value ?? "[]"); return validSwimAreas(parsed) ? parsed : []; }
  catch { return []; }
}
export const swimAreaKey = (worldId: string) => `world-swim-areas:${worldId}`;
export function swimAreaBounds(a: WorldSwimArea, level: number): SwimBounds {
  if (a.buildingId || level === a.groundLevel) return a;
  const previous = parkGroundSize(a.groundLevel), next = parkGroundSize(level);
  return { x: parkExpandedCoordinate(a.x, previous.width, next.width),
    y: parkExpandedCoordinate(a.y, previous.height, next.height),
    width: a.width * previous.width / next.width, height: a.height * previous.height / next.height };
}
export function containsSwimPoint(b: SwimBounds, p: SwimPoint): boolean {
  return p.x >= b.x && p.y >= b.y && p.x <= b.x + b.width && p.y <= b.y + b.height;
}
