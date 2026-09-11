import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { EVOLUTION_SLOT_COUNT, applyEvolutionPoints, evolutionTargetForRarity } from "@shared/evolution";
import socketActive from "@assets/ui/power-up/evolution-icon-unlocked.png";
import socketLocked from "@assets/ui/power-up/evolution-icon-locked.png";
import popupMain from "@assets/ui/power-up/evolution-popup/main.png";
import popupClose from "@assets/ui/power-up/evolution-popup/close-icon.png";
import popupDecor from "@assets/ui/power-up/evolution-popup/decor-icon.png";
import popupPetCard from "@assets/ui/power-up/evolution-popup/pet-card.png";
import popupSelected from "@assets/ui/power-up/evolution-popup/selected-icon.png";
import popupPointsBar from "@assets/ui/power-up/evolution-popup/points-bar.png";
import popupSelecting from "@assets/ui/power-up/evolution-popup/selecting-icon.png";

interface EvolutionFeederPet {
  inventoryId: string;
  name: string;
  rarity: number;
  imageUrl: string | null;
  evolutionPoints: number;
}

interface EvolutionState {
  target: { inventoryId: string; name: string; rarity: number; imageUrl: string | null };
  slotCount: number;
  completedSlots: number;
  currentPoints: number;
  claimedSlots: number[];
  nodeCoinReward: number;
  nodeStatReward: number;
  pointsRequired: number;
  percent: number;
  isComplete: boolean;
  feeders: EvolutionFeederPet[];
  blockedPetCount: number;
}

interface Props {
  enabled: boolean;
  fallbackRarity: number;
}

// Progression begins at the bottom-left socket and travels clockwise.
const POSITIONS = [
  { x: 35, y: 63 },
  { x: 20, y: 37 },
  { x: 35, y: 11 },
  { x: 65, y: 11 },
  { x: 80, y: 37 },
  { x: 65, y: 63 },
] as const;

const CONNECTOR_PATHS = [
  "M35 63 Q22 57 20 37",
  "M20 37 Q22 17 35 11",
  "M35 11 Q50 3 65 11",
  "M65 11 Q78 17 80 37",
  "M80 37 Q78 57 65 63",
] as const;

