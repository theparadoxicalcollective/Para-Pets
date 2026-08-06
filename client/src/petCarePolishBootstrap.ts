import { queryClient } from "@/lib/queryClient";
import { installPetCareDragPolish } from "./petCarePolish";

const PET_CARE_OVERLAY_SELECTOR = ".pet-care-overlay";
const PET_CARE_SCOPE_REFRESH_MS = 750;

type MutableQueryCache = {
  subscribe: (...args: any[]) => any;
};

/**
 * Pet Care's interaction helper is installed from the app entry point because
 * it owns capture-phase pointer handling. Its optional stack-count polish must
 * not observe the whole application, though: doing so makes every animated DOM
 * update on Home wake Pet Care work that has nothing to do with the active
 * route.
 *
 * This bootstrap captures the one document-wide observer/subscriber created by
 * the legacy helper and scopes both callbacks to the mounted Pet Care overlay.
 * Dragging, petting, stack counts, and drop sparkles keep their existing code;
 * Home and the shared PetAnimator remain completely outside the observer scope.
 */
export function installScopedPetCareDragPolish(): void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") {
    installPetCareDragPolish();
    return;
  }

  const originalObserve = MutationObserver.prototype.observe;
  const queryCache = queryClient.getQueryCache() as unknown as MutableQueryCache;
  const originalSubscribe = queryCache.subscribe;

  let quantityObserver: MutationObserver | null = null;
  let observedOverlay: HTMLElement | null = null;
  let guardedQuantityListener: ((event?: unknown) => void) | null = null;
  let quantitySubscriptionCaptured = false;

  const patchedObserve = function (
    this: MutationObserver,
    target: Node,
    options?: MutationObserverInit,
  ): void {
    if (
      target === document.documentElement
      && options?.childList === true
      && options?.subtree === true
    ) {
      quantityObserver = this;
      return;
    }
    originalObserve.call(this, target, options);
  };

  const patchedSubscribe = (listener: (...args: any[]) => void) => {
    if (!quantitySubscriptionCaptured) {
      quantitySubscriptionCaptured = true;
      guardedQuantityListener = (event?: unknown) => {
        if (observedOverlay?.isConnected) listener(event);
      };
      return originalSubscribe.call(queryCache, guardedQuantityListener);
    }
    return originalSubscribe.call(queryCache, listener);
  };

  MutationObserver.prototype.observe = patchedObserve;
  queryCache.subscribe = patchedSubscribe;
  try {
    installPetCareDragPolish();
  } finally {
    MutationObserver.prototype.observe = originalObserve;
    queryCache.subscribe = originalSubscribe;
  }

  const refreshPetCareScope = () => {
    const nextOverlay = document.querySelector<HTMLElement>(PET_CARE_OVERLAY_SELECTOR);
    if (nextOverlay === observedOverlay) return;

    quantityObserver?.disconnect();
    observedOverlay = nextOverlay;

    if (quantityObserver && nextOverlay) {
      originalObserve.call(quantityObserver, nextOverlay, {
        childList: true,
        subtree: true,
      });
      guardedQuantityListener?.();
    }
  };

  // Pet Care is routed inside the SPA, so a tiny low-frequency route check is
  // enough to attach/detach the observer without watching Home's animated DOM.
  refreshPetCareScope();
  window.setInterval(refreshPetCareScope, PET_CARE_SCOPE_REFRESH_MS);
  window.addEventListener("pageshow", refreshPetCareScope);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshPetCareScope();
      return;
    }
    quantityObserver?.disconnect();
    observedOverlay = null;
  });
}
