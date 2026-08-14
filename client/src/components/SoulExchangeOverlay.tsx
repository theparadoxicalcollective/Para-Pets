import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, LockKeyhole, Sparkles, X } from "lucide-react";
import { useLocation } from "wouter";
import { currencyAssets } from "@/lib/currencyAssets";

type Pet = { inventoryId: string; name: string; nickname?: string | null; imageUrl?: string | null; rarity: number; essenceValue: number; eligible: boolean; unavailableReason?: string | null };
type SoulExchangeBlock = "egg" | "active" | "accessories" | "market" | "pvp" | "house" | "clearing" | "cave";

type BlockUi = { label: string; actionLabel?: string; route?: string };

const BLOCK_UI: Record<SoulExchangeBlock, BlockUi> = {
  egg: { label: "Not Hatched", actionLabel: "View Pets", route: "/pets" },
  active: { label: "Active Pet", actionLabel: "Change Active Pet", route: "/pets" },
  accessories: { label: "Accessories Equipped", actionLabel: "Remove Accessories", route: "/equip-accessories" },
  market: { label: "Marketplace Listing", actionLabel: "Open Market", route: "/market" },
  pvp: { label: "In PvP Team", actionLabel: "Manage PvP Team", route: "/pvp" },
  house: { label: "In Pet House", actionLabel: "Open Pet House", route: "/pet-house" },
  clearing: { label: "Clearing Rewards", actionLabel: "Open Clearing", route: "/explore/elysian-bayou-clearing" },
  cave: { label: "Cave Progress" },
};

function getBlockedType(reason?: string | null): SoulExchangeBlock | null {
  const text = (reason || "").toLowerCase();
  if (!text) return null;
  if (text.includes("egg") || text.includes("hatched")) return "egg";
  if (text.includes("active pet")) return "active";
  if (text.includes("accessor")) return "accessories";
  if (text.includes("market")) return "market";
  if (text.includes("pvp") || text.includes("battle group")) return "pvp";
  if (text.includes("house")) return "house";
  if (text.includes("clearing")) return "clearing";
  if (text.includes("cave")) return "cave";
  return null;
}

