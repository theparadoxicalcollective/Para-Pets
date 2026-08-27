import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  DEFAULT_HAUNTED_CASINO_HOTSPOTS,
  type HauntedCasinoHotspot,
  type HauntedCasinoHotspotId,
} from "@shared/hauntedCasino";
import SlaughterSlotsOverlay from "./SlaughterSlotsOverlay";

interface CasinoConfigResponse {
  hotspots: HauntedCasinoHotspot[];
  isAdmin: boolean;
}

interface DragState {
  id: HauntedCasinoHotspotId;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

function replaceHotspot(
  hotspots: HauntedCasinoHotspot[],
  id: HauntedCasinoHotspotId,
  patch: Partial<HauntedCasinoHotspot>,
): HauntedCasinoHotspot[] {
  return hotspots.map((spot) => spot.id === id ? { ...spot, ...patch } : spot);
}

function HauntedCasinoHotspotLayer({ onCurrencyChanged }: { onCurrencyChanged: () => void }) {
  const [hotspots, setHotspots] = useState<HauntedCasinoHotspot[]>(DEFAULT_HAUNTED_CASINO_HOTSPOTS);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [openingSoon, setOpeningSoon] = useState<string | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/haunted-casino/config", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Casino layout failed to load");
        return response.json() as Promise<CasinoConfigResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.hotspots) && data.hotspots.length) setHotspots(data.hotspots);
        setIsAdmin(Boolean(data.isAdmin));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const persist = (next: HauntedCasinoHotspot[]) => {
    if (!isAdmin) return;
    setSaveFailed(false);
    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/admin/haunted-casino/hotspots", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotspots: next }),
        });
        if (!response.ok) throw new Error("save failed");
        const payload = await response.json() as { hotspots?: HauntedCasinoHotspot[] };
        if (Array.isArray(payload.hotspots)) setHotspots(payload.hotspots);
      })
      .catch(() => setSaveFailed(true));
  };

  const openHotspot = (spot: HauntedCasinoHotspot) => {
    if (spot.id === "slots") {
      setSlotsOpen(true);
      return;
    }
    setOpeningSoon(spot.label);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, spot: HauntedCasinoHotspot) => {
    if (!isAdmin) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: spot.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!isAdmin || !drag || drag.pointerId !== event.pointerId) return;
    const layer = event.currentTarget.parentElement;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) drag.moved = true;
    const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100));
    setHotspots((current) => replaceHotspot(current, drag.id, { x, y }));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>, spot: HauntedCasinoHotspot) => {
    if (!isAdmin) return;
    event.preventDefault();
    event.stopPropagation();
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    if (drag.moved) {
      setHotspots((current) => {
        persist(current);
        return current;
      });
    } else {
      openHotspot(spot);
    }
  };

  const resize = (id: HauntedCasinoHotspotId, delta: number) => {
    setHotspots((current) => {
      const target = current.find((spot) => spot.id === id);
      if (!target) return current;
      const size = Math.max(6, Math.min(28, target.size + delta));
      const next = replaceHotspot(current, id, { size });
      persist(next);
      return next;
    });
  };

  if (!loaded) return null;

  return (
    <>
      {hotspots.map((spot) => (
        <button
          key={spot.id}
          type="button"
          aria-label={spot.label}
          data-testid={`haunted-casino-hotspot-${spot.id}`}
          onPointerDown={(event) => onPointerDown(event, spot)}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => onPointerUp(event, spot)}
          onPointerCancel={() => { dragRef.current = null; }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isAdmin) openHotspot(spot);
          }}
          className="absolute rounded-full"
          style={{
            left: `${spot.x}%`,
            top: `${spot.y}%`,
            width: `${spot.size}%`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
            touchAction: isAdmin ? "none" : "pan-x",
            cursor: isAdmin ? "grab" : "pointer",
            border: isAdmin ? "2px dashed rgba(250,204,21,.92)" : "none",
            background: isAdmin ? "rgba(76,29,149,.16)" : "transparent",
            boxShadow: isAdmin ? "0 0 0 2px rgba(88,28,135,.3), 0 0 18px rgba(250,204,21,.32)" : "none",
            color: isAdmin ? "#fff7cc" : "transparent",
            zIndex: 5,
            padding: 0,
          }}
        >
          {isAdmin && (
            <>
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/75 px-2 py-1 font-fantasy text-[10px] sm:text-xs whitespace-nowrap"
                style={{ pointerEvents: "none" }}
              >
                {spot.label}
              </span>
              <span className="absolute -bottom-7 left-1/2 flex -translate-x-1/2 gap-1" onPointerDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  aria-label={`Make ${spot.label} hotspot smaller`}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); resize(spot.id, -1); }}
                  className="grid h-6 w-6 place-items-center rounded-full border border-amber-200/60 bg-black/85 text-sm font-bold text-amber-100"
                >−</button>
                <button
                  type="button"
                  aria-label={`Make ${spot.label} hotspot larger`}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); resize(spot.id, 1); }}
                  className="grid h-6 w-6 place-items-center rounded-full border border-amber-200/60 bg-black/85 text-sm font-bold text-amber-100"
                >+</button>
              </span>
            </>
          )}
        </button>
      ))}

      {isAdmin && saveFailed && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-rose-300/50 bg-black/80 px-3 py-1 text-xs text-rose-100" style={{ pointerEvents: "none", zIndex: 20 }}>
          Casino hotspot layout could not be saved.
        </div>
      )}

      {openingSoon && createPortal(
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/65 p-5" style={{ pointerEvents: "auto" }} onClick={() => setOpeningSoon(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${openingSoon} opening soon`}
            className="w-full max-w-sm rounded-2xl border border-amber-200/35 bg-[#110817]/95 px-5 py-6 text-center shadow-[0_0_40px_rgba(126,34,206,.32)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="font-fantasy text-xl text-amber-100">{openingSoon}</div>
            <div className="mt-2 text-base lowercase tracking-wide text-violet-100">opening soon</div>
            <button
              type="button"
              onClick={() => setOpeningSoon(null)}
              className="mt-5 rounded-lg border border-violet-200/30 bg-violet-900/40 px-5 py-2 text-sm text-violet-50 active:scale-95"
            >Close</button>
          </div>
        </div>,
        document.body,
      )}

      {slotsOpen && createPortal(
        <SlaughterSlotsOverlay
          onClose={() => setSlotsOpen(false)}
          onCurrencyChanged={onCurrencyChanged}
        />,
        document.body,
      )}
    </>
  );
}

