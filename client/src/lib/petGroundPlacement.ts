import type { ActivePetAnchor, PetPresentation } from "@shared/petPresentation";
import type { AlphaBounds } from "./alphaBounds";
import { AUTHORED_SCENE_WIDTH, AUTHORED_SCENE_HEIGHT, dragAuthoredPercentOffset } from "./authoredScenePlacement";
import { scenePointToPlacement } from "./stage";

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

/**
 * Placement must resolve to the same ground point in Admin and on player devices.
 * Use authored part rectangles instead of runtime alpha scans so Safari low-memory
 * rendering cannot shift a pet after Admin saves it.
 */
export function getStablePetGroundPoint(parts: readonly GroundPart[]) {
  return getPetGroundPoint(parts, () => ({ left: 0, top: 0, width: 1, height: 1 }));
}

/** Both axes use the same square artwork coordinates, even inside a scaled phone stage. */
export function dragPetPlacement(value: PetPresentation, dx: number, dy: number, renderedWidth: number): PetPresentation {
  return dragAuthoredPercentOffset(value, dx, dy, renderedWidth);
}

export function dragActivePetAnchor(value: ActivePetAnchor, dx: number, dy: number, renderedWidth: number): ActivePetAnchor {
  return dragAuthoredPercentOffset(value, dx, dy, renderedWidth);
}

// A screen-space spot, independent of artwork bounds and pet size.
export const PET_SPOT = { x: AUTHORED_SCENE_WIDTH / 2, y: 900, widthPercent: 45 } as const;

export function getPetSpotPosition(anchor: ActivePetAnchor = { x: 0, y: 0 }) {
  const spot = scenePointToPlacement(PET_SPOT, { width: AUTHORED_SCENE_WIDTH, height: AUTHORED_SCENE_HEIGHT });
  return { x: (spot?.x ?? 0.5) * 100 + anchor.x, y: (spot?.y ?? 0.9) * 100 + anchor.y };
}

export function getPetPlacementTransform(
  ground: { x: number; y: number },
  value: PetPresentation,
  anchor: ActivePetAnchor = { x: 0, y: 0 },
) {
  const extent = { width: AUTHORED_SCENE_WIDTH, height: AUTHORED_SCENE_HEIGHT };
  const spot = scenePointToPlacement(PET_SPOT, extent);
  const feet = scenePointToPlacement(ground, extent);
  // Retain the authored 1000x1000 artwork coordinate space while expressing
  // the renderer offsets as scene-relative values rather than device pixels.
  const xOffset = ((spot?.x ?? 0.5) - (feet?.x ?? 0.5)) * 100;
  const yOffset = ((spot?.y ?? 0.9) - (feet?.y ?? 0.9)) * 100;
  return {
    transform: `translate(${anchor.x + value.x + xOffset}%, ${anchor.y + value.y + yOffset}%) scale(${value.scale})`,
    transformOrigin: `${(feet?.x ?? 0.5) * 100}% ${(feet?.y ?? 0.9) * 100}%`,
  };
}
export function centerPetPlacement(value: PetPresentation): PetPresentation {
  return { ...value, x: 0, y: 0 };
}
