import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, LockKeyhole, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { setNavHidden } from "@/lib/navVisibility";
import seButton from "@assets/uploads/SE-Button.png";
import seEssenceBalance from "@assets/uploads/SE-EssenceBal.png";
import seLogo from "@assets/uploads/SE-Logo.png";
import sePetCard from "@assets/uploads/SE-PetCard.png";
import seClose from "@assets/uploads/SE-Close.png";
import seBackground from "@assets/uploads/SEBG1?url";

type Pet = {
  inventoryId: string;
  name: string;
  nickname?: string | null;
  imageUrl?: string | null;
  rarity: number;
  essenceValue: number;
  eligible: boolean;
  unavailableReason?: string | null;
};

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

export default function SoulExchangeOverlay({
  backgroundUrl,
  onClose,
}: {
  backgroundUrl: string | null;
  onClose: () => void;
}) {
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
    setNavHidden(true);
    return () => setNavHidden(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/soul-exchange/pets", { credentials: "include" })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "Could not hear the waiting souls.");
        if (active) {
          setPets(body.pets);
          setEssence(body.essence);
        }
      })
      .catch(reason => active && setError(reason instanceof Error ? reason.message : "Could not hear the waiting souls."));
    return () => {
      active = false;
    };
  }, []);

  const displayPets = useMemo(
    () => [...pets].sort((a, b) => Number(b.eligible) - Number(a.eligible)),
    [pets],
  );
  const selected = useMemo(() => pets.filter(pet => selectedIds.has(pet.inventoryId)), [pets, selectedIds]);
  const total = selected.reduce((sum, pet) => sum + pet.essenceValue, 0);
  const eligibleCount = pets.filter(pet => pet.eligible).length;
  const sceneBackground = seBackground || backgroundUrl || "";

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
    setBusy(true);
    setError("");
    actionId.current ||= crypto.randomUUID();

    try {
      const response = await fetch("/api/soul-exchange/exchange", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petInventoryIds: selected.map(pet => pet.inventoryId),
          exchangeActionId: actionId.current,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "The ritual could not be completed.");

      const exchanged = new Set<string>(body.exchangedPets.map((pet: Pet) => pet.inventoryId));
      setConfirm(false);
      setGain(body.essenceAwarded);
      setEssence(body.newEssenceBalance);
      setPulse(true);
      setPets(current => current.filter(pet => !exchanged.has(pet.inventoryId)));
      setSelectedIds(new Set());
      actionId.current = null;
      window.setTimeout(() => setPulse(false), 700);
      window.setTimeout(() => setGain(null), 2200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The ritual failed safely.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] overflow-hidden bg-[#05030b] text-white">
      <img
        src={sceneBackground}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,2,8,.18)_0%,rgba(3,2,10,.12)_32%,rgba(5,3,12,.7)_72%,rgba(3,2,8,.96)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(120,48,210,.08),transparent_42%)]" />

      <main className="relative z-10 mx-auto flex h-full w-full max-w-3xl min-w-0 flex-col overflow-hidden pb-[max(8px,env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))]">
        <header className="relative flex-none px-3 pb-1 pt-1 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Soul Exchange"
            className="absolute right-3 top-1 z-30 h-12 w-12 transition active:scale-95 sm:right-5 sm:h-14 sm:w-14"
          >
            <img src={seClose} alt="" aria-hidden="true" className="h-full w-full object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,.7)]" />
          </button>

          <div className={`soul-exchange-zone mx-auto flex w-[84%] max-w-xl flex-col items-center text-center ${pulse ? "soul-exchange-success" : ""}`}>
            <img
              src={seLogo}
              alt=""
              aria-hidden="true"
              className="h-12 w-12 object-contain drop-shadow-[0_0_14px_rgba(168,85,247,.48)] sm:h-16 sm:w-16"
            />
            <h1 className="font-fantasy text-[clamp(1.8rem,7vw,3.2rem)] font-black uppercase leading-[.95] tracking-[.045em] text-[#f6ead1] drop-shadow-[0_3px_10px_#000]">
              SOUL EXCHANGE
            </h1>
            <div aria-hidden="true" className="mt-1.5 flex w-[70%] items-center gap-2">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#c79b50] to-[#c79b50]" />
              <span className="h-2 w-2 rotate-45 border border-[#d5aa62] bg-violet-600 shadow-[0_0_10px_#a855f7]" />
              <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#c79b50] to-[#c79b50]" />
            </div>
            <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-violet-50/80 drop-shadow-[0_2px_4px_#000] min-[390px]:text-xs sm:text-sm">
              Release companions into the violet beyond.
            </p>
          </div>

          <div className="mt-1 flex min-h-11 items-center justify-end pr-1 sm:min-h-14">
            <div className="relative w-[150px] min-[390px]:w-[170px] sm:w-[195px]" aria-label={`${essence.toLocaleString()} Essence`}>
              <img src={seEssenceBalance} alt="" aria-hidden="true" className="w-full object-contain drop-shadow-[0_5px_12px_rgba(0,0,0,.65)]" />
              <span className="absolute bottom-0 left-[37%] right-[7%] top-0 flex items-center justify-center pl-1 text-[clamp(.95rem,4vw,1.35rem)] font-black text-[#f8e8c3] drop-shadow-[0_2px_3px_#000]">
                {essence.toLocaleString()}
              </span>
            </div>
          </div>

          {gain !== null && (
            <b
              aria-live="polite"
              className="absolute bottom-0 left-1/2 z-30 -translate-x-1/2 rounded-full border border-violet-200/60 bg-[#171020]/95 px-4 py-1.5 text-xs text-violet-50 shadow-[0_0_24px_rgba(168,85,247,.55)]"
            >
              +{gain.toLocaleString()} Essence
            </b>
          )}
        </header>

        <section className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 sm:px-5">
          <div className="mx-auto w-full max-w-[700px] rounded-2xl border border-[#b88b48]/70 bg-[#080912]/95 p-3 shadow-[0_12px_34px_rgba(0,0,0,.6),0_0_22px_rgba(88,28,135,.18),inset_0_0_26px_rgba(75,34,110,.11)] backdrop-blur-[2px] sm:p-4">
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 font-fantasy text-[15px] font-black uppercase tracking-[.035em] text-[#e4c58b] min-[390px]:text-base sm:text-xl">
                  CHOOSE HATCHED PETS
                </h2>
                <span className="shrink-0 rounded-full border border-violet-400/55 bg-[#24113a]/85 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.08em] text-violet-100 shadow-[inset_0_0_12px_rgba(139,92,246,.18)] min-[390px]:text-[10px] sm:text-xs">
                  {eligibleCount} Eligible
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-violet-50/[.72] min-[390px]:text-[11px] sm:text-sm">
                Select eligible pets to release permanently for Essence.
                <span className="block">Protected pets show what to change first.</span>
              </p>
            </div>

            {error && (
              <p role="alert" className="mb-3 rounded-lg border border-rose-400/30 bg-red-950/90 p-2.5 text-sm text-red-100">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
              {displayPets.map(pet => {
                const isSelected = selectedIds.has(pet.inventoryId);
                const blockedType = pet.eligible ? null : getBlockedType(pet.unavailableReason);
                const blockedUi = blockedType ? BLOCK_UI[blockedType] : null;
                const displayName = pet.nickname || pet.name;

                return (
                  <article
                    key={pet.inventoryId}
                    data-soul-card={pet.eligible ? "available" : "unavailable"}
                    className={`relative aspect-[3/4] min-w-0 overflow-hidden rounded-2xl border backdrop-blur transition duration-200 ${
                      isSelected
                        ? "border-amber-300/80 shadow-[0_0_24px_rgba(251,191,36,.26)]"
                        : pet.eligible
                          ? "border-violet-300/10 shadow-[0_7px_18px_rgba(0,0,0,.34)]"
                          : "border-violet-200/5 shadow-[0_6px_16px_rgba(0,0,0,.42)]"
                    }`}
                  >
                    <img src={sePetCard} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />

                    {isSelected && (
                      <>
                        <span aria-hidden="true" className="soul-selected-mote left-[24%] top-[46%]" />
                        <span aria-hidden="true" className="soul-selected-mote left-[52%] top-[41%] [animation-delay:.45s]" />
                        <span aria-hidden="true" className="soul-selected-mote left-[76%] top-[49%] [animation-delay:.9s]" />
                        <span className="absolute right-[8%] top-[7%] z-30 grid h-6 w-6 place-items-center rounded-full border border-amber-100/80 bg-amber-300 text-violet-950 shadow-[0_0_14px_#fcd34d] sm:h-7 sm:w-7">
                          <Check size={16} strokeWidth={3} />
                        </span>
                      </>
                    )}

                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${displayName}, ${pet.rarity} star rarity, ${pet.essenceValue.toLocaleString()} Essence${pet.eligible ? "" : `. ${pet.unavailableReason || "Unavailable"}`}`}
                      data-soul-availability={pet.eligible ? "available" : "unavailable"}
                      disabled={!pet.eligible || busy}
                      onClick={() => toggle(pet)}
                      className={`group absolute inset-x-[7%] top-[7%] z-20 flex h-[65%] min-w-0 flex-col items-center justify-start text-center outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-amber-200 ${
                        pet.eligible ? "active:scale-[.985]" : "cursor-not-allowed"
                      }`}
                    >
                      <img
                        src={pet.imageUrl || ""}
                        alt=""
                        className={`mt-[2%] h-[55%] w-[75%] object-contain transition duration-200 ${
                          pet.eligible
                            ? "drop-shadow-[0_5px_6px_rgba(0,0,0,.85)] group-hover:scale-[1.03]"
                            : "brightness-75 saturate-[.75] opacity-60 drop-shadow-[0_4px_5px_rgba(0,0,0,.78)]"
                        }`}
                      />
                      <b className={`mt-[2%] block w-[92%] truncate font-fantasy text-[11px] font-black leading-tight drop-shadow-[0_2px_3px_#000] min-[390px]:text-xs sm:text-base ${pet.eligible ? "text-violet-50" : "text-violet-100/[.72]"}`}>
                        {displayName}
                      </b>
                      <span className={`mt-0.5 block text-[10px] leading-none min-[390px]:text-[11px] sm:text-sm ${pet.eligible ? "text-amber-300" : "text-amber-200/55"}`} aria-label={`${pet.rarity} star rarity`}>
                        {"★".repeat(pet.rarity)}
                      </span>
                      <span className={`mt-1 block text-[10px] font-black min-[390px]:text-[11px] sm:text-sm ${pet.eligible ? "text-violet-50" : "text-violet-100/[.65]"}`}>
                        {pet.essenceValue.toLocaleString()} Essence
                      </span>
                    </button>

                    <div className="absolute inset-x-[9%] bottom-[13.5%] z-20 flex h-[8%] items-center justify-center text-center">
                      {pet.eligible ? (
                        <span className={`text-[8px] font-black uppercase tracking-[.1em] min-[390px]:text-[9px] sm:text-xs ${isSelected ? "text-amber-200" : "text-violet-100/[.72]"}`}>
                          {isSelected ? "Selected" : "Available"}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-[8px] font-black uppercase tracking-[.08em] text-[#d9bd82] min-[390px]:text-[9px] sm:text-xs" title={pet.unavailableReason || undefined}>
                          <LockKeyhole size={11} className="shrink-0" />
                          {blockedUi?.label || "Unavailable"}
                        </span>
                      )}
                    </div>

                    {pet.eligible ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggle(pet)}
                        className="absolute bottom-[3.4%] left-[12%] right-[12%] z-30 flex h-[9.5%] items-center justify-center text-[9px] font-black text-violet-50 drop-shadow-[0_2px_3px_#000] transition active:scale-[.97] disabled:opacity-50 min-[390px]:text-[10px] sm:text-sm"
                      >
                        {isSelected ? "Selected" : "Select Pet"}
                      </button>
                    ) : blockedUi?.route && blockedUi.actionLabel ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openBlockAction(blockedType)}
                        className="absolute bottom-[3.4%] left-[10%] right-[10%] z-30 flex h-[9.5%] items-center justify-center gap-0.5 truncate px-1 text-[8px] font-black text-violet-50 drop-shadow-[0_2px_3px_#000] transition active:scale-[.97] disabled:opacity-50 min-[390px]:text-[9px] sm:text-xs"
                      >
                        <span className="truncate">{blockedUi.actionLabel}</span>
                        <ChevronRight size={12} className="shrink-0" />
                      </button>
                    ) : (
                      <p className="absolute bottom-[3.5%] left-[10%] right-[10%] z-30 line-clamp-2 text-center text-[7px] leading-tight text-violet-100/[.58] min-[390px]:text-[8px] sm:text-[10px]">
                        {pet.unavailableReason}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>

            {!pets.length && (
              <div className="mx-auto my-6 max-w-sm rounded-2xl border border-violet-300/15 bg-black/55 px-5 py-8 text-center text-violet-100 backdrop-blur-sm">
                <Sparkles className="mx-auto mb-3 text-violet-300" />
                <b>No souls are ready for exchange.</b>
                <p className="mx-auto mt-2 text-sm leading-relaxed text-violet-100/70">
                  Hatched pets that are not equipped, active, listed, or in use will appear here.
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="flex-none px-3 pb-1 sm:px-5">
          <div className="relative mx-auto flex min-h-[72px] w-full max-w-[700px] items-center gap-2 overflow-hidden rounded-xl border border-[#b98b49]/70 bg-[#070811]/95 px-2.5 py-2 shadow-[0_-8px_26px_rgba(0,0,0,.72),inset_0_0_18px_rgba(83,45,116,.12)] sm:min-h-[88px] sm:px-4">
            <img src={seLogo} alt="" aria-hidden="true" className="h-11 w-11 shrink-0 object-contain opacity-90 drop-shadow-[0_0_12px_rgba(168,85,247,.38)] sm:h-14 sm:w-14" />
            <div className="min-w-0 flex-1">
              <b className="block text-[11px] font-black text-violet-50 min-[390px]:text-xs sm:text-base">
                {selected.length} Selected
              </b>
              <span className={`mt-0.5 block text-[11px] font-black min-[390px]:text-xs sm:text-base ${selected.length ? "text-[#e8c77f]" : "text-violet-200/55"}`}>
                {total.toLocaleString()} Essence
              </span>
            </div>

            <button
              type="button"
              disabled={!selected.length || busy}
              onClick={() => setConfirm(true)}
              className="relative aspect-[3/1] w-[44%] max-w-[250px] shrink-0 transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <img src={seButton} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-fill" />
              <span className="relative z-10 px-2 text-[9px] font-black uppercase tracking-[.025em] text-[#f1e5d0] drop-shadow-[0_2px_3px_#000] min-[390px]:text-[10px] sm:text-sm">
                Exchange Selected
              </span>
            </button>
          </div>
        </footer>
      </main>

      {confirm && selected.length > 0 && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="soul-confirm-title"
          className="absolute inset-0 z-[140] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#c69a54]/70 bg-[radial-gradient(circle_at_top,#301044,#090711_62%)] p-5 text-center shadow-[0_0_42px_rgba(109,40,217,.38)]">
            <img src={seLogo} alt="" aria-hidden="true" className="mx-auto mb-1 h-14 w-14 object-contain" />
            <h2 id="soul-confirm-title" className="font-fantasy text-xl font-black text-[#ead3a3]">
              Release {selected.length} {selected.length === 1 ? "pet" : "pets"} to the Soul Exchange?
            </h2>
            <p className="my-3 text-sm font-semibold text-rose-100">
              This is permanent. These pets will leave your inventory.
            </p>
            <ul className="mx-auto mb-3 max-h-24 overflow-y-auto text-sm text-violet-200">
              {selected.map(pet => (
                <li key={pet.inventoryId}>
                  {pet.nickname || pet.name} · {pet.rarity}★
                </li>
              ))}
            </ul>
            <p className="text-sm text-violet-100">
              You will receive:
              <b className="mt-1 block text-2xl text-amber-300">{total.toLocaleString()} Essence</b>
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
                className="min-h-12 rounded-xl border border-violet-200/35 bg-black/30 font-bold text-violet-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void exchange()}
                className="relative min-h-12 overflow-hidden rounded-xl font-black text-[#f4e7cf] disabled:opacity-50"
              >
                <img src={seButton} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-fill" />
                <span className="relative z-10">{busy ? "Exchanging…" : "Exchange Pets"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes soul-success {
          50% { filter: brightness(1.45); transform: scale(1.035); }
        }
        @keyframes soul-mote {
          0% { opacity: 0; transform: translate3d(0,10px,0) scale(.65); }
          32% { opacity: .95; }
          100% { opacity: 0; transform: translate3d(0,-42px,0) scale(1.15); }
        }
        .soul-exchange-success { animation: soul-success .65s ease-out; }
        .soul-selected-mote {
          position: absolute;
          z-index: 20;
          height: 4px;
          width: 4px;
          border-radius: 9999px;
          background: #fef3c7;
          box-shadow: 0 0 8px #fde68a, 0 0 14px #a78bfa;
          animation: soul-mote 1.8s ease-in-out infinite;
          pointer-events: none;
        }
        @media (prefers-reduced-motion:reduce) {
          .soul-exchange-zone,
          .soul-exchange-success,
          .soul-selected-mote {
            animation: none !important;
            transition: none !important;
          }
          .soul-exchange-zone * {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
