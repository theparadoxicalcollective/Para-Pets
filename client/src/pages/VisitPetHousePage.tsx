import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";

// ── Types (mirrors PetHousePage) ──────────────────────────────────────────────
interface VisitedPet {
  inventoryId: string;
  shopItemId: string;
  name: string;
  nickname: string | null;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  eggImageUrl: string | null;
  rarity: number | null;
  petLevel: number;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petTemplateId: string | null;
  posLeft: string | null;
  posTop: string | null;
  location: string | null;
}

interface UserPetsResponse {
  username: string;
  pets: VisitedPet[];
}

interface ActiveBundle {
  id: string;
  name: string;
  bgImageUrl: string | null;
  buildings: {
    id: string;
    name: string;
    imageUrl: string;
    posX: number;
    posY: number;
    width: number;
    flippedX: boolean;
    interiorImageUrl?: string | null;
  }[];
}

interface PlacedDecorItem {
  id: string;
  decorItemId: string;
  xPct: number;
  yPct: number;
  size: number;
  flipped: boolean;
  item: { id: string; name: string; imageUrl: string | null };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_BG_RATIO = 1920 / 2400;
const BUILDING_REF_H = 900;

// Parse saved posLeft/posTop strings → 0–1 float (mirrors PetHousePage)
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
  const size = 120 + pseudo(seed + 2) * 25; // 120–145px (smaller than 160px interior pets)
  const centerX = 20 + pseudo(seed) * 60;
  const centerY = 64 + pseudo(seed + 1) * 11;
  return { size, centerX, centerY };
}

