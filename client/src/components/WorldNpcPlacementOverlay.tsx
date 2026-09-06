import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface NpcCatalogRow {
  id: string;
  name: string;
  imageUrl: string | null;
  type: string;
  worldId: string;
}

interface WorldLocationRow {
  id: string;
  worldId: string;
  name: string;
  type: string;
  iconUrl: string | null;
  posX: number;
  posY: number;
  iconSize: number;
  flipped?: boolean;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<NpcCatalogRow[]>([]);
  const [locations, setLocations] = useState<WorldLocationRow[]>([]);
  const [mounts, setMounts] = useState<Record<string, HTMLElement>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (window.location.pathname !== pathname) setPathname(window.location.pathname);
    }, 350);
    return () => window.clearInterval(timer);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { credentials: "include" })
      .then(response => response.ok ? response.json() : null)
      .then(user => { if (!cancelled) setIsAdmin(Boolean(user?.isAdmin)); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [pathname]);

  const loadLocations = useCallback(async () => {
    if (!worldId) {
      setLocations([]);
      return;
    }
    try {
      const response = await fetch(`/api/world/${worldId}/locations`, { credentials: "include" });
      if (!response.ok) return;
      setLocations(await response.json());
    } catch {}
  }, [worldId]);

  useEffect(() => { void loadLocations(); }, [loadLocations]);

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
      await apiRequest("POST", `/api/admin/world/${worldId}/location`, {
        name: npc.name,
        isShop: false,
        type: "npc",
        description: "World NPC",
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

  if (!worldId) return null;

  const npcLocations = locations.filter(loc => loc.type === "npc" && loc.iconUrl);

  return (
    <>
      <style>{`
        .npc-world-location [data-testid^="location-sparkle-"] { display: none !important; }
        .npc-world-location [data-testid^="player-location-hotspot-"] { pointer-events: none !important; }
      `}</style>

      {npcLocations.map(loc => {
        const mount = mounts[loc.id];
        if (!mount || !loc.iconUrl) return null;
        return createPortal(
          <div
            aria-hidden="true"
            data-testid={`world-npc-art-${loc.id}`}
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
                filter: "drop-shadow(0 4px 8px rgba(0,0,0,.35))",
              }}
            />
          </div>,
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
                <p className="mt-1 text-[10px] text-stone-400">Choose an uploaded NPC. It will appear in the center, ready to move and resize.</p>
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
