import { lazy, type ComponentType } from "react";

/**
 * Wrap React.lazy with stale-deploy recovery.
 *
 * When we ship a new build, the in-flight tab still has the OLD index.js,
 * which references lazy chunks by their old hashed filenames
 * (e.g. /assets/MapPage-CCTfZtqC.js). After redeploy those files are gone,
 * so the SPA's catch-all returns index.html with content-type text/html,
 * and the browser refuses to execute it as a module → the user sees a
 * "'text/html' is not a valid JavaScript MIME type" / ChunkLoadError.
 *
 * Strategy:
 *  1. On the first failure, mark a sessionStorage flag and force a full
 *     reload so the browser fetches the fresh index.html with the new
 *     asset hashes — the failed page will just work after the reload.
 *  2. If the import fails AGAIN after we already reloaded once this
 *     session, the problem is real (network/parse error), so we re-throw
 *     and let the ErrorBoundary show the crash card.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    const RELOAD_KEY = "__para_chunk_reloaded";
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "");
      const looksLikeChunkLoadError =
        err?.name === "ChunkLoadError" ||
        /Loading chunk|Loading CSS chunk|dynamically imported module|MIME type|Failed to fetch dynamically/i.test(msg);
      const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
      if (looksLikeChunkLoadError && !alreadyReloaded) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        // Hard reload so the browser drops cached index.html and re-fetches
        // the new asset manifest. Use replace() to avoid back-button getting
        // stuck on the broken state.
        window.location.reload();
        // Return a never-resolving promise so React doesn't keep retrying
        // while the reload is in flight.
        return new Promise(() => {}) as never;
      }
      throw err;
    }
  });
}

// Call this from a successful render path (e.g. App mount) to reset the
// reload-once flag so a future stale deploy can recover again.
export function clearChunkReloadFlag() {
  try { sessionStorage.removeItem("__para_chunk_reloaded"); } catch (_) {}
}
