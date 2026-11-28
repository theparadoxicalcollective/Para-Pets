import { useEffect, useRef } from "react";
import { WORLD_DEFINITION_LIST } from "@shared/worlds/worldRegistry";

/** Actual new world is mounted underneath this overlay. Never download an
 * original-map background or impose the old cinematic minimum duration. */
export default function NewWorldLoadingOverlay({ worldId, ready, onReady }: {
  worldId: string; ready: boolean; onReady: () => void;
}) {
  const callback = useRef(onReady);
  callback.current = onReady;
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => callback.current(), 180);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const name = WORLD_DEFINITION_LIST.find(world => world.id === worldId)?.defaultName ?? "World";
  return <div data-testid={`new-world-loading-${worldId}`} role="status" aria-live="polite"
    className="absolute inset-0 z-[200] flex flex-col items-center justify-center gap-4 overflow-hidden text-center font-fantasy text-[#f5d77b]"
    style={{
      background: "linear-gradient(180deg,rgba(5,15,10,.76),rgba(12,32,23,.45),rgba(5,15,10,.82))",
      opacity: ready ? 0 : 1, transition: "opacity 180ms ease-out",
    }}>
    <p className="text-xs uppercase tracking-[.25em]">Entering</p>
    <h1 className="text-2xl text-[#f7df9e]">{name}</h1>
    <div aria-hidden className="h-8 w-8 animate-spin rounded-full border-2 border-[#b99a4c]/30 border-t-[#f5d77b]" />
    <p className="text-xs">Loading your world…</p>
  </div>;
}
