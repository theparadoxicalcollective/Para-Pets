import {
  HOUSE_INTERIOR_EFFECT_MAX_COUNT, HOUSE_INTERIOR_EFFECT_MIN_SIZE,
  HOUSE_INTERIOR_EFFECT_MAX_SIZE, isHouseInteriorEffectType,
  sanitizeHouseInteriorEffects, type HouseInteriorEffect,
} from "./housing";
import { isParkWaterEffect, type ParkWaterEffect } from "./petParkEffects";

/** Pet Park-only portal: normal Pet House effects and their renderer are unchanged. */
export type ParkRoomView = "full_page" | "popup";
export interface ParkRoomEffect {
  id: string;
  type: "room";
  x: number;
  y: number;
  size: number;
  name: string;
  imageUrl: string | null;
  view: ParkRoomView;
  maxPets: number;
}
export type ParkInteriorWaterEffect = {
  id: string; type: ParkWaterEffect; x: number; y: number; size: number;
};
export type ParkInteriorEffect = HouseInteriorEffect | ParkRoomEffect | ParkInteriorWaterEffect;
export const PARK_ROOM_MAX_PETS = 25;
export const PARK_ROOM_MIN_PETS = 1;
export const PARK_ROOM_DEFAULT_PETS = 3;

export function isParkRoomEffect(effect: ParkInteriorEffect): effect is ParkRoomEffect {
  return effect.type === "room";
}

/** Never trust a client-provided room image URL; only an existing saved URL or
 * one uploaded through the server's image processor can enter park JSON.
 */
export function sanitizeParkInteriorEffects(
  value: unknown, existing: readonly ParkInteriorEffect[] = [],
): ParkInteriorEffect[] {
  if (!Array.isArray(value)) return [];
  const savedRooms = new Map(existing.filter(isParkRoomEffect).map(room => [room.id, room]));
  const result: ParkInteriorEffect[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const parsed = item.type === "room" ? sanitizeRoom(item, savedRooms) :
      isParkWaterEffect(item.type) ? sanitizeWaterEffect(item) :
      isHouseInteriorEffectType(item.type) ? sanitizeHouseInteriorEffects([item])[0] : null;
    if (!parsed || ids.has(parsed.id)) continue;
    ids.add(parsed.id);
    result.push(parsed);
    if (result.length >= HOUSE_INTERIOR_EFFECT_MAX_COUNT) break;
  }
  return result;
}

function sanitizeWaterEffect(item: Record<string, unknown>): ParkInteriorWaterEffect | null {
  if (!isParkWaterEffect(item.type)) return null;
  // Reuse the same ID, placement, and size validation as regular Home
  // interior effects. Only the effect TYPE is Pet Park-specific.
  const base = sanitizeHouseInteriorEffects([{ ...item, type: "soft_mist" }])[0];
  return base ? { ...base, type: item.type } : null;
}

function sanitizeRoom(
  entry: Record<string, unknown>, existing: Map<string, ParkRoomEffect>,
): ParkRoomEffect | null {
  const id = typeof entry.id === "string" ? entry.id.trim().slice(0, 64) : "";
  if (!id) return null;
  const finite = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 60) : "";
  const view: ParkRoomView = entry.view === "full_page" ? "full_page" : "popup";
  const capacity = Math.round(finite(entry.maxPets, PARK_ROOM_DEFAULT_PETS));
  const saved = existing.get(id);
  return {
    id, type: "room",
    x: Math.max(0, Math.min(1, finite(entry.x, 0.5))),
    y: Math.max(0, Math.min(1, finite(entry.y, 0.5))),
    size: Math.max(HOUSE_INTERIOR_EFFECT_MIN_SIZE,
      Math.min(HOUSE_INTERIOR_EFFECT_MAX_SIZE, finite(entry.size, 14))),
    name: name || "Magical Room",
    imageUrl: saved?.imageUrl ?? null,
    view,
    maxPets: Math.max(PARK_ROOM_MIN_PETS, Math.min(PARK_ROOM_MAX_PETS, capacity)),
  };
}

/** A pet can occupy a portal only if it opens a full room with an uploaded image. */
export function isPetAccessibleParkRoom(room: ParkInteriorEffect | undefined | null): room is ParkRoomEffect {
  return !!room && room.type === "room" && room.view === "full_page" && !!room.imageUrl;
}
