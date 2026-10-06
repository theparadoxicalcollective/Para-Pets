import { useSyncExternalStore } from "react";
import { enhanceHauntedCasinoRoot } from "@/components/world/HauntedCasinoRuntime";

let hidden = false;
const listeners = new Set<() => void>();

const HAUNTED_CASINO_SELECTOR = '[data-testid="haunted-casino-scroll-view"]';
const GLOBAL_HUD_BLOCKER_SELECTOR = [
  '[data-global-hud-blocker="true"]',
  '[aria-modal="true"]',
  '[data-quest-guide-blocker="true"]',
].join(",");

function getHauntedCasinoRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const root = document.querySelector(HAUNTED_CASINO_SELECTOR);
  return root instanceof HTMLElement ? root : null;
}

function isHauntedCasinoOpen(): boolean {
  return Boolean(getHauntedCasinoRoot());
}

function isPlayerMarketOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/market";
}

function isGlobalHudBlockerOpen(): boolean {
  if (typeof document === "undefined") return false;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(GLOBAL_HUD_BLOCKER_SELECTOR));
  return nodes.some((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width <= 3 || rect.height <= 3) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity || "1") <= 0.05) return false;
    return node.getAttribute("aria-hidden") !== "true";
  });
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

  // FloatingNav and TopBar live in the global viewport HUD, while many
  // full-screen panels and dialogs live lower in page/stage layers. Observe
  // modal ownership centrally so chrome yields whenever a real blocking popup
  // is mounted instead of forcing every popup into a z-index arms race.
  let observer: MutationObserver | null = null;
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
    let casinoOpen = isHauntedCasinoOpen();
    let blockerOpen = isGlobalHudBlockerOpen();
    enhanceCasinoIfPresent();
    observer = new MutationObserver(() => {
      enhanceCasinoIfPresent();
      const nextCasinoOpen = isHauntedCasinoOpen();
      const nextBlockerOpen = isGlobalHudBlockerOpen();
      if (nextCasinoOpen === casinoOpen && nextBlockerOpen === blockerOpen) return;
      casinoOpen = nextCasinoOpen;
      blockerOpen = nextBlockerOpen;
      cb();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "style",
        "class",
        "aria-hidden",
        "aria-modal",
        "data-global-hud-blocker",
        "data-quest-guide-blocker",
      ],
    });
  }

  return () => {
    listeners.delete(cb);
    observer?.disconnect();
  };
}

function getSnapshot() {
  return hidden || isHauntedCasinoOpen() || isPlayerMarketOpen() || isGlobalHudBlockerOpen();
}

function getServerSnapshot() {
  return hidden;
}

export function useNavHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}