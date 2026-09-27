export const NPC_PHASES = [
  "sad", "happy", "talking_casual", "talking_eyes_closed",
  "angry", "shocked", "flirty", "scared",
] as const;

export type NpcPhase = typeof NPC_PHASES[number];

export function isNpcPhase(value: unknown): value is NpcPhase {
  return typeof value === "string" && (NPC_PHASES as readonly string[]).includes(value);
}

export function npcPhaseLabel(phase: NpcPhase): string {
  return phase.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
