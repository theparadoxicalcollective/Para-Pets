import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { apiRequest, fetchAuthenticatedUserCached, queryClient } from "@/lib/queryClient";
import {
  chooseNpcMessage,
  getNpcQuestAssociations,
  npcNamesMatch,
  parseNpcMetadata,
  serializeNpcMetadata,
} from "@/lib/npcMetadata";
import { calculateWorldDragPosition, worldPositionsDiffer, type WorldPercentPosition } from "@/lib/worldNpcPlacement";

interface NpcCatalogRow {
  id: string;
  name: string;
  imageUrl: string | null;
  type: string;
  worldId: string;
  specialSkill?: string | null;
}

interface WorldLocationRow {
  id: string;
  worldId: string;
  name: string;
  type: string;
  iconUrl: string | null;
  description?: string | null;
  posX: number;
  posY: number;
  iconSize: number;
  flipped?: boolean;
}

interface NpcDragFallback {
  pointerId: number;
  locationId: string;
  origin: WorldPercentPosition;
  pointerStart: { x: number; y: number };
  renderedMap: { width: number; height: number };
  lastPosition: WorldPercentPosition;
  moved: boolean;
}

const NPC_CATALOG_WORLD = "__npc_catalog__";

function getWorldId(pathname: string) {
  const match = pathname.match(/^\/world\/([^/]+)/);
  return match?.[1] ?? "";
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Could not load NPC image");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read NPC image"));
    reader.readAsDataURL(blob);
  });
}