const CSS = String.raw`
.pupevo-picker-head{align-items:center}
.pupevo-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.pupevo-orbit{position:absolute;inset:0;z-index:8;pointer-events:none}.pupevo-slot{position:absolute;left:var(--x);top:var(--y);width:clamp(52px,14vw,78px);height:clamp(52px,14vw,78px);transform:translate(-50%,-50%);padding:0;border:0;background:transparent;filter:drop-shadow(0 0 5px rgba(65,236,151,.28));pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}.pupevo-slot.current{filter:drop-shadow(0 0 10px rgba(83,255,177,.96)) drop-shadow(0 0 24px rgba(38,219,136,.56)) brightness(1.08)}.pupevo-slot.complete{filter:drop-shadow(0 0 9px rgba(45,247,151,.48))}.pupevo-slot.claimable{animation:pupevoRewardGlow 1.7s ease-in-out infinite}.pupevo-slot.claimed{filter:drop-shadow(0 0 7px rgba(45,247,151,.32))}.pupevo-slot.evolution-ready{animation:pupevoEvolutionReady 1.45s ease-in-out infinite}.pupevo-slot.locked{opacity:.98}.pupevo-slot>img,.pupevo-fill img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;image-rendering:auto}.pupevo-base{filter:grayscale(1) brightness(.5);opacity:.86}.pupevo-locked-base{filter:none;opacity:1}.pupevo-fill{position:absolute;inset:0;overflow:hidden;filter:drop-shadow(0 0 7px rgba(77,255,173,.56));pointer-events:none}.pupevo-fill img{filter:saturate(1.08) brightness(1.04)}.pupevo-status{position:absolute;left:50%;bottom:8%;transform:translateX(-50%);max-width:68%;padding:3px 9px;border:1px solid #387b60;border-radius:999px;background:#04130fd4;color:#a5ddc0;text-align:center;font:700 9px/1.2 system-ui,sans-serif;pointer-events:none}.pupevo-status.error{color:#ffc0b4;border-color:#98564d;background:#1d0908e6}.pupage-enhance-art{clip-path:inset(9% 0 20% 0);filter:none!important;backface-visibility:hidden}.pupage-inventory-art{clip-path:inset(16% 0 19% 0);filter:none!important;backface-visibility:hidden}.pupage-inventory-hint{display:none!important}
.pupevo-picker-backdrop{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:max(env(safe-area-inset-top),8px) 8px max(env(safe-area-inset-bottom),8px);box-sizing:border-box;background:rgba(0,5,5,.82);backdrop-filter:blur(5px);overscroll-behavior:none;touch-action:none}.pupevo-picker{position:relative;width:min(calc(100vw - 16px),58.66dvh,500px);aspect-ratio:2/3;max-height:88dvh;overflow:visible;border:0;background:transparent;color:#eafff3;filter:drop-shadow(0 18px 34px #000d);touch-action:none}.pupevo-picker-art{position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:contain;pointer-events:none}.pupevo-picker-head{position:absolute;left:14%;right:14%;top:11%;height:12%;z-index:2;display:grid;align-content:center;text-align:center;pointer-events:none}.pupevo-picker-head h3{margin:0;color:#d9ffe9;font:700 clamp(15px,4.3vw,22px)/1.05 Georgia,serif;letter-spacing:.025em;text-shadow:0 2px 5px #000,0 0 10px rgba(80,255,169,.3)}.pupevo-picker-head p{margin:4px 0 0;color:#a9d9c0;font:700 clamp(8px,2.4vw,11px)/1.15 system-ui,sans-serif;text-shadow:0 1px 3px #000}.pupevo-picker-close{position:absolute;right:1.5%;top:2.8%;z-index:6;width:12%;aspect-ratio:1;border:0;padding:0;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}.pupevo-picker-close img,.pupevo-picker-decor{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}.pupevo-picker-close:focus-visible{outline:2px solid #a7ffd1;outline-offset:-5px;border-radius:50%}.pupevo-picker-close:active{transform:scale(.95)}.pupevo-picker-decor{position:absolute;left:4.5%;top:9.8%;z-index:2;width:10%;height:auto;filter:drop-shadow(0 0 6px rgba(67,245,157,.46))}.pupevo-feeders{position:absolute;left:10%;right:10%;top:25%;bottom:31%;z-index:2;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:clamp(4px,1.2vw,8px);padding:1.5% 2% 3%;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#36b97a transparent;-webkit-overflow-scrolling:touch;touch-action:pan-y}.pupevo-feeders::-webkit-scrollbar{width:4px}.pupevo-feeders::-webkit-scrollbar-thumb{border-radius:999px;background:#36b97a}.pupevo-feeder{position:relative;flex:0 0 auto;width:100%;aspect-ratio:3/1;min-height:0;border:0;padding:0;background:transparent;color:#eafff3;text-align:left;cursor:pointer;touch-action:pan-y;-webkit-tap-highlight-color:transparent}.pupevo-feeder-card{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}.pupevo-feeder-pet{position:absolute;left:4.5%;top:12%;z-index:1;width:24%;height:76%;object-fit:contain;filter:drop-shadow(0 3px 4px #000a);pointer-events:none}.pupevo-feeder-info{position:absolute;left:31%;right:19%;top:22%;z-index:2;min-width:0}.pupevo-feeder-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#eafff3;font:700 clamp(10px,3vw,14px)/1.15 Georgia,serif;text-shadow:0 2px 3px #000}.pupevo-feeder-stars{display:block;margin-top:2px;overflow:hidden;white-space:nowrap;color:#f3c653;font:800 clamp(9px,2.8vw,13px)/1 system-ui,sans-serif;letter-spacing:.04em;text-shadow:0 1px 3px #000,0 0 5px rgba(255,201,72,.34)}.pupevo-feeder-points{display:block;margin-top:3px;color:#8bf4bb;font:800 clamp(8px,2.5vw,12px)/1 system-ui,sans-serif;text-shadow:0 1px 3px #000}.pupevo-selecting{position:absolute;right:3%;top:50%;z-index:3;width:14%;height:auto;transform:translateY(-50%);object-fit:contain;pointer-events:none;transition:filter .18s,transform .18s}.pupevo-checkmark{position:absolute;right:6.5%;top:50%;z-index:4;transform:translate(50%,-52%);color:transparent;font:900 clamp(12px,4vw,20px)/1 system-ui,sans-serif;pointer-events:none}.pupevo-feeder.selected .pupevo-selecting{transform:translateY(-50%) scale(1.08);filter:brightness(1.35) saturate(1.35) drop-shadow(0 0 4px #72ffb7) drop-shadow(0 0 11px rgba(49,242,148,.95))}.pupevo-feeder.selected .pupevo-checkmark{color:#d8ffea;text-shadow:0 0 5px #42f39b,0 1px 2px #00130d}.pupevo-feeder:focus-visible{outline:2px solid #7effbd;outline-offset:-4px;border-radius:10px}.pupevo-error{position:absolute;left:13%;right:13%;top:23%;z-index:5;padding:4px 8px;border-radius:8px;background:#2a0909e8;color:#ffc0b4;text-align:center;font:700 9px/1.25 system-ui,sans-serif}.pupevo-empty{margin:auto;padding:18px 10px;text-align:center;color:#aed8c3;font:600 11px/1.4 system-ui,sans-serif}.pupevo-points{position:absolute;left:12%;right:12%;bottom:15.5%;z-index:3;aspect-ratio:3/1;display:grid;place-items:center;pointer-events:none}.pupevo-points-art{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.pupevo-total{position:relative;z-index:1;display:grid;gap:2px;width:74%;text-align:center;text-shadow:0 2px 4px #000}.pupevo-total strong{color:#d8ffea;font:800 clamp(10px,3vw,14px)/1.1 system-ui,sans-serif}.pupevo-total span{color:#8de9b7;font:700 clamp(7px,2.1vw,10px)/1.1 system-ui,sans-serif}.pupevo-warning{position:absolute;left:14%;right:14%;bottom:13.4%;z-index:3;margin:0;color:#e4baa9;text-align:center;font:700 clamp(6px,1.8vw,8px)/1.15 system-ui,sans-serif;text-shadow:0 1px 2px #000}.pupevo-feed{position:absolute;left:13%;right:13%;bottom:5.2%;z-index:4;height:8.5%;border:0;padding:0 7% 0 17%;display:grid;place-items:center;background:transparent;color:#eafff3;font:800 clamp(10px,3.2vw,15px)/1 system-ui,sans-serif;letter-spacing:.025em;text-shadow:0 2px 3px #000;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}.pupevo-feed-icon{position:absolute;left:2%;top:50%;width:15%;height:auto;transform:translateY(-50%);object-fit:contain;pointer-events:none;filter:drop-shadow(0 0 5px rgba(71,242,157,.48))}.pupevo-feed:disabled{opacity:.42;cursor:default}.pupevo-feed:not(:disabled):active{transform:scale(.98)}.pupevo-feed:focus-visible{outline:2px solid #9cffca;outline-offset:-5px;border-radius:999px}.pupevo-node-message{position:fixed;left:50%;top:50%;z-index:100100;width:min(calc(100vw - 32px),420px);transform:translate(-50%,-50%);padding:12px 22px;border:1px solid #68d69c;border-radius:22px;background:rgba(4,25,19,.96);color:#e9fff2;text-align:center;box-shadow:0 8px 30px #000b,0 0 16px rgba(76,255,170,.22);font:800 16px/1.25 system-ui,sans-serif;letter-spacing:.025em;pointer-events:none}
@keyframes pupevoRewardGlow{0%,100%{filter:drop-shadow(0 0 5px rgba(60,255,157,.42)) drop-shadow(0 0 10px rgba(36,214,127,.2))}50%{filter:drop-shadow(0 0 12px rgba(91,255,177,1)) drop-shadow(0 0 26px rgba(39,239,145,.72)) brightness(1.16)}}@keyframes pupevoEvolutionReady{0%,100%{transform:translate(-50%,-50%) scale(1);filter:sepia(.32) saturate(1.3) drop-shadow(0 0 8px rgba(255,205,74,.65))}50%{transform:translate(-50%,-50%) scale(1.07);filter:sepia(.58) saturate(1.75) brightness(1.18) drop-shadow(0 0 17px rgba(255,218,91,1)) drop-shadow(0 0 32px rgba(255,178,36,.65))}}@media(prefers-reduced-motion:reduce){.pupevo-slot.claimable,.pupevo-slot.evolution-ready{animation:none}}@media(max-width:430px){.pupevo-slot{width:55px;height:55px}.pupevo-picker{width:min(calc(100vw - 12px),58.66dvh)}.pupevo-picker-backdrop{padding:max(env(safe-area-inset-top),6px) 6px max(env(safe-area-inset-bottom),6px)}}
`;

