import { useEffect, useSyncExternalStore } from "react";

export type PrimaryQuestGuideOwner = "begin-journey" | "npc-discovery";

const activeOwners = new Set<PrimaryQuestGuideOwner>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setPrimaryQuestGuideOwnerActive(
  owner: PrimaryQuestGuideOwner,
  active: boolean,
) {
  const changed = active ? !activeOwners.has(owner) : activeOwners.has(owner);
  if (!changed) return;

  if (active) activeOwners.add(owner);
  else activeOwners.delete(owner);
  emit();
}

export function isPrimaryQuestGuideActive(): boolean {
  return activeOwners.size > 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrimaryQuestGuideActive(): boolean {
  return useSyncExternalStore(
    subscribe,
    isPrimaryQuestGuideActive,
    () => false,
  );
}

export function usePrimaryQuestGuideOwner(
  owner: PrimaryQuestGuideOwner,
  active: boolean,
) {
  useEffect(() => {
    setPrimaryQuestGuideOwnerActive(owner, active);
    return () => setPrimaryQuestGuideOwnerActive(owner, false);
  }, [owner, active]);
}