// ── Read-only interior viewer ─────────────────────────────────────────────────
function InteriorViewerVisit({
  url,
  placedItems,
  placedPets,
  onClose,
}: {
  url: string;
  placedItems: PlacedDecorItem[];
  placedPets: VisitedPet[];
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const aspectRef = useRef(16 / 9);
  const imgWidthRef = useRef(0);
  const containerHRef = useRef(0);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalHeight > 0) {
        const a = img.naturalWidth / img.naturalHeight;
        aspectRef.current = a;
        setAspect(a);
      }
    };
    img.src = url;
  }, [url]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const recalc = () => {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      const imgW = h * aspectRef.current;
      const newPanX = Math.max(Math.min(0, w - imgW), (w - imgW) / 2);
      setPanX(newPanX);
      setImgWidth(imgW);
      setContainerH(h);
      imgWidthRef.current = imgW;
      containerHRef.current = h;
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [aspect]);

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
    const h = container.offsetHeight;
    const imgW = h * aspectRef.current;
    const min = Math.min(0, w - imgW);
    const newPanX = Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX)));
    setPanX(newPanX);
  }, []);

  const handlePointerUp = useCallback(() => { panStartRef.current = null; }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0"
      style={{ zIndex: 60, background: "#000", overflow: "hidden", touchAction: "none", maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <img
        src={url}
        alt="Building interior"
        draggable={false}
        style={{ position: "absolute", top: 0, left: `${panX}px`, height: "100%", width: "auto", maxWidth: "none" }}
      />

      {/* Decor items (read-only) */}
      {imgWidth > 0 && placedItems.map((item) => {
        const left = panX + item.xPct * imgWidth;
        const top = item.yPct * containerH;
        return (
          <div
            key={item.id}
            className="absolute pointer-events-none"
            style={{ zIndex: 6, left, top, transform: "translate(-50%, -50%)" }}
          >
            <img
              src={item.item.imageUrl ?? ""}
              alt={item.item.name}
              draggable={false}
              style={{
                width: item.size, height: item.size, objectFit: "contain",
                transform: item.flipped ? "scaleX(-1)" : undefined,
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
                userSelect: "none",
              }}
            />
          </div>
        );
      })}

      {/* Pets placed inside this building (read-only) */}
      {imgWidth > 0 && placedPets.map((pet) => {
        const xPct = parsePetPct(pet.posLeft) ?? 0.5;
        const yPct = parsePetPct(pet.posTop) ?? 0.5;
        const left = panX + xPct * imgWidth;
        const top = yPct * containerH;
        const size = 160;
        return (
          <div
            key={pet.inventoryId}
            className="absolute pointer-events-none"
            style={{ zIndex: 7, left, top, width: size, height: size, transform: "translate(-50%, -50%)" }}
          >
            {pet.petTemplateId ? (
              <PetAnimator
                petTemplateId={pet.petTemplateId}
                mode="house"
                size={size}
                fillContainer
                className="pet-idle-squish"
                style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" }}
              />
            ) : (
              <div className="pet-idle-squish" style={{ width: "100%", height: "100%" }}>
                <img
                  src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                  alt={pet.nickname ?? pet.name}
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" }}
                />
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={onClose}
        onPointerDown={e => e.stopPropagation()}
        className="absolute right-4 flex items-center justify-center font-bold text-xs tracking-widest rounded-full px-4 py-2"
        style={{
          zIndex: 10,
          top: "max(48px, calc(16px + env(safe-area-inset-top, 0px)))",
          background: "rgba(0,0,0,0.65)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.25)",
          fontFamily: "Cinzel, serif",
        }}
      >
        Leave
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VisitPetHousePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [openInterior, setOpenInterior] = useState<{ url: string; buildingId: string } | null>(null);

  // Canvas panning state
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);
  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [bgAspect, setBgAspect] = useState(DEFAULT_BG_RATIO);

  // ── Data queries ─────────────────────────────────────────────────────────────
  const { data: petsData, isLoading, isError } = useQuery<UserPetsResponse>({
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
    refetchOnWindowFocus: true,
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
  const outdoorPets = pets.filter(p => p.posLeft !== null && (p.location === "outside" || p.location === null));
  const interiorPets = openInterior
    ? pets.filter(p => p.location === openInterior.buildingId && p.posLeft !== null)
    : [];

  // ── Background aspect + panning ──────────────────────────────────────────────
  const bgUrl = activeBundle?.bgImageUrl ?? null;

  useEffect(() => {
    if (!bgUrl) return;
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalHeight > 0) setBgAspect(img.naturalWidth / img.naturalHeight);
    };
    img.src = bgUrl;
  }, [bgUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const recalc = () => {
      const containerW = container.offsetWidth;
      const h = container.offsetHeight;
      const imgW = h * bgAspect;
      setContainerH(h);
      setImgWidth(imgW);
      setPanX(Math.max(Math.min(0, containerW - imgW), -(imgW - containerW) / 2));
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
    const containerW = container.offsetWidth;
    const imgW = container.offsetHeight * bgAspect;
    const min = Math.min(0, containerW - imgW);
    setPanX(Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX))));
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
      {/* Background — clipped separately so buildings can overflow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {bgUrl ? (
          <img
            src={bgUrl}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              top: 0,
              left: `${panX}px`,
              height: "100%",
              width: "auto",
              maxWidth: "none",
              userSelect: "none",
            }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0a1a0a 0%, #0d2210 60%, #081408 100%)" }} />
        )}
        <div className="absolute inset-0" style={{ zIndex: 1, background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 18%, transparent 72%, rgba(0,0,0,0.45) 100%)" }} />
      </div>

      {/* Buildings layer — NOT inside overflow:hidden so buildings at edges aren't clipped */}
      {imgWidth > 0 && activeBundle?.buildings && activeBundle.buildings.length > 0 && (
        <div
          className="absolute"
          style={{ zIndex: 4, top: 0, left: `${panX}px`, width: imgWidth, height: "100%", pointerEvents: "none" }}
        >
          {activeBundle.buildings.map((b) => {
            const hasInterior = !!b.interiorImageUrl;
            const displayW = Math.round((b.width ?? 120) * (containerH || BUILDING_REF_H) / BUILDING_REF_H);
            return (
              <div
                key={b.id}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${b.posX}%`, top: `${b.posY}%`,
                  transform: "translate(-50%, -100%)",
                  minWidth: displayW,
                  pointerEvents: hasInterior ? "auto" : "none",
                  cursor: hasInterior ? "pointer" : "default",
                }}
                onClick={() => hasInterior && setOpenInterior({ url: b.interiorImageUrl!, buildingId: b.id })}
              >
                <img
                  src={b.imageUrl} alt={b.name} draggable={false}
                  style={{
                    width: displayW, height: displayW, objectFit: "contain",
                    filter: "drop-shadow(0 0 10px rgba(255,210,80,0.3)) drop-shadow(0 3px 6px rgba(0,0,0,0.55))",
                    transform: b.flippedX ? "scaleX(-1)" : undefined,
                    flexShrink: 0,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Outdoor pets layer (read-only, same rendering as PetHousePage) */}
      {imgWidth > 0 && outdoorPets.map((pet, i) => {
        const cfg = randomGroundConfig(i);
        const savedX = parsePetPct(pet.posLeft);
        const savedY = parsePetPct(pet.posTop);
        const xPct = savedX ?? (cfg.centerX / 100);
        const yPct = savedY ?? (cfg.centerY / 100);
        const left = panX + xPct * imgWidth;
        const top = yPct * containerH;
        return (
          <div
            key={pet.inventoryId}
            data-testid={`visit-pet-outdoor-${pet.inventoryId}`}
            className="absolute pointer-events-none"
            style={{
              zIndex: 5,
              left,
              top,
              width: cfg.size,
              height: cfg.size,
              transform: "translate(-50%, -50%)",
            }}
          >
            {pet.petTemplateId ? (
              <PetAnimator
                petTemplateId={pet.petTemplateId}
                mode="house"
                size={cfg.size}
                fillContainer
                className="pet-idle-squish"
                style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}
              />
            ) : (
              <div className="pet-idle-squish" style={{ width: "100%", height: "100%" }}>
                <img
                  src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                  alt={pet.nickname ?? pet.name}
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Outdoor decor layer (read-only) */}
      {imgWidth > 0 && outdoorDecor.map((item) => {
        const left = panX + item.xPct * imgWidth;
        const top = item.yPct * containerH;
        return (
          <div
            key={item.id}
            className="absolute pointer-events-none"
            style={{ zIndex: 6, left, top, transform: "translate(-50%, -50%)" }}
          >
            <img
              src={item.item.imageUrl ?? ""}
              alt={item.item.name}
              draggable={false}
              style={{
                width: item.size, height: item.size, objectFit: "contain",
                transform: item.flipped ? "scaleX(-1)" : undefined,
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
                userSelect: "none",
              }}
            />
          </div>
        );
      })}

      {/* HUD */}
      <div
        className="absolute z-30 left-0 right-0 flex items-center justify-between px-3"
        style={{
          paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
          paddingBottom: 8,
          background: "linear-gradient(180deg, rgba(8,14,5,0.82) 0%, rgba(8,14,5,0.45) 80%, transparent 100%)",
          pointerEvents: "none",
        }}
      >
        {/* X — close, go back */}
        <button
          data-testid="button-back-visit"
          onClick={() => window.history.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-transform active:scale-90"
          style={{
            background: "rgba(4,10,6,0.88)",
            border: "1.5px solid rgba(127,255,212,0.35)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.7)",
            color: "#7fffd4",
            cursor: "pointer",
            pointerEvents: "auto",
          }}
        >
          <X size={16} />
        </button>

        {/* Owner name — centre */}
        {petsData && (
          <p
            className="font-fantasy text-xs tracking-widest absolute left-0 right-0 text-center pointer-events-none"
            style={{ color: "rgba(240,192,64,0.85)", textShadow: "0 0 12px rgba(240,192,64,0.4)" }}
            data-testid="text-visit-house-owner"
          >
            {petsData.username}'s Pet House
          </p>
        )}

        {/* Spacer to balance the layout */}
        <div className="w-9 h-9 flex-shrink-0" />
      </div>

      {/* Loading / error states */}
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

      {/* Read-only interior overlay */}
      {openInterior && (
        <InteriorViewerVisit
          url={openInterior.url}
          placedItems={interiorDecor}
          placedPets={interiorPets}
          onClose={() => setOpenInterior(null)}
        />
      )}
    </div>
  );
}
