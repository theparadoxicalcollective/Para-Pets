import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import ErrorBoundary from "@/components/ErrorBoundary";
import SendGiftModal from "@/components/SendGiftModal";

// ── Types ────────────────────────────────────────────────────────────────────
interface VisitedPet {
  inventoryId: string; shopItemId: string; name: string; nickname: string | null;
  imageUrl: string | null; hatchedImageUrl: string | null; eggImageUrl: string | null;
  rarity: number | null; petLevel: number; petHealth: number; petAtk: number; petDef: number;
  petTemplateId: string | null; posLeft: string | null; posTop: string | null; location: string | null;
}
interface ActiveBundle {
  id: string; name: string; bgImageUrl: string | null;
  buildings: { id: string; name: string; imageUrl: string; posX: number; posY: number; width: number; flippedX: boolean; interiorImageUrl?: string | null; leaveButtonX?: number | null; leaveButtonY?: number | null }[];
}
interface PlacedDecorItem {
  id: string; decorItemId: string; xPct: number; yPct: number; size: number; flipped: boolean;
  item: { id: string; name: string; imageUrl: string | null };
}

const DEFAULT_BG_RATIO = 1920 / 2400;
const BUILDING_REF_H = 900;
const INTERIOR_PET_SIZE = 110;

function parsePetPct(s: string | null): number | null {
  if (!s) return null;
  const v = parseFloat(s);
  if (!isNaN(v)) return Math.max(0, Math.min(1, v / 100));
  const m = s.match(/calc\(([\d.]+)%/);
  if (m) return Math.max(0, Math.min(1, parseFloat(m[1]) / 100));
  return null;
}

function randomGroundConfig(index: number) {
  const seed = index * 137.508;
  const pseudo = (n: number) => ((Math.sin(n) * 10000) % 1 + 1) % 1;
  const size = 100 + pseudo(seed + 2) * 30;
  const centerX = 20 + pseudo(seed) * 60;
  const centerY = 64 + pseudo(seed + 1) * 11;
  return { size, centerX, centerY };
}

// ── Read-only Interior Viewer ─────────────────────────────────────────────────
// MEMORY SAFETY: the background image is NOT rendered while this is mounted.
function InteriorViewerVisit({ url, placedItems, placedPets, leaveButtonX = 0.92, leaveButtonY = 0.06, onClose }: {
  url: string;
  placedItems: PlacedDecorItem[];
  placedPets: VisitedPet[];
  leaveButtonX?: number;
  leaveButtonY?: number;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef(16 / 9);
  const imgWidthRef = useRef(0);
  const containerHRef = useRef(0);
  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const recalc = () => {
      try {
        const w = container.offsetWidth;
        const h = container.offsetHeight;
        const imgW = h * aspectRef.current;
        const newPanX = Math.max(Math.min(0, w - imgW), (w - imgW) / 2);
        setPanX(newPanX);
        setImgWidth(imgW);
        setContainerH(h);
        imgWidthRef.current = imgW;
        containerHRef.current = h;
      } catch {}
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [aspect]);

  const onDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX]);

  const onMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const w = container.offsetWidth;
    const imgW = container.offsetHeight * aspectRef.current;
    setPanX(Math.min(0, Math.max(Math.min(0, w - imgW), drag.startPanX + (e.clientX - drag.startX))));
  }, []);

  const onUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    panStartRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0"
      style={{ zIndex: 60, background: "#000", overflow: "hidden", touchAction: "none", maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <img
        src={url}
        alt="Building interior"
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalHeight > 0) {
            const a = img.naturalWidth / img.naturalHeight;
            aspectRef.current = a;
            setAspect(a);
          }
        }}
        style={{ position: "absolute", top: 0, left: `${panX}px`, height: "100%", width: "auto", maxWidth: "none", userSelect: "none" }}
      />

      {/* Decor items (read-only) */}
      {imgWidth > 0 && placedItems.map((item) => (
        <div
          key={item.id}
          className="absolute pointer-events-none"
          style={{ zIndex: 6, left: panX + item.xPct * imgWidth, top: item.yPct * containerH, transform: "translate(-50%, -50%)" }}
        >
          <img
            src={item.item.imageUrl ?? ""}
            alt={item.item.name}
            draggable={false}
            style={{ width: item.size, height: item.size, objectFit: "contain", transform: item.flipped ? "scaleX(-1)" : undefined, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))", userSelect: "none" }}
          />
        </div>
      ))}

      {/* Pets inside building (read-only) — use static image to save GPU memory */}
      {imgWidth > 0 && placedPets.map((pet) => {
        const xPct = parsePetPct(pet.posLeft) ?? 0.5;
        const yPct = parsePetPct(pet.posTop) ?? 0.5;
        return (
          <div
            key={pet.inventoryId}
            className="absolute pointer-events-none pet-idle-squish"
            style={{ zIndex: 7, left: panX + xPct * imgWidth, top: yPct * containerH, width: INTERIOR_PET_SIZE, height: INTERIOR_PET_SIZE, transform: "translate(-50%, -50%)" }}
          >
            {(pet.hatchedImageUrl || pet.imageUrl) ? (
              <img
                src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                alt={pet.nickname ?? pet.name}
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : null}
          </div>
        );
      })}

      <button
        onClick={onClose}
        onPointerDown={e => e.stopPropagation()}
        className="absolute flex items-center justify-center font-bold text-xs tracking-widest rounded-full px-4 py-2"
        style={{
          zIndex: 10,
          left: `${leaveButtonX * 100}%`,
          top: `${leaveButtonY * 100}%`,
          transform: "translate(-50%, -50%)",
          background: "rgba(0,0,0,0.32)", color: "rgba(255,255,255,0.7)",
          border: "1px solid rgba(255,255,255,0.18)",
          fontFamily: "Lora, serif",
        }}
      >
        Outside
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function VisitPetHousePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [openInterior, setOpenInterior] = useState<{ url: string; buildingId: string; leaveButtonX: number; leaveButtonY: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);
  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [bgAspect, setBgAspect] = useState(DEFAULT_BG_RATIO);

  const { data: petsData, isLoading, isError } = useQuery<{ username: string; pets: VisitedPet[] }>({
    queryKey: ["/api/users", userId, "pets"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/pets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pets");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const { data: activeBundle } = useQuery<ActiveBundle | null>({
    queryKey: ["/api/users", userId, "active-house-bundle"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/active-house-bundle`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userId,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: outdoorDecor = [] } = useQuery<PlacedDecorItem[]>({
    queryKey: ["/api/users", userId, "pet-house/decor/placed", "outside"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/pet-house/decor/placed?location=outside`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
    staleTime: 15000,
  });

  const { data: interiorDecor = [] } = useQuery<PlacedDecorItem[]>({
    queryKey: ["/api/users", userId, "pet-house/decor/placed", openInterior?.buildingId ?? ""],
    queryFn: async () => {
      if (!openInterior) return [];
      const res = await fetch(`/api/users/${userId}/pet-house/decor/placed?location=${encodeURIComponent(openInterior.buildingId)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!openInterior && !!userId,
    staleTime: 15000,
  });

  const pets = petsData?.pets ?? [];

  // Logged-in viewer — only used to know how many coins are available
  // when sending a gift through the visited player's mailbox.
  const { data: me } = useQuery<{ id: string; coins: number } | null>({
    queryKey: ["/api/auth/me"],
  });

  // Mailbox interaction — clicking the visited player's mailbox opens the
  // shared SendGiftModal targeted at that player. The modal already lets
  // a sender attach a written message *and* either coins or an item, so
  // the mailbox naturally covers both of the two interactions that used
  // to live on the player popup.
  const [showGiftModal, setShowGiftModal] = useState(false);
  const outdoorPets = pets.filter(p => p.posLeft !== null && (p.location === "outside" || p.location === null));
  const interiorPets = openInterior ? pets.filter(p => p.location === openInterior.buildingId && p.posLeft !== null) : [];

  const bgUrl = activeBundle?.bgImageUrl ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const recalc = () => {
      try {
        const w = container.offsetWidth;
        const h = container.offsetHeight;
        const imgW = h * bgAspect;
        setContainerH(h);
        setImgWidth(imgW);
        setPanX(Math.max(Math.min(0, w - imgW), -(imgW - w) / 2));
      } catch {}
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [bgAspect]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const w = container.offsetWidth;
    const imgW = container.offsetHeight * bgAspect;
    setPanX(Math.min(0, Math.max(Math.min(0, w - imgW), drag.startPanX + (e.clientX - drag.startX))));
  }, [bgAspect]);

  const handlePointerUp = useCallback(() => { panStartRef.current = null; }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen-frame"
      style={{ maxWidth: "768px", margin: "0 auto", touchAction: "none", cursor: "grab", overflow: "hidden" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* ── CRITICAL MEMORY FIX ─────────────────────────────────────────────
          Background image is removed from DOM when interior is open,
          freeing its GPU texture so the interior image can load safely. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {bgUrl && !openInterior ? (
          <img
            src={bgUrl}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalHeight > 0) setBgAspect(img.naturalWidth / img.naturalHeight);
            }}
            style={{ position: "absolute", top: 0, left: `${panX}px`, height: "100%", width: "auto", maxWidth: "none", userSelect: "none" }}
          />
        ) : !bgUrl ? (
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0a1a0a 0%, #0d2210 60%, #081408 100%)" }} />
        ) : null}
        <div className="absolute inset-0" style={{ zIndex: 1, background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 18%, transparent 72%, rgba(0,0,0,0.45) 100%)" }} />
      </div>

      {/* Buildings layer */}
      {imgWidth > 0 && activeBundle?.buildings && activeBundle.buildings.length > 0 && (
        <div className="absolute" style={{ zIndex: 4, top: 0, left: `${panX}px`, width: imgWidth, height: "100%", pointerEvents: "none" }}>
          {activeBundle.buildings.map((b) => {
            const hasInterior = !!b.interiorImageUrl;
            // Mailboxes are matched by name so the owner can place any
            // mailbox decor anywhere in their world without us having to
            // wire a per-building flag through the schema.
            const isMailbox = (b.name ?? "").toLowerCase().includes("mailbox");
            const isClickable = hasInterior || isMailbox;
            const displayW = Math.round((b.width ?? 120) * (containerH || BUILDING_REF_H) / BUILDING_REF_H);
            return (
              <div
                key={b.id}
                data-testid={isMailbox ? `building-mailbox-${b.id}` : `building-${b.id}`}
                className="absolute flex flex-col items-center"
                style={{ left: `${b.posX}%`, top: `${b.posY}%`, transform: "translate(-50%, -100%)", minWidth: displayW, pointerEvents: isClickable ? "auto" : "none", cursor: isClickable ? "pointer" : "default" }}
                onClick={() => {
                  if (isMailbox) {
                    setShowGiftModal(true);
                    return;
                  }
                  if (hasInterior) {
                    setOpenInterior({ url: b.interiorImageUrl!, buildingId: b.id, leaveButtonX: b.leaveButtonX ?? 0.92, leaveButtonY: b.leaveButtonY ?? 0.06 });
                  }
                }}
              >
                <img
                  src={b.imageUrl} alt={b.name} draggable={false}
                  style={{
                    width: displayW, height: displayW, objectFit: "contain",
                    filter: isMailbox
                      ? "drop-shadow(0 0 14px rgba(127,255,212,0.55)) drop-shadow(0 3px 6px rgba(0,0,0,0.55))"
                      : "drop-shadow(0 0 10px rgba(255,210,80,0.3)) drop-shadow(0 3px 6px rgba(0,0,0,0.55))",
                    transform: b.flippedX ? "scaleX(-1)" : undefined,
                    flexShrink: 0,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Outdoor pets (read-only) */}
      {imgWidth > 0 && outdoorPets.map((pet, i) => {
        const cfg = randomGroundConfig(i);
        const xPct = parsePetPct(pet.posLeft) ?? cfg.centerX / 100;
        const yPct = parsePetPct(pet.posTop) ?? cfg.centerY / 100;
        return (
          <div
            key={pet.inventoryId}
            data-testid={`visit-pet-outdoor-${pet.inventoryId}`}
            className="absolute pointer-events-none"
            style={{ zIndex: 5, left: panX + xPct * imgWidth, top: yPct * containerH, width: cfg.size, height: cfg.size, transform: "translate(-50%, -50%)" }}
          >
            {pet.petTemplateId ? (
              <PetAnimator petTemplateId={pet.petTemplateId} mode="static" size={cfg.size} fillContainer className="pet-idle-squish" style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }} />
            ) : (pet.hatchedImageUrl || pet.imageUrl) ? (
              <img
                src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                alt={pet.nickname ?? pet.name}
                draggable={false}
                className="pet-idle-squish"
                style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}
              />
            ) : null}
          </div>
        );
      })}

      {/* Outdoor decor (read-only) */}
      {imgWidth > 0 && outdoorDecor.map((item) => (
        <div key={item.id} className="absolute pointer-events-none" style={{ zIndex: 6, left: panX + item.xPct * imgWidth, top: item.yPct * containerH, transform: "translate(-50%, -50%)" }}>
          <img
            src={item.item.imageUrl ?? ""}
            alt={item.item.name}
            draggable={false}
            style={{ width: item.size, height: item.size, objectFit: "contain", transform: item.flipped ? "scaleX(-1)" : undefined, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))", userSelect: "none" }}
          />
        </div>
      ))}

      {/* HUD */}
      <div
        className="absolute z-30 left-0 right-0 flex items-center justify-between px-3"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))", paddingBottom: 8, background: "linear-gradient(180deg, rgba(8,14,5,0.82) 0%, rgba(8,14,5,0.45) 80%, transparent 100%)", pointerEvents: "none" }}
      >
        <button
          data-testid="button-back-visit"
          onClick={() => window.history.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-transform active:scale-90"
          style={{ background: "rgba(4,10,6,0.88)", border: "1.5px solid rgba(127,255,212,0.35)", boxShadow: "0 2px 12px rgba(0,0,0,0.7)", color: "#7fffd4", cursor: "pointer", pointerEvents: "auto" }}
        >
          <X size={16} />
        </button>
        {petsData && (
          <p className="font-fantasy text-xs tracking-widest absolute left-0 right-0 text-center pointer-events-none" style={{ color: "rgba(240,192,64,0.85)", textShadow: "0 0 12px rgba(240,192,64,0.4)" }} data-testid="text-visit-house-owner">
            {petsData.username}'s Pet House
          </p>
        )}
        <div className="w-9 h-9 flex-shrink-0" />
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="font-fantasy text-[#8b6a3e] text-xs animate-pulse tracking-widest">Opening the door...</p>
        </div>
      )}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="font-fantasy text-[#ff6666] text-xs tracking-widest">Could not enter pet house</p>
        </div>
      )}
      {!isLoading && !isError && petsData && outdoorPets.length === 0 && (
        <div className="absolute inset-0 flex items-end justify-center pointer-events-none" style={{ paddingBottom: "15%" }}>
          <p className="font-fantasy text-[9px] tracking-wider text-center px-6 z-10" style={{ color: "rgba(200,170,100,0.55)" }}>
            {petsData.username} hasn't moved any pets outside yet!
          </p>
        </div>
      )}

      {/* Mailbox → send a written message and/or a gift to the visited
          player. The modal closes itself on success. */}
      {showGiftModal && userId && petsData && (
        <SendGiftModal
          friendId={userId}
          friendUsername={petsData.username}
          senderCoins={me?.coins ?? 0}
          onClose={() => setShowGiftModal(false)}
        />
      )}

      {/* Read-only interior */}
      {openInterior && (
        <ErrorBoundary fallback={
          <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" style={{ zIndex: 60, background: "#07090f", maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#ffd700", letterSpacing: "0.1em" }}>Something went wrong</div>
            <button onClick={() => setOpenInterior(null)} style={{ fontFamily: "Lora, serif", fontSize: 11, letterSpacing: "0.15em", color: "#ffd700", background: "rgba(30,18,4,0.9)", border: "1px solid rgba(255,215,0,0.45)", borderRadius: 9999, padding: "8px 20px", cursor: "pointer" }}>Outside</button>
          </div>
        }>
          <InteriorViewerVisit
            url={openInterior.url}
            placedItems={interiorDecor}
            placedPets={interiorPets}
            leaveButtonX={openInterior.leaveButtonX}
            leaveButtonY={openInterior.leaveButtonY}
            onClose={() => setOpenInterior(null)}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
