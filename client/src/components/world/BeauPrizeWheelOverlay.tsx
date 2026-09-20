import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Coins, Gem, Pencil, Plus, Search, Sparkles, X } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import {
  BEAU_PRIZE_WHEEL_PAID_COST,
  BEAU_PRIZE_WHEEL_PRIZE_SLOTS,
  beauWheelLandingRotation,
  beauWheelSlotCenterAngle,
  type BeauPrizeKind,
  type BeauPrizeView,
} from "@shared/beauPrizeWheel";

const beauFrame = "/world-assets/uploads/BeauPrizeWheel.png";
const emptyWheel = "/world-assets/uploads/PrizeWheelEmpty.png";
const wheelArrow = "/world-assets/uploads/PrizeWheelArrow.png";
const hauntedForestBackground = "/world-assets/bg_haunted_woods_v2.webp";
const lossSkull = "/world-assets/generated_images/icon_skull_defeat.png";
const coinIcon = "/world-assets/icon_coin.png";
const essenceIcon = "/world-assets/Photoroom_20260709_23958_PM_1783626016795.png";

export interface WheelState {
  ready: boolean;
  slots: BeauPrizeView[];
  requiresActivePet: boolean;
  activePetReady: boolean;
  activePetName: string | null;
  balances: { coins: number; essence: number };
  freeSpinAvailable: boolean;
  nextSpinCost: number;
  isAdmin: boolean;
}

interface PrizeOption {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
  rarity: number;
}

interface PrizeOptions {
  items: PrizeOption[];
  eggs: PrizeOption[];
}

interface SpinResult {
  slotIndex: number;
  wasFree: boolean;
  cost: number;
  reward: BeauPrizeView & {
    message: string;
    petName?: string;
    newLevel?: number;
    levelsGained?: number;
  };
  balances: { coins: number; essence: number };
  freeSpinAvailable: boolean;
  nextSpinCost: number;
}

interface Props {
  initialState: WheelState;
  onClose: () => void;
  onStateChange?: (state: WheelState) => void;
}

const WHEEL_LEFT = 28.9;
const WHEEL_TOP = 35.15;
const WHEEL_SIZE = 62.8;
const ARROW_LEFT = 54.7;
const ARROW_TOP = 30.25;
const ARROW_WIDTH = 11;

function slotPosition(slot: number) {
  const angle = beauWheelSlotCenterAngle(slot) * Math.PI / 180;
  const radius = 31.8;
  return {
    left: 50 + Math.sin(angle) * radius,
    top: 50 - Math.cos(angle) * radius,
  };
}

