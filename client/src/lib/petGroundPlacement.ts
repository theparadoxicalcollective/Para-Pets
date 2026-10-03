import type { PetPresentation } from "@shared/petPresentation";
import type { AlphaBounds } from "./alphaBounds";

export interface GroundPart { partType: string; posX: number; posY: number; width: number; height: number; imageUrl: string; rotation?: number; pivotX?: number; pivotY?: number }

/** Anchor to visible feet, rather than transparent image padding or wings. */
export function getPetGroundPoint(parts: readonly GroundPart[], bounds: (url: string) => AlphaBounds) {
  const feet = parts.filter(p => /(?:^|_)(?:leg|foot)(?:_|$)/.test(p.partType));
  const anchors = feet.length ? feet : parts.filter(p => /^(body|back_full|head)$/.test(p.partType));
  const selected = anchors.length ? anchors : parts;
  if (!selected.length) return { x: 500, y: 900 };
  const points = selected.flatMap(p => {
    const b = bounds(p.imageUrl);
    const px = p.posX + p.width * (b.left + b.width * (p.pivotX ?? 50) / 100);
    const py = p.posY + p.height * (b.top + b.height * (p.pivotY ?? 50) / 100);
    const angle = (p.rotation ?? 0) * Math.PI / 180;
    return [b.left, b.left + b.width].flatMap(x => [b.top, b.top + b.height].map(y => {
      const dx = p.posX + x * p.width - px, dy = p.posY + y * p.height - py;
      return { x: px + dx * Math.cos(angle) - dy * Math.sin(angle), y: py + dx * Math.sin(angle) + dy * Math.cos(angle) };
    }));
  });
  return { x: (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2, y: Math.max(...points.map(p => p.y)) };
}

/** Both axes use the same square artwork coordinates, even inside a scaled phone stage. */
export function dragPetPlacement(value: PetPresentation, dx: number, dy: number, renderedWidth: number): PetPresentation {
  if (renderedWidth <= 0) return value;
  const clamp = (n: number) => Math.max(-100, Math.min(100, n));
  return { ...value, x: clamp(value.x + dx / renderedWidth * 100), y: clamp(value.y + dy / renderedWidth * 100) };
}

// A screen-space spot, independent of artwork bounds and pet size.
export const PET_SPOT = { x: 500, y: 900, widthPercent: 45 } as const;

export function getPetPlacementTransform(ground: { x: number; y: number }, value: PetPresentation) {
  return {
    transform: `translate(${value.x + (PET_SPOT.x - ground.x) / 10}%, ${value.y + (PET_SPOT.y - ground.y) / 10}%) scale(${value.scale})`,
    transformOrigin: `${ground.x / 10}% ${ground.y / 10}%`,
  };
}
export function centerPetPlacement(value: PetPresentation): PetPresentation {
  return { ...value, x: 0, y: 0 };
}
