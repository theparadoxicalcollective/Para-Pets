const LEVEL_UP_EVENT = "para_pets_level_up";

export function fireLevelUp(newLevel: number, petName?: string, petTemplateId?: string | null) {
  window.dispatchEvent(new CustomEvent(LEVEL_UP_EVENT, { detail: { newLevel, petName, petTemplateId } }));
}

export function onLevelUp(cb: (detail: { newLevel: number; petName?: string; petTemplateId?: string | null }) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(LEVEL_UP_EVENT, handler);
  return () => window.removeEventListener(LEVEL_UP_EVENT, handler);
}
