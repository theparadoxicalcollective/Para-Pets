import { useSyncExternalStore } from "react";

let hidden = false;
const listeners = new Set<() => void>();

const HAUNTED_CASINO_SELECTOR = '[data-testid="haunted-casino-scroll-view"]';

function isHauntedCasinoOpen(): boolean {
  return typeof document !== "undefined" && Boolean(document.querySelector(HAUNTED_CASINO_SELECTOR));
}

export function setNavHidden(next: boolean) {
  if (hidden === next) return;
  hidden = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);

  // The Haunted Casino overlay is owned by WorldLocations, while FloatingNav
  // lives higher in the app tree. Observe the overlay's presence so the main
  // navigation disappears for the entire lifetime of that full-screen scene
  // without coupling the two components together or leaking casino state into
  // unrelated world/location flows.
  let observer: MutationObserver | null = null;
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
    let casinoOpen = isHauntedCasinoOpen();
    observer = new MutationObserver(() => {
      const nextCasinoOpen = isHauntedCasinoOpen();
      if (nextCasinoOpen === casinoOpen) return;
      casinoOpen = nextCasinoOpen;
      cb();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  return () => {
    listeners.delete(cb);
    observer?.disconnect();
  };
}

function getSnapshot() {
  return hidden || isHauntedCasinoOpen();
}

function getServerSnapshot() {
  return hidden;
}

export function useNavHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
