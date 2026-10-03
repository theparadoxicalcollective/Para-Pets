export interface ActivePetFrameSetting {
  offsetXPct: number;
  offsetYPct: number;
}

export interface ActivePetTemplateLayout {
  activeDisplayX: number;
  activeDisplayY: number;
  activeDisplayScale: number;
  xEyesBaseX: number;
  xEyesBaseY: number;
  xEyesBaseScale: number;
  xEyesEvolutionX: number;
  xEyesEvolutionY: number;
  xEyesEvolutionScale: number;
}

export interface PetXEyesPlacement {
  x: number;
  y: number;
  scale: number;
}

export const ACTIVE_PET_FRAME_OFFSET_MIN = -35;
export const ACTIVE_PET_FRAME_OFFSET_MAX = 35;

export const ACTIVE_PET_DISPLAY_X_MIN = -40;
export const ACTIVE_PET_DISPLAY_X_MAX = 40;
export const ACTIVE_PET_DISPLAY_Y_MIN = -35;
export const ACTIVE_PET_DISPLAY_Y_MAX = 35;
export const ACTIVE_PET_DISPLAY_SCALE_MIN = 60;
export const ACTIVE_PET_DISPLAY_SCALE_MAX = 180;

export const PET_X_EYES_COORD_MIN = 0;
export const PET_X_EYES_COORD_MAX = 1000;
export const PET_X_EYES_SCALE_MIN = 45;
export const PET_X_EYES_SCALE_MAX = 180;

export const DEFAULT_ACTIVE_PET_FRAME: ActivePetFrameSetting = {
  offsetXPct: 0,
  offsetYPct: 0,
};

export const DEFAULT_ACTIVE_PET_TEMPLATE_LAYOUT: ActivePetTemplateLayout = {
  // Preserve the existing Active Pet page appearance as the migration default.
  activeDisplayX: 0,
  activeDisplayY: 8,
  activeDisplayScale: 112,
  // Matches the original PetFireReaction overlay closely in the logical
  // 1000x1000 pet canvas while making the placement authorable per form.
  xEyesBaseX: 500,
  xEyesBaseY: 390,
  xEyesBaseScale: 100,
  xEyesEvolutionX: 500,
  xEyesEvolutionY: 390,
  xEyesEvolutionScale: 100,
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeActivePetFrame(value: unknown): ActivePetFrameSetting {
  const raw = value && typeof value === "object" ? value as Partial<ActivePetFrameSetting> : {};
  return {
    offsetXPct: clamp(
      finiteOr(raw.offsetXPct, DEFAULT_ACTIVE_PET_FRAME.offsetXPct),
      ACTIVE_PET_FRAME_OFFSET_MIN,
      ACTIVE_PET_FRAME_OFFSET_MAX,
    ),
    offsetYPct: clamp(
      finiteOr(raw.offsetYPct, DEFAULT_ACTIVE_PET_FRAME.offsetYPct),
      ACTIVE_PET_FRAME_OFFSET_MIN,
      ACTIVE_PET_FRAME_OFFSET_MAX,
    ),
  };
}

export function sanitizeActivePetTemplateLayout(
  value: Partial<ActivePetTemplateLayout> | null | undefined,
): ActivePetTemplateLayout {
  const raw = value ?? {};
  const d = DEFAULT_ACTIVE_PET_TEMPLATE_LAYOUT;
  return {
    activeDisplayX: Math.round(clamp(finiteOr(raw.activeDisplayX, d.activeDisplayX), ACTIVE_PET_DISPLAY_X_MIN, ACTIVE_PET_DISPLAY_X_MAX)),
    activeDisplayY: Math.round(clamp(finiteOr(raw.activeDisplayY, d.activeDisplayY), ACTIVE_PET_DISPLAY_Y_MIN, ACTIVE_PET_DISPLAY_Y_MAX)),
    activeDisplayScale: Math.round(clamp(finiteOr(raw.activeDisplayScale, d.activeDisplayScale), ACTIVE_PET_DISPLAY_SCALE_MIN, ACTIVE_PET_DISPLAY_SCALE_MAX)),
    xEyesBaseX: Math.round(clamp(finiteOr(raw.xEyesBaseX, d.xEyesBaseX), PET_X_EYES_COORD_MIN, PET_X_EYES_COORD_MAX)),
    xEyesBaseY: Math.round(clamp(finiteOr(raw.xEyesBaseY, d.xEyesBaseY), PET_X_EYES_COORD_MIN, PET_X_EYES_COORD_MAX)),
    xEyesBaseScale: Math.round(clamp(finiteOr(raw.xEyesBaseScale, d.xEyesBaseScale), PET_X_EYES_SCALE_MIN, PET_X_EYES_SCALE_MAX)),
    xEyesEvolutionX: Math.round(clamp(finiteOr(raw.xEyesEvolutionX, d.xEyesEvolutionX), PET_X_EYES_COORD_MIN, PET_X_EYES_COORD_MAX)),
    xEyesEvolutionY: Math.round(clamp(finiteOr(raw.xEyesEvolutionY, d.xEyesEvolutionY), PET_X_EYES_COORD_MIN, PET_X_EYES_COORD_MAX)),
    xEyesEvolutionScale: Math.round(clamp(finiteOr(raw.xEyesEvolutionScale, d.xEyesEvolutionScale), PET_X_EYES_SCALE_MIN, PET_X_EYES_SCALE_MAX)),
  };
}

export function petXEyesPlacementForForm(
  layout: ActivePetTemplateLayout,
  form: "base" | "evolution",
): PetXEyesPlacement {
  return form === "evolution"
    ? { x: layout.xEyesEvolutionX, y: layout.xEyesEvolutionY, scale: layout.xEyesEvolutionScale }
    : { x: layout.xEyesBaseX, y: layout.xEyesBaseY, scale: layout.xEyesBaseScale };
}
