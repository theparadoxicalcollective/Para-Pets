import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X, Heart, Sword, Shield, Star } from "lucide-react";
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
interface EquippedAccessory {
  id: string; name: string; imageUrl: string | null;
  atkBoost: number | null; defBoost: number | null; healthBoost: number | null;
}

const DEFAULT_BG_RATIO = 1920 / 2400;
const BUILDING_REF_H = 900;
const INTERIOR_PET_SIZE = 110;

const RARITY_LABEL: Record<number, string> = { 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary" };
const RARITY_COLOR: Record<number, string> = { 1: "#a89878", 2: "#6dbf6d", 3: "#5ba3e0", 4: "#c373f5", 5: "#ffd700" };

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

// ── Pet Stat Popup ────────────────────────────────────────────────────────────
function PetStatPopup({ pet, onClose }: { pet: VisitedPet; onClose: () => void }) {
  const { data: accessories = [], isLoading: accsLoading } = useQuery<EquippedAccessory[]>({
    queryKey: ["/api/pet", pet.inventoryId, "accessories/public"],
    queryFn: async () => {
      const res = await fetch(`/api/pet/${pet.inventoryId}/accessories/public`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30000,
  });

  const rarityColor = RARITY_COLOR[pet.rarity ?? 1] ?? "#a89878";
  const rarityLabel = RARITY_LABEL[pet.rarity ?? 1] ?? "Common";
  const displayName = pet.nickname ?? pet.name;

  return (
    <div
      data-testid="overlay-pet-stat-popup"
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 120, background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        data-testid="panel-pet-stat"
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: "linear-gradient(180deg, #0f0a18 0%, #130c1e 100%)",
          border: "1px solid rgba(180,140,255,0.22)",
          borderBottom: "none",
          borderRadius: "20px 20px 0 0",
          padding: "20px 20px 32px",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 72, height: 72, flexShrink: 0,
            borderRadius: 14,
            background: "rgba(255,255,255,0.04)",
            border: `1.5px solid ${rarityColor}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            {pet.petTemplateId ? (
              <PetAnimator petTemplateId={pet.petTemplateId} mode="static" size={68} fillContainer />
            ) : (pet.hatchedImageUrl || pet.imageUrl) ? (
              <img src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""} alt={displayName} draggable={false} style={{ width: 68, height: 68, objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: 32 }}>🐾</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "Lora, serif", fontSize: 15, fontWeight: 700, color: "#f0e8ff", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              data-testid="text-pet-stat-name">{displayName}</p>
            {pet.nickname && (
              <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#9070c0", margin: "0 0 6px" }}>{pet.name}</p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "Lora, serif", fontSize: 10, letterSpacing: "0.1em", color: rarityColor, background: `${rarityColor}18`, border: `1px solid ${rarityColor}45`, borderRadius: 99, padding: "2px 8px" }}>{rarityLabel}</span>
              <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "#d4a017", display: "flex", alignItems: "center", gap: 3 }}>
                <Star size={10} style={{ color: "#d4a017" }} />Lv.{pet.petLevel}
              </span>
            </div>
          </div>

          <button
            data-testid="button-close-pet-stat"
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ height: 1, background: "rgba(180,140,255,0.12)", marginBottom: 14 }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
          <div style={{ background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4 }}>
              <Heart size={11} style={{ color: "#ff7070" }} />
              <span style={{ fontFamily: "Lora, serif", fontSize: 9, letterSpacing: "0.12em", color: "#ff7070", textTransform: "uppercase" }}>HP</span>
            </div>
            <p data-testid="text-pet-stat-hp" style={{ fontFamily: "Lora, serif", fontSize: 17, fontWeight: 700, color: "#ffaaaa", margin: 0 }}>{pet.petHealth}</p>
          </div>
          <div style={{ background: "rgba(255,170,50,0.08)", border: "1px solid rgba(255,170,50,0.2)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4 }}>
              <Sword size={11} style={{ color: "#ffaa33" }} />
              <span style={{ fontFamily: "Lora, serif", fontSize: 9, letterSpacing: "0.12em", color: "#ffaa33", textTransform: "uppercase" }}>ATK</span>
            </div>
            <p data-testid="text-pet-stat-atk" style={{ fontFamily: "Lora, serif", fontSize: 17, fontWeight: 700, color: "#ffd080", margin: 0 }}>{pet.petAtk}</p>
          </div>
          <div style={{ background: "rgba(80,160,255,0.08)", border: "1px solid rgba(80,160,255,0.2)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4 }}>
              <Shield size={11} style={{ color: "#60a8ff" }} />
              <span style={{ fontFamily: "Lora, serif", fontSize: 9, letterSpacing: "0.12em", color: "#60a8ff", textTransform: "uppercase" }}>DEF</span>
            </div>
            <p data-testid="text-pet-stat-def" style={{ fontFamily: "Lora, serif", fontSize: 17, fontWeight: 700, color: "#a0c8ff", margin: 0 }}>{pet.petDef}</p>
          </div>
        </div>

        <div>
          <p style={{ fontFamily: "Lora, serif", fontSize: 9, letterSpacing: "0.2em", color: "#7060a0", textTransform: "uppercase", margin: "0 0 8px" }}>Equipped Accessories</p>
          {accsLoading ? (
            <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(200,180,255,0.3)", margin: 0 }}>Loading…</p>
          ) : accessories.length === 0 ? (
            <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(200,180,255,0.3)", margin: 0 }}>No accessories equipped</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {accessories.map(acc => (
                <div
                  key={acc.id}
                  data-testid={`row-accessory-${acc.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(180,140,255,0.15)", borderRadius: 10, padding: "7px 10px" }}
                >
                  {acc.imageUrl && (
                    <img src={acc.imageUrl} alt={acc.name} style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
                  )}
                  <span style={{ fontFamily: "Lora, serif", fontSize: 12, color: "#d4c0f0", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</span>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {(acc.healthBoost ?? 0) > 0 && <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "#ffaaaa" }}>+{acc.healthBoost} HP</span>}
                    {(acc.atkBoost ?? 0) > 0 && <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "#ffd080" }}>+{acc.atkBoost} ATK</span>}
                    {(acc.defBoost ?? 0) > 0 && <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "#a0c8ff" }}>+{acc.defBoost} DEF</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Read-only Interior Viewer ─────────────────────────────────────────────────
function InteriorViewerVisit({ url, placedItems, placedPets, leaveButtonX = 0.92, leaveButtonY = 0.06, onClose, onPetClick }: {
  url: string;
  placedItems: PlacedDecorItem[];
  placedPets: VisitedPet[];
  leaveButtonX?: number;
  leaveButtonY?: number;
  onClose: () => void;
  onPetClick: (pet: VisitedPet) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef(16 / 9);
  const imgWidthRef = useRef(0);
  const containerHRef = useRef(0);
  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number; moved: boolean } | null>(null);

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
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId, moved: false };
  }, [panX]);

  const onMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    const imgW = h * aspectRef.current;
    const min = Math.min(0, w - imgW);
    const newPanX = Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX)));
    if (Math.abs(e.clientX - drag.startX) > 4) drag.moved = true;
    setPanX(newPanX);
  }, []);

  const onUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    panStartRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0"
      style={{ zIndex: 60, background: "#000", overflow: "hidden", touchAction: "none" }}
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

      {imgWidth > 0 && placedPets.map((pet) => {
        const xPct = parsePetPct(pet.posLeft) ?? 0.5;
        const yPct = parsePetPct(pet.posTop) ?? 0.5;
        return (
          <div
            key={pet.inventoryId}
            data-testid={`visit-pet-interior-${pet.inventoryId}`}
            className="absolute pet-idle-squish"
            style={{ zIndex: 7, left: panX + xPct * imgWidth, top: yPct * containerH, width: INTERIOR_PET_SIZE, height: INTERIOR_PET_SIZE, transform: "translate(-50%, -50%)", cursor: "pointer", pointerEvents: "auto" }}
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onPetClick(pet); }}
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
          left: imgWidth > 0 ? panX + leaveButtonX * imgWidth : `${leaveButtonX * 100}%`,
          top: containerH > 0 ? leaveButtonY * containerH : `${leaveButtonY * 100}%`,
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
  const [selectedPet, setSelectedPet] = useState<VisitedPet | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number; moved: boolean } | null>(null);
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

  const { data: me } = useQuery<{ id: string; coins: number } | null>({
    queryKey: ["/api/auth/me"],
  });

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
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId, moved: false };
  }, [panX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const w = container.offsetWidth;
    const imgW = container.offsetHeight * bgAspect;
    if (Math.abs(e.clientX - drag.startX) > 4) drag.moved = true;
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
            const isMailbox = (b.name ?? "").toLowerCase().includes("mailbox");
            const isClickable = hasInterior || isMailbox;
            const displayW = Math.round((b.width ?? 120) * (containerH || BUILDING_REF_H) / BUILDING_REF_H);
            return (
              <div
                key={b.id}
                data-testid={isMailbox ? `building-mailbox-${b.id}` : `building-${b.id}`}
                className="absolute flex flex-col items-center"
                style={{ left: `${b.posX}%`, top: `${b.posY}%`, transform: "translate(-50%, -100%)", minWidth: displayW, pointerEvents: isClickable ? "auto" : "none", cursor: isClickable ? "pointer" : "default" }}
                onPointerDown={e => { if (isClickable) e.stopPropagation(); }}
                onClick={() => {
                  if (isMailbox) { setShowGiftModal(true); return; }
                  if (hasInterior) {
                    setOpenInterior({ url: b.interiorImageUrl!, buildingId: b.id, leaveButtonX: b.leaveButtonX ?? 0.92, leaveButtonY: b.leaveButtonY ?? 0.06 });
                  }
                }}
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

      {/* Outdoor pets — tappable */}
      {imgWidth > 0 && outdoorPets.map((pet, i) => {
        const cfg = randomGroundConfig(i);
        const xPct = parsePetPct(pet.posLeft) ?? cfg.centerX / 100;
        const yPct = parsePetPct(pet.posTop) ?? cfg.centerY / 100;
        return (
          <div
            key={pet.inventoryId}
            data-testid={`visit-pet-outdoor-${pet.inventoryId}`}
            className="absolute"
            style={{ zIndex: 5, left: panX + xPct * imgWidth, top: yPct * containerH, width: cfg.size, height: cfg.size, transform: "translate(-50%, -50%)", cursor: "pointer", pointerEvents: "auto" }}
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setSelectedPet(pet); }}
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

      {/* Outdoor decor */}
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

      {showGiftModal && userId && petsData && (
        <SendGiftModal
          friendId={userId}
          friendUsername={petsData.username}
          senderCoins={me?.coins ?? 0}
          onClose={() => setShowGiftModal(false)}
        />
      )}

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
            onPetClick={(pet) => setSelectedPet(pet)}
          />
        </ErrorBoundary>
      )}

      {selectedPet && (
        <PetStatPopup pet={selectedPet} onClose={() => setSelectedPet(null)} />
      )}
    </div>
  );
}
