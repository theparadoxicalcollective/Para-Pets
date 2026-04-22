import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { MailOpen } from "lucide-react";
import RoleBadge from "@/components/RoleBadge";
import { playGrab } from "@/lib/sounds";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetAnimator from "@/components/PetAnimator";
import ErrorBoundary from "@/components/ErrorBoundary";
import homeInventoryIcon from "@assets/icon_home_inventory.png";
import decorInventoryIcon from "@assets/icon_decor_inventory.png";
import petInventoryIcon from "@assets/icon_pet_inventory.png";
import friendsInventoryIcon from "@assets/icon_friends_inventory.png";
import feedButtonIcon from "@assets/generated_images/feed_button_icon.png";
import feedingPageBg from "@assets/generated_images/feeding_page_bg.png";
import moodFaceHappy from "@assets/mood_face_happy.png";
import moodFaceContent from "@assets/mood_face_content.png";
import moodFaceSad from "@assets/mood_face_sad.png";
import moodFaceHungry from "@assets/mood_face_hungry.png";
import LoadingScreen from "@/components/LoadingScreen";
import GiftClaimModal from "@/components/GiftClaimModal";
import FriendProfileModal from "@/components/FriendProfileModal";

// ── SVG icons ────────────────────────────────────────────────────────────────
function SvgMinus() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M5 11h12" stroke="#ffd700" strokeWidth="2.5" strokeLinecap="round"/>
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

