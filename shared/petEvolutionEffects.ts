export const EVOLUTION_PET_EFFECT_TYPES = ["sparkle", "smoke", "light_ball"] as const;
export type EvolutionPetEffectType = typeof EVOLUTION_PET_EFFECT_TYPES[number];

export interface EvolutionPetEffect {
  id: string;
  type: EvolutionPetEffectType;
  view: "front" | "back";
  xPct: number;
  yPct: number;
  sizePct: number;
  color?: string;
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_EVOLUTION_EFFECT_COLOR: Readonly<Record<Exclude<EvolutionPetEffectType, "smoke">, string>> = {
  sparkle: "#fff2a8",
  light_ball: "#86e7ff",
};

export function evolutionPetEffectCountsTowardAnimationBudget(type: string): boolean {
  return EVOLUTION_PET_EFFECT_TYPES.includes(type as EvolutionPetEffectType);
}

export function sanitizeEvolutionPetEffects(value: unknown): EvolutionPetEffect[] {
  if (!Array.isArray(value)) return [];

  const effects: EvolutionPetEffect[] = [];
  for (const raw of value.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Record<string, unknown>;
    if (!EVOLUTION_PET_EFFECT_TYPES.includes(candidate.type as EvolutionPetEffectType)) continue;

    const type = candidate.type as EvolutionPetEffectType;
    const id = typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim().slice(0, 80)
      : `effect-${effects.length + 1}`;
    const view = candidate.view === "back" ? "back" : "front";
    const rawX = Number(candidate.xPct);
    const rawY = Number(candidate.yPct);
    const rawSize = Number(candidate.sizePct);
    const xPct = Math.max(0, Math.min(1, Number.isFinite(rawX) ? rawX : 0.5));
    const yPct = Math.max(0, Math.min(1, Number.isFinite(rawY) ? rawY : 0.5));
    const sizePct = Math.max(6, Math.min(80, Number.isFinite(rawSize) ? rawSize : (type === "smoke" ? 34 : 24)));

    const effect: EvolutionPetEffect = { id, type, view, xPct, yPct, sizePct };
    if (type !== "smoke") {
      effect.color = typeof candidate.color === "string" && COLOR_RE.test(candidate.color)
        ? candidate.color
        : DEFAULT_EVOLUTION_EFFECT_COLOR[type];
    }
    effects.push(effect);
  }
  return effects;
}