export default function WorldNpcPlacementOverlay() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const worldId = useMemo(() => getWorldId(pathname), [pathname]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<NpcCatalogRow[]>([]);
  const [locations, setLocations] = useState<WorldLocationRow[]>([]);
  const [mounts, setMounts] = useState<Record<string, HTMLElement>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [spokenMessages, setSpokenMessages] = useState<Record<string, string>>({});
  const locationsRef = useRef<WorldLocationRow[]>([]);
  const npcDragFallbackRef = useRef<NpcDragFallback | null>(null);
  const lastDraggedNpcRef = useRef<{ locationId: string; at: number } | null>(null);
  const pendingPositionCheckRef = useRef<number | null>(null);
  const speechTimeoutsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  useEffect(() => () => {
    Object.values(speechTimeoutsRef.current).forEach(timeout => window.clearTimeout(timeout));
    speechTimeoutsRef.current = {};
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (window.location.pathname !== pathname) setPathname(window.location.pathname);
    }, 350);
    return () => window.clearInterval(timer);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    setAuthResolved(false);
    void fetchAuthenticatedUserCached()
      .then(user => { if (!cancelled) setIsAdmin(Boolean(user?.isAdmin)); })
      .catch(() => { if (!cancelled) setIsAdmin(false); })
      .finally(() => { if (!cancelled) setAuthResolved(true); });
    return () => { cancelled = true; };
  }, [pathname]);

  const loadLocations = useCallback(async () => {
    if (!worldId) {
      setLocations([]);
      return;
    }
    try {
      const response = await fetch(`/api/world/${worldId}/locations`, { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      setLocations(await response.json());
    } catch {}
  }, [worldId]);

  const loadPublicCatalog = useCallback(async () => {
    try {
      const response = await fetch(`/api/shop/${encodeURIComponent(NPC_CATALOG_WORLD)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const rows = await response.json() as NpcCatalogRow[];
      setCatalog(rows.filter(row => row.type === "npc" && row.worldId === NPC_CATALOG_WORLD));
    } catch {}
  }, []);

  useEffect(() => { void loadLocations(); }, [loadLocations]);
  useEffect(() => {
    if (!worldId) return;
    void loadPublicCatalog();
  }, [loadPublicCatalog, worldId]);

  useEffect(() => {
    if (!worldId) return;
    const refreshMounts = () => {
      const next: Record<string, HTMLElement> = {};
      for (const loc of locations) {
        if (loc.type !== "npc") continue;
        const node = document.querySelector<HTMLElement>(`[data-testid="location-${loc.id}"]`);
        if (!node) continue;
        node.classList.add("npc-world-location");
        next[loc.id] = node;
      }
      setMounts(previous => {
        const prevKeys = Object.keys(previous);
        const nextKeys = Object.keys(next);
        if (prevKeys.length === nextKeys.length && nextKeys.every(key => previous[key] === next[key])) return previous;
        return next;
      });
    };
    refreshMounts();
    const observer = new MutationObserver(refreshMounts);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(refreshMounts, 700);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [locations, worldId]);

  const verifyNpcPosition = useCallback(async (locationId: string, expected: WorldPercentPosition) => {
    if (!worldId) return;
    try {
      const response = await fetch(`/api/world/${worldId}/locations`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.ok) {
        const rows = await response.json() as WorldLocationRow[];
        const saved = rows.find(row => row.id === locationId);
        if (saved && !worldPositionsDiffer({ x: saved.posX, y: saved.posY }, expected)) {
          setLocations(rows);
          return;
        }
      }

      const saveResponse = await apiRequest("PATCH", `/api/admin/world/location/${locationId}/position`, {
        posX: expected.x,
        posY: expected.y,
      });
      const updated = await saveResponse.json() as WorldLocationRow;
      setLocations(previous => previous.map(row => row.id === locationId ? { ...row, ...updated } : row));
      await queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      await loadLocations();
    } catch {
      setMessage("NPC moved on screen, but its saved position could not be confirmed. Please try moving it once more.");
    }
  }, [loadLocations, worldId]);

  // WorldPage already owns the normal admin drag interaction. This listener is
  // deliberately a persistence safety net for NPCs: on fast taps/drags (most
  // noticeable on touch devices) React state can be one event behind when the
  // pointer is released, causing a newly placed NPC to snap back on refresh.
  // Track the same percentage-space drag from native pointer coordinates, then
  // verify the server value after WorldPage has had a chance to save it. We only
  // issue a fallback PATCH when the persisted position does not match the last
  // visible drag position, so normal drags do not create duplicate writes.
  useEffect(() => {
    if (!isAdmin || !worldId) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const hotspot = event.target.closest<HTMLElement>('[data-testid^="admin-location-hotspot-"]');
      if (!hotspot || hotspot.style.cursor !== "grab") return;

      const node = hotspot.closest<HTMLElement>('[data-testid^="location-"]');
      if (!node) return;
      const loc = locationsRef.current.find(row => row.type === "npc" && hotspot.getAttribute("data-testid") === `admin-location-hotspot-${row.id}`);
      if (!loc) return;

      const mapLayer = node.parentElement;
      const rect = mapLayer?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const origin = { x: loc.posX, y: loc.posY };
      npcDragFallbackRef.current = {
        pointerId: event.pointerId,
        locationId: loc.id,
        origin,
        pointerStart: { x: event.clientX, y: event.clientY },
        renderedMap: { width: rect.width, height: rect.height },
        lastPosition: origin,
        moved: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = npcDragFallbackRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.pointerStart.x;
      const dy = event.clientY - drag.pointerStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      drag.lastPosition = calculateWorldDragPosition(
        drag.origin,
        drag.pointerStart,
        { x: event.clientX, y: event.clientY },
        drag.renderedMap,
      );
    };

    const finishDrag = (event: PointerEvent) => {
      const drag = npcDragFallbackRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      npcDragFallbackRef.current = null;
      if (!drag.moved) return;
      lastDraggedNpcRef.current = { locationId: drag.locationId, at: Date.now() };

      const finalPosition = event.type === "pointercancel"
        ? drag.lastPosition
        : calculateWorldDragPosition(
            drag.origin,
            drag.pointerStart,
            { x: event.clientX, y: event.clientY },
            drag.renderedMap,
          );

      // Keep this overlay's local location snapshot current immediately. The
      // canonical WorldPage query is still the visual source of truth.
      setLocations(previous => previous.map(row => row.id === drag.locationId
        ? { ...row, posX: finalPosition.x, posY: finalPosition.y }
        : row));

      if (pendingPositionCheckRef.current !== null) {
        window.clearTimeout(pendingPositionCheckRef.current);
      }
      pendingPositionCheckRef.current = window.setTimeout(() => {
        pendingPositionCheckRef.current = null;
        void verifyNpcPosition(drag.locationId, finalPosition);
      }, 220);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      npcDragFallbackRef.current = null;
      if (pendingPositionCheckRef.current !== null) {
        window.clearTimeout(pendingPositionCheckRef.current);
        pendingPositionCheckRef.current = null;
      }
    };
  }, [isAdmin, verifyNpcPosition, worldId]);

  const openPicker = async () => {
    setPickerOpen(true);
    setMessage(null);
    try {
      const response = await apiRequest("GET", "/api/admin/shop-items-all");
      const rows = await response.json() as NpcCatalogRow[];
      setCatalog(rows.filter(row => row.type === "npc" && row.worldId === NPC_CATALOG_WORLD));
    } catch (error: any) {
      setMessage(error?.message || "Could not load NPCs.");
    }
  };

  const placeNpc = async (npc: NpcCatalogRow) => {
    if (!worldId || !npc.imageUrl) return;
    setBusyId(npc.id);
    setMessage(null);
    try {
      const iconData = await imageUrlToDataUrl(npc.imageUrl);
      const metadata = parseNpcMetadata(npc.specialSkill);
      await apiRequest("POST", `/api/admin/world/${worldId}/location`, {
        name: npc.name,
        isShop: false,
        type: "npc",
        description: serializeNpcMetadata(metadata),
        iconData,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      await loadLocations();
      setPickerOpen(false);
      setMessage(`${npc.name} added. Tap it to select, then drag or use the size controls.`);
    } catch (error: any) {
      setMessage(error?.message || "Could not add NPC to this world.");
    } finally {
      setBusyId(null);
    }
  };

  const speakNpcMessage = useCallback((locationId: string, messages: readonly string[]) => {
    setSpokenMessages(previous => {
      const chosen = chooseNpcMessage(messages, previous[locationId]);
      if (!chosen) return previous;
      return { ...previous, [locationId]: chosen };
    });

    const existingTimeout = speechTimeoutsRef.current[locationId];
    if (existingTimeout !== undefined) window.clearTimeout(existingTimeout);
    speechTimeoutsRef.current[locationId] = window.setTimeout(() => {
      setSpokenMessages(previous => {
        if (!(locationId in previous)) return previous;
        const next = { ...previous };
        delete next[locationId];
        return next;
      });
      delete speechTimeoutsRef.current[locationId];
    }, 4500);
  }, []);

  // Regular players use the transparent talk hitbox rendered below. Admins
  // cannot use that same hitbox because it would sit above the placement
  // hotspot and break select/drag/resize. Instead, observe admin hotspot clicks
  // without cancelling them: the normal admin interaction still runs, and a
  // configured non-quest NPC also speaks. Suppress the synthetic click that can
  // follow a drag so repositioning an NPC does not unexpectedly open dialogue.
  useEffect(() => {
    if (!authResolved || !isAdmin || !worldId) return;

    const onAdminNpcClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const hotspot = event.target.closest<HTMLElement>('[data-testid^="admin-location-hotspot-"]');
      if (!hotspot) return;

      const loc = locationsRef.current.find(row =>
        row.type === "npc" && hotspot.getAttribute("data-testid") === `admin-location-hotspot-${row.id}`
      );
      if (!loc) return;

      const lastDrag = lastDraggedNpcRef.current;
      if (lastDrag?.locationId === loc.id && Date.now() - lastDrag.at < 400) return;

      const catalogNpc = catalog.find(npc => npcNamesMatch(npc.name, loc.name));
      const metadata = parseNpcMetadata(catalogNpc?.specialSkill ?? loc.description);
      if (getNpcQuestAssociations(loc.name, loc.worldId).length > 0 || metadata.messages.length === 0) return;

      speakNpcMessage(loc.id, metadata.messages);
    };

    document.addEventListener("click", onAdminNpcClick, true);
    return () => document.removeEventListener("click", onAdminNpcClick, true);
  }, [authResolved, catalog, isAdmin, speakNpcMessage, worldId]);

  if (!worldId) return null;

  const npcLocations = locations.filter(loc => loc.type === "npc" && loc.iconUrl);

  return (
    <>
      <style>{`
        .npc-world-location [data-testid^="location-sparkle-"] { display: none !important; }
        .npc-world-location [data-testid^="player-location-hotspot-"] { pointer-events: none !important; }
        @keyframes paraNpcBreathe {
          0%, 100% { transform: translate3d(0,0,0) scale3d(1,1,1); }
          50% { transform: translate3d(0,.16%,0) scale3d(1.003,.984,1); }
        }
        @keyframes paraNpcFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7%); }
        }
        .para-npc-animation-breathe {
          animation: paraNpcBreathe 4.8s cubic-bezier(.42,0,.58,1) infinite;
          transform-origin: 50% 100%;
          will-change: transform;
          backface-visibility: hidden;
        }
        .para-npc-animation-float {
          animation: paraNpcFloat 3s ease-in-out infinite;
          transform-origin: 50% 50%;
        }
        @media (prefers-reduced-motion: reduce) {
          .para-npc-animation-breathe,
          .para-npc-animation-float { animation: none !important; }
        }
      `}</style>

      {npcLocations.map(loc => {
        const mount = mounts[loc.id];
        if (!mount || !loc.iconUrl) return null;

        const catalogNpc = catalog.find(npc => npcNamesMatch(npc.name, loc.name));
        const metadata = parseNpcMetadata(catalogNpc?.specialSkill ?? loc.description);
        const quests = getNpcQuestAssociations(loc.name, loc.worldId);
        const canUsePlayerTalkHitbox = authResolved && !isAdmin && quests.length === 0 && metadata.messages.length > 0;
        const spokenMessage = spokenMessages[loc.id];

        return createPortal(
          <>
            <div
              aria-hidden="true"
              data-testid={`world-npc-art-${loc.id}`}
              data-npc-animation={metadata.animation}
              className={metadata.animation === "none" ? undefined : `para-npc-animation-${metadata.animation}`}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 5,
                pointerEvents: "none",
                display: "grid",
                placeItems: "center",
              }}
            >
              <img
                src={loc.iconUrl}
                alt=""
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: loc.flipped ? "scaleX(-1)" : undefined,
                  filter: "drop-shadow(0 7px 9px rgba(0,0,0,.68)) drop-shadow(0 2px 3px rgba(0,0,0,.5)) drop-shadow(0 0 2px rgba(255,244,214,.18))",
                }}
              />
            </div>

            {canUsePlayerTalkHitbox && (
              <button
                type="button"
                aria-label={`Talk to ${loc.name}`}
                data-testid={`button-talk-npc-${loc.id}`}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  speakNpcMessage(loc.id, metadata.messages);
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 8,
                  border: 0,
                  padding: 0,
                  background: "transparent",
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              />
            )}

            {spokenMessage && (
              <div
                role="status"
                aria-live="polite"
                data-testid={`npc-message-${loc.id}`}
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: "98%",
                  transform: "translate(-50%, -8px)",
                  zIndex: 14,
                  width: "max-content",
                  maxWidth: "min(220px, 72vw)",
                  padding: "7px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,220,128,.72)",
                  background: "rgba(18,12,20,.94)",
                  boxShadow: "0 5px 18px rgba(0,0,0,.6), 0 0 12px rgba(255,205,90,.13)",
                  color: "#fff2c7",
                  fontFamily: "Lora, serif",
                  fontSize: 10,
                  lineHeight: 1.35,
                  textAlign: "center",
                  pointerEvents: "none",
                  whiteSpace: "normal",
                }}
              >
                <strong style={{ display: "block", marginBottom: 2, color: "#ffd978", fontSize: 9 }}>{loc.name}</strong>
                {spokenMessage}
              </div>
            )}
          </>,
          mount,
        );
      })}

      {isAdmin && (
        <div className="fixed right-3 z-[75] flex flex-col items-end gap-2" style={{ top: "max(env(safe-area-inset-top, 0px) + 76px, 86px)" }}>
          <button
            type="button"
            data-testid="button-world-npc-picker"
            onClick={() => void openPicker()}
            className="rounded-full px-4 py-2 font-fantasy text-[10px] tracking-[0.16em]"
            style={{
              color: "#ffe5b4",
              background: "rgba(49,28,8,.92)",
              border: "1px solid rgba(251,191,36,.58)",
              boxShadow: "0 4px 16px rgba(0,0,0,.38), 0 0 14px rgba(245,158,11,.15)",
            }}
          >
            NPC
          </button>
          {message && (
            <div className="max-w-[250px] rounded-lg border border-amber-300/25 bg-black/75 px-3 py-2 text-right text-[10px] leading-relaxed text-amber-100">
              {message}
            </div>
          )}
        </div>
      )}

      {isAdmin && pickerOpen && (
        <div className="fixed inset-0 z-[1300] grid place-items-center bg-black/80 p-4" onClick={() => setPickerOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl p-4"
            style={{ background: "#15100b", border: "1px solid rgba(251,191,36,.42)", maxHeight: "78vh", overflowY: "auto" }}
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-fantasy text-sm tracking-wider text-amber-200">ADD NPC TO WORLD</h2>
                <p className="mt-1 text-[10px] text-stone-400">Choose an uploaded NPC. It will appear in the center with its saved idle effect and dialogue settings.</p>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="p-2 text-stone-300"><X size={18} /></button>
            </div>

            {catalog.length === 0 ? (
              <p className="rounded-xl border border-dashed border-amber-300/20 p-8 text-center text-xs text-stone-400">No NPCs are available yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {catalog.map(npc => (
                  <button
                    key={npc.id}
                    type="button"
                    disabled={!npc.imageUrl || busyId !== null}
                    onClick={() => void placeNpc(npc)}
                    data-testid={`button-place-npc-${npc.id}`}
                    className="rounded-xl p-3 text-left disabled:opacity-45"
                    style={{ background: "rgba(0,0,0,.38)", border: "1px solid rgba(251,191,36,.22)" }}
                  >
                    <div className="grid h-28 place-items-center rounded-lg bg-black/25">
                      {npc.imageUrl ? <img src={npc.imageUrl} alt={npc.name} className="h-full w-full object-contain" /> : null}
                    </div>
                    <p className="mt-2 truncate font-fantasy text-[11px] text-amber-100">{npc.name}</p>
                    <p className="mt-1 text-[9px] text-amber-300/65">{busyId === npc.id ? "ADDING…" : "Tap to add"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
