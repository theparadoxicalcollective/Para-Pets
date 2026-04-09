import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function setAppHeight() {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}
setAppHeight();
window.addEventListener("resize", setAppHeight);

// ── Global error reporter ─────────────────────────────────────────────────────
// Captures unhandled JS errors and promise rejections that bypass React's
// ErrorBoundary (e.g. ResizeObserver callbacks, native event handlers).
// Stored in localStorage so it survives a full page reload / PWA restart.

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

function storeError(msg: string, source?: string) {
  try {
    const message = String(msg).slice(0, 500);
    if (isBenign(message)) return;
    const entry = JSON.stringify({ msg: message, source: String(source ?? "").slice(0, 200), ts: Date.now() });
    localStorage.setItem("__para_last_error", entry);
  } catch (_) {}
}

window.addEventListener("error", (e) => {
  storeError(e.message ?? String(e.error), e.filename ? `${e.filename}:${e.lineno}` : "window.onerror");
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
  storeError(msg, "unhandledrejection");
});

createRoot(document.getElementById("root")!).render(<App />);