function ControlBtn({ onClick, danger = false, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex items-center justify-center rounded-xl active:opacity-60"
      style={{
        width: 44, height: 44,
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

// ── Types ────────────────────────────────────────────────────────────────────
interface PetHousePageProps {
  user: {
    id: string; username: string; email: string;
    profileImage: string | null; coins: number; isAdmin: boolean;
    activePetId: string | null; lastUsernameChange: string | null; lastProfilePicChange: string | null;
  };
}
interface HousePet {
  inventoryId: string; shopItemId: string; name: string; nickname: string | null;
  imageUrl: string | null; hatchedImageUrl: string | null; eggImageUrl: string | null;
  rarity: number | null; petLevel: number; petHealth: number; petAtk: number; petDef: number;
  petTemplateId: string | null; posLeft: string | null; posTop: string | null; location: string | null;
}
interface HouseBundle { id: string; name: string; shopImageUrl: string | null; bgImageUrl: string | null; price: number; giftNotificationX?: number; giftNotificationY?: number; }
interface ActiveBundle extends HouseBundle {
  maxOutdoorPets: number;
  buildings: { id: string; name: string; imageUrl: string; posX: number; posY: number; width: number; flippedX: boolean; interiorImageUrl?: string | null; leaveButtonX?: number | null; leaveButtonY?: number | null; maxPets?: number | null; size?: string | null }[];
}

const BUILDING_CAPACITY: Record<string, { pets: number; items: number }> = {
  small:  { pets: 3, items: 3 },
  medium: { pets: 5, items: 6 },
  large:  { pets: 7, items: 9 },
};
const MAX_OUTDOOR_DECOR = 8;
interface OwnedBundle { id: string; bundleId: string; bundle: HouseBundle & { shopImageUrl: string | null }; }
interface DecorInventoryItem { id: string; decorItemId: string; quantity: number; item: { id: string; name: string; imageUrl: string | null; price: number }; }
interface PlacedDecorItem { id: string; decorItemId: string; xPct: number; yPct: number; size: number; flipped: boolean; item: { id: string; name: string; imageUrl: string | null }; }

// ── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_BG_RATIO = 1920 / 2400;
const BUILDING_REF_H = 900;
// Space (in CSS px) reserved at the bottom of the scene so pets & decor
// cannot be dragged behind the bottom inventory toolbar.
const BOTTOM_TOOLBAR_RESERVE_PX = 140;

// Clamp helper for Y drag limits — reserves the bottom toolbar area.
function maxYForHeight(containerH: number, reservePx = BOTTOM_TOOLBAR_RESERVE_PX): number {
  if (containerH <= 0) return 0.82;
  return Math.min(0.92, (containerH - reservePx) / containerH);
}

function parsePetPct(s: string | null): number | null {
  if (!s) return null;
  const v = parseFloat(s);
  if (!isNaN(v)) return Math.max(0, Math.min(1, v / 100));
  const m = s.match(/calc\(([\d.]+)%/);
  if (m) return Math.max(0, Math.min(1, parseFloat(m[1]) / 100));
  return null;
}

// Per-user request: indoor and outdoor pet sizes were swapped. Outdoor pets
// now use a single fixed size (formerly the indoor value), and indoor pets
// pick up the per-pet randomized 100–130 range previously used outdoors.
const OUTDOOR_PET_SIZE = 110;

function randomGroundConfig(index: number) {
  const seed = index * 137.508;
  const pseudo = (n: number) => ((Math.sin(n) * 10000) % 1 + 1) % 1;
  const centerX = 20 + pseudo(seed) * 60;
  const centerY = 64 + pseudo(seed + 1) * 11;
  return { size: OUTDOOR_PET_SIZE, centerX, centerY };
}

// Indoor pets use a single fixed size for visual consistency.
const INDOOR_PET_SIZE = 125;
function indoorPetSize(_index: number): number {
  return INDOOR_PET_SIZE;
}

// ── Interior Viewer ──────────────────────────────────────────────────────────
// Shown as a full-screen overlay when a building is tapped.
// MEMORY SAFETY: the background image is NOT rendered while this is open,
// so only this one large image occupies GPU memory at a time.
function InteriorViewer({
  url, placedItems, placedPets, panStateRef,
  leaveButtonX = 0.92, leaveButtonY = 0.06,
  onUpdateItem, onRemoveItem, onMovePet, onRemovePet, onFeedPet, onClose,
}: {
  url: string;
  placedItems: PlacedDecorItem[];
  placedPets: HousePet[];
  panStateRef: React.MutableRefObject<{ panX: number; imgWidth: number; containerH: number } | null>;
  leaveButtonX?: number;
  leaveButtonY?: number;
  onUpdateItem: (id: string, data: { xPct?: number; yPct?: number; size?: number; flipped?: boolean }) => void;
  onRemoveItem: (id: string) => void;
  onMovePet: (inventoryId: string, xPct: number, yPct: number) => void;
  onRemovePet: (inventoryId: string) => void;
  onFeedPet: (pet: HousePet) => void;
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [popupPet, setPopupPet] = useState<HousePet | null>(null);
  const [topPetId, setTopPetId] = useState<string | null>(null);
  const [topItemId, setTopItemId] = useState<string | null>(null);
  const itemDragRef = useRef<{ id: string; startXPct: number; startYPct: number; startPointerX: number; startPointerY: number; pid: number } | null>(null);
  const [itemDragLive, setItemDragLive] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const petDragRef = useRef<{ inventoryId: string; startXPct: number; startYPct: number; startPointerX: number; startPointerY: number; pid: number } | null>(null);
  const [petDragLive, setPetDragLive] = useState<{ inventoryId: string; xPct: number; yPct: number } | null>(null);

  // Recalc layout whenever aspect changes or container resizes
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
        panStateRef.current = { panX: newPanX, imgWidth: imgW, containerH: h };
      } catch {}
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [aspect, panStateRef]);

  // Pan handlers
  const onContainerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedItemId) setSelectedItemId(null);
    if (popupPet) setPopupPet(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX, selectedItemId, popupPet]);

  const onContainerMove = useCallback((e: React.PointerEvent) => {
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
    setPanX(newPanX);
    panStateRef.current = { panX: newPanX, imgWidth: imgWidthRef.current, containerH: containerHRef.current };
  }, [panStateRef]);

  const onContainerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    panStartRef.current = null;
  }, []);

  // Decor drag handlers
  const onItemDown = useCallback((e: React.PointerEvent, item: PlacedDecorItem) => {
    e.stopPropagation();
    playGrab();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    itemDragRef.current = { id: item.id, startXPct: item.xPct, startYPct: item.yPct, startPointerX: e.clientX, startPointerY: e.clientY, pid: e.pointerId };
    setSelectedItemId(item.id);
  }, []);

  const onItemMove = useCallback((e: React.PointerEvent) => {
    const drag = itemDragRef.current;
    if (!drag || drag.pid !== e.pointerId || imgWidthRef.current <= 0) return;
    setItemDragLive({
      id: drag.id,
      xPct: Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidthRef.current)),
      yPct: Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerHRef.current)),
    });
  }, []);

  const onItemUp = useCallback((e: React.PointerEvent) => {
    const drag = itemDragRef.current;
    itemDragRef.current = null;
    setItemDragLive(null);
    if (!drag || imgWidthRef.current <= 0) return;
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidthRef.current));
    const newYPct = Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerHRef.current));
    if (Math.abs(newXPct - drag.startXPct) > 0.005 || Math.abs(newYPct - drag.startYPct) > 0.005) {
      setTopItemId(drag.id);
      onUpdateItem(drag.id, { xPct: newXPct, yPct: newYPct });
    }
  }, [onUpdateItem]);

  // Pet drag handlers
  const onPetDown = useCallback((e: React.PointerEvent, pet: HousePet) => {
    e.stopPropagation();
    playGrab();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const savedX = parsePetPct(pet.posLeft) ?? 0.5;
    const savedY = parsePetPct(pet.posTop) ?? 0.5;
    petDragRef.current = { inventoryId: pet.inventoryId, startXPct: savedX, startYPct: savedY, startPointerX: e.clientX, startPointerY: e.clientY, pid: e.pointerId };
  }, []);

  const onPetMove = useCallback((e: React.PointerEvent) => {
    const drag = petDragRef.current;
    if (!drag || drag.pid !== e.pointerId || imgWidthRef.current <= 0) return;
    const maxY = maxYForHeight(containerHRef.current);
    setPetDragLive({
      inventoryId: drag.inventoryId,
      xPct: Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidthRef.current)),
      yPct: Math.max(0.02, Math.min(maxY, drag.startYPct + (e.clientY - drag.startPointerY) / containerHRef.current)),
    });
  }, []);

  const onPetUp = useCallback((e: React.PointerEvent) => {
    const drag = petDragRef.current;
    petDragRef.current = null;
    setPetDragLive(null);
    if (!drag || imgWidthRef.current <= 0) return;
    const maxY = maxYForHeight(containerHRef.current);
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidthRef.current));
    const newYPct = Math.max(0.02, Math.min(maxY, drag.startYPct + (e.clientY - drag.startPointerY) / containerHRef.current));
    if (Math.abs(newXPct - drag.startXPct) > 0.005 || Math.abs(newYPct - drag.startYPct) > 0.005) {
      setTopPetId(drag.inventoryId);
      onMovePet(drag.inventoryId, newXPct, newYPct);
    }
  }, [onMovePet]);

  const displayedItems = useMemo(() =>
    placedItems.map(item => itemDragLive?.id === item.id ? { ...item, xPct: itemDragLive.xPct, yPct: itemDragLive.yPct } : item),
    [placedItems, itemDragLive]);


  return (
    <div
      ref={containerRef}
      className="fixed inset-0"
      style={{ zIndex: 60, background: "#000", overflow: "hidden", touchAction: "none", maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
      onPointerDown={onContainerDown}
      onPointerMove={onContainerMove}
      onPointerUp={onContainerUp}
      onPointerCancel={onContainerUp}
    >
      {/* Interior background image — single decode only */}
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

      {/* Placed decor */}
      {imgWidth > 0 && displayedItems.map((item) => {
        const isSelected = selectedItemId === item.id;
        const left = panX + item.xPct * imgWidth;
        const top = item.yPct * containerH;
        return (
          <div
            key={item.id}
            className="absolute"
            style={{ zIndex: topItemId === item.id ? 8 : 6, left, top, transform: "translate(-50%, -50%)", touchAction: "none" }}
            onPointerDown={(e) => onItemDown(e, item)}
            onPointerMove={onItemMove}
            onPointerUp={onItemUp}
            onPointerCancel={onItemUp}
            onClick={(e) => { e.stopPropagation(); setSelectedItemId(isSelected ? null : item.id); }}
          >
            {isSelected && (
              <div className="absolute flex gap-2" style={{ bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", zIndex: 10, whiteSpace: "nowrap" }}>
                <ControlBtn onClick={() => onUpdateItem(item.id, { size: Math.max(100, item.size - 25) })}><SvgMinus /></ControlBtn>
                <ControlBtn onClick={() => onUpdateItem(item.id, { size: Math.min(400, item.size + 25) })}><SvgPlus /></ControlBtn>
                <ControlBtn onClick={() => onUpdateItem(item.id, { flipped: !item.flipped })}><SvgFlip /></ControlBtn>
                <ControlBtn danger onClick={() => { onRemoveItem(item.id); setSelectedItemId(null); }}><SvgDelete /></ControlBtn>
              </div>
            )}
            <img
              src={item.item.imageUrl ?? ""}
              alt={item.item.name}
              draggable={false}
              style={{
                width: item.size, height: item.size, objectFit: "contain",
                transform: item.flipped ? "scaleX(-1)" : undefined,
                outline: isSelected ? "2px solid rgba(255,215,0,0.8)" : "none",
                outlineOffset: "3px",
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
                userSelect: "none", cursor: "grab",
              }}
            />
          </div>
        );
      })}

      {/* Pets inside this building */}
      {imgWidth > 0 && placedPets.map((pet, i) => {
        const livePos = petDragLive?.inventoryId === pet.inventoryId ? petDragLive : null;
        const xPct = livePos?.xPct ?? (parsePetPct(pet.posLeft) ?? 0.5);
        const yPct = livePos?.yPct ?? (parsePetPct(pet.posTop) ?? 0.5);
        const left = panX + xPct * imgWidth;
        const top = yPct * containerH;
        // Indoor pets use a per-pet randomized size (same range outdoor pets
        // used previously) so each pet feels distinct rather than uniform.
        const petSize = indoorPetSize(i);
        return (
          <div
            key={pet.inventoryId}
            className="absolute"
            style={{ zIndex: topPetId === pet.inventoryId ? 9 : 7, left, top, width: petSize, height: petSize, transform: "translate(-50%, -50%)", touchAction: "none", cursor: "grab" }}
            onPointerDown={(e) => onPetDown(e, pet)}
            onPointerMove={onPetMove}
            onPointerUp={onPetUp}
            onPointerCancel={onPetUp}
            onClick={(e) => {
              e.stopPropagation();
              const drag = petDragRef.current;
              if (!drag) setPopupPet(pet);
            }}
          >
            {(pet.hatchedImageUrl || pet.imageUrl) ? (
              <img
                src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                alt={pet.nickname ?? pet.name}
                draggable={false}
                className="pet-idle-squish"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : null}
          </div>
        );
      })}

      {/* Pet popup */}
      {popupPet && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 20, background: "rgba(0,0,0,0.45)" }}
          onPointerDown={e => { e.stopPropagation(); setPopupPet(null); }}
        >
          <div
            className="flex flex-col items-center gap-3 rounded-2xl px-5 py-4"
            style={{ background: "rgba(15,10,5,0.95)", border: "1px solid rgba(255,215,0,0.25)", boxShadow: "0 4px 24px rgba(0,0,0,0.7)" }}
            onPointerDown={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: "Lora, serif", color: "#ffd700", fontSize: 14, fontWeight: 700 }}>
              {popupPet.nickname ?? popupPet.name}
            </div>
            {/* Feed is the primary CTA — larger, brighter, top-of-stack — and
                Cancel + Return-to-Inventory sit below as smaller secondaries. */}
            <div className="flex flex-col items-center gap-2 w-full">
              <button
                onClick={() => { onFeedPet(popupPet); setPopupPet(null); }}
                className="rounded-2xl px-7 py-3 text-base font-bold flex items-center gap-2.5 transition-transform active:scale-95"
                style={{
                  fontFamily: "Lora, serif",
                  background: "linear-gradient(160deg, rgba(140,220,100,0.45) 0%, rgba(80,160,60,0.55) 100%)",
                  border: "2px solid rgba(190,255,160,0.85)",
                  color: "#f4ffe6",
                  boxShadow: "0 0 18px rgba(150,230,110,0.5), 0 4px 14px rgba(0,0,0,0.5)",
                  letterSpacing: "0.05em",
                }}
                data-testid="button-popup-feed-indoor"
              >
                <img src={feedButtonIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                Feed
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setPopupPet(null)}
                  className="rounded-lg px-3 py-1 text-[11px] font-bold"
                  style={{ fontFamily: "Lora, serif", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.55)" }}
                  data-testid="button-popup-cancel-indoor"
                >Cancel</button>
                <button
                  onClick={() => { onRemovePet(popupPet.inventoryId); setPopupPet(null); }}
                  className="rounded-lg px-3 py-1 text-[11px] font-bold"
                  style={{ fontFamily: "Lora, serif", background: "rgba(255,100,80,0.12)", border: "1px solid rgba(255,100,80,0.35)", color: "rgba(255,160,140,0.85)" }}
                  data-testid="button-popup-return-indoor"
                >Return to Inventory</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave button — positioned by admin via leaveButtonX/Y percentages */}
      <button
        onClick={onClose}
        onPointerDown={e => e.stopPropagation()}
        className="absolute flex items-center justify-center font-bold tracking-widest rounded-full"
        style={{
          zIndex: 10,
          left: imgWidth > 0 ? panX + leaveButtonX * imgWidth : `${leaveButtonX * 100}%`,
          top: leaveButtonY * containerH,
          transform: "translate(-50%, -50%)",
          background: "rgba(0,0,0,0.28)",
          border: "1px solid rgba(255,255,255,0.14)",
          fontFamily: "Lora, serif",
          fontSize: 9,
          color: "rgba(255,255,255,0.38)",
          padding: "4px 10px",
          letterSpacing: "0.18em",
        }}
      >
        Outside
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PetHousePage({ user }: PetHousePageProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [openInterior, setOpenInterior] = useState<{ url: string; buildingId: string; leaveButtonX: number; leaveButtonY: number } | null>(null);
  const interiorPanRef = useRef<{ panX: number; imgWidth: number; containerH: number } | null>(null);
  const [openInventory, setOpenInventory] = useState<"home" | "decor" | "pets" | "friends" | null>(null);
  const [pendingActivate, setPendingActivate] = useState<{ bundleId: string; bundle: OwnedBundle["bundle"] } | null>(null);
  const [openGiftModal, setOpenGiftModal] = useState(false);
  const [showNoMailPopup, setShowNoMailPopup] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<{ id: string; username: string } | null>(null);

  // Canvas panning
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);
  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [bgAspect, setBgAspect] = useState(DEFAULT_BG_RATIO);

  // Outdoor decor drag state
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [placedDragLive, setPlacedDragLive] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const placedDragRef = useRef<{ id: string; startXPct: number; startYPct: number; startPointerX: number; startPointerY: number; pid: number } | null>(null);

  // Inventory drag: decor
  const [inventoryDragState, setInventoryDragState] = useState<{ decorItemId: string; imageUrl: string | null; ghostX: number; ghostY: number } | null>(null);
  const inventoryDragRef = useRef<{ decorItemId: string; imageUrl: string | null; ghostX: number; ghostY: number; startX: number; startY: number; isDragging: boolean; pid: number } | null>(null);
  const [isDraggingDecor, setIsDraggingDecor] = useState(false);

  // Inventory drag: pet
  const [petInvDragState, setPetInvDragState] = useState<{ pet: HousePet; ghostX: number; ghostY: number } | null>(null);
  const petInvDragRef = useRef<{ pet: HousePet; ghostX: number; ghostY: number; startX: number; startY: number; isDragging: boolean; pid: number } | null>(null);
  const [isDraggingPet, setIsDraggingPet] = useState(false);

  // Outdoor pet repositioning drag
  const petDragRef = useRef<{ inventoryId: string; startXPct: number; startYPct: number; startPointerX: number; startPointerY: number; pid: number; moved: boolean } | null>(null);
  const [petDragLive, setPetDragLive] = useState<{ inventoryId: string; xPct: number; yPct: number } | null>(null);
  // Popup for outdoor pet tap
  const [outdoorPopupPet, setOutdoorPopupPet] = useState<HousePet | null>(null);
  const [feedingPet, setFeedingPet] = useState<HousePet | null>(null);
  // Last-moved pet / decor id — these render above their peers (higher z-index).
  const [topOutdoorPetId, setTopOutdoorPetId] = useState<string | null>(null);
  const [topOutdoorDecorId, setTopOutdoorDecorId] = useState<string | null>(null);
  // Hold-to-drag timer for the pet inventory list
  const petHoldRef = useRef<{ pet: HousePet; pid: number; startX: number; startY: number; el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);
  const petScrollRef = useRef<HTMLDivElement>(null);
  const petScrollTrackerRef = useRef<{ scrollLeft: number; startX: number; pid: number } | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: activeBundle, isLoading: bundleLoading, refetch: refetchActiveBundle } = useQuery<ActiveBundle | null>({
    queryKey: ["/api/users", user.id, "active-house-bundle"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/active-house-bundle`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: ownedBundles = [], refetch: refetchOwned } = useQuery<OwnedBundle[]>({
    queryKey: ["/api/users", user.id, "house-bundles"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/house-bundles`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: decorInventory = [] } = useQuery<DecorInventoryItem[]>({
    queryKey: ["/api/pet-house/decor/inventory"],
    staleTime: 15000,
  });

  const { data: pendingGifts = [] } = useQuery<any[]>({
    queryKey: ["/api/gifts/pending"],
    queryFn: () => fetch("/api/gifts/pending", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: friendsList = [], refetch: refetchFriends } = useQuery<any[]>({
    queryKey: ["/api/friends"],
    enabled: openInventory === "friends",
    refetchInterval: openInventory === "friends" ? 20000 : false,
  });

  const { data: friendRequestsList = [], refetch: refetchFriendRequests } = useQuery<any[]>({
    queryKey: ["/api/friends/requests"],
    enabled: openInventory === "friends",
    refetchInterval: openInventory === "friends" ? 20000 : false,
  });

  const { data: friendNotifications = [], refetch: refetchFriendNotifs } = useQuery<any[]>({
    queryKey: ["/api/notifications/unread"],
    enabled: openInventory === "friends",
    select: (data: any[]) => data.filter((n: any) => n.type === "friend_accepted"),
  });

  const dismissFriendNotifsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-read", {}),
    onSuccess: () => { refetchFriendNotifs(); qc.invalidateQueries({ queryKey: ["/api/notifications/unread"] }); },
  });

  const { data: friendRequestCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/friends/requests/count"],
    refetchInterval: 45000,
  });
  const friendRequestCount = friendRequestCountData?.count ?? 0;

  const acceptFriendMutation = useMutation({
    mutationFn: ({ requestId }: { requestId: string; username: string }) =>
      apiRequest("POST", `/api/friends/accept/${requestId}`, {}),
    onSuccess: (_, { username }) => {
      toast({ title: "Friend Added!", description: `You and ${username} are now friends.` });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
      refetchFriends();
      refetchFriendRequests();
    },
  });

  const declineFriendMutation = useMutation({
    mutationFn: (requesterId: string) => apiRequest("DELETE", `/api/friends/${requesterId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
      refetchFriendRequests();
    },
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

  // Merge live drag positions into outdoor placed decor
  const placedDecor = useMemo(() =>
    placedDecorRaw.map(item => placedDragLive?.id === item.id ? { ...item, xPct: placedDragLive.xPct, yPct: placedDragLive.yPct } : item),
    [placedDecorRaw, placedDragLive]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const activateMutation = useMutation({
    mutationFn: async (bundleId: string) => {
      const res = await apiRequest("POST", `/api/house-bundles/${bundleId}/activate`, {});
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => { refetchActiveBundle(); refetchOwned(); toast({ title: "Bundle activated!" }); },
    onError: (e: any) => toast({ title: "Activation failed", description: e.message, variant: "destructive" }),
  });

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

  const placePetMutation = useMutation({
    mutationFn: async ({ inventoryId, xPct, yPct, location }: { inventoryId: string; xPct: number; yPct: number; location: string }) => {
      const res = await apiRequest("PATCH", `/api/pet-house-positions/${inventoryId}`, {
        posLeft: String(xPct * 100), posTop: String(yPct * 100), location,
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users", user.id, "pets"] }),
  });

  const updatePetPositionMutation = useMutation({
    mutationFn: async ({ inventoryId, xPct, yPct }: { inventoryId: string; xPct: number; yPct: number }) => {
      const res = await apiRequest("PATCH", `/api/pet-house-positions/${inventoryId}`, {
        posLeft: String(xPct * 100), posTop: String(yPct * 100), location: "outside",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users", user.id, "pets"] }),
  });

  const removePetFromSceneMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("DELETE", `/api/pet-house-positions/${inventoryId}`, {});
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

  // ── Background layout ──────────────────────────────────────────────────────
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

  // ── Main canvas pointer handlers ───────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (petInvDragRef.current?.pid === e.pointerId) return;
    if (selectedPlacedId) setSelectedPlacedId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX, selectedPlacedId]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Pet inventory drag
    const petDrag = petInvDragRef.current;
    if (petDrag && petDrag.pid === e.pointerId) {
      petDrag.ghostX = e.clientX; petDrag.ghostY = e.clientY;
      if (Math.hypot(e.clientX - petDrag.startX, e.clientY - petDrag.startY) > 8) petDrag.isDragging = true;
      if (petDrag.isDragging) { setPetInvDragState({ pet: petDrag.pet, ghostX: e.clientX, ghostY: e.clientY }); setIsDraggingPet(true); }
      return;
    }
    // Decor inventory drag
    const decorDrag = inventoryDragRef.current;
    if (decorDrag && decorDrag.pid === e.pointerId) {
      decorDrag.ghostX = e.clientX; decorDrag.ghostY = e.clientY;
      if (Math.hypot(e.clientX - decorDrag.startX, e.clientY - decorDrag.startY) > 8) decorDrag.isDragging = true;
      if (decorDrag.isDragging) { setInventoryDragState({ decorItemId: decorDrag.decorItemId, imageUrl: decorDrag.imageUrl, ghostX: e.clientX, ghostY: e.clientY }); setIsDraggingDecor(true); }
      return;
    }
    // Pan
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    const imgW = h * bgAspect;
    setPanX(Math.min(0, Math.max(Math.min(0, w - imgW), drag.startPanX + (e.clientX - drag.startX))));
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
            const building = activeBundle?.buildings.find(b => b.id === openInterior.buildingId);
            const maxPets = building?.maxPets ?? (building?.size ? BUILDING_CAPACITY[building.size]?.pets : undefined) ?? 5;
            const currentCount = pets.filter(p => p.location === openInterior.buildingId && p.posLeft !== null).length;
            if (currentCount >= maxPets) {
              toast({ title: "Pet limit reached!", description: `This building can hold up to ${maxPets} pets.` });
            } else {
              placePetMutation.mutate({
                inventoryId: petDrag.pet.inventoryId,
                xPct: Math.max(0.03, Math.min(0.97, (localX - interior.panX) / interior.imgWidth)),
                yPct: Math.max(0.03, Math.min(0.97, localY / interior.containerH)),
                location: openInterior.buildingId,
              });
            }
          } else if (imgWidth > 0) {
            const maxOutdoor = activeBundle?.maxOutdoorPets ?? 6;
            if (outdoorPets.length >= maxOutdoor) {
              toast({ title: "Pet limit reached!", description: `Your yard can hold up to ${maxOutdoor} pets outdoors.` });
            } else {
              const maxYPct = maxYForHeight(containerH);
              placePetMutation.mutate({
                inventoryId: petDrag.pet.inventoryId,
                xPct: Math.max(0.05, Math.min(0.95, (localX - panX) / imgWidth)),
                yPct: Math.max(0.05, Math.min(maxYPct, localY / containerH)),
                location: "outside",
              });
            }
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
            const building = activeBundle?.buildings.find(b => b.id === openInterior.buildingId);
            const maxItems = building?.size ? BUILDING_CAPACITY[building.size]?.items : 6;
            if (interiorPlacedRaw.length >= (maxItems ?? 6)) {
              toast({ title: "Decor limit reached!", description: `This building can hold up to ${maxItems ?? 6} decorations.` });
            } else {
              placeDecorMutation.mutate({
                decorItemId: decorDrag.decorItemId, size: 220, flipped: false,
                xPct: Math.max(0.03, Math.min(0.97, (localX - interior.panX) / interior.imgWidth)),
                yPct: Math.max(0.03, Math.min(0.97, localY / interior.containerH)),
                location: openInterior.buildingId,
              });
            }
          } else if (imgWidth > 0) {
            if (placedDecorRaw.length >= MAX_OUTDOOR_DECOR) {
              toast({ title: "Decor limit reached!", description: `Your yard can hold up to ${MAX_OUTDOOR_DECOR} decorations outdoors.` });
            } else {
              placeDecorMutation.mutate({
                decorItemId: decorDrag.decorItemId, size: 220, flipped: false,
                xPct: Math.max(0.03, Math.min(0.97, (localX - panX) / imgWidth)),
                yPct: Math.max(0.03, Math.min(0.97, localY / containerH)),
                location: "outside",
              });
            }
          }
        }
      }
      return;
    }
    panStartRef.current = null;
  }, [openInterior, panX, imgWidth, containerH]);

  // ── Outdoor decor drag ─────────────────────────────────────────────────────
  const handlePlacedDragStart = useCallback((e: React.PointerEvent, item: PlacedDecorItem) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    placedDragRef.current = { id: item.id, startXPct: item.xPct, startYPct: item.yPct, startPointerX: e.clientX, startPointerY: e.clientY, pid: e.pointerId };
    setSelectedPlacedId(item.id);
  }, []);

  const handlePlacedDragMove = useCallback((e: React.PointerEvent) => {
    const drag = placedDragRef.current;
    if (!drag || drag.pid !== e.pointerId || imgWidth <= 0) return;
    setPlacedDragLive({
      id: drag.id,
      xPct: Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidth)),
      yPct: Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerH)),
    });
  }, [imgWidth, containerH]);

  const handlePlacedDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = placedDragRef.current;
    placedDragRef.current = null;
    setPlacedDragLive(null);
    if (!drag || imgWidth <= 0) return;
    const newXPct = Math.max(0.02, Math.min(0.98, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidth));
    const newYPct = Math.max(0.02, Math.min(0.98, drag.startYPct + (e.clientY - drag.startPointerY) / containerH));
    if (Math.abs(newXPct - drag.startXPct) > 0.005 || Math.abs(newYPct - drag.startYPct) > 0.005) {
      setTopOutdoorDecorId(drag.id);
      updateDecorMutation.mutate({ id: drag.id, xPct: newXPct, yPct: newYPct });
    }
  }, [imgWidth, containerH]);

  // ── Outdoor pet repositioning drag ─────────────────────────────────────────
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
    const maxYPct = maxYForHeight(containerH);
    setPetDragLive({
      inventoryId: drag.inventoryId,
      xPct: Math.max(0.05, Math.min(0.95, drag.startXPct + dx / imgWidth)),
      yPct: Math.max(0.05, Math.min(maxYPct, drag.startYPct + dy / containerH)),
    });
  }, [imgWidth, containerH]);

  const handlePetDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = petDragRef.current;
    petDragRef.current = null;
    setPetDragLive(null);
    if (!drag) return;
    if (!drag.moved) {
      // Tap with no movement — show the popup for this pet
      const pet = pets.find(p => p.inventoryId === drag.inventoryId);
      if (pet) setOutdoorPopupPet(pet);
      return;
    }
    if (imgWidth <= 0) return;
    const maxYPct = maxYForHeight(containerH);
    setTopOutdoorPetId(drag.inventoryId);
    updatePetPositionMutation.mutate({
      inventoryId: drag.inventoryId,
      xPct: Math.max(0.05, Math.min(0.95, drag.startXPct + (e.clientX - drag.startPointerX) / imgWidth)),
      yPct: Math.max(0.05, Math.min(maxYPct, drag.startYPct + (e.clientY - drag.startPointerY) / containerH)),
    });
  }, [imgWidth, containerH, pets]);

  // ── Inventory drag starters ────────────────────────────────────────────────
  const handleInvDragStart = useCallback((e: React.PointerEvent, decorItemId: string, imageUrl: string | null) => {
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    inventoryDragRef.current = { decorItemId, imageUrl, ghostX: e.clientX, ghostY: e.clientY, startX: e.clientX, startY: e.clientY, isDragging: false, pid: e.pointerId };
  }, []);

  const handlePetInvDragStart = useCallback((e: React.PointerEvent, pet: HousePet) => {
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    petInvDragRef.current = { pet, ghostX: e.clientX, ghostY: e.clientY, startX: e.clientX, startY: e.clientY, isDragging: false, pid: e.pointerId };
  }, []);

  // Hold-to-drag for the pet inventory scroll list.
  // Does NOT capture the pointer immediately. After 150ms without significant
  // movement the hold fires and drag begins. If the user moves horizontally
  // before the hold fires, we cancel it and instead manually scroll the list.
  const handlePetInvPointerDown = useCallback((e: React.PointerEvent, pet: HousePet) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const pid = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    petScrollTrackerRef.current = null;
    petHoldRef.current = {
      pet, pid, startX, startY, el,
      timer: setTimeout(() => {
        // Hold confirmed: steal pointer from browser scroll and begin drag
        playGrab();
        el.setPointerCapture(pid);
        petInvDragRef.current = { pet, ghostX: startX, ghostY: startY, startX, startY, isDragging: true, pid };
        setPetInvDragState({ pet, ghostX: startX, ghostY: startY });
        setIsDraggingPet(true);
        petHoldRef.current = null;
      }, 150),
    };
  }, []);

  const handlePetInvPointerMove = useCallback((e: React.PointerEvent) => {
    const hold = petHoldRef.current;
    if (hold && hold.pid === e.pointerId) {
      // Cancel hold if user moves more than 10px
      if (Math.hypot(e.clientX - hold.startX, e.clientY - hold.startY) > 10) {
        clearTimeout(hold.timer);
        petHoldRef.current = null;
        // If primarily horizontal, start manual scroll tracking
        if (petScrollRef.current && Math.abs(e.clientX - hold.startX) >= Math.abs(e.clientY - hold.startY)) {
          petScrollTrackerRef.current = { scrollLeft: petScrollRef.current.scrollLeft, startX: e.clientX, pid: e.pointerId };
        }
        return;
      }
    }
    // Apply manual scroll if tracking
    const scrollTrack = petScrollTrackerRef.current;
    if (scrollTrack && scrollTrack.pid === e.pointerId && petScrollRef.current) {
      petScrollRef.current.scrollLeft = scrollTrack.scrollLeft - (e.clientX - scrollTrack.startX);
    }
    // Update ghost position once drag is active
    const drag = petInvDragRef.current;
    if (drag && drag.pid === e.pointerId) {
      drag.ghostX = e.clientX; drag.ghostY = e.clientY;
      setPetInvDragState({ pet: drag.pet, ghostX: e.clientX, ghostY: e.clientY });
    }
  }, []);

  const handlePetInvPointerUp = useCallback((e: React.PointerEvent) => {
    const hold = petHoldRef.current;
    if (hold && hold.pid === e.pointerId) {
      clearTimeout(hold.timer);
      petHoldRef.current = null;
    }
    if (petScrollTrackerRef.current?.pid === e.pointerId) {
      petScrollTrackerRef.current = null;
    }
    handlePointerUp(e);
  }, [handlePointerUp]);

  const outdoorPets = pets.filter(p => p.posLeft !== null && (p.location === "outside" || p.location === null));

  // Show loading screen on first load (before bundle data arrives)
  if (bundleLoading && activeBundle === undefined) {
    return <LoadingScreen label="Loading your home..." />;
  }

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
      {/* ── CRITICAL MEMORY FIX ──────────────────────────────────────────────
          Background image is REMOVED from the DOM when the interior is open.
          This frees its GPU texture memory so the interior image can load safely.
          The interior is full-screen anyway, so the background isn't visible. */}
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
            const isMailbox = b.name.toLowerCase().includes("mailbox");
            const isClickable = hasInterior || isMailbox;
            const displayW = Math.round((b.width ?? 120) * (containerH || BUILDING_REF_H) / BUILDING_REF_H);
            return (
              <div
                key={b.id}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${b.posX}%`, top: `${b.posY}%`,
                  transform: "translate(-50%, -100%)",
                  minWidth: displayW,
                  pointerEvents: isClickable ? "auto" : "none",
                  cursor: isClickable ? "pointer" : "default",
                }}
                role={isClickable ? "button" : undefined}
                data-testid={isClickable ? `tile-building-${b.id}` : undefined}
                onClick={() => {
                  if (hasInterior) {
                    setOpenInterior({ url: b.interiorImageUrl!, buildingId: b.id, leaveButtonX: b.leaveButtonX ?? 0.92, leaveButtonY: b.leaveButtonY ?? 0.06 });
                  } else if (isMailbox) {
                    if (pendingGifts.length > 0) {
                      setOpenGiftModal(true);
                    } else {
                      setShowNoMailPopup(true);
                    }
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

      {/* Gift notification button — only visible when there are pending gifts */}
      {pendingGifts.length > 0 && imgWidth > 0 && !openInterior && (
        <button
          data-testid="button-gift-notification"
          onClick={(e) => { e.stopPropagation(); setOpenGiftModal(true); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: panX + (activeBundle?.giftNotificationX ?? 0.05) * imgWidth,
            top: (activeBundle?.giftNotificationY ?? 0.85) * containerH,
            transform: "translate(-50%, -50%)",
            zIndex: 50,
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div style={{ position: "relative", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Glowing orbs */}
            <span style={{ position: "absolute", top: -10, left: -8,  width: 5, height: 5, borderRadius: "50%", background: "#4ade80", animation: "gift-orb-drift-1 2.2s ease-in-out infinite, gift-orb-pulse 2.2s ease-in-out infinite", animationDelay: "0s" }} />
            <span style={{ position: "absolute", top: -6,  right: -10, width: 4, height: 4, borderRadius: "50%", background: "#86efac", animation: "gift-orb-drift-2 1.9s ease-in-out infinite, gift-orb-pulse 1.9s ease-in-out infinite", animationDelay: "0.4s" }} />
            <span style={{ position: "absolute", bottom: -9, left: -6,  width: 4, height: 4, borderRadius: "50%", background: "#4ade80", animation: "gift-orb-drift-3 2.5s ease-in-out infinite, gift-orb-pulse 2.5s ease-in-out infinite", animationDelay: "0.8s" }} />
            <span style={{ position: "absolute", bottom: -7, right: -8,  width: 5, height: 5, borderRadius: "50%", background: "#a7f3d0", animation: "gift-orb-drift-4 2.0s ease-in-out infinite, gift-orb-pulse 2.0s ease-in-out infinite", animationDelay: "1.2s" }} />
            {/* The ! */}
            <span style={{ fontSize: 22, fontWeight: "900", color: "#4ade80", lineHeight: 1, display: "inline-block", animation: "pulse-notif 1.8s ease-in-out infinite", WebkitTextStroke: "1px #000" }}>!</span>
          </div>
        </button>
      )}

      {/* Outdoor pets layer */}
      {imgWidth > 0 && outdoorPets.map((pet, i) => {
        const cfg = randomGroundConfig(i);
        const savedX = parsePetPct(pet.posLeft);
        const savedY = parsePetPct(pet.posTop);
        const isDraggingThis = petDragLive?.inventoryId === pet.inventoryId;
        const xPct = isDraggingThis ? petDragLive.xPct : (savedX ?? cfg.centerX / 100);
        const yPct = isDraggingThis ? petDragLive.yPct : (savedY ?? cfg.centerY / 100);
        const left = panX + xPct * imgWidth;
        const top = yPct * containerH;
        return (
          <div
            key={pet.inventoryId}
            className="absolute"
            style={{ zIndex: isDraggingThis ? 30 : (topOutdoorPetId === pet.inventoryId ? 14 : 12), left, top, width: cfg.size, height: cfg.size, transform: "translate(-50%, -50%)", pointerEvents: "none" }}
          >
            {pet.petTemplateId ? (
              <PetAnimator
                petTemplateId={pet.petTemplateId}
                mode="static"
                size={cfg.size}
                fillContainer
                className={isDraggingThis ? undefined : "pet-idle-squish"}
                style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}
              />
            ) : (pet.hatchedImageUrl || pet.imageUrl) ? (
              <img
                src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                alt={pet.nickname ?? pet.name}
                draggable={false}
                className={isDraggingThis ? undefined : "pet-idle-squish"}
                style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}
              />
            ) : null}
            {/* Full-area hit zone for dragging — covers entire pet so top-of-screen pets are still grabbable */}
            <div
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "auto", touchAction: "none", cursor: isDraggingThis ? "grabbing" : "grab" }}
              onPointerDown={(e) => handlePetDragStart(e, pet.inventoryId, xPct, yPct)}
              onPointerMove={handlePetDragMove}
              onPointerUp={handlePetDragEnd}
              onPointerCancel={handlePetDragEnd}
            />
          </div>
        );
      })}

      {/* Outdoor pet tap popup — same pattern as indoor InteriorScene popup */}
      {outdoorPopupPet && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 40, background: "rgba(0,0,0,0.45)" }}
          onPointerDown={e => { e.stopPropagation(); setOutdoorPopupPet(null); }}
        >
          <div
            className="flex flex-col items-center gap-3 rounded-2xl px-5 py-4"
            style={{ background: "rgba(15,10,5,0.95)", border: "1px solid rgba(255,215,0,0.25)", boxShadow: "0 4px 24px rgba(0,0,0,0.7)" }}
            onPointerDown={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: "Lora, serif", color: "#ffd700", fontSize: 14, fontWeight: 700 }}>
              {outdoorPopupPet.nickname ?? outdoorPopupPet.name}
            </div>
            <div className="flex flex-col items-center gap-2 w-full">
              <button
                onClick={() => { setFeedingPet(outdoorPopupPet); setOutdoorPopupPet(null); }}
                className="rounded-2xl px-7 py-3 text-base font-bold flex items-center gap-2.5 transition-transform active:scale-95"
                style={{
                  fontFamily: "Lora, serif",
                  background: "linear-gradient(160deg, rgba(140,220,100,0.45) 0%, rgba(80,160,60,0.55) 100%)",
                  border: "2px solid rgba(190,255,160,0.85)",
                  color: "#f4ffe6",
                  boxShadow: "0 0 18px rgba(150,230,110,0.5), 0 4px 14px rgba(0,0,0,0.5)",
                  letterSpacing: "0.05em",
                }}
                data-testid="button-popup-feed-outdoor"
              >
                <img src={feedButtonIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                Feed
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setOutdoorPopupPet(null)}
                  className="rounded-lg px-3 py-1 text-[11px] font-bold"
                  style={{ fontFamily: "Lora, serif", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.55)" }}
                  data-testid="button-popup-cancel-outdoor"
                >Cancel</button>
                <button
                  onClick={() => { removePetFromSceneMutation.mutate(outdoorPopupPet.inventoryId); setOutdoorPopupPet(null); }}
                  className="rounded-lg px-3 py-1 text-[11px] font-bold"
                  style={{ fontFamily: "Lora, serif", background: "rgba(255,100,80,0.12)", border: "1px solid rgba(255,100,80,0.35)", color: "rgba(255,160,140,0.85)" }}
                  data-testid="button-popup-return-outdoor"
                >Return to Inventory</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outdoor placed decor layer */}
      {imgWidth > 0 && placedDecor.map((item) => {
        const isSelected = selectedPlacedId === item.id;
        const left = panX + item.xPct * imgWidth;
        const top = item.yPct * containerH;
        return (
          <div
            key={item.id}
            className="absolute"
            style={{ zIndex: topOutdoorDecorId === item.id ? 8 : 6, left, top, transform: "translate(-50%, -50%)", touchAction: "none" }}
            onPointerDown={(e) => handlePlacedDragStart(e, item)}
            onPointerMove={handlePlacedDragMove}
            onPointerUp={handlePlacedDragEnd}
            onPointerCancel={handlePlacedDragEnd}
            onClick={(e) => { e.stopPropagation(); setSelectedPlacedId(isSelected ? null : item.id); }}
          >
            {isSelected && (
              <div className="absolute flex gap-2" style={{ bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", zIndex: 10, whiteSpace: "nowrap" }}>
                <ControlBtn onClick={() => updateDecorMutation.mutate({ id: item.id, size: Math.max(100, item.size - 25) })}><SvgMinus /></ControlBtn>
                <ControlBtn onClick={() => updateDecorMutation.mutate({ id: item.id, size: Math.min(400, item.size + 25) })}><SvgPlus /></ControlBtn>
                <ControlBtn onClick={() => updateDecorMutation.mutate({ id: item.id, flipped: !item.flipped })}><SvgFlip /></ControlBtn>
                <ControlBtn danger onClick={() => removeDecorMutation.mutate(item.id)}><SvgDelete /></ControlBtn>
              </div>
            )}
            <img
              src={item.item.imageUrl ?? ""}
              alt={item.item.name}
              draggable={false}
              style={{
                width: item.size, height: item.size, objectFit: "contain",
                transform: item.flipped ? "scaleX(-1)" : undefined,
                outline: isSelected ? "2px solid rgba(255,215,0,0.8)" : "none",
                outlineOffset: "3px",
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
                userSelect: "none", cursor: "grab",
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

      {/* Bottom inventory bar — left-aligned to avoid FloatingNav (bottom-right) */}
      <div
        className="absolute bottom-0 left-0 flex gap-3 pb-5 pt-3 pl-3"
        style={{ zIndex: openInterior ? 65 : 40, pointerEvents: "auto", right: 80, background: "linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {[
          { key: "pets" as const, label: "Pets", icon: () => <img src={petInventoryIcon} alt="" className="w-8 h-8 object-contain" />, bg: "rgba(255,180,50,0.35)", border: "rgba(255,200,80,0.8)" },
          { key: "home" as const, label: "Home", icon: () => <img src={homeInventoryIcon} alt="" className="w-8 h-8 object-contain" />, bg: "rgba(120,200,100,0.35)", border: "rgba(120,220,80,0.8)" },
          { key: "decor" as const, label: "Decor", icon: () => <img src={decorInventoryIcon} alt="" className="w-8 h-8 object-contain" />, bg: "rgba(180,120,220,0.35)", border: "rgba(200,120,255,0.8)" },
          { key: "friends" as const, label: "Friends", icon: () => <img src={friendsInventoryIcon} alt="" className="w-8 h-8 object-contain" />, bg: "rgba(74,222,128,0.3)", border: "rgba(74,222,128,0.8)" },
        ].map(({ key, label, icon, bg, border }) => {
          const active = openInventory === key;
          return (
            <button
              key={key}
              data-testid={`button-${key}-inventory`}
              onClick={() => setOpenInventory(active ? null : key)}
              className="flex flex-col items-center gap-0.5 group relative"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-active:scale-90"
                style={{
                  background: active ? bg : "rgba(0,0,0,0.45)",
                  border: `2px solid ${active ? border : "rgba(255,255,255,0.2)"}`,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                  backdropFilter: "blur(6px)",
                }}
              >
                {icon()}
              </div>
              {/* Friend request badge on the Friends button */}
              {key === "friends" && friendRequestCount > 0 && (
                <div
                  className="absolute -top-1 right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1"
                  style={{
                    background: "radial-gradient(circle, #4ade80 0%, #16a34a 100%)",
                    border: "2px solid rgba(0,0,0,0.6)",
                    boxShadow: "0 0 6px rgba(74,222,128,0.7)",
                    zIndex: 10,
                  }}
                >
                  <span className="font-bold text-[9px] text-white leading-none">{friendRequestCount}</span>
                </div>
              )}
              <span className="text-white font-semibold drop-shadow-md" style={{ fontSize: 9, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Inventory overlay panel — z-250 so it rises above the FloatingNav main button (z-96) */}
      {openInventory && (
        <div
          className="absolute inset-0 flex flex-col justify-end"
          style={{ zIndex: openInterior ? 70 : 250, pointerEvents: "none", visibility: (isDraggingDecor || isDraggingPet) ? "hidden" : "visible" }}
        >
          <div className="absolute inset-0" style={{ pointerEvents: "auto" }} onPointerDown={(e) => { e.stopPropagation(); setOpenInventory(null); }} />
          <div
            className={`relative rounded-t-3xl ${openInventory === "pets" ? "px-4 pt-3 pb-4" : "px-5 pt-5 pb-28"}`}
            style={{
              pointerEvents: "auto",
              background: "linear-gradient(180deg, rgba(20,30,20,0.97) 0%, rgba(10,18,10,0.99) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
              minHeight: openInventory === "pets" ? 110 : 280,
              maxHeight: openInventory === "pets" ? 160 : "70vh",
              overflowY: openInventory === "pets" ? "hidden" : "auto",
              overflowX: "hidden",
            }}
          >
            {openInventory === "pets" && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-xs" style={{ fontFamily: "Lora, serif" }}>Pet Inventory</span>
                <button
                  onClick={() => setOpenInventory(null)}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-xs"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.15)" }}
                >✕</button>
              </div>
            )}
            {openInventory !== "pets" && <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />}
            {openInventory !== "pets" && (
              <div className="flex items-center gap-3 mb-5">
                <img
                  src={openInventory === "home" ? homeInventoryIcon : openInventory === "decor" ? decorInventoryIcon : friendsInventoryIcon}
                  alt=""
                  className="w-10 h-10 object-contain"
                />
                <div>
                  <h2 className="text-white font-bold text-lg leading-tight">
                    {openInventory === "home" ? "Home Inventory" : openInventory === "decor" ? "Decor Inventory" : "Friends"}
                  </h2>
                  <p className="text-white/50 text-xs">
                    {openInventory === "home" ? "House bundles you own" : openInventory === "decor" ? "Home decorations you own" : "Your companions in the realm"}
                  </p>
                </div>
              </div>
            )}

            {openInventory === "home" && (
              <div className="flex flex-col gap-4">
                {activeBundle && (
                  <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "rgba(120,220,80,0.12)", border: "1.5px solid rgba(120,220,80,0.4)" }}>
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
                              <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.9)" }}>
                                <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>✓</span>
                              </div>
                            )}
                          </div>
                          <span className="w-full text-center leading-tight px-0.5 truncate" style={{ color: isActive ? "#86efac" : "rgba(255,255,255,0.75)", fontSize: 10, fontFamily: "Lora, serif", fontWeight: 600 }}>
                            {bundle.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {openInventory === "decor" && (
              <div className="flex flex-col gap-4">
                {decorInventory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <img src={decorInventoryIcon} alt="" className="w-14 h-14 object-contain opacity-50" />
                    <p className="text-white/40 text-sm text-center">No decor items yet.{"\n"}Visit the shop to find some!</p>
                  </div>
                ) : (
                  <>
                    <p className="text-white/40 text-xs text-center" style={{ fontFamily: "Lora, serif" }}>
                      {openInterior ? "Hold & drag an item onto the interior" : "Hold & drag an item onto your home"}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {decorInventory.map((entry) => (
                        <div
                          key={entry.id}
                          data-testid={`decor-item-${entry.decorItemId}`}
                          className="flex flex-col items-center gap-1.5"
                          onPointerDown={(e) => handleInvDragStart(e, entry.decorItemId, entry.item.imageUrl)}
                          onPointerMove={(e) => {
                            const drag = inventoryDragRef.current;
                            if (!drag || drag.pid !== e.pointerId) return;
                            drag.ghostX = e.clientX; drag.ghostY = e.clientY;
                            if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8) drag.isDragging = true;
                            if (drag.isDragging) { setInventoryDragState({ decorItemId: drag.decorItemId, imageUrl: drag.imageUrl, ghostX: e.clientX, ghostY: e.clientY }); setIsDraggingDecor(true); }
                          }}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                          style={{ touchAction: "none", cursor: "grab" }}
                        >
                          <div className="w-full rounded-2xl overflow-hidden relative" style={{ aspectRatio: "1 / 1", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,215,0,0.18)" }}>
                            {entry.item.imageUrl ? (
                              <img src={entry.item.imageUrl} alt={entry.item.name} className="w-full h-full object-contain p-2" draggable={false} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <img src={decorInventoryIcon} alt="" className="w-10 h-10 object-contain opacity-50" />
                              </div>
                            )}
                            {entry.quantity > 1 && (
                              <div className="absolute top-1 right-1 rounded-full flex items-center justify-center" style={{ minWidth: 20, height: 20, background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,215,0,0.5)", padding: "0 4px" }}>
                                <span style={{ color: "#ffd700", fontSize: 10, fontWeight: 700 }}>×{entry.quantity}</span>
                              </div>
                            )}
                          </div>
                          <span className="w-full text-center truncate px-0.5 leading-tight" style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "Lora, serif", fontWeight: 600 }}>
                            {entry.item.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {openInventory === "friends" && (
              <div className="flex flex-col gap-4 pb-4">
                {/* Pending requests */}
                {friendNotifications.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[9px] tracking-widest uppercase" style={{ color: "rgba(240,192,64,0.7)", fontFamily: "Lora, serif" }}>
                        Accepted ({friendNotifications.length})
                      </p>
                      <button
                        data-testid="button-dismiss-friend-notifs"
                        onClick={() => dismissFriendNotifsMutation.mutate()}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "rgba(240,192,64,0.4)", fontFamily: "Lora, serif" }}
                      >
                        dismiss all
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {friendNotifications.map((notif: any) => (
                        <div
                          key={notif.id}
                          data-testid={`notif-friend-accepted-${notif.id}`}
                          className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                          style={{ background: "rgba(240,192,64,0.06)", border: "1px solid rgba(240,192,64,0.18)" }}
                        >
                          <span style={{ fontSize: 14, flexShrink: 0 }}>🤝</span>
                          <span className="flex-1 text-xs leading-snug" style={{ color: "#d4c89a", fontFamily: "Lora, serif" }}>{notif.message}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(240,192,64,0.15), transparent)", margin: "12px 0" }} />
                  </div>
                )}

                {friendRequestsList.length > 0 && (
                  <div>
                    <p className="text-[9px] tracking-widest uppercase mb-2" style={{ color: "rgba(74,222,128,0.6)", fontFamily: "Lora, serif" }}>
                      Requests ({friendRequestsList.length})
                    </p>
                    <div className="flex flex-col gap-2">
                      {friendRequestsList.map((req: any) => (
                        <div
                          key={req.id}
                          data-testid={`friend-request-${req.id}`}
                          className="flex items-center gap-2 rounded-xl px-3 py-2"
                          style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)" }}
                        >
                          {req.profileImage ? (
                            <img src={req.profileImage} alt={req.username} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(74,222,128,0.3)", flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 11, color: "#4ade80", fontWeight: "bold" }}>{(req.username ?? "?").charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className="flex-1 truncate text-sm" style={{ color: "#d4e8da", fontFamily: "Lora, serif" }}>{req.username}</span>
                          <button
                            data-testid={`button-accept-${req.id}`}
                            onClick={() => acceptFriendMutation.mutate({ requestId: req.id, username: req.username })}
                            disabled={acceptFriendMutation.isPending}
                            className="rounded-lg px-3 py-1 text-xs font-bold transition-transform active:scale-90"
                            style={{ background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.45)", color: "#4ade80", cursor: "pointer" }}
                          >✓</button>
                          <button
                            data-testid={`button-decline-${req.id}`}
                            onClick={() => declineFriendMutation.mutate(req.requesterId)}
                            disabled={declineFriendMutation.isPending}
                            className="rounded-lg px-3 py-1 text-xs font-bold transition-transform active:scale-90"
                            style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171", cursor: "pointer" }}
                          >✕</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.2), transparent)", margin: "12px 0" }} />
                  </div>
                )}

                {/* Friends list */}
                <p className="text-[9px] tracking-widest uppercase mb-1" style={{ color: "rgba(127,255,212,0.6)", fontFamily: "Lora, serif" }}>
                  My Friends ({friendsList.length})
                </p>
                {friendsList.length === 0 && friendRequestsList.length === 0 && (
                  <p className="text-sm text-center py-4" style={{ color: "#5a8070", fontFamily: "Lora, serif" }}>No friends yet — explore and add some!</p>
                )}
                <div className="flex flex-col gap-2">
                  {friendsList.map((f: any) => (
                    <button
                      key={f.id}
                      data-testid={`friend-row-${f.friendId}`}
                      onClick={() => { setOpenInventory(null); setSelectedFriend({ id: f.friendId, username: f.username }); }}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 w-full text-left transition-transform active:scale-95"
                      style={{ background: "rgba(127,255,212,0.04)", border: "1px solid rgba(127,255,212,0.1)", cursor: "pointer" }}
                    >
                      {f.profileImage ? (
                        <img src={f.profileImage} alt={f.username} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(212,160,23,0.35)", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: "#d4a017", fontWeight: "bold" }}>{(f.username ?? "?").charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      <span className="flex-1 truncate text-sm" style={{ color: "#d4e8da", fontFamily: "Lora, serif" }}>{f.username}</span>
                      <RoleBadge isAdmin={f.isAdmin} isModerator={f.isModerator} />
                      <span style={{ fontSize: 11, color: "rgba(127,255,212,0.3)" }}>›</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {openInventory === "pets" && (() => {
              const unplacedPets = pets.filter(p => p.posLeft === null);
              const placedCount = pets.length - unplacedPets.length;
              if (pets.length === 0) return (
                <p className="text-white/40 text-xs text-center py-3" style={{ fontFamily: "Lora, serif" }}>No pets yet — hatch some eggs!</p>
              );
              const recallButton = placedCount > 0 ? (
                <button
                  data-testid="button-recall-all-pets"
                  onClick={() => storeAllPetsMutation.mutate()}
                  disabled={storeAllPetsMutation.isPending}
                  className="rounded-lg px-3 py-1 text-[10px] font-bold transition-transform active:scale-95 disabled:opacity-50"
                  style={{
                    background: "rgba(255,100,80,0.18)",
                    border: "1px solid rgba(255,100,80,0.4)",
                    color: "rgba(255,170,150,0.95)",
                    fontFamily: "Lora, serif",
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {storeAllPetsMutation.isPending ? "Recalling…" : `Recall All (${placedCount})`}
                </button>
              ) : null;
              if (unplacedPets.length === 0) return (
                <div className="flex items-center justify-between gap-2 py-2">
                  <p className="text-white/40 text-xs" style={{ fontFamily: "Lora, serif" }}>All pets are on the scene!</p>
                  {recallButton}
                </div>
              );
              return (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white/40 text-xs" style={{ fontFamily: "Lora, serif" }}>Hold &amp; drag a pet onto your home</p>
                    {recallButton}
                  </div>
                  <div
                    ref={petScrollRef}
                    className="flex gap-2 overflow-x-auto"
                    style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch", touchAction: "pan-x" } as React.CSSProperties}
                  >
                    {unplacedPets.map((pet) => (
                      <div
                        key={pet.inventoryId}
                        data-testid={`pet-inv-item-${pet.inventoryId}`}
                        className="flex flex-col items-center gap-1"
                        style={{ flexShrink: 0, width: 64, touchAction: "pan-x", cursor: "grab" }}
                        onPointerDown={(e) => handlePetInvPointerDown(e, pet)}
                        onPointerMove={handlePetInvPointerMove}
                        onPointerUp={handlePetInvPointerUp}
                        onPointerCancel={handlePetInvPointerUp}
                      >
                        <div className="rounded-xl overflow-hidden" style={{ width: 64, height: 64, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,215,0,0.18)" }}>
                          <img
                            src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
                            alt={pet.nickname ?? pet.name}
                            className="w-full h-full object-contain p-1"
                            draggable={false}
                          />
                        </div>
                        <span className="text-center truncate w-full leading-tight" style={{ color: "rgba(255,255,255,0.65)", fontSize: 9, fontFamily: "Lora, serif", fontWeight: 600 }}>
                          {pet.nickname ?? pet.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Decor drag ghost */}
      {inventoryDragState && (
        <div className="fixed pointer-events-none" style={{ zIndex: 100, left: inventoryDragState.ghostX - 65, top: inventoryDragState.ghostY - 65, width: 130, height: 130, opacity: 0.88 }}>
          {inventoryDragState.imageUrl ? (
            <img src={inventoryDragState.imageUrl} className="w-full h-full object-contain" draggable={false} style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.7))" }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center rounded-2xl" style={{ background: "rgba(0,0,0,0.4)", border: "2px dashed rgba(255,215,0,0.5)" }}>
              <img src={decorInventoryIcon} className="w-16 h-16 object-contain opacity-60" alt="" />
            </div>
          )}
        </div>
      )}

      {/* Pet drag ghost */}
      {petInvDragState && (
        <div className="fixed pointer-events-none" style={{ zIndex: 100, left: petInvDragState.ghostX - 60, top: petInvDragState.ghostY - 60, width: 120, height: 120, opacity: 0.88 }}>
          <img
            src={petInvDragState.pet.hatchedImageUrl ?? petInvDragState.pet.imageUrl ?? ""}
            className="w-full h-full object-contain"
            draggable={false}
            style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.7))" }}
          />
        </div>
      )}

      {/* Bundle activation modal */}
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
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0" style={{ border: "1.5px solid rgba(255,215,0,0.25)", background: "rgba(255,255,255,0.05)" }}>
                {pendingActivate.bundle.shopImageUrl
                  ? <img src={pendingActivate.bundle.shopImageUrl} alt={pendingActivate.bundle.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><img src={homeInventoryIcon} alt="" className="w-9 h-9 object-contain opacity-60" /></div>}
              </div>
              <div>
                <p className="text-white/50 text-xs mb-0.5" style={{ fontFamily: "Lora, serif" }}>Switch Home Bundle?</p>
                <p className="text-white font-bold text-base leading-tight" style={{ fontFamily: "Lora, serif" }}>{pendingActivate.bundle.name}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button data-testid="button-cancel-activate" onClick={() => setPendingActivate(null)} className="flex-1 py-3 rounded-2xl font-bold text-sm tracking-wide" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: "Lora, serif" }}>Cancel</button>
              <button
                data-testid="button-confirm-activate"
                onClick={() => { activateMutation.mutate(pendingActivate.bundleId); setPendingActivate(null); }}
                disabled={activateMutation.isPending}
                className="flex-1 py-3 rounded-2xl font-bold text-sm tracking-wide transition-opacity disabled:opacity-50"
                style={{ background: "rgba(120,220,80,0.25)", color: "#86efac", border: "1.5px solid rgba(120,220,80,0.5)", fontFamily: "Lora, serif" }}
              >
                {activateMutation.isPending ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Building interior viewer */}
      {openInterior && (
        <ErrorBoundary fallback={
          <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" style={{ zIndex: 60, background: "#07090f", maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#ffd700", letterSpacing: "0.1em" }}>Something went wrong</div>
            <button onClick={() => { setOpenInterior(null); interiorPanRef.current = null; }}
              style={{ fontFamily: "Lora, serif", fontSize: 11, letterSpacing: "0.15em", color: "#ffd700", background: "rgba(30,18,4,0.9)", border: "1px solid rgba(255,215,0,0.45)", borderRadius: 9999, padding: "8px 20px", cursor: "pointer" }}>
              Outside
            </button>
          </div>
        }>
          <InteriorViewer
            url={openInterior.url}
            placedItems={interiorPlacedRaw}
            placedPets={pets.filter(p => p.posLeft !== null && p.location === openInterior.buildingId)}
            panStateRef={interiorPanRef}
            leaveButtonX={openInterior.leaveButtonX}
            leaveButtonY={openInterior.leaveButtonY}
            onUpdateItem={(id, data) => updateDecorMutation.mutate({ id, ...data })}
            onRemoveItem={(id) => removeDecorMutation.mutate(id)}
            onMovePet={(inventoryId, xPct, yPct) => placePetMutation.mutate({ inventoryId, xPct, yPct, location: openInterior.buildingId })}
            onRemovePet={(inventoryId) => removePetFromSceneMutation.mutate(inventoryId)}
            onFeedPet={(pet) => setFeedingPet(pet)}
            onClose={() => { setOpenInterior(null); interiorPanRef.current = null; }}
          />
        </ErrorBoundary>
      )}

      {showProfile && (
        <UserProfilePanel user={currentUser} onClose={() => setShowProfile(false)} onUserUpdate={(u) => setCurrentUser(u)} />
      )}

      {openGiftModal && (
        <GiftClaimModal onClose={() => setOpenGiftModal(false)} />
      )}

      {showNoMailPopup && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 9000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
          onClick={() => setShowNoMailPopup(false)}
        >
          <div
            className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl"
            style={{
              background: "linear-gradient(160deg, rgba(14,8,3,0.98) 0%, rgba(35,20,6,0.98) 100%)",
              border: "1.5px solid rgba(212,160,23,0.4)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.8), 0 0 20px rgba(212,160,23,0.08)",
              maxWidth: 260,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "radial-gradient(ellipse, rgba(212,160,23,0.15) 0%, rgba(60,35,10,0.4) 100%)", border: "1.5px solid rgba(212,160,23,0.3)" }}
            >
              <MailOpen size={24} color="rgba(212,160,23,0.7)" />
            </div>
            <div className="text-center">
              <p className="font-fantasy tracking-widest mb-1" style={{ color: "#f0c040", fontSize: 13, letterSpacing: "0.15em" }}>NO MAIL YET</p>
              <p className="font-sans" style={{ color: "#c8b896", fontSize: 12, lineHeight: 1.5 }}>Check back later for gifts and messages from friends.</p>
            </div>
            <button
              data-testid="button-close-no-mail"
              onClick={() => setShowNoMailPopup(false)}
              className="font-fantasy tracking-widest transition-transform active:scale-90"
              style={{
                fontSize: 10, padding: "6px 20px", borderRadius: 8,
                background: "rgba(212,160,23,0.12)",
                border: "1px solid rgba(212,160,23,0.35)",
                color: "rgba(240,192,64,0.8)",
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {selectedFriend && (
        <FriendProfileModal
          friendId={selectedFriend.id}
          friendUsername={selectedFriend.username}
          senderCoins={currentUser.coins}
          onClose={() => setSelectedFriend(null)}
        />
      )}

      {feedingPet && (
        <FeedingOverlay
          pet={feedingPet}
          onClose={() => setFeedingPet(null)}
        />
      )}
    </div>
  );
}

// ── Feeding Overlay ──────────────────────────────────────────────────────────
// Full-screen magical-rainforest scene where a player drags edibles from the
// bottom strip onto the pet to feed it. Each successful drop calls the existing
// `/api/pet/:inventoryId/feed-edible` endpoint, which destroys the edible and
// awards LVL points. Inventory + pet caches are invalidated after each feed.
// Hunger & Mood status bars rendered below the pet on the feeding page.
// Hunger: color shifts green → yellow → orange → red as it depletes.
// Mood: color shifts gold → soft purple → grey → muddy red, with the
// matching mood face icon swapped out at thresholds.
function PetStatusBars({
  hungerVal,
  hungerMax,
  hungerPct,
  moodVal,
}: {
  hungerVal: number;
  hungerMax: number;
  hungerPct: number;
  moodVal: number;
}) {
  const hungerColor =
    hungerPct > 66 ? "linear-gradient(90deg, #6dd36b 0%, #b9f0a0 100%)"
    : hungerPct > 33 ? "linear-gradient(90deg, #d3c44e 0%, #f0e58a 100%)"
    : hungerPct > 12 ? "linear-gradient(90deg, #d38c4e 0%, #f0c08a 100%)"
    : "linear-gradient(90deg, #b94a3b 0%, #f08a7a 100%)";

  let moodFace = moodFaceHappy;
  let moodColor = "linear-gradient(90deg, #f4c84a 0%, #ffe890 100%)";
  let moodLabel = "Happy";
  if (moodVal <= 25) { moodFace = moodFaceHungry; moodColor = "linear-gradient(90deg, #b94a3b 0%, #f08a7a 100%)"; moodLabel = "Miserable"; }
  else if (moodVal <= 50) { moodFace = moodFaceSad; moodColor = "linear-gradient(90deg, #6a6790 0%, #b8b3d8 100%)"; moodLabel = "Sad"; }
  else if (moodVal <= 75) { moodFace = moodFaceContent; moodColor = "linear-gradient(90deg, #6db3a6 0%, #a8d8ce 100%)"; moodLabel = "Content"; }

  const barWrap: React.CSSProperties = {
    width: 240,
    height: 14,
    borderRadius: 999,
    background: "rgba(10,18,8,0.75)",
    border: "1px solid rgba(180,255,160,0.35)",
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.4)",
    overflow: "hidden",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: "Lora, serif",
    color: "#e6f5d0",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.15em",
    textShadow: "0 1px 4px rgba(0,0,0,0.7)",
  };
  const valStyle: React.CSSProperties = {
    fontFamily: "Lora, serif",
    color: "#f7ffe8",
    fontSize: 10,
    fontWeight: 700,
    textShadow: "0 1px 4px rgba(0,0,0,0.7)",
  };

  return (
    <div
      className="absolute left-1/2"
      style={{
        top: "calc(42% + 130px)",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
      }}
      data-testid="pet-status-bars"
    >
      {/* Hunger row */}
      <div className="flex items-center gap-2">
        <span style={labelStyle}>HUNGER</span>
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: -4 }}>
        <div style={barWrap} data-testid="bar-hunger">
          <div
            style={{
              width: `${hungerPct}%`,
              height: "100%",
              background: hungerColor,
              transition: "width 0.5s ease, background 0.5s ease",
              boxShadow: "0 0 10px rgba(255,255,255,0.25)",
            }}
          />
        </div>
        <span style={valStyle} data-testid="text-hunger-value">{hungerVal}/{hungerMax}</span>
      </div>

      {/* Mood row */}
      <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
        <span style={labelStyle}>MOOD</span>
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: -4 }}>
        <img
          src={moodFace}
          alt={moodLabel}
          style={{ width: 28, height: 28, objectFit: "contain", filter: "drop-shadow(0 0 6px rgba(255,220,120,0.5)) drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}
          data-testid="img-mood-face"
        />
        <div style={barWrap} data-testid="bar-mood">
          <div
            style={{
              width: `${moodVal}%`,
              height: "100%",
              background: moodColor,
              transition: "width 0.5s ease, background 0.5s ease",
              boxShadow: "0 0 10px rgba(255,255,255,0.25)",
            }}
          />
        </div>
        <span style={valStyle} data-testid="text-mood-value">{moodVal}</span>
      </div>
    </div>
  );
}

function FeedingOverlay({ pet, onClose }: { pet: HousePet; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Pull the live, full inventory so we can filter to edibles AND look up the
  // canonical, server-decayed hunger/mood for THIS pet (the prop is a stale
  // snapshot from the pet-house page).
  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    refetchInterval: 30_000,  // Keep hunger/mood live while overlay is open.
  });
  const edibles = useMemo(
    () => inventory.filter((it) => it.type === "edibles"),
    [inventory],
  );
  // Find the live pet record so hunger/mood reflect server state.
  const livePet = useMemo(
    () => inventory.find((it) => it.id === pet.inventoryId) ?? pet,
    [inventory, pet],
  );
  const maxHunger = Math.max(1, livePet.petHealth ?? 1000);
  const hungerRaw = livePet.petHunger;
  const hungerVal = hungerRaw == null || hungerRaw < 0 ? maxHunger : hungerRaw;
  const hungerPct = Math.max(0, Math.min(100, (hungerVal / maxHunger) * 100));
  const moodVal = Math.max(0, Math.min(100, livePet.petMood ?? 100));

  // Drag state.
  const dragRef = useRef<{ inventoryId: string; imageUrl: string | null; pid: number } | null>(null);
  const [dragGhost, setDragGhost] = useState<{ inventoryId: string; imageUrl: string | null; x: number; y: number } | null>(null);

  // Pet visual state — drop target, glow, click animation, sparkles.
  const petBoxRef = useRef<HTMLDivElement>(null);
  const [petGlow, setPetGlow] = useState(false);
  const [petBounce, setPetBounce] = useState(false);
  const [floatTexts, setFloatTexts] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const [sparkles, setSparkles] = useState<{ id: number; cx: number; cy: number; dx: number; dy: number; rot: number; size: number }[]>([]);
  const [hearts, setHearts] = useState<{ id: number; cx: number; cy: number; dx: number; size: number; delay: number }[]>([]);
  const floatIdRef = useRef(0);
  const sparkIdRef = useRef(0);
  const heartIdRef = useRef(0);

  const burstHearts = useCallback((cx: number, cy: number, count = 7) => {
    const newOnes = Array.from({ length: count }, () => ({
      id: ++heartIdRef.current,
      cx: cx + (Math.random() - 0.5) * 180,
      cy,
      dx: (Math.random() - 0.5) * 200,
      size: 18 + Math.random() * 22,
      delay: Math.random() * 0.45,
    }));
    setHearts((h) => [...h, ...newOnes]);
    const ids = new Set(newOnes.map((n) => n.id));
    setTimeout(() => setHearts((h) => h.filter((x) => !ids.has(x.id))), 2600);
  }, []);

  const burstSparkles = useCallback((cx: number, cy: number, count = 10) => {
    const newOnes = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 70 + Math.random() * 70;
      return {
        id: ++sparkIdRef.current,
        cx, cy,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - 20,  // bias upward
        rot: (Math.random() - 0.5) * 540,
        size: 12 + Math.random() * 10,
      };
    });
    setSparkles((s) => [...s, ...newOnes]);
    const ids = new Set(newOnes.map((n) => n.id));
    setTimeout(() => setSparkles((s) => s.filter((x) => !ids.has(x.id))), 1200);
  }, []);

  const onPetClick = useCallback(() => {
    setPetBounce(true);
    // Hold the happy expression a bit longer than the bounce so the eyes-closed
    // / open-mouth pose lingers while the hearts float.
    setTimeout(() => setPetBounce(false), 1100);
    const box = petBoxRef.current?.getBoundingClientRect();
    if (box) {
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      burstSparkles(cx, cy, 8);
      burstHearts(cx, cy + 30, 7);
    }
  }, [burstSparkles, burstHearts]);

  const feedMutation = useMutation({
    mutationFn: async ({ itemInventoryId }: { itemInventoryId: string }) => {
      return await apiRequest("POST", `/api/pet/${pet.inventoryId}/feed-edible`, { itemInventoryId });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      // Glow + bounce + sparkles + floating text on successful feed.
      setPetGlow(true);
      setPetBounce(true);
      setTimeout(() => setPetGlow(false), 700);
      setTimeout(() => setPetBounce(false), 1100);
      const fed = inventory.find((it) => it.id === variables.itemInventoryId);
      const amount = fed?.statBoostAmount ?? 5;
      const id = ++floatIdRef.current;
      const box = petBoxRef.current?.getBoundingClientRect();
      const cx = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const cy = box ? box.top + box.height * 0.3 : window.innerHeight / 2;
      setFloatTexts((arr) => [...arr, { id, x: cx, y: cy, text: `+${amount} Feed pts` }]);
      setTimeout(() => setFloatTexts((arr) => arr.filter((f) => f.id !== id)), 1400);
      if (box) {
        const bx = box.left + box.width / 2;
        const by = box.top + box.height / 2;
        burstSparkles(bx, by, 14);
        burstHearts(bx, by + 30, 8);
      }
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't feed",
        description: err?.message || "Try again in a moment.",
      });
    },
  });

  const onItemPointerDown = useCallback((e: React.PointerEvent, item: any) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { inventoryId: item.id, imageUrl: item.imageUrl, pid: e.pointerId };
    setDragGhost({ inventoryId: item.id, imageUrl: item.imageUrl, x: e.clientX, y: e.clientY });
  }, []);

  const onItemPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    setDragGhost({ inventoryId: d.inventoryId, imageUrl: d.imageUrl, x: e.clientX, y: e.clientY });
  }, []);

  const onItemPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    dragRef.current = null;
    const ghost = { x: e.clientX, y: e.clientY };
    const box = petBoxRef.current?.getBoundingClientRect();
    setDragGhost(null);
    if (box && ghost.x >= box.left && ghost.x <= box.right && ghost.y >= box.top && ghost.y <= box.bottom) {
      feedMutation.mutate({ itemInventoryId: d.inventoryId });
    }
  }, [feedMutation]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0"
      style={{
        zIndex: 500,
        background: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.55) 100%), url(${feedingPageBg}) center/cover no-repeat`,
        maxWidth: "768px", margin: "0 auto", left: 0, right: 0,
        touchAction: "none",
      }}
      onPointerMove={onItemPointerMove}
      onPointerUp={onItemPointerUp}
      onPointerCancel={onItemPointerUp}
      data-testid="overlay-feeding"
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}>
        <div
          className="px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(15,25,12,0.7)",
            border: "1px solid rgba(180,255,160,0.35)",
            backdropFilter: "blur(6px)",
            fontFamily: "Lora, serif",
            color: "#dfffd0",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          }}
          data-testid="text-feeding-pet-name"
        >
          Feeding {pet.nickname ?? pet.name}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(15,25,12,0.75)",
            border: "1px solid rgba(180,255,160,0.4)",
            backdropFilter: "blur(6px)",
            color: "#dfffd0",
            fontFamily: "Lora, serif",
            fontWeight: 700,
            fontSize: 18,
            cursor: "pointer",
          }}
          data-testid="button-close-feeding"
          aria-label="Close feeding"
        >×</button>
      </div>

      {/* Floating glowing orbs around the pet — pure decoration */}
      {[
        { left: "22%", top: "30%", size: 18, hue: "rgba(190,255,140,0.85)", delay: "0s",   dur: "4.2s" },
        { left: "78%", top: "32%", size: 14, hue: "rgba(255,220,140,0.85)", delay: "0.6s", dur: "5.1s" },
        { left: "16%", top: "55%", size: 10, hue: "rgba(150,230,255,0.8)",  delay: "1.2s", dur: "4.6s" },
        { left: "84%", top: "58%", size: 22, hue: "rgba(220,180,255,0.8)",  delay: "0.3s", dur: "5.4s" },
        { left: "30%", top: "20%", size: 8,  hue: "rgba(255,200,180,0.75)", delay: "1.8s", dur: "3.9s" },
      ].map((o, i) => (
        <div
          key={i}
          className="absolute pointer-events-none feed-orb-float"
          style={{
            left: o.left, top: o.top,
            width: o.size, height: o.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${o.hue} 0%, ${o.hue.replace(/0?\.\d+/, "0.05")} 70%, transparent 100%)`,
            boxShadow: `0 0 ${o.size * 1.6}px ${o.hue}`,
            animationDelay: o.delay,
            animationDuration: o.dur,
          }}
        />
      ))}

      {/* Pet centerpiece — drop target + click target */}
      <div
        ref={petBoxRef}
        className="absolute"
        style={{
          left: "50%",
          top: "42%",
          transform: "translate(-50%, -50%)",
          width: 300,
          height: 300,
          cursor: "pointer",
          filter: petGlow
            ? "drop-shadow(0 0 32px rgba(190,255,160,1)) drop-shadow(0 0 14px rgba(255,220,120,0.85)) drop-shadow(0 6px 16px rgba(0,0,0,0.55))"
            : "drop-shadow(0 0 18px rgba(190,255,160,0.55)) drop-shadow(0 0 8px rgba(255,220,120,0.35)) drop-shadow(0 6px 16px rgba(0,0,0,0.55))",
          transition: "filter 0.3s ease",
        }}
        onClick={onPetClick}
        data-testid="drop-zone-feed-pet"
      >
        {/* Soft radial halo behind the pet */}
        <div
          className="absolute inset-0 pointer-events-none feed-halo-pulse"
          style={{
            background:
              "radial-gradient(circle, rgba(190,255,160,0.22) 0%, rgba(190,255,160,0.06) 45%, transparent 70%)",
          }}
        />
        <div className={petBounce ? "feed-pet-happy" : "pet-idle-squish"} style={{ width: "100%", height: "100%" }}>
          {pet.petTemplateId ? (
            <PetAnimator
              petTemplateId={pet.petTemplateId}
              mode="idle"
              size={300}
              fillContainer
              expression={petBounce ? "happy" : "neutral"}
            />
          ) : (pet.hatchedImageUrl || pet.imageUrl) ? (
            <img
              src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
              alt={pet.nickname ?? pet.name}
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
            />
          ) : null}
        </div>
      </div>

      {/* Hunger + Mood bars beneath the pet */}
      <PetStatusBars
        hungerVal={hungerVal}
        hungerMax={maxHunger}
        hungerPct={hungerPct}
        moodVal={moodVal}
      />

      {/* Floating heart layer — appears when the pet is clicked or fed */}
      {hearts.map((h) => (
        <div
          key={h.id}
          className="fixed pointer-events-none feed-heart-rise"
          style={{
            left: h.cx,
            top: h.cy,
            width: h.size,
            height: h.size,
            ["--dx" as any]: `${h.dx}px`,
            animationDelay: `${h.delay}s`,
            zIndex: 514,
            color: "#ff5d6c",
          }}
        >
          <svg viewBox="0 0 24 24" width={h.size} height={h.size}>
            <defs>
              <radialGradient id={`hg${h.id}`} cx="35%" cy="35%" r="70%">
                <stop offset="0%" stopColor="#ffb3bb" />
                <stop offset="55%" stopColor="#ff5d6c" />
                <stop offset="100%" stopColor="#a8112a" />
              </radialGradient>
            </defs>
            <path
              d="M12 21s-7.5-4.6-9.6-9.4C1.1 8.4 3 5 6.3 5c1.9 0 3.6 1 4.7 2.6C12.1 6 13.8 5 15.7 5 19 5 20.9 8.4 19.6 11.6 17.5 16.4 12 21 12 21z"
              fill={`url(#hg${h.id})`}
              stroke="#7a0a1c"
              strokeWidth="0.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ))}

      {/* Sparkle burst layer */}
      {sparkles.map((s) => (
        <div
          key={s.id}
          className="fixed pointer-events-none feed-sparkle"
          style={{
            left: s.cx,
            top: s.cy,
            width: s.size,
            height: s.size,
            // CSS variables consumed by the `feed-sparkle` keyframe.
            ["--dx" as any]: `${s.dx}px`,
            ["--dy" as any]: `${s.dy}px`,
            ["--rot" as any]: `${s.rot}deg`,
            zIndex: 515,
          }}
        >
          <svg viewBox="0 0 24 24" width={s.size} height={s.size}>
            <defs>
              <radialGradient id={`g${s.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fffbe0" stopOpacity="1" />
                <stop offset="60%" stopColor="#ffd966" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#c98a00" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path
              d="M12 2 L13.6 9.5 L21 11 L13.6 12.6 L12 22 L10.4 12.6 L3 11 L10.4 9.5 Z"
              fill={`url(#g${s.id})`}
            />
          </svg>
        </div>
      ))}

      {/* Floating feedback text */}
      {floatTexts.map((f) => (
        <div
          key={f.id}
          className="fixed pointer-events-none feed-float-up"
          style={{
            left: f.x,
            top: f.y,
            transform: "translate(-50%, -50%)",
            fontFamily: "Lora, serif",
            fontWeight: 800,
            fontSize: 22,
            color: "#c8ff90",
            textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 12px rgba(190,255,140,0.7)",
            zIndex: 510,
          }}
        >
          {f.text}
        </div>
      ))}

      {/* Bottom edible strip */}
      <div
        className="absolute bottom-0 left-0 right-0 px-3 pb-5 pt-3"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
          background: "linear-gradient(0deg, rgba(8,18,8,0.92) 0%, rgba(8,18,8,0.78) 60%, rgba(8,18,8,0) 100%)",
        }}
      >
        <div
          className="mb-2 px-1"
          style={{
            fontFamily: "Lora, serif",
            color: "#cfe9b4",
            fontSize: 11,
            letterSpacing: "0.18em",
            fontWeight: 700,
          }}
        >
          EDIBLES • {edibles.length}
        </div>
        {edibles.length === 0 ? (
          <div
            className="rounded-2xl px-4 py-5 text-center"
            style={{
              background: "rgba(20,30,18,0.55)",
              border: "1px dashed rgba(180,255,160,0.25)",
              fontFamily: "Lora, serif",
              color: "rgba(220,240,200,0.7)",
              fontSize: 12,
            }}
            data-testid="text-no-edibles"
          >
            You have no edibles yet. Find some in shops to feed your pets.
          </div>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto pb-2"
            style={{ touchAction: "pan-x" }}
          >
            {edibles.map((item) => (
              <div
                key={item.id}
                className="flex-shrink-0 rounded-2xl flex flex-col items-center justify-center relative"
                style={{
                  width: 92,
                  height: 108,
                  background: "linear-gradient(160deg, rgba(40,60,30,0.85) 0%, rgba(20,35,15,0.9) 100%)",
                  border: "1px solid rgba(180,255,160,0.35)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.5), inset 0 0 16px rgba(150,220,120,0.07)",
                  cursor: "grab",
                  touchAction: "none",
                }}
                onPointerDown={(e) => onItemPointerDown(e, item)}
                data-testid={`edible-item-${item.id}`}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    draggable={false}
                    style={{ width: 56, height: 56, objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
                  />
                ) : (
                  <div style={{ width: 56, height: 56, background: "rgba(255,255,255,0.05)", borderRadius: 12 }} />
                )}
                <div
                  className="mt-1 px-1 text-center"
                  style={{
                    fontFamily: "Lora, serif",
                    color: "#e6f5d0",
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    maxWidth: 86,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.name}
                </div>
                {item.quantity > 1 && (
                  <div
                    className="absolute"
                    style={{
                      top: 4, right: 4,
                      background: "rgba(60,90,40,0.95)",
                      border: "1px solid rgba(180,255,160,0.5)",
                      borderRadius: 10,
                      padding: "1px 6px",
                      fontFamily: "Lora, serif",
                      color: "#dfffd0",
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  >
                    ×{item.quantity}
                  </div>
                )}
                {item.statBoostAmount && (
                  <div
                    className="absolute"
                    style={{
                      bottom: -6, left: "50%", transform: "translateX(-50%)",
                      background: "rgba(120,200,90,0.95)",
                      borderRadius: 8,
                      padding: "1px 6px",
                      fontFamily: "Lora, serif",
                      color: "#0a1505",
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    +{item.statBoostAmount} Feed
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drag ghost */}
      {dragGhost && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: dragGhost.x - 36,
            top: dragGhost.y - 36,
            width: 72,
            height: 72,
            zIndex: 520,
            opacity: 0.92,
            filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.6)) drop-shadow(0 0 16px rgba(190,255,140,0.5))",
          }}
        >
          {dragGhost.imageUrl && (
            <img src={dragGhost.imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          )}
        </div>
      )}
    </div>
  );
}
