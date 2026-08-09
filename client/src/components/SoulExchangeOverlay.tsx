import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { currencyAssets } from "@/lib/currencyAssets";

type Pet = { inventoryId: string; name: string; nickname?: string | null; imageUrl?: string | null; rarity: number; essenceValue: number; eligible: boolean; unavailableReason?: string | null };

export default function SoulExchangeOverlay({ backgroundUrl, onClose }: { backgroundUrl: string | null; onClose: () => void }) {
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

  return <div className="fixed inset-0 z-50 mx-auto max-w-3xl overflow-hidden bg-[#090314] text-white">
    {backgroundUrl && <>
      <img aria-hidden="true" src={backgroundUrl} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-lg" />
      <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
    </>}
    <div className="absolute inset-0 bg-gradient-to-b from-[#090314]/85 via-[#190b2b]/20 to-[#090314]/95" />
    <main className="relative z-10 flex h-full min-w-0 flex-col gap-2 overflow-hidden px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] sm:gap-3 sm:px-5">
      <header className="flex flex-none items-center gap-2 rounded-2xl border border-violet-300/30 bg-black/50 p-3 backdrop-blur-sm">
        <div className="min-w-0 flex-1"><h1 className="font-fantasy text-lg font-black tracking-wider text-violet-100 sm:text-2xl">The Soul Exchange</h1><p className="hidden text-xs text-violet-200/70 min-[390px]:block">Release companions into the violet beyond.</p></div>
        <span className="flex items-center gap-1 whitespace-nowrap font-black text-amber-200"><img src={currencyAssets.essenceToken} alt="Essence" className="h-7 w-7" />{essence.toLocaleString()}</span>
        <button onClick={onClose} aria-label="Close Soul Exchange" className="grid min-h-11 min-w-11 place-items-center rounded-full border border-violet-200/40 bg-black/50"><X /></button>
      </header>

      <section aria-label="Magical Soul Exchange area" className={`soul-exchange-zone relative mx-auto flex h-28 w-40 flex-none items-center justify-center sm:h-36 sm:w-52 ${pulse ? "soul-exchange-success" : ""}`}>
        <img src="/world-assets/worlds/haunted_woods/soul-exchange-portal.svg" alt="Sparkling Soul Exchange" className="h-full w-full object-contain" />
        {gain !== null && <b aria-live="polite" className="absolute rounded-full border border-violet-100/60 bg-violet-100 px-4 py-2 text-violet-950 shadow-[0_0_25px_#c4b5fd]">+{gain.toLocaleString()} Essence</b>}
      </section>

      <section className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl border border-violet-300/25 bg-[#140b26]/70 p-3 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-bold text-violet-100">Choose hatched pets</h2><span className="text-xs text-violet-200/70">{eligibleCount} available</span></div>
        {error && <p role="alert" className="mb-2 rounded-lg border border-rose-400/30 bg-red-950/85 p-2 text-sm text-red-100">{error}</p>}
        <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3 sm:gap-3">
          {pets.map(pet => {
            const isSelected = selectedIds.has(pet.inventoryId);
            return <button key={pet.inventoryId} type="button" aria-pressed={isSelected} disabled={!pet.eligible || busy} onClick={() => toggle(pet)} className={`relative min-h-44 min-w-0 rounded-xl border p-2 text-center transition active:scale-[.98] ${isSelected ? "border-amber-300 bg-violet-700/70 shadow-[0_0_18px_#8b5cf6]" : "border-violet-300/25 bg-black/40"} disabled:cursor-not-allowed disabled:opacity-65`}>
              {isSelected && <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-amber-300 text-violet-950 shadow-lg"><Check size={18} strokeWidth={3} /></span>}
              <img src={pet.imageUrl || ""} alt="" className="mx-auto h-20 w-20 max-w-full object-contain" />
              <b className="block truncate text-violet-50">{pet.nickname || pet.name}</b>
              <span className="block text-amber-300" aria-label={`${pet.rarity} star rarity`}>{"★".repeat(pet.rarity)}</span>
              <span className="block text-sm font-bold text-violet-100">{pet.essenceValue.toLocaleString()} Essence</span>
              {!pet.eligible && <small className="mt-1 block leading-tight text-rose-200">{pet.unavailableReason}</small>}
            </button>;
          })}
        </div>
        {!pets.length && <div className="py-10 text-center text-violet-100"><Sparkles className="mx-auto mb-3 text-violet-300" /><b>No souls are ready for exchange.</b><p className="mx-auto mt-2 max-w-sm text-sm text-violet-200/70">Hatched pets that are not equipped, active, listed, or in use will appear here.</p></div>}
        {!!pets.length && !eligibleCount && <p className="py-5 text-center text-sm text-violet-100">No souls are ready for exchange. Each pet card explains what must be changed first.</p>}
      </section>

      <div className="flex flex-none items-center gap-3 rounded-xl border border-violet-300/25 bg-black/65 p-2.5 backdrop-blur-sm">
        <div className="min-w-0 flex-1"><b className="block text-sm text-violet-100">{selected.length} {selected.length === 1 ? "pet" : "pets"} selected</b><span className="text-sm font-black text-amber-300">Total: {total.toLocaleString()} Essence</span></div>
        <button disabled={!selected.length || busy} onClick={() => setConfirm(true)} className="min-h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-black shadow-lg disabled:opacity-45 sm:px-6">Exchange Selected Pets</button>
      </div>
    </main>

    {confirm && selected.length > 0 && <div role="alertdialog" aria-modal="true" aria-labelledby="soul-confirm-title" className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl border-2 border-violet-300/70 bg-[#160929]/95 p-5 text-center shadow-[0_0_40px_#6d28d955]">
        <h2 id="soul-confirm-title" className="text-xl font-black text-violet-100">Release {selected.length} {selected.length === 1 ? "pet" : "pets"} to the Soul Exchange?</h2>
        <p className="my-3 text-rose-100">These pets will permanently leave your inventory.</p>
        <ul className="mx-auto mb-3 max-h-24 overflow-y-auto text-sm text-violet-200">{selected.map(pet => <li key={pet.inventoryId}>{pet.nickname || pet.name} · {pet.rarity}★</li>)}</ul>
        <p>You will receive:<b className="mt-1 block text-2xl text-amber-300">{total.toLocaleString()} Essence</b></p>
        <div className="mt-5 grid grid-cols-2 gap-3"><button disabled={busy} onClick={() => setConfirm(false)} className="min-h-12 rounded-xl border border-violet-200/50">Cancel</button><button disabled={busy} onClick={() => void exchange()} className="min-h-12 rounded-xl bg-violet-500 font-black disabled:opacity-50">{busy ? "Exchanging…" : "Exchange Pets"}</button></div>
      </div>
    </div>}
    <style>{`@keyframes soul-success{50%{filter:brightness(1.65);transform:scale(1.08)}}.soul-exchange-success{animation:soul-success .65s ease-out}@media(prefers-reduced-motion:reduce){.soul-exchange-zone,.soul-exchange-success{animation:none!important;transition:none!important}}`}</style>
  </div>;
}
