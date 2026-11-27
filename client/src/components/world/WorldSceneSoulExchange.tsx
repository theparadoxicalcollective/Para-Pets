import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { currencyAssets } from "@/lib/currencyAssets";
import { invalidatePlayerOwnershipState } from "@/lib/queryClient";

type Pet = {
  inventoryId: string;
  name: string;
  nickname?: string | null;
  imageUrl?: string | null;
  petLevel: number;
  rarity: number;
  essenceValue: number;
  eligible: boolean;
};
type ExchangeState = { pets: Pet[]; essence: number };
type ExchangeReceipt = {
  success: boolean;
  exchangedPets: { inventoryId: string }[];
  essenceAwarded: number;
  newEssenceBalance: number;
};
type Point = { x: number; y: number };
type StoneGeometry = Point & { size: number; top: number; bottom: number; height: number };
type Pending = { pet: Pet; actionId: string };
type Drag = { pointerId: number; pet: Pet; start: Point };

const nameOf = (pet: Pet) => pet.nickname || pet.name;
const numberText = (value: number) => value.toLocaleString();
const exchangeButton = "rounded-lg border border-[#b48acb]/70 bg-[#42205a] px-4 py-2.5 text-sm font-semibold text-[#fff1cc] disabled:opacity-50";

/** A room-local tray and drag gesture, using the actual authored stone's
 * rendered bounds. Only the existing server transaction can exchange a pet. */
