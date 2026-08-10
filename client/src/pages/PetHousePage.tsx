import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { MailOpen } from "lucide-react";
import { playClick, playGrab, playPlop } from "@/lib/sounds";
import { setNavHidden } from "@/lib/navVisibility";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { clientToStage, getDesignW, getStageScale, DESIGN_H } from "@/lib/stage";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import ErrorBoundary from "@/components/ErrorBoundary";
import homeInventoryIcon from "@assets/icon_home_inventory.png";
import decorInventoryIcon from "@assets/icon_decor_inventory.png";
import petInventoryIcon from "@assets/icon_pet_inventory.png";
import feedButtonIcon from "@assets/generated_images/feed_button_icon.png";
import feedingPageBg from "@assets/IMG_5734_1783098320823.jpeg";
import careWreathImg from "@assets/Photoroom_20260611_74428_AM_1781181905848.png";
import { QuillBadge } from "@/components/QuillBadge";
import moodFaceHappy from "@assets/mood_face_happy.png";
import moodFaceContent from "@assets/mood_face_content.png";
import moodFaceSad from "@assets/mood_face_sad.png";
import moodFaceHungry from "@assets/mood_face_hungry.png";
import LoadingScreen from "@/components/LoadingScreen";
import GiftClaimModal from "@/components/GiftClaimModal";
import { VisibleAssetImage } from "@/components/VisibleAssetImage";
import tutorialArrow from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";
import loyaltyRewardIcon from "@assets/Photoroom_20260703_72612_AM_1783081617614.png";
import petCareItemShelf from "@assets/ui/pet-care/item-shelf.png";
import hungerMeterFrame from "@assets/ui/pet-care/hunger-meter-frame.png";
import moodMeterFrame from "@assets/ui/pet-care/mood-meter-frame.png";
import loyaltyMeterFrame from "@assets/ui/pet-care/loyalty-meter-frame.png";
import {
  classifyPetCareItemGesture,
  createPetCareGestureController,
  PET_CARE_DROP_PADDING_PX,
  PET_CARE_DRAG_GHOST_SIZE_PX,
  PET_CARE_VISIBLE_SLOTS,
  getPetCareDragGhostTransform,
  pointInsideExpandedPetDropZone,
  type PetCareItemGestureIntent,
} from "@/lib/petCareInteractions";
import { buildPetCareInventoryStacks, orderPetCareItemsByEffect } from "@/lib/petCareInventory";
import { finitePetCareStat, parsePetCareInventory } from "@/lib/petCareData";
import { stabilityDiagnostic } from "@/lib/stabilityDiagnostics";
import { detectRuntimeMode } from "@/lib/runtimeMode";
import { clearPetCarePhase, getPetCareRuntimeDecisions, readRecoverablePetCarePhase, reportRecoveredPetCarePhase, sanitizePetCareRoute, writePetCarePhase, type PetCarePhase, type PetCarePhaseRecord } from "@/lib/petCareSafeMode";

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
// ── Care wreath popup ────────────────────────────────────────────────────────
// Replaces the old "Feed / Cancel / Return to Inventory" pet popup with a
// decorative wreath image. The buttons baked into the artwork are matched by
// invisible hotspots: the central fruit bowl triggers Care (was "Feed"), the
// left tablet is Cancel, the right tablet is Return-to-Inventory. Each tap
// fires a sparkle burst whose colour matches the button it came from.
type CareSparkle = { id: number; x: number; y: number; dx: number; dy: number; color: string; size: number; delay: number };
function CarePopup({
  petName, onCare, onCancel, onReturn, zIndex = 40,
}: {
  petName: string;
  onCare: () => void;
  onCancel: () => void;
  onReturn: () => void;
  zIndex?: number;
}) {
  const [sparks, setSparks] = useState<CareSparkle[]>([]);
  const idRef = useRef(0);
  const burst = useCallback((cx: number, cy: number, colors: string[], count = 16) => {
    const newOnes: CareSparkle[] = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 80;
      return {
        id: ++idRef.current,
        x: cx, y: cy,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 10,
        delay: Math.random() * 0.12,
      };
    });
    setSparks((s) => [...s, ...newOnes]);
    const ids = new Set(newOnes.map((n) => n.id));
    setTimeout(() => setSparks((s) => s.filter((x) => !ids.has(x.id))), 1100);
  }, []);
  const handle = (
    e: React.PointerEvent<HTMLButtonElement>,
    colors: string[],
    action: () => void,
  ) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, colors, 16);
    setTimeout(action, 280);
  };

  // Rainbow palette for the multicolored fruit bowl.
  const fruitColors = ["#ff5f6d", "#ffba08", "#3ed598", "#22d3ee", "#a78bfa", "#f472b6"];
  const cancelColors = ["#c5e0a0", "#9bc16a", "#6f9b3d"];      // mossy green tablet
  const returnColors = ["#e89261", "#c95d2c", "#9b3a14"];      // wood-brown tablet

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ zIndex, background: "transparent" }}
      onPointerDown={(e) => { e.stopPropagation(); onCancel(); }}
      data-testid="care-popup-backdrop"
    >
      {/* Pet name above the wreath */}
      <div
        style={{
          fontFamily: "Lora, serif",
          color: "#ffd700",
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 6,
          textShadow: "0 2px 8px rgba(0,0,0,0.85)",
          letterSpacing: "0.04em",
        }}
      >
        {petName}
      </div>

      {/* Wreath artwork with invisible hotspots */}
      <div
        className="relative"
        style={{
          width: "min(calc(86*var(--vw)), 440px)",
          aspectRatio: "1 / 1",
          backgroundImage: `url(${careWreathImg})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.85))",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Subtle dark-green glow tucked INSIDE the wreath ring — sits behind
            the menu artwork only, never spilling onto the pet/scene around
            it. Tight inset + low alpha keeps it as a hint, not a tint. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "22%",
            borderRadius: "50%",
            background: "radial-gradient(circle at center, rgba(20,55,30,0.32) 0%, rgba(15,40,22,0.18) 55%, rgba(0,0,0,0) 90%)",
            pointerEvents: "none",
            zIndex: -1,
            filter: "blur(3px)",
          }}
        />
        {/* Living forest orbs — confined to the wreath ring (28–72%) so they
            decorate the menu without scattering green dots over the scene. */}
        {[
          { left: "30%", top: "26%", size: 14, hue: "rgba(150,230,140,0.45)", delay: "0s",   dur: "5.4s" },
          { left: "68%", top: "30%", size: 10, hue: "rgba(110,200,120,0.4)",  delay: "0.8s", dur: "4.6s" },
          { left: "72%", top: "52%", size: 16, hue: "rgba(70,170,90,0.35)",   delay: "1.4s", dur: "6.1s" },
          { left: "30%", top: "55%", size: 12, hue: "rgba(190,255,170,0.45)", delay: "0.4s", dur: "5.0s" },
          { left: "44%", top: "30%", size: 8,  hue: "rgba(170,240,160,0.45)", delay: "1.1s", dur: "4.8s" },
          { left: "56%", top: "55%", size: 10, hue: "rgba(120,210,130,0.4)",  delay: "0.6s", dur: "5.3s" },
        ].map((o, i) => (
          <div
            key={`care-orb-${i}`}
            aria-hidden
            className="absolute pointer-events-none feed-orb-float"
            style={{
              left: o.left, top: o.top,
              width: o.size, height: o.size,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${o.hue} 0%, ${o.hue.replace(/0?\.\d+\)/, "0.05)")} 65%, transparent 100%)`,
              boxShadow: `0 0 ${o.size * 1.6}px ${o.hue}`,
              animationDelay: o.delay,
              animationDuration: o.dur,
              zIndex: -1,
            }}
          />
        ))}
        {/* Care hotspot — centered paw print */}
        <button
          data-testid="button-care-care"
          onPointerDown={(e) => handle(e, fruitColors, onCare)}
          aria-label="Care"
          className="absolute"
          style={{
            left: "29%", top: "31%", width: "42%", height: "40%",
            background: "transparent", border: "none", cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        />
        {/* Cancel hotspot — left orb (scroll) */}
        <button
          data-testid="button-care-cancel"
          onPointerDown={(e) => handle(e, cancelColors, onCancel)}
          aria-label="Cancel"
          className="absolute"
          style={{
            left: "0%", top: "36%", width: "22%", height: "22%",
            background: "transparent", border: "none", cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            borderRadius: "50%",
          }}
        />
        {/* Return-to-inventory hotspot — right orb (level-up arrows) */}
        <button
          data-testid="button-care-return"
          onPointerDown={(e) => handle(e, returnColors, onReturn)}
          aria-label="Return to Inventory"
          className="absolute"
          style={{
            left: "78%", top: "36%", width: "22%", height: "22%",
            background: "transparent", border: "none", cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            borderRadius: "50%",
          }}
        />
      </div>

      {/* Sparkle burst layer (rendered fixed over everything) */}
      {sparks.map((s) => (
        <div
          key={s.id}
          className="fixed pointer-events-none ring-sparkle"
          style={{
            left: s.x, top: s.y, width: s.size, height: s.size,
            color: s.color,
            ["--dx" as any]: `${s.dx}px`,
            ["--dy" as any]: `${s.dy}px`,
            animationDelay: `${s.delay}s`,
            zIndex: zIndex + 5,
          }}
        >
          <svg viewBox="0 0 24 24" width={s.size} height={s.size} style={{ filter: `drop-shadow(0 0 6px ${s.color})` }}>
            <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" fill={s.color} />
          </svg>
        </div>
      ))}
    </div>
  );
}

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
// Pet House presentation multipliers are deliberately local to this page so
// PetAnimator and pets everywhere else retain their existing dimensions.
export const PET_HOUSE_OUTDOOR_SCALE = 0.82;
export const PET_HOUSE_INTERIOR_SCALE = 1;
const RESPONSIVE_OUTDOOR_PET_SIZE = 110;
const OUTDOOR_PET_SIZE = Math.round(RESPONSIVE_OUTDOOR_PET_SIZE * PET_HOUSE_OUTDOOR_SCALE);

