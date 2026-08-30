import { createRoot } from "react-dom/client";
import RootEntry from "./RootEntry";
import { detectRuntimeMode } from "./lib/runtimeMode";
import "./index.css";
import "./tabletStageShell.css";
import "./petCarePolish.css";
import "./clearingBossPolish.css";
import "./soulExchangeCardPolish.css";
import "./activePetRewardAssets.css";
import "./hubPageOverrides.css";

declare const __BUILD_ID__: string;

function setAppHeight() {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}
setAppHeight();
window.addEventListener("resize", setAppHeight);

// ── Global error reporter ─────────────────────────────────────────────────────
// Captures unhandled JS errors and promise rejections that bypass React's
// ErrorBoundary (e.g. ResizeObserver callbacks, native event handlers).
// Keep a local copy for immediate support/debugging and also send a bounded,
// privacy-safe production diagnostic so iOS/PWA failures survive a reload.

// Patterns that are browser quirks or handled gracefully — never worth showing to players
const BENIGN_ERROR_PATTERNS = [
  /ResizeObserver loop/i,
  /ResizeObserver/i,
  /Non-Error promise rejection captured/i,
  /NetworkError/i,
  /Failed to fetch/i,
  /Load failed/i,
  /fetch.*cancelled/i,
  /AbortError/i,
  /cancelled/i,
  /The operation was aborted/i,
  /401/,
  /403/,
  /404/,
];

function isBenign(msg: string): boolean {
  return BENIGN_ERROR_PATTERNS.some((p) => p.test(msg));
}

const recentDiagnosticKeys = new Map<string, number>();
const DIAGNOSTIC_DEDUPE_MS = 30_000;

function reportDiagnostic(event: "error" | "unhandledrejection", message: string, source: string) {
  if (!import.meta.env.PROD) return;

  const now = Date.now();
  const dedupeKey = `${event}:${message}:${source}`.slice(0, 800);
  const previous = recentDiagnosticKeys.get(dedupeKey) ?? 0;
  if (now - previous < DIAGNOSTIC_DEDUPE_MS) return;
  recentDiagnosticKeys.set(dedupeKey, now);

  // Keep the tiny dedupe map bounded during long play sessions.
  if (recentDiagnosticKeys.size > 40) {
    for (const [key, timestamp] of recentDiagnosticKeys) {
      if (now - timestamp > DIAGNOSTIC_DEDUPE_MS) recentDiagnosticKeys.delete(key);
    }
  }

  let runtime = "unknown";
  try {
    const mode = detectRuntimeMode();
    runtime = `${mode.displayMode}:${mode.browserClassification}`;
  } catch (_) {}

  const payload = {
    event,
    message: message.slice(0, 500),
    source: source.slice(0, 200),
    path: window.location.pathname,
    buildId: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown",
    runtime,
  };

  void fetch("/api/client-diagnostics", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Diagnostics must never become a new source of player-visible failures.
  });
}

function storeError(msg: string, source?: string, event: "error" | "unhandledrejection" = "error") {
  try {
    const message = String(msg).slice(0, 500);
    if (isBenign(message)) return;
    const safeSource = String(source ?? "").slice(0, 200);
    const entry = JSON.stringify({ msg: message, source: safeSource, ts: Date.now() });
    localStorage.setItem("__para_last_error", entry);
    reportDiagnostic(event, message, safeSource);
  } catch (_) {}
}

window.addEventListener("error", (e) => {
  storeError(e.message ?? String(e.error), e.filename ? `${e.filename}:${e.lineno}` : "window.onerror", "error");
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
  storeError(msg, "unhandledrejection", "unhandledrejection");
});

createRoot(document.getElementById("root")!).render(<RootEntry />);
