import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LockKeyhole, Sparkles, X } from "lucide-react";
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
      <img aria-hidden="true" src={backgroundUrl} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-xl" />
      <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
    </>}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(126,34,206,.08),rgba(7,2,15,.18)_42%,rgba(7,2,15,.92)_100%)]" />
    <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#07020f] via-[#0d0618]/92 to-transparent" />

    <main className="relative z-10 flex h-full min-w-0 flex-col overflow-hidden pb-[max(8px,env(safe-area-inset-bottom))] pt-[max(10px,env(safe-area-inset-top))]">
      <header className="flex flex-none items-start gap-2 px-4 pb-1 sm:px-6">
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="font-fantasy text-[22px] font-black tracking-[.06em] text-violet-50 drop-shadow-[0_2px_8px_#000] sm:text-3xl">The Soul Exchange</h1>
          <p className="text-xs text-violet-100/75 drop-shadow-[0_1px_4px_#000] min-[390px]:text-sm">Release companions into the violet beyond.</p>
        </div>
        <span className="mt-1 flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200/35 bg-black/55 px-2.5 font-black text-amber-100 shadow-[0_0_18px_rgba(139,92,246,.22)] backdrop-blur-sm">
          <img src={currencyAssets.essenceToken} alt="Essence" className="h-7 w-7" />{essence.toLocaleString()}
        </span>
        <button onClick={onClose} aria-label="Close Soul Exchange" className="mt-1 grid min-h-11 min-w-11 place-items-center rounded-full border border-violet-100/45 bg-black/55 shadow-lg backdrop-blur-sm active:scale-95"><X /></button>
      </header>

      <section aria-label="Magical Soul Exchange area" className={`soul-exchange-zone relative mx-auto flex h-24 w-36 flex-none items-center justify-center sm:h-32 sm:w-48 ${pulse ? "soul-exchange-success" : ""}`}>
        <img src="/world-assets/worlds/haunted_woods/soul-exchange-portal.svg" alt="Glowing violet soul orbs" className="h-full w-full object-contain drop-shadow-[0_0_18px_rgba(168,85,247,.5)]" />
        {gain !== null && <b aria-live="polite" className="absolute rounded-full border border-violet-100/60 bg-violet-100 px-4 py-2 text-violet-950 shadow-[0_0_25px_#c4b5fd]">+{gain.toLocaleString()} Essence</b>}
      </section>

      <section className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-2 sm:px-5">
        <div className="sticky top-0 z-10 mb-1 flex items-center justify-between gap-2 bg-gradient-to-b from-[#0a0412] via-[#0a0412]/92 to-transparent px-1 pb-3 pt-1">
          <h2 className="font-fantasy text-base font-bold tracking-wide text-violet-50 sm:text-lg">Choose hatched pets</h2>
          <span className="text-xs font-semibold text-violet-200/75">{eligibleCount} available</span>
        </div>
        {error && <p role="alert" className="mb-2 rounded-lg border border-rose-400/30 bg-red-950/85 p-2 text-sm text-red-100">{error}</p>}

        <div className="grid grid-cols-2 gap-x-2 gap-y-3 min-[520px]:grid-cols-3 sm:gap-x-4 sm:gap-y-5">
          {displayPets.map(pet => {
            const isSelected = selectedIds.has(pet.inventoryId);
            return <button
              key={pet.inventoryId}
              type="button"
              aria-pressed={isSelected}
              data-soul-availability={pet.eligible ? "available" : "unavailable"}
              disabled={!pet.eligible || busy}
              onClick={() => toggle(pet)}
              className={`group relative flex min-h-[184px] min-w-0 flex-col items-center justify-start px-1 py-1 text-center transition duration-200 ${pet.eligible ? "active:scale-[.97]" : "cursor-not-allowed"}`}
            >
              <span aria-hidden="true" className={`absolute top-3 h-28 w-28 max-w-[82%] rounded-full transition duration-200 ${isSelected ? "bg-violet-400/28 shadow-[0_0_30px_10px_rgba(192,132,252,.4)]" : pet.eligible ? "bg-violet-600/10 shadow-[0_0_20px_rgba(139,92,246,.2)]" : "bg-slate-400/5"}`} />
              <span aria-hidden="true" className={`absolute top-[105px] h-3 w-24 max-w-[72%] rounded-[50%] blur-sm ${isSelected ? "bg-amber-200/45" : pet.eligible ? "bg-violet-400/25" : "bg-slate-300/10"}`} />
              {isSelected && <span className="absolute right-3 top-2 z-20 grid h-7 w-7 place-items-center rounded-full border border-amber-100/80 bg-amber-300 text-violet-950 shadow-[0_0_14px_#fcd34d]"><Check size={18} strokeWidth={3} /></span>}

              <img
                src={pet.imageUrl || ""}
                alt=""
                className={`relative z-10 h-28 w-28 max-w-[82%] object-contain transition duration-200 ${pet.eligible ? "drop-shadow-[0_5px_6px_rgba(0,0,0,.85)] group-hover:scale-[1.03]" : "grayscale saturate-0 opacity-35 drop-shadow-[0_3px_4px_rgba(0,0,0,.7)]"}`}
              />
              <b className={`relative z-10 mt-1 block max-w-full truncate text-base drop-shadow-[0_2px_3px_#000] ${pet.eligible ? "text-violet-50" : "text-slate-400"}`}>{pet.nickname || pet.name}</b>
              <span className={`relative z-10 block leading-tight ${pet.eligible ? "text-amber-300" : "text-slate-500"}`} aria-label={`${pet.rarity} star rarity`}>{"★".repeat(pet.rarity)}</span>
              <span className={`relative z-10 block text-sm font-black ${pet.eligible ? "text-violet-100" : "text-slate-500"}`}>{pet.essenceValue.toLocaleString()} Essence</span>
              {!pet.eligible && <small className="relative z-10 mt-1 flex max-w-[170px] items-start justify-center gap-1 leading-tight text-slate-400"><LockKeyhole size={12} className="mt-px shrink-0" />{pet.unavailableReason}</small>}
            </button>;
          })}
        </div>

        {!pets.length && <div className="py-10 text-center text-violet-100"><Sparkles className="mx-auto mb-3 text-violet-300" /><b>No souls are ready for exchange.</b><p className="mx-auto mt-2 max-w-sm text-sm text-violet-200/70">Hatched pets that are not equipped, active, listed, or in use will appear here.</p></div>}
        {!!pets.length && !eligibleCount && <p className="py-5 text-center text-sm text-violet-100">No souls are ready for exchange. Greyed-out pets show what must be changed first.</p>}
      </section>

      <div className="flex flex-none items-center gap-3 border-t border-violet-300/20 bg-black/62 px-3 py-2.5 shadow-[0_-12px_30px_rgba(7,2,15,.75)] backdrop-blur-md sm:px-5">
        <div className="min-w-0 flex-1"><b className="block text-sm text-violet-100">{selected.length} {selected.length === 1 ? "pet" : "pets"} selected</b><span className="text-sm font-black text-amber-300">Total: {total.toLocaleString()} Essence</span></div>
        <button disabled={!selected.length || busy} onClick={() => setConfirm(true)} className="min-h-12 rounded-xl border border-fuchsia-300/30 bg-gradient-to-r from-violet-700 via-violet-600 to-fuchsia-700 px-4 text-sm font-black text-white shadow-[0_0_18px_rgba(168,85,247,.35)] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-45 sm:px-6">Exchange Selected Pets</button>
      </div>
    </main>

    {confirm && selected.length > 0 && <div role="alertdialog" aria-modal="true" aria-labelledby="soul-confirm-title" className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border-2 border-violet-300/70 bg-[radial-gradient(circle_at_top,#351454,#160929_55%)] p-5 text-center shadow-[0_0_40px_#6d28d955]">
        <h2 id="soul-confirm-title" className="font-fantasy text-xl font-black text-violet-100">Release {selected.length} {selected.length === 1 ? "pet" : "pets"} to the Soul Exchange?</h2>
        <p className="my-3 text-rose-100">These pets will permanently leave your inventory.</p>
        <ul className="mx-auto mb-3 max-h-24 overflow-y-auto text-sm text-violet-200">{selected.map(pet => <li key={pet.inventoryId}>{pet.nickname || pet.name} · {pet.rarity}★</li>)}</ul>
        <p>You will receive:<b className="mt-1 block text-2xl text-amber-300">{total.toLocaleString()} Essence</b></p>
        <div className="mt-5 grid grid-cols-2 gap-3"><button disabled={busy} onClick={() => setConfirm(false)} className="min-h-12 rounded-xl border border-violet-200/50 bg-black/20">Cancel</button><button disabled={busy} onClick={() => void exchange()} className="min-h-12 rounded-xl bg-violet-500 font-black shadow-[0_0_18px_rgba(139,92,246,.4)] disabled:opacity-50">{busy ? "Exchanging…" : "Exchange Pets"}</button></div>
      </div>
    </div>}
    <style>{`@keyframes soul-success{50%{filter:brightness(1.65);transform:scale(1.08)}}.soul-exchange-success{animation:soul-success .65s ease-out}@media(prefers-reduced-motion:reduce){.soul-exchange-zone,.soul-exchange-success{animation:none!important;transition:none!important}.soul-exchange-zone *{transition:none!important}}`}</style>
  </div>;
}