export default function SoulExchangeOverlay({ backgroundUrl, onClose }: { backgroundUrl: string | null; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [pets, setPets] = useState<Pet[]>([]);
  const [essence, setEssence] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gain, setGain] = useState<number | null>(null);
  const [pulse, setPulse] = useState(false);
  const actionId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/soul-exchange/pets", { credentials: "include" }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not hear the waiting souls.");
      if (active) { setPets(body.pets); setEssence(body.essence); }
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : "Could not hear the waiting souls."));
    return () => { active = false; };
  }, []);

  const displayPets = useMemo(
    () => [...pets].sort((a, b) => Number(b.eligible) - Number(a.eligible)),
    [pets],
  );
  const selected = useMemo(() => pets.filter(pet => selectedIds.has(pet.inventoryId)), [pets, selectedIds]);
  const total = selected.reduce((sum, pet) => sum + pet.essenceValue, 0);
  const eligibleCount = pets.filter(pet => pet.eligible).length;

  const toggle = (pet: Pet) => {
    if (!pet.eligible || busy) return;
    setSelectedIds(current => {
      const next = new Set(current);
      next.has(pet.inventoryId) ? next.delete(pet.inventoryId) : next.add(pet.inventoryId);
      return next;
    });
  };

  const openBlockAction = (block: SoulExchangeBlock | null) => {
    if (!block) return;
    const route = BLOCK_UI[block].route;
    if (!route) return;
    onClose();
    navigate(route);
  };

  const exchange = async () => {
    if (!selected.length || busy) return;
    setBusy(true); setError("");
    actionId.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/soul-exchange/exchange", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petInventoryIds: selected.map(pet => pet.inventoryId), exchangeActionId: actionId.current }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "The ritual could not be completed.");
      const exchanged = new Set<string>(body.exchangedPets.map((pet: Pet) => pet.inventoryId));
      setConfirm(false); setGain(body.essenceAwarded); setEssence(body.newEssenceBalance); setPulse(true);
      setPets(current => current.filter(pet => !exchanged.has(pet.inventoryId)));
      setSelectedIds(new Set()); actionId.current = null;
      window.setTimeout(() => setPulse(false), 700);
      window.setTimeout(() => setGain(null), 2200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The ritual failed safely.");
    } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-50 mx-auto max-w-3xl overflow-hidden bg-[#07020f] text-white">
    {backgroundUrl && <>
      <img aria-hidden="true" src={backgroundUrl} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-xl" />
      <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
    </>}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(126,34,206,.04),rgba(7,2,15,.2)_38%,rgba(7,2,15,.94)_100%)]" />
    <div className="absolute inset-x-0 bottom-0 h-[68%] bg-gradient-to-t from-[#07020f] via-[#0c0617]/95 to-[#0c0617]/35" />

    <main className="relative z-10 flex h-full min-w-0 flex-col overflow-hidden pb-[max(8px,env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))]">
      <header className="flex-none bg-gradient-to-b from-black/75 via-black/45 to-transparent px-4 pb-2 pt-1 sm:px-6">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 font-fantasy text-[25px] font-black tracking-[.055em] text-violet-50 drop-shadow-[0_2px_8px_#000] sm:text-3xl">The Soul Exchange</h1>
          <button onClick={onClose} aria-label="Close Soul Exchange" className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full border border-violet-100/45 bg-black/60 shadow-lg backdrop-blur-sm transition active:scale-95"><X /></button>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs font-medium leading-relaxed text-violet-50/90 drop-shadow-[0_1px_4px_#000] min-[390px]:text-sm">Release companions into the violet beyond.</p>
          <span className="flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200/35 bg-black/60 px-2.5 font-black text-amber-100 shadow-[0_0_18px_rgba(139,92,246,.22)] backdrop-blur-sm">
            <img src={currencyAssets.essenceToken} alt="Essence" className="h-7 w-7" />{essence.toLocaleString()}
          </span>
        </div>
      </header>

      <section aria-label="Magical Soul Exchange area" className={`soul-exchange-zone relative mx-auto flex h-20 w-36 flex-none items-center justify-center sm:h-28 sm:w-48 ${pulse ? "soul-exchange-success" : ""}`}>
        <div aria-hidden="true" className="absolute inset-x-2 bottom-0 h-10 rounded-[50%] bg-violet-500/15 blur-2xl" />
        <img src="/world-assets/worlds/haunted_woods/soul-exchange-portal-v3.svg" alt="" className="relative h-full w-full object-contain opacity-90 drop-shadow-[0_0_18px_rgba(168,85,247,.5)]" />
        {gain !== null && <b aria-live="polite" className="absolute rounded-full border border-violet-100/60 bg-violet-100 px-4 py-2 text-violet-950 shadow-[0_0_25px_#c4b5fd]">+{gain.toLocaleString()} Essence</b>}
      </section>

      <section className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 sm:px-5">
        <div className="sticky top-0 z-20 mb-3 rounded-xl border border-violet-300/20 bg-[#0b0613]/92 px-3 py-2.5 shadow-[0_8px_22px_rgba(7,2,15,.55)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-fantasy text-base font-bold tracking-wide text-violet-50 sm:text-lg">Choose Hatched Pets</h2>
            <span className="shrink-0 rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-100">{eligibleCount} Eligible</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-violet-100/80">Select eligible pets to release permanently for Essence. Protected pets show what to change first.</p>
        </div>
        {error && <p role="alert" className="mb-3 rounded-lg border border-rose-400/30 bg-red-950/90 p-2.5 text-sm text-red-100">{error}</p>}

        <div className="grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-3 sm:gap-4">
          {displayPets.map(pet => {
            const isSelected = selectedIds.has(pet.inventoryId);
            const blockedType = pet.eligible ? null : getBlockedType(pet.unavailableReason);
            const blockedUi = blockedType ? BLOCK_UI[blockedType] : null;
            const displayName = pet.nickname || pet.name;
            return <article
              key={pet.inventoryId}
              data-soul-card={pet.eligible ? "available" : "unavailable"}
              className={`relative min-w-0 overflow-hidden rounded-2xl border backdrop-blur-[2px] transition duration-200 ${isSelected ? "border-amber-300/80 bg-[#171022]/92 shadow-[0_0_22px_rgba(251,191,36,.24),inset_0_0_18px_rgba(167,139,250,.13)]" : pet.eligible ? "border-violet-300/25 bg-[#100919]/82 shadow-[0_7px_18px_rgba(0,0,0,.3)]" : "border-violet-200/15 bg-[#09070d]/86 shadow-[0_6px_16px_rgba(0,0,0,.35)]"}`}
            >
              {isSelected && <>
                <span aria-hidden="true" className="soul-selected-mote left-[24%] top-[46%]" />
                <span aria-hidden="true" className="soul-selected-mote left-[52%] top-[41%] [animation-delay:.45s]" />
                <span aria-hidden="true" className="soul-selected-mote left-[76%] top-[49%] [animation-delay:.9s]" />
              </>}
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`${displayName}, ${pet.rarity} star rarity, ${pet.essenceValue.toLocaleString()} Essence${pet.eligible ? "" : `. ${pet.unavailableReason || "Unavailable"}`}`}
                data-soul-availability={pet.eligible ? "available" : "unavailable"}
                disabled={!pet.eligible || busy}
                onClick={() => toggle(pet)}
                className={`group relative flex w-full min-w-0 flex-col items-center px-2 pb-2.5 pt-3 text-center outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200 ${pet.eligible ? "active:scale-[.98]" : "cursor-not-allowed"}`}
              >
                <span aria-hidden="true" className={`absolute top-3 h-24 w-24 max-w-[76%] rounded-full transition duration-200 ${isSelected ? "bg-violet-400/24 shadow-[0_0_26px_8px_rgba(192,132,252,.32)]" : pet.eligible ? "bg-violet-600/10 shadow-[0_0_18px_rgba(139,92,246,.18)]" : "bg-violet-200/[.04]"}`} />
                <span aria-hidden="true" className={`absolute top-[92px] h-3 w-20 max-w-[65%] rounded-[50%] blur-sm ${isSelected ? "bg-amber-200/38" : pet.eligible ? "bg-violet-400/20" : "bg-slate-300/10"}`} />
                {isSelected && <span className="absolute right-2.5 top-2 z-20 grid h-7 w-7 place-items-center rounded-full border border-amber-100/80 bg-amber-300 text-violet-950 shadow-[0_0_14px_#fcd34d]"><Check size={18} strokeWidth={3} /></span>}

                <img
                  src={pet.imageUrl || ""}
                  alt=""
                  className={`relative z-10 h-24 w-24 max-w-[78%] object-contain transition duration-200 ${pet.eligible ? "drop-shadow-[0_5px_6px_rgba(0,0,0,.85)] group-hover:scale-[1.03]" : "brightness-75 saturate-[.75] opacity-60 drop-shadow-[0_4px_5px_rgba(0,0,0,.75)]"}`}
                />
                <b className={`relative z-10 mt-1.5 block w-full truncate text-sm font-extrabold drop-shadow-[0_2px_3px_#000] min-[390px]:text-[15px] ${pet.eligible ? "text-violet-50" : "text-violet-100/70"}`}>{displayName}</b>
                <span className={`relative z-10 mt-0.5 block text-sm leading-tight ${pet.eligible ? "text-amber-300" : "text-amber-200/50"}`} aria-label={`${pet.rarity} star rarity`}>{"★".repeat(pet.rarity)}</span>
                <span className={`relative z-10 mt-1 block text-sm font-black ${pet.eligible ? "text-violet-50" : "text-violet-100/60"}`}>{pet.essenceValue.toLocaleString()} Essence</span>
              </button>

              {!pet.eligible && <div className="border-t border-violet-100/10 bg-black/20 px-2 pb-2.5 pt-2 text-center">
                <div className="flex min-h-5 items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[.08em] text-violet-100/75" title={pet.unavailableReason || undefined}>
                  <LockKeyhole size={12} className="shrink-0" />{blockedUi?.label || "Unavailable"}
                </div>
                {blockedUi?.route && blockedUi.actionLabel ? <button
                  type="button"
                  disabled={busy}
                  onClick={() => openBlockAction(blockedType)}
                  className="mt-1.5 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-lg border border-violet-300/20 bg-violet-400/10 px-2 text-[11px] font-bold text-violet-50 transition hover:bg-violet-400/20 active:scale-[.98] disabled:opacity-50"
                >
                  {blockedUi.actionLabel}<ChevronRight size={13} />
                </button> : <p className="mt-1 text-[10px] leading-snug text-violet-100/55">{pet.unavailableReason}</p>}
              </div>}
            </article>;
          })}
        </div>

        {!pets.length && <div className="mx-auto my-6 max-w-sm rounded-2xl border border-violet-300/15 bg-black/45 px-5 py-8 text-center text-violet-100 backdrop-blur-sm"><Sparkles className="mx-auto mb-3 text-violet-300" /><b>No souls are ready for exchange.</b><p className="mx-auto mt-2 text-sm leading-relaxed text-violet-100/70">Hatched pets that are not equipped, active, listed, or in use will appear here.</p></div>}
      </section>

      <div className="flex flex-none items-center gap-3 border-t border-violet-300/20 bg-[#07040b]/92 px-3 py-2.5 shadow-[0_-12px_30px_rgba(7,2,15,.8)] backdrop-blur-md sm:px-5">
        <div className="min-w-0 flex-1">
          <b className="block text-sm font-black text-violet-50">{selected.length} Selected</b>
          <span className={`text-sm font-black ${selected.length ? "text-amber-300" : "text-violet-200/55"}`}>{total.toLocaleString()} Essence</span>
        </div>
        <button disabled={!selected.length || busy} onClick={() => setConfirm(true)} className="min-h-12 shrink-0 rounded-xl border border-amber-200/30 bg-gradient-to-r from-[#254c31] via-[#2f6240] to-[#254c31] px-4 text-sm font-black text-amber-50 shadow-[0_0_18px_rgba(217,170,65,.18)] transition active:scale-[.98] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-none disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none sm:px-6">Exchange Selected</button>
      </div>
    </main>

    {confirm && selected.length > 0 && <div role="alertdialog" aria-modal="true" aria-labelledby="soul-confirm-title" className="absolute inset-0 z-30 flex items-center justify-center bg-black/82 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border-2 border-violet-300/55 bg-[radial-gradient(circle_at_top,#351454,#160929_55%)] p-5 text-center shadow-[0_0_40px_#6d28d955]">
        <h2 id="soul-confirm-title" className="font-fantasy text-xl font-black text-violet-100">Release {selected.length} {selected.length === 1 ? "pet" : "pets"} to the Soul Exchange?</h2>
        <p className="my-3 text-sm font-semibold text-rose-100">This is permanent. These pets will leave your inventory.</p>
        <ul className="mx-auto mb-3 max-h-24 overflow-y-auto text-sm text-violet-200">{selected.map(pet => <li key={pet.inventoryId}>{pet.nickname || pet.name} · {pet.rarity}★</li>)}</ul>
        <p className="text-sm text-violet-100">You will receive:<b className="mt-1 block text-2xl text-amber-300">{total.toLocaleString()} Essence</b></p>
        <div className="mt-5 grid grid-cols-2 gap-3"><button disabled={busy} onClick={() => setConfirm(false)} className="min-h-12 rounded-xl border border-violet-200/50 bg-black/20 font-bold">Cancel</button><button disabled={busy} onClick={() => void exchange()} className="min-h-12 rounded-xl border border-amber-200/30 bg-[#2f6240] font-black text-amber-50 shadow-[0_0_18px_rgba(217,170,65,.18)] disabled:opacity-50">{busy ? "Exchanging…" : "Exchange Pets"}</button></div>
      </div>
    </div>}
    <style>{`@keyframes soul-success{50%{filter:brightness(1.65);transform:scale(1.08)}}@keyframes soul-mote{0%{opacity:0;transform:translate3d(0,10px,0) scale(.65)}32%{opacity:.95}100%{opacity:0;transform:translate3d(0,-46px,0) scale(1.15)}}.soul-exchange-success{animation:soul-success .65s ease-out}.soul-selected-mote{position:absolute;z-index:20;height:4px;width:4px;border-radius:9999px;background:#fef3c7;box-shadow:0 0 8px #fde68a,0 0 14px #a78bfa;animation:soul-mote 1.8s ease-in-out infinite;pointer-events:none}@media(prefers-reduced-motion:reduce){.soul-exchange-zone,.soul-exchange-success,.soul-selected-mote{animation:none!important;transition:none!important}.soul-exchange-zone *{transition:none!important}}`}</style>
  </div>;
}