const REFINEMENT_CSS = String.raw`
.pupevo-links{position:absolute;inset:0;z-index:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.pupevo-link-shadow,.pupevo-link-glow{fill:none;stroke-linecap:round;stroke-linejoin:round}
.pupevo-link-shadow{stroke:#031b13;stroke-width:2.2}
.pupevo-link-glow{stroke:#52f5a1;stroke-width:.75;filter:drop-shadow(0 0 2px #8affc2) drop-shadow(0 0 5px rgba(50,239,146,.88));animation:pupevoLinkGlow 1.8s ease-in-out infinite}
.pupevo-picker-wrap{width:min(calc(100vw - 16px),58.66dvh,500px);display:grid;justify-items:center}
.pupevo-picker-wrap .pupevo-picker{width:100%}
.pupevo-picker-progress{position:relative;width:76%;height:5px;margin:4px auto 0;overflow:hidden;border:1px solid rgba(91,211,151,.78);border-radius:999px;background:#03140e;box-shadow:inset 0 1px 3px #000b}
.pupevo-picker-progress i{position:absolute;top:0;display:block;height:100%;transition:width .25s ease,left .25s ease}
.pupevo-picker-progress-current{left:0;z-index:2;border-radius:999px;background:linear-gradient(90deg,#14864f,#43e697,#b0ffcf);box-shadow:0 0 7px rgba(75,255,170,.72)}
.pupevo-picker-progress-preview{z-index:1;border-radius:0 999px 999px 0;background:linear-gradient(90deg,rgba(176,255,207,.55),rgba(232,255,241,.92));box-shadow:0 0 8px rgba(176,255,207,.62);animation:pupevoPreviewPulse 1.25s ease-in-out infinite}
.pupevo-picker-head p{margin-top:3px}
.pupevo-feeders{gap:0}
.pupevo-feeder+.pupevo-feeder{margin-top:-6%}
.pupevo-feeder-pet{left:5.5%;top:8%;width:22%;height:70%}
.pupevo-feeder-info{top:28%}
.pupevo-feeder.selected::after{content:"";position:absolute;right:5.2%;top:50%;z-index:3;width:9.5%;aspect-ratio:1;transform:translateY(-50%);clip-path:polygon(50% 8%,92% 50%,50% 92%,8% 50%);background:linear-gradient(135deg,#087743,#25d87d);border:1px solid #82ffc0;filter:drop-shadow(0 0 5px rgba(39,238,142,.9));pointer-events:none}
.pupevo-selecting{z-index:4}
.pupevo-feed{left:8%;right:18%;bottom:9.5%;display:flex;align-items:center;justify-content:center;gap:4px;padding:0}
.pupevo-feed-icon{position:static;width:9%;transform:none}
.pupevo-warning{left:6%;right:6%;bottom:-3.5%;width:auto;margin:0;color:#e8c5b7;font-size:clamp(8px,2.1vw,11px);line-height:1.25}
.pupevo-node-message.local{position:absolute;left:50%;top:50%;z-index:8;width:max-content;max-width:88px;transform:translate(-50%,-50%);padding:4px 7px;border-radius:999px;font-size:8px;line-height:1.1;letter-spacing:0;box-shadow:0 3px 10px #000a,0 0 8px rgba(76,255,170,.22)}
@keyframes pupevoLinkGlow{0%,100%{opacity:.7}50%{opacity:1;stroke-width:1}}
@keyframes pupevoPreviewPulse{0%,100%{opacity:.62}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.pupevo-link-glow,.pupevo-picker-progress-preview{animation:none}}
`;