/**
 * WorldLocations already owns the full-screen Haunted Casino scroller. This
 * enhancer mounts a React interaction layer directly over the rendered casino
 * image, so hotspots scroll with the art without coupling casino game logic to
 * the generic world-location component.
 */
export function enhanceHauntedCasinoRoot(rootElement: HTMLElement): void {
  if (rootElement.dataset.hauntedCasinoEnhanced === "1") return;
  const image = rootElement.querySelector("img");
  const scene = image?.parentElement as HTMLElement | null;
  if (!(image instanceof HTMLImageElement) || !scene) return;

  rootElement.dataset.hauntedCasinoEnhanced = "1";
  if (window.getComputedStyle(scene).position === "static") scene.style.position = "relative";

  const host = document.createElement("div");
  host.dataset.testid = "haunted-casino-hotspot-layer";
  host.style.position = "absolute";
  host.style.pointerEvents = "none";
  host.style.zIndex = "15";
  scene.appendChild(host);

  const syncGeometry = () => {
    host.style.left = `${image.offsetLeft}px`;
    host.style.top = `${image.offsetTop}px`;
    host.style.width = `${image.clientWidth}px`;
    host.style.height = `${image.clientHeight}px`;
  };
  syncGeometry();
  image.addEventListener("load", syncGeometry);
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncGeometry) : null;
  resizeObserver?.observe(image);
  resizeObserver?.observe(scene);

  let currencyDirty = false;
  const reactRoot: Root = createRoot(host);
  reactRoot.render(<HauntedCasinoHotspotLayer onCurrencyChanged={() => { currencyDirty = true; }} />);

  const lifecycleObserver = new MutationObserver(() => {
    if (rootElement.isConnected) return;
    lifecycleObserver.disconnect();
    resizeObserver?.disconnect();
    image.removeEventListener("load", syncGeometry);
    reactRoot.unmount();
    if (currencyDirty) window.setTimeout(() => window.location.reload(), 0);
  });
  lifecycleObserver.observe(document.body, { childList: true, subtree: true });
}