function createActionId(): string {
  const secureCrypto = globalThis.crypto;
  if (typeof secureCrypto?.randomUUID === "function") return secureCrypto.randomUUID();
  if (!secureCrypto) throw new Error("Secure spin ID is unavailable.");
  const bytes = new Uint8Array(16);
  secureCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function prizeGlyph(slot: BeauPrizeView) {
  if (slot.kind === "coins") return slot.imageUrl || coinIcon;
  if (slot.kind === "essence") return slot.imageUrl || essenceIcon;
  if (slot.kind === "loss") return slot.imageUrl || lossSkull;
  return slot.imageUrl;
}

function visibleAmount(slot: BeauPrizeView) {
  if (!slot.amount || !["coins", "essence", "exp"].includes(String(slot.kind))) return null;
  if (slot.amount >= 1_000_000) return (slot.amount / 1_000_000).toFixed(slot.amount % 1_000_000 ? 1 : 0) + "m";
  if (slot.amount >= 1_000) return (slot.amount / 1_000).toFixed(slot.amount % 1_000 ? 1 : 0) + "k";
  return String(slot.amount);
}

function PrizeToken({ slot, admin, spinning, onEdit }: { slot: BeauPrizeView; admin: boolean; spinning: boolean; onEdit: () => void }) {
  const position = slotPosition(slot.slot);
  const icon = prizeGlyph(slot);
  const amount = visibleAmount(slot);
  const isLoss = slot.kind === "loss";

  if (!slot.configured && !admin) return null;

  return (
    <div
      className="absolute z-[8] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${position.left}%`, top: `${position.top}%`, width: "17.5%", height: "17.5%" }}
      data-testid={`beau-wheel-slot-${slot.slot}`}
    >
      {slot.configured ? (
        <div className="relative flex h-full w-full items-center justify-center">
          <div
            className="relative grid h-[76%] w-[76%] place-items-center rounded-full border border-amber-100/50 bg-black/45"
            style={{ boxShadow: "0 0 9px rgba(255,217,124,.33), inset 0 0 8px rgba(0,0,0,.58)" }}
          >
            {icon ? (
              <img
                src={icon}
                alt=""
                draggable={false}
                className="h-[72%] w-[72%] object-contain"
                style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.72))" }}
              />
            ) : slot.kind === "exp" ? (
              <span className="font-fantasy text-[clamp(7px,2vw,12px)] font-bold text-cyan-100" style={{ textShadow: "0 0 7px #60a5fa" }}>EXP</span>
            ) : (
              <span className="text-[10px] text-amber-50">?</span>
            )}
            {amount && (
              <span
                className="absolute -bottom-[18%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-100/35 bg-black/75 px-1.5 py-[1px] text-[clamp(5px,1.4vw,8px)] font-black text-amber-50"
                style={{ textShadow: "0 1px 2px #000" }}
              >
                {amount}{slot.kind === "exp" ? " XP" : ""}
              </span>
            )}
          </div>
          {admin && !isLoss && !spinning && (
            <button
              type="button"
              aria-label={`Edit prize ${slot.slot + 1}: ${slot.label}`}
              onClick={(event) => { event.stopPropagation(); onEdit(); }}
              className="absolute -right-[2%] -top-[1%] grid h-[30%] w-[30%] place-items-center rounded-full border border-amber-200/70 bg-[#29160c]/95 text-amber-100 active:scale-90"
              style={{ boxShadow: "0 0 8px rgba(251,191,36,.55)" }}
            >
              <Pencil className="h-[55%] w-[55%]" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Set prize ${slot.slot + 1}`}
          onClick={(event) => { event.stopPropagation(); onEdit(); }}
          className="grid h-full w-full place-items-center rounded-full border-2 border-dashed border-amber-100/80 bg-black/55 text-amber-50 active:scale-90"
          style={{ boxShadow: "0 0 11px rgba(251,191,36,.58), inset 0 0 8px rgba(0,0,0,.7)" }}
        >
          <Plus className="h-[52%] w-[52%]" strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}

function PrizeEditor({
  slot,
  options,
  optionsLoading,
  current,
  onClose,
  onSaved,
}: {
  slot: number;
  options: PrizeOptions | null;
  optionsLoading: boolean;
  current: BeauPrizeView | undefined;
  onClose: () => void;
  onSaved: (state: WheelState) => void;
}) {
  const initialKind: BeauPrizeKind = current?.configured && current.kind && current.kind !== "loss" ? current.kind : "coins";
  const [kind, setKind] = useState<BeauPrizeKind>(initialKind);
  const [amount, setAmount] = useState(String(current?.amount ?? (initialKind === "exp" ? 100 : 500)));
  const [shopItemId, setShopItemId] = useState(current?.shopItemId ?? "");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const catalog = kind === "egg" ? options?.eggs ?? [] : kind === "item" ? options?.items ?? [] : [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return catalog.slice(0, 80);
    return catalog.filter(item => item.name.toLowerCase().includes(query) || item.type.toLowerCase().includes(query)).slice(0, 80);
  }, [catalog, search]);

  const selected = catalog.find(item => item.id === shopItemId);
  const usesAmount = kind === "coins" || kind === "essence" || kind === "exp";
  const canSave = usesAmount ? Number.isSafeInteger(Number(amount)) && Number(amount) > 0 : Boolean(shopItemId);

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/beau-prize-wheel/slots/${slot}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usesAmount ? { kind, amount: Number(amount) } : { kind, shopItemId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Prize could not be saved.");
      onSaved(body as WheelState);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prize could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!current?.configured || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/beau-prize-wheel/slots/${slot}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Prize could not be cleared.");
      onSaved(body as WheelState);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prize could not be cleared.");
    } finally {
      setSaving(false);
    }
  };

  const kindButtons: Array<{ kind: BeauPrizeKind; label: string; icon: ReactNode }> = [
    { kind: "coins", label: "Coins", icon: <Coins className="h-4 w-4" /> },
    { kind: "essence", label: "Essence", icon: <Gem className="h-4 w-4" /> },
    { kind: "exp", label: "Pet EXP", icon: <Sparkles className="h-4 w-4" /> },
    { kind: "item", label: "Item", icon: <span className="text-sm">◆</span> },
    { kind: "egg", label: "Pet Egg", icon: <span className="text-sm">◉</span> },
  ];

  return (
    <div className="fixed inset-0 z-[2350] grid place-items-center bg-black/80 p-3" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Configure Beau wheel prize ${slot + 1}`}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-300/55 bg-[#140b0c] text-amber-50"
        style={{ maxHeight: "min(86dvh,720px)", boxShadow: "0 20px 60px #000, 0 0 28px rgba(180,83,9,.2)" }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-amber-200/15 px-4 py-3">
          <div>
            <div className="font-fantasy text-base text-amber-100">Wheel Prize {slot + 1}</div>
            <div className="mt-0.5 text-[10px] text-amber-100/60">Choose exactly what this wheel section awards.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close prize editor" className="grid h-9 w-9 place-items-center rounded-full border border-amber-100/25 bg-black/40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(min(86dvh,720px)-64px)] overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {kindButtons.map(entry => (
              <button
                key={entry.kind}
                type="button"
                onClick={() => { setKind(entry.kind); setShopItemId(""); setSearch(""); setError(""); }}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[9px] font-semibold"
                style={{
                  borderColor: kind === entry.kind ? "rgba(253,230,138,.85)" : "rgba(253,230,138,.18)",
                  background: kind === entry.kind ? "rgba(146,64,14,.38)" : "rgba(0,0,0,.28)",
                  color: kind === entry.kind ? "#fff2bd" : "rgba(255,237,178,.62)",
                }}
              >
                {entry.icon}
                {entry.label}
              </button>
            ))}
          </div>

          {usesAmount ? (
            <div className="mt-4 rounded-xl border border-amber-200/15 bg-black/25 p-3">
              <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-amber-100/65">
                {kind === "exp" ? "EXP for active pet" : kind === "coins" ? "Coin amount" : "Essence amount"}
              </label>
              <input
                type="number"
                min={1}
                max={kind === "exp" ? 100000 : 1000000}
                step={1}
                value={amount}
                onChange={event => setAmount(event.target.value)}
                className="mt-2 w-full rounded-lg border border-amber-200/35 bg-black/45 px-3 py-3 text-base font-bold text-amber-50 outline-none"
              />
              {kind === "exp" && <p className="mt-2 text-[10px] leading-relaxed text-cyan-100/65">EXP is applied only to the player's currently active, hatched pet.</p>}
            </div>
          ) : (
            <div className="mt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-100/40" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={kind === "egg" ? "Search pet eggs…" : "Search items…"}
                  className="w-full rounded-xl border border-amber-200/25 bg-black/35 py-3 pl-9 pr-3 text-sm text-amber-50 outline-none placeholder:text-amber-100/30"
                />
              </div>
              <div className="mt-2 grid max-h-[310px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {optionsLoading ? (
                  <div className="col-span-2 py-8 text-center text-xs text-amber-100/45">Loading prize catalog…</div>
                ) : filtered.length ? filtered.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setShopItemId(item.id)}
                    className="relative flex min-h-16 items-center gap-2 rounded-xl border p-2 text-left"
                    style={{
                      borderColor: shopItemId === item.id ? "rgba(253,230,138,.82)" : "rgba(253,230,138,.16)",
                      background: shopItemId === item.id ? "rgba(146,64,14,.34)" : "rgba(0,0,0,.24)",
                    }}
                  >
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-black/35">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" className="h-10 w-10 object-contain" /> : <span className="text-amber-100/35">?</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[10px] font-semibold text-amber-50">{item.name}</div>
                      <div className="mt-1 text-[8px] uppercase tracking-wide text-amber-100/45">{kind === "egg" ? `${Math.max(1, item.rarity)}★ egg` : item.type}</div>
                    </div>
                    {shopItemId === item.id && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-emerald-300" />}
                  </button>
                )) : (
                  <div className="col-span-2 py-8 text-center text-xs text-amber-100/45">No matching prizes found.</div>
                )}
              </div>
              {selected && <div className="mt-2 text-center text-[10px] text-emerald-200/75">Selected: {selected.name}</div>}
            </div>
          )}

          {error && <div className="mt-3 rounded-lg border border-rose-300/25 bg-rose-950/35 px-3 py-2 text-xs text-rose-100">{error}</div>}

          <div className="mt-4 flex gap-2">
            {current?.configured && (
              <button type="button" disabled={saving} onClick={() => void clear()} className="min-h-11 flex-1 rounded-xl border border-rose-300/35 bg-rose-950/35 px-3 text-xs font-semibold text-rose-100 disabled:opacity-40">
                Clear
              </button>
            )}
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={() => void save()}
              className="min-h-11 flex-[2] rounded-xl border border-amber-200/55 bg-gradient-to-b from-amber-800/55 to-amber-950/70 px-4 font-fantasy text-sm tracking-wide text-amber-50 disabled:opacity-35"
            >
              {saving ? "Saving…" : "Set Prize"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function BeauPrizeWheelOverlay({ initialState, onClose, onStateChange }: Props) {
  const [state, setState] = useState<WheelState>(initialState);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [editorSlot, setEditorSlot] = useState<number | null>(null);
  const [options, setOptions] = useState<PrizeOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SpinResult | null>(null);
  const resultTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
  }, []);

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  useEffect(() => {
    if (!state.isAdmin || editorSlot === null || options || optionsLoading) return;
    let cancelled = false;
    setOptionsLoading(true);
    void fetch("/api/admin/beau-prize-wheel/options", { credentials: "include", cache: "no-store" })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.message || "Prize catalog could not be loaded.");
        if (!cancelled) setOptions(body as PrizeOptions);
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Prize catalog could not be loaded."); })
      .finally(() => { if (!cancelled) setOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [editorSlot, options, optionsLoading, state.isAdmin]);

  const configuredCount = state.slots.filter(slot => slot.slot < BEAU_PRIZE_WHEEL_PRIZE_SLOTS && slot.configured).length;
  const canAfford = state.freeSpinAvailable || state.balances.coins >= BEAU_PRIZE_WHEEL_PAID_COST;
  const activePetBlocked = state.requiresActivePet && !state.activePetReady;
  const canSpin = state.ready && !activePetBlocked && canAfford && !spinning;

  const updateState = (next: WheelState) => {
    setState(next);
    onStateChange?.(next);
    setEditorSlot(null);
    setError("");
  };

  const spin = async () => {
    if (!canSpin) return;
    setSpinning(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch("/api/beau-prize-wheel/spin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: createActionId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Beau's wheel could not spin.");

      const spinResult = body as SpinResult;
      const desired = beauWheelLandingRotation(spinResult.slotIndex);
      const current = normalizeDegrees(rotation);
      const correction = normalizeDegrees(desired - current);
      setRotation(rotation + 360 * 6 + correction);

      const nextState: WheelState = {
        ...state,
        balances: spinResult.balances,
        freeSpinAvailable: spinResult.freeSpinAvailable,
        nextSpinCost: spinResult.nextSpinCost,
      };
      setState(nextState);
      onStateChange?.(nextState);
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });

      resultTimerRef.current = window.setTimeout(() => {
        setResult(spinResult);
        setSpinning(false);
        resultTimerRef.current = null;
      }, 4100);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Beau's wheel could not spin.");
      setSpinning(false);
    }
  };

  const spinLabel = state.freeSpinAvailable ? "FREE SPIN" : "SPIN · 500";
  const footerMessage = !state.ready
    ? `Admin setup: ${configuredCount}/${BEAU_PRIZE_WHEEL_PRIZE_SLOTS} prize sections set`
    : activePetBlocked
      ? "Set a hatched pet as active before spinning — EXP is on the wheel."
      : !canAfford
        ? "You need 500 coins for another spin."
        : state.freeSpinAvailable
          ? "Your first spin today is free."
          : "Additional spins cost 500 coins each.";

  return (
    <div
      className="fixed inset-0 z-[2200] flex flex-col items-center overflow-hidden text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Beau's Prize Wheel"
      data-testid="beau-prize-wheel-overlay"
      style={{ overscrollBehavior: "contain" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: `linear-gradient(180deg,rgba(3,8,7,.25),rgba(3,5,6,.62)),url(${hauntedForestBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(.9) brightness(.72)",
          transform: "scale(1.02)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,.6)_100%)]" />

      <header className="relative z-[3] flex w-full max-w-2xl shrink-0 items-center justify-between gap-3 px-3 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="rounded-full border border-amber-300/25 bg-black/55 px-3 py-1.5 text-[10px] text-amber-100 backdrop-blur-sm">
          <span className="inline-flex items-center gap-1.5"><img src={coinIcon} alt="" className="h-5 w-5 object-contain" />{state.balances.coins.toLocaleString()}</span>
          <span className="mx-2 text-amber-100/25">•</span>
          <span className="inline-flex items-center gap-1.5"><img src={essenceIcon} alt="" className="h-5 w-5 object-contain" />{state.balances.essence.toLocaleString()}</span>
        </div>
        <button
          type="button"
          aria-label="Close Beau's Prize Wheel"
          disabled={spinning}
          onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-amber-100/30 bg-black/55 text-amber-50 backdrop-blur-sm disabled:opacity-35 active:scale-90"
          style={{ boxShadow: "0 0 12px rgba(251,191,36,.18)" }}
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <main className="relative z-[2] flex min-h-0 w-full flex-1 flex-col items-center justify-center px-1">
        <div
          className="relative shrink-0"
          style={{ width: "min(96vw, 720px, calc((100dvh - 170px) * .8003))", aspectRatio: "1122 / 1402" }}
          data-testid="beau-prize-wheel-stage"
        >
          <img src={beauFrame} alt="Beau holding his prize wheel" draggable={false} decoding="async" className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain" />

          <div
            className="absolute"
            style={{ left: `${WHEEL_LEFT}%`, top: `${WHEEL_TOP}%`, width: `${WHEEL_SIZE}%`, aspectRatio: "1 / 1" }}
          >
            <div
              className="absolute inset-0"
              data-testid="beau-prize-wheel-spinner"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? "transform 4s cubic-bezier(.12,.72,.08,1)" : undefined,
                transformOrigin: "50% 50%",
                willChange: spinning ? "transform" : undefined,
              }}
            >
              <img src={emptyWheel} alt="" draggable={false} decoding="async" className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain" />
              {state.slots.map(slot => (
                <PrizeToken
                  key={slot.slot}
                  slot={slot}
                  admin={state.isAdmin}
                  spinning={spinning}
                  onEdit={() => setEditorSlot(slot.slot)}
                />
              ))}
            </div>
          </div>

          <img
            src={wheelArrow}
            alt=""
            draggable={false}
            decoding="async"
            className="pointer-events-none absolute z-[12] select-none object-contain"
            style={{
              left: `${ARROW_LEFT}%`,
              top: `${ARROW_TOP}%`,
              width: `${ARROW_WIDTH}%`,
              filter: "drop-shadow(0 0 7px rgba(255,205,92,.78)) drop-shadow(0 3px 5px rgba(0,0,0,.72))",
            }}
          />
        </div>
      </main>

      <footer className="relative z-[4] w-full max-w-xl shrink-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
        {result && !spinning && (
          <div
            className="mx-auto mb-2 flex max-w-md items-center justify-center gap-2 rounded-xl border border-amber-200/35 bg-black/70 px-3 py-2 text-center text-xs text-amber-50 backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            {prizeGlyph(result.reward) ? <img src={prizeGlyph(result.reward)!} alt="" className="h-8 w-8 shrink-0 object-contain" /> : result.reward.kind === "exp" ? <Sparkles className="h-6 w-6 text-cyan-200" /> : null}
            <span>{result.reward.message}</span>
          </div>
        )}
        {error && <div className="mx-auto mb-2 max-w-md rounded-lg border border-rose-300/35 bg-rose-950/65 px-3 py-2 text-center text-xs text-rose-100">{error}</div>}
        <div className="mx-auto mb-2 max-w-md text-center text-[10px] leading-relaxed text-amber-100/75">{footerMessage}</div>
        <button
          type="button"
          data-testid="button-spin-beau-prize-wheel"
          disabled={!canSpin}
          onClick={() => void spin()}
          className="mx-auto flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl border border-amber-200/65 bg-gradient-to-b from-[#7d251f]/95 to-[#32100e]/95 px-5 font-fantasy text-base tracking-[.1em] text-amber-50 disabled:opacity-35 active:scale-[.98]"
          style={{ boxShadow: canSpin ? "0 0 18px rgba(251,191,36,.25), inset 0 0 14px rgba(255,220,130,.09)" : undefined }}
        >
          {spinning ? "SPINNING…" : spinLabel}
        </button>
      </footer>

      {state.isAdmin && editorSlot !== null && editorSlot < BEAU_PRIZE_WHEEL_PRIZE_SLOTS && (
        <PrizeEditor
          slot={editorSlot}
          current={state.slots.find(slot => slot.slot === editorSlot)}
          options={options}
          optionsLoading={optionsLoading}
          onClose={() => setEditorSlot(null)}
          onSaved={updateState}
        />
      )}
    </div>
  );
}
