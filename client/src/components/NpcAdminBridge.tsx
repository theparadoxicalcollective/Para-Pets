import { createRoot, type Root } from "react-dom/client";
import NpcAdminPanel from "@/components/NpcAdminPanel";

// The Add Character tabs currently live inline inside AdminPage. Keep the NPC
// implementation isolated in its own component and attach it to the existing
// NPC placeholder until those tabs are extracted into a dedicated component.
let mountedTarget: Element | null = null;
let mountedRoot: Root | null = null;
let observer: MutationObserver | null = null;

function syncNpcAdminMount() {
  if (typeof document === "undefined") return;
  const nextTarget = document.querySelector('[data-testid="panel-npc-placeholder"]');

  if (mountedTarget && (!mountedTarget.isConnected || mountedTarget !== nextTarget)) {
    mountedRoot?.unmount();
    mountedRoot = null;
    mountedTarget = null;
  }

  if (!nextTarget || mountedTarget === nextTarget) return;
  nextTarget.replaceChildren();
  const root = createRoot(nextTarget);
  root.render(<NpcAdminPanel />);
  mountedTarget = nextTarget;
  mountedRoot = root;
}

function startNpcAdminBridge() {
  if (typeof document === "undefined" || observer) return;
  syncNpcAdminMount();
  observer = new MutationObserver(syncNpcAdminMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startNpcAdminBridge, { once: true });
  } else {
    startNpcAdminBridge();
  }
}

export {};