export default function WorldSceneSoulExchange({ stoneRef, geometryKey, onClose }: {
  stoneRef: RefObject<HTMLButtonElement | null>;
  geometryKey: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const submitting = useRef(false);
  const [state, setState] = useState<ExchangeState | null>(null);
  const [error, setError] = useState("");
  const [stone, setStone] = useState<StoneGeometry | null>(null);
  const [ghost, setGhost] = useState<{ pet: Pet; point: Point; over: boolean } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<{ pet: Pet; amount: number; actionId: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/soul-exchange/pets", { credentials: "include", signal: controller.signal, cache: "no-cache" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Could not load your pets.");
        if (!controller.signal.aborted) setState(body);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load your pets.");
      });
    return () => controller.abort();
  }, []);

  useLayoutEffect(() => {
    const layer = root.current, target = stoneRef.current;
    if (!layer || !target) return;
    const measure = () => {
      const bounds = layer.getBoundingClientRect(), rect = target.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const sx = layer.clientWidth / bounds.width, sy = layer.clientHeight / bounds.height;
      const top = (rect.top - bounds.top) * sy, bottom = (rect.bottom - bounds.top) * sy;
      setStone({
        x: (rect.left + rect.width / 2 - bounds.left) * sx,
        y: (top + bottom) / 2, size: Math.min(rect.width * sx, rect.height * sy),
        top, bottom, height: layer.clientHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    observer.observe(target);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [stoneRef, geometryKey]);

  useEffect(() => {
    if (!reward) return;
    const timer = window.setTimeout(() => setReward(null), 1600);
    return () => window.clearTimeout(timer);
  }, [reward]);

  function localPoint(event: PointerEvent): Point {
    const layer = root.current!, bounds = layer.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * layer.clientWidth / bounds.width,
      y: (event.clientY - bounds.top) * layer.clientHeight / bounds.height };
  }
  function isOverStone(event: PointerEvent) {
    const rect = stoneRef.current?.getBoundingClientRect();
    return !!rect && event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
  }
  function requestExchange(pet: Pet) {
    if (!pet.eligible || submitting.current || pending || reward) return;
    setError("");
    setPending({ pet, actionId: crypto.randomUUID() });
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, pet: Pet) {
    if (!event.isPrimary || event.button !== 0 || pending || submitting.current || reward) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, pet, start: { x: event.clientX, y: event.clientY } };
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (!ghost && Math.hypot(event.clientX - active.start.x, event.clientY - active.start.y) < 6) return;
    setGhost({ pet: active.pet, point: localPoint(event), over: isOverStone(event) });
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    setGhost(null);
    if (!cancelled && Math.hypot(event.clientX - active.start.x, event.clientY - active.start.y) >= 6 && isOverStone(event)) {
      requestExchange(active.pet);
    }
  }

  function cancel() {
    if (submitting.current) return;
    setPending(null);
    setError("");
  }
  async function confirmExchange() {
    if (!pending || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/soul-exchange/exchange", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petInventoryIds: [pending.pet.inventoryId], exchangeActionId: pending.actionId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "The exchange could not be completed.");
      const receipt = body as ExchangeReceipt;
      if (!receipt.success || !receipt.exchangedPets?.some(p => p.inventoryId === pending.pet.inventoryId) ||
          !Number.isFinite(receipt.essenceAwarded) || !Number.isFinite(receipt.newEssenceBalance)) {
        throw new Error("The exchange result could not be verified. Confirm again to check the same exchange.");
      }
      // The same action ID is retained on an error or lost response. No card
      // disappears and no essence is credited locally before a server receipt.
      const exchanged = new Set(receipt.exchangedPets.map(p => p.inventoryId));
      setState(current => current && ({
        pets: current.pets.filter(p => !exchanged.has(p.inventoryId)),
        essence: receipt.newEssenceBalance,
      }));
      setReward({ pet: pending.pet, amount: receipt.essenceAwarded, actionId: pending.actionId });
      setPending(null);
      // Refresh shared balance and owned pets after confirmation, not on drag.
      await qc.cancelQueries({ queryKey: ["/api/auth/me"] });
      qc.setQueryData(["/api/auth/me"], (current: Record<string, unknown> | null | undefined) =>
        current ? { ...current, essence: receipt.newEssenceBalance } : current);
      void invalidatePlayerOwnershipState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The exchange could not be completed.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const pets = state?.pets.filter(pet => pet.eligible) ?? [];
  // Prefer the floor below the stone. If the authored stone is close to the
  // bottom, use the space above it rather than covering the drop target.
  const below = stone ? stone.height - stone.bottom : 0;
  const above = stone?.top ?? 0;
  const trayAbove = below < 170 && above > below;
  const available = Math.max(0, trayAbove ? above : below);
  const trayHeight = stone ? Math.max(100, Math.min(210, available - 12)) : 210;
  // Anchor the chooser to the space directly beside the stone, not the
  // bottom edge of the screen. Authored positions and viewport sizes vary.
  const trayAnchor = stone ? Math.max(6, Math.min(
    (trayAbove ? stone.height - stone.top : stone.bottom) + 6,
    stone.height - trayHeight - 6,
  )) : 6;
  return <div ref={root} className="pointer-events-none absolute inset-0 z-30"
    data-testid="world-soul-exchange">
    <style>{`
      @keyframes world-soul-fade { 0% { transform: translate(-50%,-65%) scale(1); opacity: 1; } 70% { opacity: .65; } 100% { transform: translate(-50%,-20%) scale(.12); opacity: 0; } }
      @keyframes world-soul-gain { 0% { transform: translate(-50%,0); opacity: 0; } 20%,70% { opacity: 1; } 100% { transform: translate(-50%,-40px); opacity: 0; } }
      @keyframes world-soul-balance { 0%,100% { opacity: 1; } 40% { filter: brightness(1.65); } }
      .world-soul-vanish { animation: world-soul-fade 1s ease-in forwards; }
      .world-soul-gain { animation: world-soul-gain 1.6s ease-out forwards; }
      .world-soul-balance { animation: world-soul-balance .75s ease-out; }
      @media (prefers-reduced-motion: reduce) {
        .world-soul-vanish, .world-soul-gain, .world-soul-balance { animation: none; }
        .world-soul-vanish { display: none; }
      }
    `}</style>
    <section aria-label="Available pets for Soul Exchange"
      className="pointer-events-auto absolute inset-x-2 mx-auto flex max-w-md flex-col overflow-hidden rounded-xl border border-[#b48acb]/80 bg-[#21102e]/95 px-2 py-2 text-[#fff0ce] shadow-[0_0_18px_#a64ce145]"
      style={{ [!stone || trayAbove ? "bottom" : "top"]: trayAnchor, maxHeight: trayHeight }}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-1">
        <span className="font-serif text-sm font-bold">Soul Exchange</span>
        {state && <span key={reward?.actionId ?? "balance"} data-testid="soul-exchange-essence-balance"
          className={`flex items-center gap-1 text-xs font-semibold text-[#a5f0b0] ${reward ? "world-soul-balance" : ""}`}>
          <img src={currencyAssets.essenceToken} alt="" className="h-5 w-5 object-contain" />
          <span aria-label="Essence balance">{numberText(state.essence)}</span>
        </span>}
        <button type="button" aria-label="Close Soul Exchange" disabled={busy || !!pending}
          className="rounded-full border border-[#b48acb]/60 px-2 py-0.5 disabled:opacity-50" onClick={onClose}>×</button>
      </div>
      <p className="shrink-0 px-1 py-1 text-[10px] text-[#e8c9f9]">Drag a pet's picture onto the stone. Swipe names to browse.</p>
      {!state && <p role="status" className="p-2 text-xs">{error || "Gathering your available pets…"}</p>}
      {state && !pets.length && <p role="status" className="p-2 text-xs">No pets are available to exchange.</p>}
      {pets.length > 0 && <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto overflow-y-auto pb-1" aria-label="Exchangeable pets">
        {pets.map(pet => <div key={pet.inventoryId} data-testid={`soul-exchange-pet-${pet.inventoryId}`}
          className="flex w-28 shrink-0 flex-col items-center rounded-lg border border-[#9565ae]/65 bg-[#321743] px-1 pb-1 text-center">
          <button type="button" aria-label={`Select ${nameOf(pet)} for Soul Exchange`}
            data-testid={`soul-exchange-drag-${pet.inventoryId}`}
            disabled={busy || !!pending || !!reward}
            className="h-16 w-full shrink-0 touch-none cursor-grab rounded-md active:cursor-grabbing disabled:cursor-default"
            onPointerDown={event => startDrag(event, pet)} onPointerMove={moveDrag}
            onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)}
            onLostPointerCapture={event => endDrag(event, true)}
            onClick={event => { if (event.detail === 0) requestExchange(pet); }}>
            {pet.imageUrl && <img src={pet.imageUrl} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain" />}
          </button>
          <strong className="w-full break-words text-[11px] leading-tight">{nameOf(pet)}</strong>
          <span className="text-[10px]">Lvl {pet.petLevel}</span>
          <span aria-label={`${pet.rarity} stars`} className="text-[11px] tracking-tight text-[#ffce65]">{"★".repeat(pet.rarity)}</span>
          <span className="flex items-center gap-0.5 text-[11px] font-bold text-[#a5f0b0]">
            <img src={currencyAssets.essenceToken} alt="Essence" className="h-4 w-4 object-contain" />{numberText(pet.essenceValue)}
          </span>
        </div>)}
      </div>}
    </section>
    {ghost && <>
      {stone && ghost.over && <div className="absolute rounded-full border-2 border-violet-300 bg-violet-500/15 shadow-[0_0_20px_#c084fc]"
        style={{ left: stone.x, top: stone.y, width: stone.size, height: stone.size, transform: "translate(-50%,-50%)" }}/>}
      {ghost.pet.imageUrl && <img src={ghost.pet.imageUrl} alt="" draggable={false}
        className="absolute h-20 w-20 object-contain drop-shadow-[0_0_10px_#e0a2ff]"
        style={{ left: ghost.point.x, top: ghost.point.y, transform: "translate(-50%,-50%)" }}/>}
    </>}
    {reward && stone && <div key={reward.actionId} data-testid="soul-exchange-reward" className="absolute inset-0" role="status">
      {reward.pet.imageUrl && <img src={reward.pet.imageUrl} alt="" draggable={false}
        className="world-soul-vanish absolute object-contain drop-shadow-[0_0_20px_#d08cff]"
        style={{ left: stone.x, top: stone.y, width: Math.max(60, Math.min(130, stone.size)), height: Math.max(60, Math.min(130, stone.size)) }}/>}
      <span className="world-soul-gain absolute whitespace-nowrap rounded-full border border-[#a5f0b0]/60 bg-[#21102e]/95 px-3 py-2 text-lg font-bold text-[#a5f0b0] shadow-[0_0_20px_#a64ce1]"
        style={{ left: stone.x, top: Math.max(4, stone.y - 45), transform: "translateX(-50%)" }}>
        +{numberText(reward.amount)} Essence
      </span>
    </div>}
    <AlertDialog.Root open={!!pending} onOpenChange={open => { if (!open) cancel(); }}>
      {pending && <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[150] bg-black/70" />
        <AlertDialog.Content data-testid="soul-exchange-confirmation"
          className="fixed left-1/2 top-1/2 z-[151] flex w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-2xl border border-[#c491db] bg-[#281337] p-5 text-center text-[#fff0ce] shadow-[0_0_32px_#9b4bcf60]"
          onEscapeKeyDown={event => { if (submitting.current) event.preventDefault(); }}>
          <AlertDialog.Title className="font-serif text-xl font-bold">Confirm Soul Exchange</AlertDialog.Title>
          {pending.pet.imageUrl && <img src={pending.pet.imageUrl} alt="" className="h-24 w-24 object-contain" />}
          <AlertDialog.Description className="text-sm">
            Exchange <strong>{nameOf(pending.pet)}</strong> for <strong className="text-[#a5f0b0]">{numberText(pending.pet.essenceValue)} Essence</strong>?
            This permanently removes the pet and cannot be undone.
          </AlertDialog.Description>
          {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
          <div className="grid w-full grid-cols-2 gap-2">
            <AlertDialog.Cancel disabled={busy} className="rounded-lg border border-[#b48acb]/70 px-4 py-2.5 text-sm disabled:opacity-50">Cancel</AlertDialog.Cancel>
            <button type="button" disabled={busy} className={exchangeButton} onClick={() => void confirmExchange()}>{busy ? "Exchanging…" : "Confirm"}</button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>}
    </AlertDialog.Root>
  </div>;
}
