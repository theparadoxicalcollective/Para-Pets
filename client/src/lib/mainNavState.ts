import { useSyncExternalStore } from "react";

// The main navigation lives outside individual page components. Keep its
// actual open state observable by quest guides instead of inferring it from
// DOM snapshots that do not re-render when the menu changes.
let open = false;
const subscribers = new Set<() => void>();

export function setMainNavOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  subscribers.forEach(callback => callback());
}

export function getMainNavOpen(): boolean {
  return open;
}

export function subscribeMainNav(callback: () => void): () => void {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

export function useMainNavOpen(): boolean {
  return useSyncExternalStore(subscribeMainNav, getMainNavOpen, () => false);
}
