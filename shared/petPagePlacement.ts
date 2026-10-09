import { z } from "zod";
import { DEFAULT_PET_PRESENTATION, petPresentationSchema, type PetPresentation } from "./petPresentation";

/**
 * Per-page whole-pet offsets are separate from the pet's existing artwork
 * placement. No existing pet placement or saved anchor is migrated.
 * All values are authored relative to the same pet scene, never the viewport.
 */
export const PET_PAGE_KEYS = ["active", "levelUp", "closet", "powerUp"] as const;
export type PetPageKey = (typeof PET_PAGE_KEYS)[number];

export const petPagePlacementSchema = z.object({
  x: petPresentationSchema.shape.x,
  y: petPresentationSchema.shape.y,
  scale: petPresentationSchema.shape.scale,
});
export type PetPagePlacement = z.infer<typeof petPagePlacementSchema>;

export const DEFAULT_PAGE_PLACEMENT: Readonly<PetPagePlacement> = Object.freeze({
  x: 0, y: 0, scale: 1,
});

export const petPagePlacementsSchema = z.object({
  active: petPagePlacementSchema.default(DEFAULT_PAGE_PLACEMENT),
  levelUp: petPagePlacementSchema.optional(),
  closet: petPagePlacementSchema.optional(),
  powerUp: petPagePlacementSchema.optional(),
});
export type PetPagePlacements = z.infer<typeof petPagePlacementsSchema>;

/** Missing pages use the same neutral oval scale as the original Active Pet view. */
export function resolvePetPagePlacement(raw: unknown, page: PetPageKey): PetPagePlacement {
  const parsed = petPagePlacementsSchema.safeParse(raw);
  if (!parsed.success) return { ...DEFAULT_PAGE_PLACEMENT };
  const active = parsed.data.active;
  if (page === "active") return active;
  const override = parsed.data[page];
  return override ?? { ...DEFAULT_PAGE_PLACEMENT };
}

/**
 * Compose an existing per-pet placement with a page adjustment. This preserves
 * the pet's eyes, base/evolution artwork and existing admin-authored position.
 */
export function composePetPagePlacement(
  pet: PetPresentation = DEFAULT_PET_PRESENTATION,
  page: PetPagePlacement = DEFAULT_PAGE_PLACEMENT,
): PetPresentation {
  return {
    ...pet,
    x: Math.max(-100, Math.min(100, pet.x + page.x)),
    y: Math.max(-100, Math.min(100, pet.y + page.y)),
    scale: Math.max(0.2, Math.min(3, +(pet.scale * page.scale).toFixed(4))),
  };
}
