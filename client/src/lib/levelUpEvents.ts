const LEVEL_UP_EVENT = "para_pets_level_up";

export interface LevelUpEventDetail {
  newLevel: number;
  petName?: string;
  petTemplateId?: string | null;
  petInventoryId?: string | null;
}

export function fireLevelUp(newLevel: number, petName?: string, petTemplateId?: string | null, petInventoryId?: string | null) {
  window.dispatchEvent(new CustomEvent(LEVEL_UP_EVENT, { detail: { newLevel, petName, petTemplateId, petInventoryId } }));
}

export function onLevelUp(cb: (detail: LevelUpEventDetail) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<LevelUpEventDetail>).detail);
  window.addEventListener(LEVEL_UP_EVENT, handler);
  return () => window.removeEventListener(LEVEL_UP_EVENT, handler);
}
