import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetAnimator from "@/components/PetAnimator";
import homeInventoryIcon from "@assets/icon_home_inventory.png";
import decorInventoryIcon from "@assets/icon_decor_inventory.png";

// ── Game-style decor control buttons ─────────────────────────────────────────
function SvgMinus() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M5 11h12" stroke="#ffd700" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M11 3 L13 6 L11 5 L9 6 Z" fill="#ffd700" opacity="0.5"/>
      <path d="M11 19 L13 16 L11 17 L9 16 Z" fill="#ffd700" opacity="0.5"/>
    </svg>
  );
}
function SvgPlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M5 11h12M11 5v12" stroke="#ffd700" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
function SvgFlip() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M3 11h16" stroke="#ffd700" strokeWidth="1.5" strokeDasharray="2 2" strokeLinecap="round"/>
      <path d="M6 7 L3 11 L6 15" stroke="#ffd700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 7 L19 11 L16 15" stroke="#ffd700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function SvgDelete() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M8 9v7M11 9v7M14 9v7" stroke="#ff8080" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M5 7h12M9 7V5.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V7" stroke="#ff8080" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="6" y="7" width="10" height="10" rx="1.5" stroke="#ff8080" strokeWidth="1.8"/>
    </svg>
  );
}

function DecorControlBtn({ onClick, danger = false, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex items-center justify-center rounded-xl active:opacity-60"
      style={{
        width: 44,
        height: 44,
        background: danger ? "rgba(90,10,10,0.92)" : "rgba(8,18,8,0.94)",
        border: danger ? "1.5px solid rgba(255,80,80,0.55)" : "1.5px solid rgba(255,215,0,0.55)",
        boxShadow: "0 2px 14px rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

interface PetHousePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

interface HousePet {
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

interface HouseBundle {
  id: string;
  name: string;
  shopImageUrl: string | null;
  bgImageUrl: string | null;
  price: number;
}

interface ActiveBundle extends HouseBundle {
  buildings: { id: string; name: string; imageUrl: string; posX: number; posY: number; width: number; flippedX: boolean; interiorImageUrl?: string | null }[];
}

interface OwnedBundle {
  id: string;
  bundleId: string;
  bundle: HouseBundle & { shopImageUrl: string | null };
}

interface DecorInventoryItem {
  id: string;
  decorItemId: string;
  quantity: number;
  item: { id: string; name: string; imageUrl: string | null; price: number };
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

const DEFAULT_BG_RATIO = 1920 / 2400;
const BUILDING_REF_H   = 900; // must match HouseBundleAdminPanel constant

function InteriorViewer({
  url,
  placedItems,
  placedPets,
  panStateRef,
  onUpdateItem,
  onRemoveItem,
  onMovePet,
  onRemovePet,
  onClose,
}: {
  url: string;
  placedItems: PlacedDecorItem[];
  placedPets: HousePet[];
  panStateRef: React.MutableRefObject<{ panX: number; imgWidth: number; containerH: number } | null>;
  onUpdateItem: (id: string, data: { xPct?: number; yPct?: number; size?: number; flipped?: boolean }) => void;
  onRemoveItem: (id: string) => void;
  onMovePet: (inventoryId: string, xPct: number, yPct: number) => void;
  onRemovePet: (inventoryId: string) => void;
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemDragLive, setItemDragLive] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const itemDragRef = useRef<{ id: string; startXPct: number; startYPct: number; startPointerX: number; startPointerY: number; pid: number } | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [petDragLiveInt, setPetDragLiveInt] = useState<{ inventoryId: string; xPct: number; yPct: number } | null>(null);
  const petDragIntRef = useRef<{ inventoryId: string; startXPct: number; startYPct: number; startPointerX: number; startPointerY: number; pid: number } | null>(null);

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
      panStateRef.current = { panX: newPanX, imgWidth: imgW, containerH: h };
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [aspect]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (selectedItemId) setSelectedItemId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX, selectedItemId]);

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
    panStateRef.current = { panX: newPanX, imgWidth: imgWidthRef.current, containerH: containerHRef.current };
  }, []);

  const handlePointerUp = useCallback(() => { panStartRef.current = null; }, []);

  const handleItemDragStart = useCallback((e: React.PointerEvent, item: PlacedDecorItem) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    itemDragRef.current = { id: item.id, startXPct: item.xPct, startYPct: item.yPct, startPointerX: e.clientX, startPointerY: e.clientY, pid: e.pointerId };
    setSelectedItemId(item.id);
  }, []);

  const handleItemDragMove = useCallback((e: React.PointerEvent) => {
    const drag = itemDragRef.current;
    if (!drag || drag.pid !== e.pointerId || imgWidthRef.current <= 0) return;
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidthRef.current));
    const newYPct = Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerHRef.current));
    setItemDragLive({ id: drag.id, xPct: newXPct, yPct: newYPct });
  }, []);

  const handleItemDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = itemDragRef.current;
    itemDragRef.current = null;
    setItemDragLive(null);
    if (!drag || imgWidthRef.current <= 0) return;
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidthRef.current));
    const newYPct = Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerHRef.current));
    const moved = Math.abs(newXPct - drag.startXPct) > 0.005 || Math.abs(newYPct - drag.startYPct) > 0.005;
    if (moved) onUpdateItem(drag.id, { xPct: newXPct, yPct: newYPct });
  }, [onUpdateItem]);

  const handlePetDragStartInt = useCallback((e: React.PointerEvent, pet: HousePet) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const savedX = parsePetPct(pet.posLeft) ?? 0.5;
    const savedY = parsePetPct(pet.posTop) ?? 0.5;
    petDragIntRef.current = { inventoryId: pet.inventoryId, startXPct: savedX, startYPct: savedY, startPointerX: e.clientX, startPointerY: e.clientY, pid: e.pointerId };
    setSelectedPetId(pet.inventoryId);
  }, []);

  const handlePetDragMoveInt = useCallback((e: React.PointerEvent) => {
    const drag = petDragIntRef.current;
    if (!drag || drag.pid !== e.pointerId || imgWidthRef.current <= 0) return;
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidthRef.current));
    const newYPct = Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerHRef.current));
    setPetDragLiveInt({ inventoryId: drag.inventoryId, xPct: newXPct, yPct: newYPct });
  }, []);

  const handlePetDragEndInt = useCallback((e: React.PointerEvent) => {
    const drag = petDragIntRef.current;
    petDragIntRef.current = null;
    setPetDragLiveInt(null);
    if (!drag || imgWidthRef.current <= 0) return;
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidthRef.current));
    const newYPct = Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerHRef.current));
    const moved = Math.abs(newXPct - drag.startXPct) > 0.005 || Math.abs(newYPct - drag.startYPct) > 0.005;
    if (moved) onMovePet(drag.inventoryId, newXPct, newYPct);
  }, [onMovePet]);

  const displayedItems = useMemo(() =>
    placedItems.map(item =>
      itemDragLive?.id === item.id
        ? { ...item, xPct: itemDragLive.xPct, yPct: itemDragLive.yPct }
        : item
    ), [placedItems, itemDragLive]);

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

      {imgWidth > 0 && displayedItems.map((item) => {
        const isSelected = selectedItemId === item.id;
        const left = panX + item.xPct * imgWidth;
        const top = item.yPct * containerH;
        return (
          <div
            key={item.id}
            className="absolute"
            style={{ zIndex: 6, left, top, transform: "translate(-50%, -50%)", touchAction: "none" }}
            onPointerDown={(e) => handleItemDragStart(e, item)}
            onPointerMove={handleItemDragMove}
            onPointerUp={handleItemDragEnd}
            onPointerCancel={handleItemDragEnd}
            onClick={(e) => { e.stopPropagation(); setSelectedItemId(isSelected ? null : item.id); }}
          >
            {isSelected && (
              <div className="absolute flex gap-2" style={{ bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", zIndex: 10, whiteSpace: "nowrap" }}>
                <DecorControlBtn onClick={() => onUpdateItem(item.id, { size: Math.max(175, item.size - 25) })}><SvgMinus /></DecorControlBtn>
                <DecorControlBtn onClick={() => onUpdateItem(item.id, { size: Math.min(400, item.size + 25) })}><SvgPlus /></DecorControlBtn>
                <DecorControlBtn onClick={() => onUpdateItem(item.id, { flipped: !item.flipped })}><SvgFlip /></DecorControlBtn>
                <DecorControlBtn danger onClick={() => { onRemoveItem(item.id); setSelectedItemId(null); }}><SvgDelete /></DecorControlBtn>
              </div>
            )}
            <img
              src={item.item.imageUrl ?? ""}
              alt={item.item.name}
              draggable={false}
              style={{
                width: item.size, height: item.size, objectFit: "contain",
                transform: item.flipped ? "scaleX(-1)" : undefined,
                filter: isSelected
                  ? "drop-shadow(0 0 10px rgba(255,215,0,0.9)) drop-shadow(0 2px 6px rgba(0,0,0,0.5))"
                  : "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
                outline: isSelected ? "2px solid rgba(255,215,0,0.7)" : "none",
                outlineOffset: "3px", borderRadius: 6, userSelect: "none", cursor: "grab",
              }}
            />
          </div>
        );
      })}

      {/* Pets placed inside this building */}
      {imgWidth > 0 && placedPets.map((pet) => {
        const isSelPet = selectedPetId === pet.inventoryId;
        const livePos = petDragLiveInt?.inventoryId === pet.inventoryId ? petDragLiveInt : null;
        const xPct = livePos?.xPct ?? (parsePetPct(pet.posLeft) ?? 0.5);
        const yPct = livePos?.yPct ?? (parsePetPct(pet.posTop) ?? 0.5);
        const left = panX + xPct * imgWidth;
        const top = yPct * containerH;
        const size = 160;
        return (
          <div
            key={pet.inventoryId}
            className="absolute"
            style={{ zIndex: 7, left, top, width: size, height: size, transform: "translate(-50%, -50%)", touchAction: "none", cursor: isSelPet ? "grabbing" : "grab" }}
            onPointerDown={(e) => handlePetDragStartInt(e, pet)}
            onPointerMove={handlePetDragMoveInt}
            onPointerUp={handlePetDragEndInt}
            onPointerCancel={handlePetDragEndInt}
            onClick={(e) => { e.stopPropagation(); setSelectedPetId(isSelPet ? null : pet.inventoryId); }}
          >
            {isSelPet && (
              <div className="absolute flex gap-2" style={{ bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", zIndex: 10, whiteSpace: "nowrap" }}>
                <DecorControlBtn danger onClick={() => { onRemovePet(pet.inventoryId); setSelectedPetId(null); }}>
                  <SvgDelete />
                </DecorControlBtn>
              </div>
            )}
            <div className={isSelPet ? undefined : "pet-idle-squish"} style={{ width: "100%", height: "100%" }}>
              <img
                src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                alt={pet.nickname ?? pet.name}
                draggable={false}
                style={{
                  width: "100%", height: "100%", objectFit: "contain",
                  filter: isSelPet ? "drop-shadow(0 0 10px rgba(255,215,0,0.9))" : "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
                  outline: isSelPet ? "2px solid rgba(255,215,0,0.7)" : "none",
                  outlineOffset: "3px", borderRadius: 6,
                }}
              />
            </div>
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

function randomGroundConfig(index: number) {
  const seed = index * 137.508;
  const pseudo = (n: number) => ((Math.sin(n) * 10000) % 1 + 1) % 1;
  const size = 180 + pseudo(seed + 2) * 40;    // 180–220px (~200px)
  const centerX = 20 + pseudo(seed) * 60;      // 20–80% horizontally
  const centerY = 64 + pseudo(seed + 1) * 11;  // 64–75% vertically (safely above toolbar)
  return { size, centerX, centerY };
}

// Parse saved posLeft/posTop strings (stored as "0–100" percentage strings or legacy calc() strings) into 0–1 floats
function parsePetPct(s: string | null): number | null {
  if (!s) return null;
  const v = parseFloat(s);
  if (!isNaN(v)) return Math.max(0, Math.min(1, v / 100));
  const m = s.match(/calc\(([\d.]+)%/);
  if (m) return Math.max(0, Math.min(1, parseFloat(m[1]) / 100));
  return null;
}


export default function PetHousePage({ user }: PetHousePageProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showProfile, setShowProfile] = useState(false);
  const [openInterior, setOpenInterior] = useState<{ url: string; buildingId: string } | null>(null);
  const interiorPanRef = useRef<{ panX: number; imgWidth: number; containerH: number } | null>(null);
  const [currentUser, setCurrentUser] = useState(user);
  const [openInventory, setOpenInventory] = useState<"home" | "decor" | "pets" | null>(null);
  const [pendingActivate, setPendingActivate] = useState<{ bundleId: string; bundle: OwnedBundle["bundle"] } | null>(null);

  // Pet inventory drag state
  const [isDraggingPet, setIsDraggingPet] = useState(false);
  const [petInvDragState, setPetInvDragState] = useState<{ pet: HousePet; ghostX: number; ghostY: number } | null>(null);
  const petInvDragRef = useRef<{ pet: HousePet; ghostX: number; ghostY: number; startX: number; startY: number; isDragging: boolean; pid: number } | null>(null);

  // Decor interaction state
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [placedDragLive, setPlacedDragLive] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const [inventoryDragState, setInventoryDragState] = useState<{ decorItemId: string; imageUrl: string | null; ghostX: number; ghostY: number } | null>(null);
  const inventoryDragRef = useRef<{ decorItemId: string; imageUrl: string | null; ghostX: number; ghostY: number; startX: number; startY: number; isDragging: boolean; pid: number } | null>(null);
  const [isDraggingDecor, setIsDraggingDecor] = useState(false);
  const placedDragRef = useRef<{ id: string; startXPct: number; startYPct: number; startPointerX: number; startPointerY: number; pid: number } | null>(null);

  // Pet drag state
  const [petDragLive, setPetDragLive] = useState<{ inventoryId: string; xPct: number; yPct: number } | null>(null);
  const petDragRef = useRef<{ inventoryId: string; startXPct: number; startYPct: number; startPointerX: number; startPointerY: number; pid: number; moved: boolean } | null>(null);

  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [bgAspect, setBgAspect] = useState(DEFAULT_BG_RATIO);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);

  // Active bundle query
  const { data: activeBundle, refetch: refetchActiveBundle } = useQuery<ActiveBundle | null>({
    queryKey: ["/api/users", user.id, "active-house-bundle"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/active-house-bundle`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
  });

  // User's owned bundles
  const { data: ownedBundles = [], refetch: refetchOwned } = useQuery<OwnedBundle[]>({
    queryKey: ["/api/users", user.id, "house-bundles"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/house-bundles`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30000,
  });

  const activateMutation = useMutation({
    mutationFn: async (bundleId: string) => {
      const res = await apiRequest("POST", `/api/house-bundles/${bundleId}/activate`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      refetchActiveBundle();
      toast({ title: "Bundle activated!" });
    },
    onError: (e: any) => toast({ title: "Activation failed", description: e.message, variant: "destructive" }),
  });

  // Decor inventory & placed decor
  const { data: decorInventory = [] } = useQuery<DecorInventoryItem[]>({
    queryKey: ["/api/pet-house/decor/inventory"],
    staleTime: 15000,
  });

  const { data: placedDecorRaw = [] } = useQuery<PlacedDecorItem[]>({
    queryKey: ["/api/pet-house/decor/placed", "outside"],
    queryFn: async () => {
      const res = await fetch("/api/pet-house/decor/placed?location=outside", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 15000,
  });

  const { data: interiorPlacedRaw = [] } = useQuery<PlacedDecorItem[]>({
    queryKey: ["/api/pet-house/decor/placed", openInterior?.buildingId ?? ""],
    queryFn: async () => {
      if (!openInterior) return [];
      const res = await fetch(`/api/pet-house/decor/placed?location=${encodeURIComponent(openInterior.buildingId)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!openInterior,
    staleTime: 15000,
  });

  // Optimistically merge live drag positions into placed decor list
  const placedDecor = useMemo(() =>
    placedDecorRaw.map(item =>
      placedDragLive?.id === item.id
        ? { ...item, xPct: placedDragLive.xPct, yPct: placedDragLive.yPct }
        : item
    ), [placedDecorRaw, placedDragLive]);

  const placeDecorMutation = useMutation({
    mutationFn: async (data: { decorItemId: string; xPct: number; yPct: number; size: number; flipped: boolean; location?: string }) => {
      const res = await apiRequest("POST", "/api/pet-house/decor/place", data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pet-house/decor/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/pet-house/decor/placed"] });
    },
    onError: (e: any) => toast({ title: "Could not place item", description: e.message, variant: "destructive" }),
  });

  const updateDecorMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; xPct?: number; yPct?: number; size?: number; flipped?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/pet-house/decor/placed/${id}`, data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/pet-house/decor/placed"] }),
  });

  const removeDecorMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/pet-house/decor/placed/${id}`, {});
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      setSelectedPlacedId(null);
      qc.invalidateQueries({ queryKey: ["/api/pet-house/decor/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/pet-house/decor/placed"] });
    },
    onError: (e: any) => toast({ title: "Could not remove item", description: e.message, variant: "destructive" }),
  });

  const updatePetPositionMutation = useMutation({
    mutationFn: async ({ inventoryId, xPct, yPct }: { inventoryId: string; xPct: number; yPct: number }) => {
      const res = await apiRequest("PATCH", `/api/pet-house-positions/${inventoryId}`, {
        posLeft: String(xPct * 100),
        posTop: String(yPct * 100),
        location: "outside",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users", user.id, "pets"] }),
  });

  const placePetMutation = useMutation({
    mutationFn: async ({ inventoryId, xPct, yPct, location }: { inventoryId: string; xPct: number; yPct: number; location: string }) => {
      const res = await apiRequest("PATCH", `/api/pet-house-positions/${inventoryId}`, {
        posLeft: String(xPct * 100),
        posTop: String(yPct * 100),
        location,
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users", user.id, "pets"] }),
  });

  const storeAllPetsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/pet-house-positions/all", {});
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users", user.id, "pets"] });
      toast({ title: "All pets stored!", description: "Drag them back out anytime." });
    },
    onError: () => toast({ title: "Error", description: "Could not store pets.", variant: "destructive" }),
  });

  const removePetFromSceneMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("DELETE", `/api/pet-house-positions/${inventoryId}`, {});
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users", user.id, "pets"] }),
  });

  // ── Pet inventory drag handlers ─────────────────────────────────────────────
  const handlePetInvDragStart = useCallback((e: React.PointerEvent, pet: HousePet) => {
    e.stopPropagation();
    // Capture on the main container so pointer events remain reliable even when
    // the panel becomes visibility:hidden during drag.
    containerRef.current?.setPointerCapture(e.pointerId);
    petInvDragRef.current = { pet, ghostX: e.clientX, ghostY: e.clientY, startX: e.clientX, startY: e.clientY, isDragging: false, pid: e.pointerId };
  }, []);

  const handlePetInvDragMove = useCallback((e: React.PointerEvent) => {
    const drag = petInvDragRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    drag.ghostX = e.clientX;
    drag.ghostY = e.clientY;
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8) drag.isDragging = true;
    if (drag.isDragging) {
      setPetInvDragState({ pet: drag.pet, ghostX: e.clientX, ghostY: e.clientY });
      setIsDraggingPet(true);
    }
  }, []);

  const handlePetInvDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = petInvDragRef.current;
    petInvDragRef.current = null;
    setPetInvDragState(null);
    setIsDraggingPet(false);
    if (!drag?.isDragging) return;
    const interior = interiorPanRef.current;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (interior && interior.imgWidth > 0 && openInterior) {
      const xPct = Math.max(0.03, Math.min(0.97, (localX - interior.panX) / interior.imgWidth));
      const yPct = Math.max(0.03, Math.min(0.97, localY / interior.containerH));
      placePetMutation.mutate({ inventoryId: drag.pet.inventoryId, xPct, yPct, location: openInterior.buildingId });
    } else if (imgWidth > 0) {
      const maxYPct = containerH > 0 ? Math.min(0.88, (containerH - 115) / containerH) : 0.82;
      if (localY < 0 || localY > rect.height) return;
      const xPct = Math.max(0.05, Math.min(0.95, (localX - panX) / imgWidth));
      const yPct = Math.max(0.05, Math.min(maxYPct, localY / containerH));
      placePetMutation.mutate({ inventoryId: drag.pet.inventoryId, xPct, yPct, location: "outside" });
    }
  }, [openInterior, panX, imgWidth, containerH]);

  // ── Drag handlers: pet reposition ─────────────────────────────────────────
  const handlePetDragStart = useCallback((e: React.PointerEvent, inventoryId: string, startXPct: number, startYPct: number) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    petDragRef.current = { inventoryId, startXPct, startYPct, startPointerX: e.clientX, startPointerY: e.clientY, pid: e.pointerId, moved: false };
  }, []);

  const handlePetDragMove = useCallback((e: React.PointerEvent) => {
    const drag = petDragRef.current;
    if (!drag || drag.pid !== e.pointerId || imgWidth <= 0) return;
    const dx = e.clientX - drag.startPointerX;
    const dy = e.clientY - drag.startPointerY;
    if (Math.hypot(dx, dy) > 8) drag.moved = true;
    if (!drag.moved) return;
    const maxYPct = containerH > 0 ? Math.min(0.88, (containerH - 115) / containerH) : 0.82;
    const newXPct = Math.max(0.05, Math.min(0.95, drag.startXPct + dx / imgWidth));
    const newYPct = Math.max(0.05, Math.min(maxYPct, drag.startYPct + dy / containerH));
    setPetDragLive({ inventoryId: drag.inventoryId, xPct: newXPct, yPct: newYPct });
  }, [imgWidth, containerH]);

  const handlePetDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = petDragRef.current;
    petDragRef.current = null;
    setPetDragLive(null);
    if (!drag?.moved || imgWidth <= 0) return;
    const maxYPct = containerH > 0 ? Math.min(0.88, (containerH - 115) / containerH) : 0.82;
    const newXPct = Math.max(0.05, Math.min(0.95, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidth));
    const newYPct = Math.max(0.05, Math.min(maxYPct, drag.startYPct + (e.clientY - drag.startPointerY) / containerH));
    updatePetPositionMutation.mutate({ inventoryId: drag.inventoryId, xPct: newXPct, yPct: newYPct });
  }, [imgWidth, containerH]);

  // ── Drag handlers: inventory item → canvas ────────────────────────────────
  const handleInvDragStart = useCallback((e: React.PointerEvent, decorItemId: string, imageUrl: string | null) => {
    e.stopPropagation();
    // Capture on main container for reliability when panel hides
    containerRef.current?.setPointerCapture(e.pointerId);
    inventoryDragRef.current = { decorItemId, imageUrl, ghostX: e.clientX, ghostY: e.clientY, startX: e.clientX, startY: e.clientY, isDragging: false, pid: e.pointerId };
  }, []);

  const handleInvDragMove = useCallback((e: React.PointerEvent) => {
    const drag = inventoryDragRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    drag.ghostX = e.clientX;
    drag.ghostY = e.clientY;
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8) drag.isDragging = true;
    if (drag.isDragging) {
      setInventoryDragState({ decorItemId: drag.decorItemId, imageUrl: drag.imageUrl, ghostX: e.clientX, ghostY: e.clientY });
      setIsDraggingDecor(true);
    }
  }, []);

  const handleInvDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = inventoryDragRef.current;
    inventoryDragRef.current = null;
    setInventoryDragState(null);
    setIsDraggingDecor(false);
    if (!drag?.isDragging) return;
    const interior = interiorPanRef.current;
    if (interior && interior.imgWidth > 0 && openInterior) {
      // Drop into open interior
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const xPct = Math.max(0.03, Math.min(0.97, (localX - interior.panX) / interior.imgWidth));
      const yPct = Math.max(0.03, Math.min(0.97, localY / interior.containerH));
      placeDecorMutation.mutate({ decorItemId: drag.decorItemId, xPct, yPct, size: 250, flipped: false, location: openInterior.buildingId });
    } else if (imgWidth > 0) {
      // Drop onto main canvas
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      if (localY < 0 || localY > rect.height) return;
      const xPct = Math.max(0.03, Math.min(0.97, (localX - panX) / imgWidth));
      const yPct = Math.max(0.03, Math.min(0.97, localY / containerH));
      placeDecorMutation.mutate({ decorItemId: drag.decorItemId, xPct, yPct, size: 250, flipped: false, location: "outside" });
    }
  }, [openInterior, panX, imgWidth, containerH]);

  // ── Drag handlers: placed item reposition ─────────────────────────────────
  const handlePlacedDragStart = useCallback((e: React.PointerEvent, item: PlacedDecorItem) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    placedDragRef.current = { id: item.id, startXPct: item.xPct, startYPct: item.yPct, startPointerX: e.clientX, startPointerY: e.clientY, pid: e.pointerId };
    setSelectedPlacedId(item.id);
  }, []);

  const handlePlacedDragMove = useCallback((e: React.PointerEvent) => {
    const drag = placedDragRef.current;
    if (!drag || drag.pid !== e.pointerId || imgWidth <= 0) return;
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidth));
    const newYPct = Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerH));
    setPlacedDragLive({ id: drag.id, xPct: newXPct, yPct: newYPct });
  }, [imgWidth, containerH]);

  const handlePlacedDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = placedDragRef.current;
    placedDragRef.current = null;
    setPlacedDragLive(null);
    if (!drag || imgWidth <= 0) return;
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidth));
    const newYPct = Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerH));
    const moved = Math.abs(newXPct - drag.startXPct) > 0.005 || Math.abs(newYPct - drag.startYPct) > 0.005;
    if (moved) updateDecorMutation.mutate({ id: drag.id, xPct: newXPct, yPct: newYPct });
  }, [imgWidth, containerH]);

  // Determine background URL — Home Bundles are the priority; fall back to a neutral dark if none active
  const bgUrl = activeBundle?.bgImageUrl ?? null;

  // Load image to get natural aspect ratio
  useEffect(() => {
    if (!bgUrl) return;
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalHeight > 0) setBgAspect(img.naturalWidth / img.naturalHeight);
    };
    img.src = bgUrl;
  }, [bgUrl]);

  // Recalculate imgWidth and center pan when aspect ratio or container changes
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
    // Don't start pan if a pet inventory drag already claimed this pointer
    if (petInvDragRef.current?.pid === e.pointerId) return;
    if (selectedPlacedId) setSelectedPlacedId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX, selectedPlacedId]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Pet inventory drag gets priority
    const petDrag = petInvDragRef.current;
    if (petDrag && petDrag.pid === e.pointerId) {
      petDrag.ghostX = e.clientX;
      petDrag.ghostY = e.clientY;
      if (Math.hypot(e.clientX - petDrag.startX, e.clientY - petDrag.startY) > 8) petDrag.isDragging = true;
      if (petDrag.isDragging) {
        setPetInvDragState({ pet: petDrag.pet, ghostX: e.clientX, ghostY: e.clientY });
        setIsDraggingPet(true);
      }
      return;
    }
    // Decor inventory drag
    const decorDrag = inventoryDragRef.current;
    if (decorDrag && decorDrag.pid === e.pointerId) {
      decorDrag.ghostX = e.clientX;
      decorDrag.ghostY = e.clientY;
      if (Math.hypot(e.clientX - decorDrag.startX, e.clientY - decorDrag.startY) > 8) decorDrag.isDragging = true;
      if (decorDrag.isDragging) {
        setInventoryDragState({ decorItemId: decorDrag.decorItemId, imageUrl: decorDrag.imageUrl, ghostX: e.clientX, ghostY: e.clientY });
        setIsDraggingDecor(true);
      }
      return;
    }
    // Pan
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const imgW = containerH * bgAspect;
    const min = Math.min(0, containerW - imgW);
    setPanX(Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX))));
  }, [bgAspect]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Pet inventory drag end
    const petDrag = petInvDragRef.current;
    if (petDrag && petDrag.pid === e.pointerId) {
      petInvDragRef.current = null;
      setPetInvDragState(null);
      setIsDraggingPet(false);
      if (petDrag.isDragging) {
        const interior = interiorPanRef.current;
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const localX = e.clientX - rect.left;
          const localY = e.clientY - rect.top;
          if (interior && interior.imgWidth > 0 && openInterior) {
            const xPct = Math.max(0.03, Math.min(0.97, (localX - interior.panX) / interior.imgWidth));
            const yPct = Math.max(0.03, Math.min(0.97, localY / interior.containerH));
            placePetMutation.mutate({ inventoryId: petDrag.pet.inventoryId, xPct, yPct, location: openInterior.buildingId });
          } else if (imgWidth > 0) {
            const maxYPct = containerH > 0 ? Math.min(0.88, (containerH - 115) / containerH) : 0.82;
            const xPct = Math.max(0.05, Math.min(0.95, (localX - panX) / imgWidth));
            const yPct = Math.max(0.05, Math.min(maxYPct, localY / containerH));
            placePetMutation.mutate({ inventoryId: petDrag.pet.inventoryId, xPct, yPct, location: "outside" });
          }
        }
      }
      return;
    }
    // Decor inventory drag end
    const decorDrag = inventoryDragRef.current;
    if (decorDrag && decorDrag.pid === e.pointerId) {
      inventoryDragRef.current = null;
      setInventoryDragState(null);
      setIsDraggingDecor(false);
      if (decorDrag.isDragging) {
        const interior = interiorPanRef.current;
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const localX = e.clientX - rect.left;
          const localY = e.clientY - rect.top;
          if (interior && interior.imgWidth > 0 && openInterior) {
            const xPct = Math.max(0.03, Math.min(0.97, (localX - interior.panX) / interior.imgWidth));
            const yPct = Math.max(0.03, Math.min(0.97, localY / interior.containerH));
            placeDecorMutation.mutate({ decorItemId: decorDrag.decorItemId, xPct, yPct, size: 250, flipped: false, location: openInterior.buildingId });
          } else if (imgWidth > 0) {
            const xPct = Math.max(0.03, Math.min(0.97, (localX - panX) / imgWidth));
            const yPct = Math.max(0.03, Math.min(0.97, localY / containerH));
            placeDecorMutation.mutate({ decorItemId: decorDrag.decorItemId, xPct, yPct, size: 250, flipped: false, location: "outside" });
          }
        }
      }
      return;
    }
    panStartRef.current = null;
  }, [openInterior, panX, imgWidth, containerH]);

  const { data: petsData } = useQuery<{ username: string; pets: HousePet[] }>({
    queryKey: ["/api/users", user.id, "pets"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/pets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const pets = petsData?.pets ?? [];

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen-frame"
      style={{ maxWidth: "768px", margin: "0 auto", touchAction: "none", cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Background — clipped separately so buildings can overflow the screen edge (same pattern as admin editor) */}
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
        {/* Ambient gradient */}
        <div className="absolute inset-0" style={{ zIndex: 1, background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 18%, transparent 72%, rgba(0,0,0,0.45) 100%)" }} />
      </div>

      {/* Bundle buildings layer — NOT inside overflow:hidden so buildings near edges are never clipped */}
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

      {/* Pets layer — only shows pets placed outdoors */}
      {imgWidth > 0 && pets.filter(p => p.posLeft !== null && (p.location === "outside" || p.location === null)).map((pet, i) => {
        const cfg = randomGroundConfig(i);
        const savedX = parsePetPct(pet.posLeft);
        const savedY = parsePetPct(pet.posTop);
        const baseXPct = savedX ?? (cfg.centerX / 100);
        const baseYPct = savedY ?? (cfg.centerY / 100);
        const isDraggingThis = petDragLive?.inventoryId === pet.inventoryId;
        const xPct = isDraggingThis ? petDragLive.xPct : baseXPct;
        const yPct = isDraggingThis ? petDragLive.yPct : baseYPct;
        const left = panX + xPct * imgWidth;
        const top = yPct * containerH;
        return (
          <div
            key={pet.inventoryId}
            className="absolute"
            style={{
              zIndex: isDraggingThis ? 9 : 5,
              left,
              top,
              width: cfg.size,
              height: cfg.size,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              filter: isDraggingThis ? "drop-shadow(0 0 14px rgba(255,215,0,0.7))" : undefined,
            }}
          >
            {pet.petTemplateId ? (
              <PetAnimator
                petTemplateId={pet.petTemplateId}
                mode="idle"
                size={cfg.size}
                className={isDraggingThis ? undefined : "pet-idle-squish"}
                style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}
              />
            ) : (
              <div
                className={isDraggingThis ? undefined : "pet-idle-squish"}
                style={{ width: "100%", height: "100%" }}
              >
                <img
                  src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                  alt={pet.nickname ?? pet.name}
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}
                />
              </div>
            )}
            {/* Circular hit zone targeting the pet body — avoids transparent edges */}
            <div
              style={{
                position: "absolute",
                top: "20%",
                left: "20%",
                width: "60%",
                height: "60%",
                borderRadius: "50%",
                pointerEvents: "auto",
                touchAction: "none",
                cursor: isDraggingThis ? "grabbing" : "grab",
              }}
              onPointerDown={(e) => handlePetDragStart(e, pet.inventoryId, xPct, yPct)}
              onPointerMove={handlePetDragMove}
              onPointerUp={handlePetDragEnd}
              onPointerCancel={handlePetDragEnd}
            />
          </div>
        );
      })}

      {/* Placed home decor layer */}
      {imgWidth > 0 && placedDecor.map((item) => {
        const isSelected = selectedPlacedId === item.id;
        const left = panX + item.xPct * imgWidth;
        const top = item.yPct * containerH;
        return (
          <div
            key={item.id}
            className="absolute"
            style={{ zIndex: 6, left, top, transform: "translate(-50%, -50%)", touchAction: "none" }}
            onPointerDown={(e) => handlePlacedDragStart(e, item)}
            onPointerMove={handlePlacedDragMove}
            onPointerUp={handlePlacedDragEnd}
            onPointerCancel={handlePlacedDragEnd}
            onClick={(e) => { e.stopPropagation(); setSelectedPlacedId(isSelected ? null : item.id); }}
          >
            {/* Control toolbar — above item when selected */}
            {isSelected && (
              <div
                className="absolute flex gap-2"
                style={{ bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", zIndex: 10, whiteSpace: "nowrap" }}
              >
                <DecorControlBtn onClick={() => updateDecorMutation.mutate({ id: item.id, size: Math.max(175, item.size - 25) })}>
                  <SvgMinus />
                </DecorControlBtn>
                <DecorControlBtn onClick={() => updateDecorMutation.mutate({ id: item.id, size: Math.min(400, item.size + 25) })}>
                  <SvgPlus />
                </DecorControlBtn>
                <DecorControlBtn onClick={() => updateDecorMutation.mutate({ id: item.id, flipped: !item.flipped })}>
                  <SvgFlip />
                </DecorControlBtn>
                <DecorControlBtn danger onClick={() => removeDecorMutation.mutate(item.id)}>
                  <SvgDelete />
                </DecorControlBtn>
              </div>
            )}
            <img
              src={item.item.imageUrl ?? ""}
              alt={item.item.name}
              draggable={false}
              style={{
                width: item.size,
                height: item.size,
                objectFit: "contain",
                transform: item.flipped ? "scaleX(-1)" : undefined,
                filter: isSelected
                  ? "drop-shadow(0 0 10px rgba(255,215,0,0.9)) drop-shadow(0 2px 6px rgba(0,0,0,0.5))"
                  : "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
                outline: isSelected ? "2px solid rgba(255,215,0,0.7)" : "none",
                outlineOffset: "3px",
                borderRadius: 6,
                userSelect: "none",
                cursor: "grab",
              }}
            />
          </div>
        );
      })}

      {/* TopBar */}
      <div className="absolute inset-0 flex flex-col" style={{ zIndex: 10, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />
        </div>
      </div>

      {/* Bottom inventory bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex justify-center gap-4 pb-5 pt-3"
        style={{ zIndex: openInterior ? 65 : 15, pointerEvents: "auto", background: "linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Pets inventory button */}
        <button
          data-testid="button-pets-inventory"
          onClick={() => setOpenInventory(openInventory === "pets" ? null : "pets")}
          className="flex flex-col items-center gap-1 group"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90"
            style={{
              background: openInventory === "pets" ? "rgba(255,180,50,0.35)" : "rgba(0,0,0,0.45)",
              border: openInventory === "pets" ? "2px solid rgba(255,200,80,0.8)" : "2px solid rgba(255,255,255,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <ellipse cx="20" cy="30" rx="9" ry="6" fill={openInventory === "pets" ? "#ffcc44" : "#ccc"} opacity="0.9"/>
              <ellipse cx="11" cy="22" rx="4.5" ry="6" fill={openInventory === "pets" ? "#ffcc44" : "#ccc"} opacity="0.9" transform="rotate(-20 11 22)"/>
              <ellipse cx="29" cy="22" rx="4.5" ry="6" fill={openInventory === "pets" ? "#ffcc44" : "#ccc"} opacity="0.9" transform="rotate(20 29 22)"/>
              <ellipse cx="14" cy="13" rx="3.5" ry="4.5" fill={openInventory === "pets" ? "#ffcc44" : "#ccc"} opacity="0.9" transform="rotate(-35 14 13)"/>
              <ellipse cx="26" cy="13" rx="3.5" ry="4.5" fill={openInventory === "pets" ? "#ffcc44" : "#ccc"} opacity="0.9" transform="rotate(35 26 13)"/>
            </svg>
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-md" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            Pets
          </span>
        </button>

        <button
          data-testid="button-home-inventory"
          onClick={() => setOpenInventory(openInventory === "home" ? null : "home")}
          className="flex flex-col items-center gap-1 group"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90"
            style={{
              background: openInventory === "home" ? "rgba(120,200,100,0.35)" : "rgba(0,0,0,0.45)",
              border: openInventory === "home" ? "2px solid rgba(120,220,80,0.8)" : "2px solid rgba(255,255,255,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
            }}
          >
            <img src={homeInventoryIcon} alt="Home Inventory" className="w-12 h-12 object-contain" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-md" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            Home
          </span>
        </button>

        <button
          data-testid="button-decor-inventory"
          onClick={() => setOpenInventory(openInventory === "decor" ? null : "decor")}
          className="flex flex-col items-center gap-1 group"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90"
            style={{
              background: openInventory === "decor" ? "rgba(180,120,220,0.35)" : "rgba(0,0,0,0.45)",
              border: openInventory === "decor" ? "2px solid rgba(200,120,255,0.8)" : "2px solid rgba(255,255,255,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
            }}
          >
            <img src={decorInventoryIcon} alt="Decor Inventory" className="w-12 h-12 object-contain" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-md" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            Decor
          </span>
        </button>
      </div>

      {/* Inventory overlay panels */}
      {openInventory && (
        <div
          className="absolute inset-0 flex flex-col justify-end"
          style={{ zIndex: openInterior ? 62 : 20, pointerEvents: "none", visibility: (isDraggingDecor || isDraggingPet) ? "hidden" : "visible" }}
        >
          {/* Tap-outside to close */}
          <div
            className="absolute inset-0"
            style={{ pointerEvents: "auto" }}
            onPointerDown={(e) => { e.stopPropagation(); setOpenInventory(null); }}
          />

          {/* Panel */}
          <div
            className="relative rounded-t-3xl px-5 pt-5 pb-28"
            style={{
              pointerEvents: "auto",
              background: "linear-gradient(180deg, rgba(20,30,20,0.97) 0%, rgba(10,18,10,0.99) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
              minHeight: 280,
              maxHeight: "70vh",
              overflowY: "auto",
            }}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              {openInventory === "pets" ? (
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <ellipse cx="20" cy="30" rx="9" ry="6" fill="#ffcc44" opacity="0.9"/>
                  <ellipse cx="11" cy="22" rx="4.5" ry="6" fill="#ffcc44" opacity="0.9" transform="rotate(-20 11 22)"/>
                  <ellipse cx="29" cy="22" rx="4.5" ry="6" fill="#ffcc44" opacity="0.9" transform="rotate(20 29 22)"/>
                  <ellipse cx="14" cy="13" rx="3.5" ry="4.5" fill="#ffcc44" opacity="0.9" transform="rotate(-35 14 13)"/>
                  <ellipse cx="26" cy="13" rx="3.5" ry="4.5" fill="#ffcc44" opacity="0.9" transform="rotate(35 26 13)"/>
                </svg>
              ) : (
                <img
                  src={openInventory === "home" ? homeInventoryIcon : decorInventoryIcon}
                  alt=""
                  className="w-10 h-10 object-contain"
                />
              )}
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">
                  {openInventory === "home" ? "Home Inventory" : openInventory === "decor" ? "Decor Inventory" : "Pet Inventory"}
                </h2>
                <p className="text-white/50 text-xs">
                  {openInventory === "home"
                    ? "House bundles you own"
                    : openInventory === "decor"
                    ? "Home decorations you own"
                    : "Drag a pet onto the scene to place it"}
                </p>
              </div>
            </div>

            {openInventory === "home" ? (
              <div className="flex flex-col gap-4">
                {/* Active bundle banner */}
                {activeBundle && (
                  <div
                    className="rounded-2xl p-3 flex items-center gap-3"
                    style={{ background: "rgba(120,220,80,0.12)", border: "1.5px solid rgba(120,220,80,0.4)" }}
                  >
                    <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="text-green-300 text-xs font-semibold flex-1">Active: {activeBundle.name}</span>
                  </div>
                )}

                {ownedBundles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <img src={homeInventoryIcon} alt="" className="w-14 h-14 object-contain opacity-50" />
                    <p className="text-white/40 text-sm text-center">No house bundles owned yet.{"\n"}Visit a shop to purchase one!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {ownedBundles.map(({ bundleId, bundle }) => {
                      const isActive = activeBundle?.id === bundleId;
                      return (
                        <button
                          key={bundleId}
                          data-testid={`bundle-item-${bundleId}`}
                          onClick={() => !isActive && setPendingActivate({ bundleId, bundle })}
                          disabled={activateMutation.isPending}
                          className="flex flex-col items-center gap-1.5 transition-opacity disabled:opacity-60"
                          style={{ background: "none", border: "none", cursor: isActive ? "default" : "pointer" }}
                        >
                          <div
                            className="w-full rounded-2xl overflow-hidden relative"
                            style={{
                              aspectRatio: "1 / 1",
                              border: isActive ? "2.5px solid rgba(120,220,80,0.85)" : "1.5px solid rgba(255,255,255,0.1)",
                              boxShadow: isActive ? "0 0 14px rgba(120,220,80,0.35)" : "none",
                              background: "rgba(255,255,255,0.04)",
                            }}
                          >
                            {bundle.shopImageUrl ? (
                              <img src={bundle.shopImageUrl} alt={bundle.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <img src={homeInventoryIcon} alt="" className="w-10 h-10 object-contain opacity-60" />
                              </div>
                            )}
                            {isActive && (
                              <div
                                className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: "rgba(34,197,94,0.9)" }}
                              >
                                <span style={{ color: "#fff", fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>
                              </div>
                            )}
                          </div>
                          <span
                            className="w-full text-center leading-tight px-0.5 truncate"
                            style={{ color: isActive ? "#86efac" : "rgba(255,255,255,0.75)", fontSize: 10, fontFamily: "Cinzel, serif", fontWeight: 600 }}
                          >
                            {bundle.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : openInventory === "decor" ? (
              <div className="flex flex-col gap-4">
                {decorInventory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <img src={decorInventoryIcon} alt="" className="w-14 h-14 object-contain opacity-50" />
                    <p className="text-white/40 text-sm text-center">No decor items yet.{"\n"}Visit the shop to find some!</p>
                  </div>
                ) : (
                  <>
                    <p className="text-white/40 text-xs text-center" style={{ fontFamily: "Cinzel, serif" }}>
                      {openInterior ? "Hold & drag an item onto the interior" : "Hold & drag an item onto your home"}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {decorInventory.map((entry) => (
                        <div
                          key={entry.id}
                          data-testid={`decor-item-${entry.decorItemId}`}
                          className="flex flex-col items-center gap-1.5"
                          onPointerDown={(e) => handleInvDragStart(e, entry.decorItemId, entry.item.imageUrl)}
                          onPointerMove={handleInvDragMove}
                          onPointerUp={handleInvDragEnd}
                          onPointerCancel={handleInvDragEnd}
                          style={{ touchAction: "none", cursor: "grab" }}
                        >
                          <div
                            className="w-full rounded-2xl overflow-hidden relative"
                            style={{
                              aspectRatio: "1 / 1",
                              background: "rgba(255,255,255,0.05)",
                              border: "1.5px solid rgba(255,215,0,0.18)",
                            }}
                          >
                            {entry.item.imageUrl ? (
                              <img src={entry.item.imageUrl} alt={entry.item.name} className="w-full h-full object-contain p-2" draggable={false} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <img src={decorInventoryIcon} alt="" className="w-10 h-10 object-contain opacity-50" />
                              </div>
                            )}
                            {entry.quantity > 1 && (
                              <div
                                className="absolute top-1 right-1 rounded-full flex items-center justify-center"
                                style={{ minWidth: 20, height: 20, background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,215,0,0.5)", padding: "0 4px" }}
                              >
                                <span style={{ color: "#ffd700", fontSize: 10, fontWeight: 700 }}>×{entry.quantity}</span>
                              </div>
                            )}
                          </div>
                          <span
                            className="w-full text-center truncate px-0.5 leading-tight"
                            style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "Cinzel, serif", fontWeight: 600 }}
                          >
                            {entry.item.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : openInventory === "pets" ? (
              /* ─── Pet inventory ─── */
              <div className="flex flex-col gap-4">
                {(() => {
                  const unplacedPets = pets.filter(p => p.posLeft === null);
                  if (unplacedPets.length === 0 && pets.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
                          <ellipse cx="20" cy="30" rx="9" ry="6" fill="#ffcc44" opacity="0.4"/>
                          <ellipse cx="11" cy="22" rx="4.5" ry="6" fill="#ffcc44" opacity="0.4" transform="rotate(-20 11 22)"/>
                          <ellipse cx="29" cy="22" rx="4.5" ry="6" fill="#ffcc44" opacity="0.4" transform="rotate(20 29 22)"/>
                          <ellipse cx="14" cy="13" rx="3.5" ry="4.5" fill="#ffcc44" opacity="0.4" transform="rotate(-35 14 13)"/>
                          <ellipse cx="26" cy="13" rx="3.5" ry="4.5" fill="#ffcc44" opacity="0.4" transform="rotate(35 26 13)"/>
                        </svg>
                        <p className="text-white/40 text-sm text-center">No pets yet.{"\n"}Hatch some eggs to get started!</p>
                      </div>
                    );
                  }
                  return (
                    <>
                      {unplacedPets.length > 0 && (
                        <>
                          <p className="text-white/40 text-xs text-center" style={{ fontFamily: "Cinzel, serif" }}>
                            Hold & drag a pet onto your home
                          </p>
                          <div className="grid grid-cols-3 gap-3">
                            {unplacedPets.map((pet) => (
                              <div
                                key={pet.inventoryId}
                                data-testid={`pet-inv-item-${pet.inventoryId}`}
                                className="flex flex-col items-center gap-1.5"
                                onPointerDown={(e) => handlePetInvDragStart(e, pet)}
                                onPointerMove={handlePetInvDragMove}
                                onPointerUp={handlePetInvDragEnd}
                                onPointerCancel={handlePetInvDragEnd}
                                style={{ touchAction: "none", cursor: "grab" }}
                              >
                                <div
                                  className="w-full rounded-2xl overflow-hidden relative"
                                  style={{
                                    aspectRatio: "1 / 1",
                                    background: "rgba(255,255,255,0.05)",
                                    border: "1.5px solid rgba(255,215,0,0.18)",
                                  }}
                                >
                                  <img
                                    src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                                    alt={pet.nickname ?? pet.name}
                                    className="w-full h-full object-contain p-2"
                                    draggable={false}
                                  />
                                </div>
                                <span
                                  className="w-full text-center truncate px-0.5 leading-tight"
                                  style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "Cinzel, serif", fontWeight: 600 }}
                                >
                                  {pet.nickname ?? pet.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {pets.some(p => p.posLeft !== null) && (
                        <div className="mt-2 flex flex-col gap-2">
                          <p className="text-white/30 text-xs text-center" style={{ fontFamily: "Cinzel, serif" }}>
                            {pets.filter(p => p.posLeft !== null).length} pet(s) placed on scene
                          </p>
                          <button
                            data-testid="button-store-all-pets"
                            onClick={() => storeAllPetsMutation.mutate()}
                            disabled={storeAllPetsMutation.isPending}
                            className="w-full py-2.5 rounded-xl text-xs font-semibold"
                            style={{
                              fontFamily: "Cinzel, serif",
                              background: "rgba(255,100,100,0.15)",
                              border: "1.5px solid rgba(255,100,100,0.4)",
                              color: "rgba(255,160,160,0.9)",
                            }}
                          >
                            {storeAllPetsMutation.isPending ? "Storing…" : "Store All Pets"}
                          </button>
                        </div>
                      )}
                      {unplacedPets.length === 0 && pets.length > 0 && (
                        <p className="text-white/40 text-sm text-center py-4">All pets are on the scene!</p>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Drag ghost — follows pointer when dragging a decor item from inventory */}
      {inventoryDragState && (
        <div
          className="fixed pointer-events-none"
          style={{
            zIndex: 100,
            left: inventoryDragState.ghostX - 65,
            top: inventoryDragState.ghostY - 65,
            width: 130,
            height: 130,
            opacity: 0.88,
          }}
        >
          {inventoryDragState.imageUrl ? (
            <img
              src={inventoryDragState.imageUrl}
              className="w-full h-full object-contain"
              draggable={false}
              style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.7)) drop-shadow(0 0 8px rgba(255,215,0,0.4))" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center rounded-2xl" style={{ background: "rgba(0,0,0,0.4)", border: "2px dashed rgba(255,215,0,0.5)" }}>
              <img src={decorInventoryIcon} className="w-16 h-16 object-contain opacity-60" />
            </div>
          )}
        </div>
      )}

      {/* Drag ghost — follows pointer when dragging a pet from inventory */}
      {petInvDragState && (
        <div
          className="fixed pointer-events-none"
          style={{
            zIndex: 100,
            left: petInvDragState.ghostX - 80,
            top: petInvDragState.ghostY - 80,
            width: 160,
            height: 160,
            opacity: 0.88,
          }}
        >
          <img
            src={petInvDragState.pet.hatchedImageUrl ?? petInvDragState.pet.imageUrl ?? ""}
            className="w-full h-full object-contain"
            draggable={false}
            style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.7)) drop-shadow(0 0 8px rgba(255,200,0,0.5))" }}
          />
        </div>
      )}

      {/* Bundle activation confirmation modal */}
      {pendingActivate && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 80, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
          onPointerDown={() => setPendingActivate(null)}
        >
          <div
            className="w-full rounded-t-3xl px-6 pt-6 pb-10 flex flex-col gap-5"
            style={{ background: "linear-gradient(180deg, #141e0f 0%, #0d1509 100%)", border: "1px solid rgba(255,215,0,0.18)", boxShadow: "0 -8px 40px rgba(0,0,0,0.7)" }}
            onPointerDown={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />

            {/* Bundle preview */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0" style={{ border: "1.5px solid rgba(255,215,0,0.25)", background: "rgba(255,255,255,0.05)" }}>
                {pendingActivate.bundle.shopImageUrl ? (
                  <img src={pendingActivate.bundle.shopImageUrl} alt={pendingActivate.bundle.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <img src={homeInventoryIcon} alt="" className="w-9 h-9 object-contain opacity-60" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-white/50 text-xs mb-0.5" style={{ fontFamily: "Cinzel, serif" }}>Switch Home Bundle?</p>
                <p className="text-white font-bold text-base leading-tight" style={{ fontFamily: "Cinzel Decorative, serif" }}>{pendingActivate.bundle.name}</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                data-testid="button-cancel-activate"
                onClick={() => setPendingActivate(null)}
                className="flex-1 py-3 rounded-2xl font-bold text-sm tracking-wide"
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: "Cinzel, serif" }}
              >
                Cancel
              </button>
              <button
                data-testid="button-confirm-activate"
                onClick={() => {
                  activateMutation.mutate(pendingActivate.bundleId);
                  setPendingActivate(null);
                }}
                disabled={activateMutation.isPending}
                className="flex-1 py-3 rounded-2xl font-bold text-sm tracking-wide transition-opacity disabled:opacity-50"
                style={{ background: "rgba(120,220,80,0.25)", color: "#86efac", border: "1.5px solid rgba(120,220,80,0.5)", fontFamily: "Cinzel, serif" }}
              >
                {activateMutation.isPending ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Building interior viewer — shown when player taps a building with an interior set */}
      {openInterior && (
        <InteriorViewer
          url={openInterior.url}
          placedItems={interiorPlacedRaw}
          placedPets={pets.filter(p => p.posLeft !== null && p.location === openInterior.buildingId)}
          panStateRef={interiorPanRef}
          onUpdateItem={(id, data) => updateDecorMutation.mutate({ id, ...data })}
          onRemoveItem={(id) => removeDecorMutation.mutate(id)}
          onMovePet={(inventoryId, xPct, yPct) => placePetMutation.mutate({ inventoryId, xPct, yPct, location: openInterior.buildingId })}
          onRemovePet={(inventoryId) => removePetFromSceneMutation.mutate(inventoryId)}
          onClose={() => { setOpenInterior(null); interiorPanRef.current = null; }}
        />
      )}

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(u) => setCurrentUser(u)}
        />
      )}
    </div>
  );
}
