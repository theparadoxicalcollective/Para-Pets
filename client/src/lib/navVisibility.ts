import { useSyncExternalStore } from "react";

let hidden = false;
const listeners = new Set<() => void>();

export function setNavHidden(next: boolean) {
  if (hidden === next) return;
  hidden = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return hidden;
}

export function useNavHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