function randomActionId() {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  browserCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function PowerUpEvolutionPanel({ enabled, fallbackRarity }: Props) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<EvolutionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nodeMessage, setNodeMessage] = useState<{ message: string; slot?: number } | null>(null);
  const [claimingSlot, setClaimingSlot] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [feeding, setFeeding] = useState(false);
  const nodeMessageTimer = useRef<number | null>(null);
  const pickerCloseRef = useRef<HTMLButtonElement>(null);
  const pickerPositionRef = useRef({ pageTop: 0, windowX: 0, windowY: 0 });

  const closePicker = useCallback(() => {
    const position = pickerPositionRef.current;
    setPickerOpen(false);
    window.requestAnimationFrame(() => {
      const pageScroll = document.querySelector<HTMLElement>(".pupage-scroll");
      if (pageScroll) pageScroll.scrollTop = position.pageTop;
      window.scrollTo(position.windowX, position.windowY);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pet-evolution/active", { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Could not load evolution progress.");
      setState(body as EvolutionState);
    } catch (err: any) {
      setError(err?.message || "Could not load evolution progress.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!pickerOpen) setSelected(new Set()); }, [pickerOpen]);
  useEffect(() => () => { if (nodeMessageTimer.current !== null) window.clearTimeout(nodeMessageTimer.current); }, []);
  useEffect(() => {
    if (!pickerOpen || typeof document === "undefined") return;
    const pageScroll = document.querySelector<HTMLElement>(".pupage-scroll");
    const root = document.documentElement;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    const previousPageOverflow = pageScroll?.style.overflowY ?? "";
    const pageTop = pageScroll?.scrollTop ?? 0;
    pickerPositionRef.current = { pageTop, windowX: window.scrollX, windowY: window.scrollY };
    document.body.style.overflow = "hidden";
    root.style.overflow = "hidden";
    if (pageScroll) pageScroll.style.overflowY = "hidden";
    window.requestAnimationFrame(() => pickerCloseRef.current?.focus({ preventScroll: true }));
    const keepPageStill = () => { if (pageScroll && pageScroll.scrollTop !== pageTop) pageScroll.scrollTop = pageTop; };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closePicker(); };
    pageScroll?.addEventListener("scroll", keepPageStill, { passive: true });
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      pageScroll?.removeEventListener("scroll", keepPageStill);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
      if (pageScroll) pageScroll.style.overflowY = previousPageOverflow;
      if (pageScroll) pageScroll.scrollTop = pageTop;
    };
  }, [pickerOpen, closePicker]);

  const pointsRequired = state?.pointsRequired ?? evolutionTargetForRarity(fallbackRarity);
  const completedSlots = state?.completedSlots ?? 0;
  const currentPoints = state?.currentPoints ?? 0;
  const currentPercent = state?.isComplete ? 100 : state?.percent ?? 0;
  const slotCount = Math.max(1, Math.min(EVOLUTION_SLOT_COUNT, state?.slotCount ?? EVOLUTION_SLOT_COUNT));
  const claimedSlots = new Set(state?.claimedSlots ?? []);
  const selectedPets = useMemo(() => (state?.feeders ?? []).filter((pet) => selected.has(pet.inventoryId)), [state?.feeders, selected]);
  const selectedPoints = selectedPets.reduce((sum, pet) => sum + pet.evolutionPoints, 0);
  const projectedProgress = useMemo(
    () => applyEvolutionPoints(completedSlots, currentPoints, selectedPoints, state?.target.rarity ?? fallbackRarity),
    [completedSlots, currentPoints, fallbackRarity, selectedPoints, state?.target.rarity],
  );
  const projectedNodes = Math.max(0, projectedProgress.completedSlots - completedSlots);
  const previewPercent = !selectedPoints
    ? currentPercent
    : projectedNodes > 0
      ? 100
      : projectedProgress.percent;
  const previewAddedPercent = Math.max(0, previewPercent - currentPercent);
  const projectedSummary = !selectedPoints
    ? ""
    : projectedProgress.isComplete
      ? "Completes the evolution track"
      : projectedNodes > 0
        ? `${projectedNodes} node${projectedNodes === 1 ? "" : "s"} completed · ${projectedProgress.currentPoints.toLocaleString()} pts carry forward`
        : `${Math.max(0, pointsRequired - projectedProgress.currentPoints).toLocaleString()} pts still needed`;

  const showNodeMessage = useCallback((message: string, slot?: number) => {
    if (nodeMessageTimer.current !== null) window.clearTimeout(nodeMessageTimer.current);
    setNodeMessage({ message, slot });
    nodeMessageTimer.current = window.setTimeout(() => {
      setNodeMessage(null);
      nodeMessageTimer.current = null;
    }, 2200);
  }, []);

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const feed = async () => {
    if (!selectedPets.length || feeding) return;
    setFeeding(true);
    setError("");
    try {
      const response = await fetch("/api/pet-evolution/active/feed", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feederPetIds: selectedPets.map((pet) => pet.inventoryId), actionId: randomActionId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Evolution failed safely.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }),
        refresh(),
      ]);
      setPickerOpen(false);
      setSelected(new Set());
    } catch (err: any) {
      setError(err?.message || "Evolution failed safely.");
    } finally {
      setFeeding(false);
    }
  };


  const claimReward = useCallback(async (slot: number) => {
    if (claimingSlot !== null) return;
    setClaimingSlot(slot);
    setError("");
    try {
      const response = await fetch("/api/pet-evolution/active/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "The evolution reward could not be collected.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }),
        refresh(),
      ]);
      showNodeMessage(`Reward Collected! +${body.coinReward ?? 100} Coins · +${body.statBoost ?? state?.nodeStatReward ?? 0} All Stats`);
    } catch (err: any) {
      const message = err?.message || "The evolution reward could not be collected.";
      setError(message);
      showNodeMessage(message);
    } finally {
      setClaimingSlot(null);
    }
  }, [claimingSlot, queryClient, refresh, showNodeMessage, state?.nodeStatReward]);

  if (!enabled) return null;

  const picker = pickerOpen && typeof document !== "undefined" ? createPortal(
    <div className="pupevo-picker-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
      <div className="pupevo-picker-wrap" onPointerDown={(event) => event.stopPropagation()}>
      <div className="pupevo-picker" role="dialog" aria-modal="true" aria-label="Choose evolution feeder pets" aria-describedby="pupevo-consumption-warning" onPointerDown={(event) => event.stopPropagation()}>
        <img className="pupevo-picker-art" src={popupMain} alt="" />
        <img className="pupevo-picker-decor" src={popupDecor} alt="" />
        <button ref={pickerCloseRef} className="pupevo-picker-close" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); closePicker(); }} aria-label="Close evolution pet picker"><img src={popupClose} alt="" /></button>
        <div className="pupevo-picker-head">
          <h3>Evolution Offering</h3>
          <div
            className="pupevo-picker-progress"
            role="progressbar"
            aria-label="Evolution node progress with selected feeder preview"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(previewPercent)}
            aria-valuetext={selectedPoints ? `${currentPoints.toLocaleString()} current points plus ${selectedPoints.toLocaleString()} selected feeder points` : `${currentPoints.toLocaleString()} of ${pointsRequired.toLocaleString()} points`}
          >
            <i className="pupevo-picker-progress-current" style={{ width: `${currentPercent}%` }} />
            {selectedPoints > 0 && previewAddedPercent > 0 ? <i className="pupevo-picker-progress-preview" style={{ left: `${currentPercent}%`, width: `${previewAddedPercent}%` }} /> : null}
          </div>
          <p>
            {currentPoints.toLocaleString()} / {pointsRequired.toLocaleString()} pts
            {selectedPoints > 0 ? <> · +{selectedPoints.toLocaleString()} selected</> : <> in the current node</>}
          </p>
        </div>
        {error && <div className="pupevo-error">{error}</div>}
        <div className="pupevo-feeders" aria-label="Eligible feeder pets">
          {(state?.feeders ?? []).length ? state!.feeders.map((pet) => {
            const checked = selected.has(pet.inventoryId);
            const stars = Math.max(1, Math.min(5, pet.rarity));
            return <button key={pet.inventoryId} type="button" className={`pupevo-feeder ${checked ? "selected" : ""}`} aria-pressed={checked} onClick={() => toggle(pet.inventoryId)} data-testid={`button-evolution-feeder-${pet.inventoryId}`}>
              <img className="pupevo-feeder-card" src={popupPetCard} alt="" />
              {pet.imageUrl ? <img className="pupevo-feeder-pet" src={pet.imageUrl} alt="" /> : null}
              <span className="pupevo-feeder-info">
                <span className="pupevo-feeder-name">{pet.name}</span>
                <span className="pupevo-feeder-stars" aria-label={`${stars} star pet`}>{"★".repeat(stars)}</span>
                <span className="pupevo-feeder-points">{pet.evolutionPoints.toLocaleString()} pts</span>
              </span>
              <img className="pupevo-selecting" src={popupSelecting} alt="" />
            </button>;
          }) : <div className="pupevo-empty">No eligible feeder pets are available. Pets in the market, house, PvP teams, with accessories, eggs, and protected cave pets are excluded.</div>}
        </div>
        <div className="pupevo-points" aria-live="polite">
          <img className="pupevo-points-art" src={popupPointsBar} alt="" />
          <div className="pupevo-total"><strong>{selectedPoints.toLocaleString()} pts selected</strong>{projectedSummary ? <span>{projectedSummary}</span> : null}</div>
        </div>
        <button className="pupevo-feed" type="button" disabled={!selectedPets.length || feeding} onClick={feed}>
          <img className="pupevo-feed-icon" src={popupSelected} alt="" />
          <span>{feeding ? "Infusing…" : selectedPets.length ? "Confirm" : "Select feeder pets"}</span>
        </button>
        <p id="pupevo-consumption-warning" className="pupevo-warning">Pets used for evolution are permanently consumed.</p>
      </div>
      </div>
    </div>,
    document.body,
  ) : null;

  const nodeToast = nodeMessage && nodeMessage.slot === undefined && typeof document !== "undefined"
    ? createPortal(<div className="pupevo-node-message" role="status" aria-live="polite">{nodeMessage.message}</div>, document.body)
    : null;

  return <>
    <style>{CSS}{REFINEMENT_CSS}</style>
    <section className="pupevo-orbit" data-testid="section-pet-evolution" aria-label="Pet evolution progress">
      <svg className="pupevo-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {CONNECTOR_PATHS.map((path, index) => index < completedSlots ? <g key={path}>
          <path className="pupevo-link-shadow" d={path} />
          <path className="pupevo-link-glow" d={path} />
        </g> : null)}
      </svg>
      {Array.from({ length: slotCount }, (_, index) => {
        const slot = index + 1;
        const complete = index < completedSlots;
        const current = !state?.isComplete && index === completedSlots;
        const locked = !complete && !current;
        const claimed = complete && claimedSlots.has(slot);
        const evolutionReady = complete && slot === EVOLUTION_SLOT_COUNT;
        const claimable = complete && !claimed && !evolutionReady;
        const fill = complete ? 100 : current ? currentPercent : 0;
        const position = POSITIONS[index] ?? POSITIONS[POSITIONS.length - 1];
        const style = { "--x": `${position.x}%`, "--y": `${position.y}%` } as React.CSSProperties;
        const rewardLabel = `100 coins and ${state?.nodeStatReward ?? 0} to ATK, DEF, and Health`;
        return <button
          key={index}
          type="button"
          className={`pupevo-slot ${complete ? "complete" : ""} ${current ? "current" : ""} ${locked ? "locked" : ""} ${claimable ? "claimable" : ""} ${claimed ? "claimed" : ""} ${evolutionReady ? "evolution-ready" : ""}`}
          style={style}
          onClick={() => {
            if (claimable) void claimReward(slot);
            else if (evolutionReady) showNodeMessage("Evolution Coming Soon");
            else if (current) setPickerOpen(true);
            else if (complete) showNodeMessage("Completed", slot);
            else showNodeMessage("Locked");
          }}
          aria-busy={claimingSlot === slot}
          aria-label={claimable ? `Evolution slot ${slot} reward ready. Tap to claim ${rewardLabel}.` : evolutionReady ? "Evolution slot 6 complete. Evolution Coming Soon." : claimed ? `Evolution slot ${slot} reward collected` : current ? `Evolution slot ${slot}, ${Math.round(fill)} percent filled. Tap to choose feeder pets.` : `Evolution slot ${slot} locked`}
          data-testid={`button-evolution-slot-${slot}`}
        >
          {locked ? <img className="pupevo-locked-base" src={socketLocked} alt="" /> : <>
            <img className="pupevo-base" src={socketActive} alt="" />
            <span className="pupevo-fill" style={{ clipPath: `inset(${100 - fill}% 0 0 0)` }}><img src={socketActive} alt="" /></span>
          </>}
          {nodeMessage?.slot === slot ? <span className="pupevo-node-message local" role="status" aria-live="polite">{nodeMessage.message}</span> : null}
        </button>;
      })}
      <span className="pupevo-sr" aria-live="polite">{state?.isComplete ? "Evolution track complete" : `Evolution slot ${Math.min(slotCount, completedSlots + 1)} of ${slotCount}: ${currentPoints} of ${pointsRequired} points`}</span>
      {(loading || error) && <span className={`pupevo-status ${error ? "error" : ""}`}>{error || "Reading evolution energy…"}</span>}
    </section>
    {picker}
    {nodeToast}
  </>;
}
