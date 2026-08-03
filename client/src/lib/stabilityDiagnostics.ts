export function stabilityDiagnostic(event: string, detail: Record<string, unknown> = {}) {
  if (!import.meta.env.DEV) return;
  console.info(`[stability] ${event}`, { path: window.location.pathname, ...detail });
}

export function installPageLifecycleDiagnostics() {
  const beforeUnload = () => stabilityDiagnostic("beforeunload");
  const pageHide = (event: PageTransitionEvent) => stabilityDiagnostic("pagehide", { persisted: event.persisted });
  const pageShow = (event: PageTransitionEvent) => stabilityDiagnostic("pageshow", { persisted: event.persisted });
  const visibility = () => stabilityDiagnostic("visibilitychange", { state: document.visibilityState });
  const popState = () => stabilityDiagnostic("browser-history-navigation");
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);
  window.addEventListener("popstate", popState);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("pagehide", pageHide);
    window.removeEventListener("pageshow", pageShow);
    window.removeEventListener("popstate", popState);
    document.removeEventListener("visibilitychange", visibility);
  };
}