function randomGroundConfig(index: number) {
  const seed = index * 137.508;
  const pseudo = (n: number) => ((Math.sin(n) * 10000) % 1 + 1) % 1;
  const centerX = 20 + pseudo(seed) * 60;
  const centerY = 64 + pseudo(seed + 1) * 11;
  return { size: OUTDOOR_PET_SIZE, centerX, centerY };
}

// Indoor pets use a single fixed size for visual consistency.
const RESPONSIVE_INDOOR_PET_SIZE = 125;
const INDOOR_PET_SIZE = Math.round(RESPONSIVE_INDOOR_PET_SIZE * PET_HOUSE_INTERIOR_SCALE);
function indoorPetSize(_index: number): number {
  return INDOOR_PET_SIZE;
}

function HousePetRemovalControl({ left, top, petName, pending, onRemove }: {
  left: number;
  top: number;
  petName: string;
  pending: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      data-testid="house-pet-removal-control"
      className="absolute"
      style={{ left, top, zIndex: 50, transform: "translate(-50%, -100%)", paddingBottom: 8 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid="button-remove-pet-from-home"
        aria-label={`Remove ${petName} from Home`}
        disabled={pending}
        onClick={onRemove}
        style={{
          minWidth: 148, minHeight: 44, padding: "9px 14px", borderRadius: 12,
          background: "rgba(7, 28, 18, 0.94)",
          border: "1px solid rgba(222, 184, 76, 0.72)",
          boxShadow: "0 5px 18px rgba(0,0,0,0.55)", backdropFilter: "blur(7px)",
          color: pending ? "rgba(247,224,157,0.55)" : "#f7e09d",
          fontFamily: "Lora, serif", fontSize: 12, fontWeight: 700,
          letterSpacing: "0.025em", cursor: pending ? "wait" : "pointer",
        }}
      >
        {pending ? "Removing…" : "Remove from Home"}
      </button>
    </div>
  );
}

// ── Interior Viewer ──────────────────────────────────────────────────────────
// Shown as a full-screen overlay when a building is tapped.
// MEMORY SAFETY: the background image is NOT rendered while this is open,
// so only this one large image occupies GPU memory at a time.
function InteriorViewer({
  url, placedItems, placedPets, panStateRef,
  leaveButtonX = 0.92, leaveButtonY = 0.06,
  onUpdateItem, onRemoveItem, onMovePet, onRemovePet, removingPetId, onClose,
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
  onRemovePet: (inventoryId: string) => Promise<void>;
  removingPetId: string | null;
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
      style={{ zIndex: 60, background: "#000", overflow: "hidden", touchAction: "none" }}
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
              if (!drag) setPopupPet(current => current?.inventoryId === pet.inventoryId ? null : pet);
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

      {/* Owner-only Pet House action; this intentionally bypasses normal pet UI. */}
      {popupPet && (
        <HousePetRemovalControl
          left={Math.max(82, Math.min((containerRef.current?.clientWidth ?? 390) - 82, panX + (parsePetPct(popupPet.posLeft) ?? 0.5) * imgWidth))}
          top={Math.max(58, (parsePetPct(popupPet.posTop) ?? 0.5) * containerH - INDOOR_PET_SIZE / 2)}
          petName={popupPet.nickname ?? popupPet.name}
          pending={removingPetId === popupPet.inventoryId}
          onRemove={async () => {
            if (removingPetId) return;
            try {
              await onRemovePet(popupPet.inventoryId);
              setPopupPet(null);
            } catch {
              // The page mutation shows the standard destructive toast. Keep
              // this selection open so the owner can retry.
            }
          }}
        />
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
  const [openInterior, setOpenInterior] = useState<{ url: string; buildingId: string; leaveButtonX: number; leaveButtonY: number } | null>(null);
  const interiorPanRef = useRef<{ panX: number; imgWidth: number; containerH: number } | null>(null);
  const [openInventory, setOpenInventory] = useState<"home" | "decor" | "pets" | null>(null);
  // Hide the global FloatingNav while an inventory drawer is open so its
  // fan-out arc doesn't collide with the Pets/Home/Decor/Friends bar.
  useEffect(() => {
    setNavHidden(!!openInventory);
    return () => setNavHidden(false);
  }, [openInventory]);
  const [pendingActivate, setPendingActivate] = useState<{ bundleId: string; bundle: OwnedBundle["bundle"] } | null>(null);
  const [openGiftModal, setOpenGiftModal] = useState(false);
  const [showNoMailPopup, setShowNoMailPopup] = useState(false);
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
  // React Query's isPending flag updates on the next render. Keep a synchronous
  // lock as well so two taps in the same frame can never submit two removals.
  const removingPetRef = useRef<string | null>(null);
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

  // (Care/Feed used to open here as an in-page overlay via `?feed=<id>`. It
  // now lives at its own real route `/pet-care/:inventoryId` — see HomePage's
  // Care/Feed action and the outdoor/interior pet-tap handlers below.)
  useEffect(() => {
    if (!pets.length) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("feed")) return;
    params.delete("feed");
    const next = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", next);
  }, [pets]);

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
    onSuccess: (_data, inventoryId) => {
      setOutdoorPopupPet(current => current?.inventoryId === inventoryId ? null : current);
      qc.invalidateQueries({ queryKey: ["/api/users", user.id, "pets"] });
    },
    onError: () => toast({ title: "Error", description: "Could not remove this pet from your home.", variant: "destructive" }),
  });

  const removePetFromHome = useCallback(async (inventoryId: string): Promise<void> => {
    if (removingPetRef.current) return;
    removingPetRef.current = inventoryId;
    try {
      await removePetFromSceneMutation.mutateAsync(inventoryId);
    } finally {
      removingPetRef.current = null;
    }
  }, [removePetFromSceneMutation]);

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
    if (outdoorPopupPet) setOutdoorPopupPet(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX, selectedPlacedId, outdoorPopupPet]);

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
      // In the owner's Pet House a tap selects only the placement-removal
      // action; it never enters the normal pet menu or care route.
      const pet = pets.find(p => p.inventoryId === drag.inventoryId);
      if (pet) setOutdoorPopupPet(current => current?.inventoryId === pet.inventoryId ? null : pet);
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
            {/* The quill badge */}
            <QuillBadge size={18} glow="#4ade80" animate />
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

      {/* Owner-only placement action, clamped inside the scene on small screens. */}
      {outdoorPopupPet && (
        <HousePetRemovalControl
          left={Math.max(82, Math.min((containerRef.current?.clientWidth ?? 390) - 82, panX + (parsePetPct(outdoorPopupPet.posLeft) ?? 0.5) * imgWidth))}
          top={Math.max(58, (parsePetPct(outdoorPopupPet.posTop) ?? 0.5) * containerH - OUTDOOR_PET_SIZE / 2)}
          petName={outdoorPopupPet.nickname ?? outdoorPopupPet.name}
          pending={removePetFromSceneMutation.isPending && removePetFromSceneMutation.variables === outdoorPopupPet.inventoryId}
          onRemove={() => { void removePetFromHome(outdoorPopupPet.inventoryId).catch(() => undefined); }}
        />
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
              maxHeight: openInventory === "pets" ? 160 : "calc(70*var(--vh))",
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
                  src={openInventory === "home" ? homeInventoryIcon : decorInventoryIcon}
                  alt=""
                  className="w-10 h-10 object-contain"
                />
                <div>
                  <h2 className="text-white font-bold text-lg leading-tight">
                    {openInventory === "home" ? "Home Inventory" : "Decor Inventory"}
                  </h2>
                  <p className="text-white/50 text-xs">
                    {openInventory === "home" ? "House bundles you own" : "Home decorations you own"}
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
            onRemovePet={removePetFromHome}
            removingPetId={removePetFromSceneMutation.isPending ? (removePetFromSceneMutation.variables ?? null) : null}
            onClose={() => { setOpenInterior(null); interiorPanRef.current = null; }}
          />
        </ErrorBoundary>
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


    </div>
  );
}
