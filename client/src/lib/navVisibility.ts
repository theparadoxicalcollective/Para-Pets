import { useSyncExternalStore } from "react";
import { enhanceHauntedCasinoRoot } from "@/components/world/HauntedCasinoRuntime";

let hidden = false;
const listeners = new Set<() => void>();

const HAUNTED_CASINO_SELECTOR = '[data-testid="haunted-casino-scroll-view"]';

function getHauntedCasinoRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const root = document.querySelector(HAUNTED_CASINO_SELECTOR);
  return root instanceof HTMLElement ? root : null;
}

function isHauntedCasinoOpen(): boolean {
  return Boolean(getHauntedCasinoRoot());
}

function enhanceCasinoIfPresent(): void {
  const root = getHauntedCasinoRoot();
  if (root) enhanceHauntedCasinoRoot(root);
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
  // navigation disappears for the entire lifetime of that full-screen scene.
  // The same observation point mounts the casino-specific hotspot editor/game
  // layer over the generic horizontal scroller without leaking that feature
  // into every other world location.
  let observer: MutationObserver | null = null;
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
    let casinoOpen = isHauntedCasinoOpen();
    enhanceCasinoIfPresent();
    observer = new MutationObserver(() => {
      enhanceCasinoIfPresent();
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
