import { useLayoutEffect, useSyncExternalStore } from "react";

// Shared spotlight ownership remains available for new avatar/player-level
// onboarding. It is no longer tied to retired "begin-journey" or NPC-tour IDs.
export type PrimaryQuestGuideOwner = string;

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
  return () => { listeners.delete(listener); };
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
  useLayoutEffect(() => {
    setPrimaryQuestGuideOwnerActive(owner, active);
    return () => setPrimaryQuestGuideOwnerActive(owner, false);
  }, [owner, active]);
}
