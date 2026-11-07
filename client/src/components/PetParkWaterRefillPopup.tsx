import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Droplets, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

/** The actual inventory art is used here and in the garden's watering motion. */
type WateringPail = {
  inventoryId: string; name: string; imageUrl?: string | null;
  gardenWaterLeft?: number | null;
};
type RefillResult = { itemName: string; waterLeft: number; capacity: number };
type RefillStage = "checking" | "choose" | "filling" | "filled" | "empty" | "error";

/**
 * Player-only visual refill sequence for both decor water sources and water tiles.
 * The existing authenticated server transaction is the only authority on filling.
 * A single eligible pail starts automatically; multiple pails require a choice.
 */
export default function PetParkWaterRefillPopup({
  sourceId, pails, eligiblePails, inventoryLoading, onClose, onRefilled, reduceMotion,
}: {
  sourceId: string;
  pails: readonly WateringPail[];
  eligiblePails: readonly WateringPail[];
  inventoryLoading: boolean;
  onClose: () => void;
  onRefilled: () => void;
  reduceMotion: boolean;
}) {
  const [stage, setStage] = useState<RefillStage>("checking");
  const [activePail, setActivePail] = useState<WateringPail | null>(null);
  const [result, setResult] = useState<RefillResult | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);
  const startedAt = useRef(0);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (completionTimer.current) clearTimeout(completionTimer.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  const refill = useMutation({
    mutationFn: async (item: WateringPail) => {
      const response = await apiRequest("POST",
        `/api/pet-park/water-sources/${sourceId}/refill`, { inventoryId: item.inventoryId });
      return response.json() as Promise<RefillResult>;
    },
    onSuccess: (filled) => {
      // Do not show a successful fill before the server confirms it.
      onRefilled();
      completionTimer.current = setTimeout(() => {
        setResult(filled);
        setStage("filled");
        dismissTimer.current = setTimeout(onClose, reduceMotion ? 1400 : 2200);
      }, Math.max(0, (reduceMotion ? 0 : 850) - (Date.now() - startedAt.current)));
    },
    onError: (cause: Error) => {
      setError(cause.message);
      setStage("error");
    },
  });

  const beginFill = (item: WateringPail) => {
    if (started.current || refill.isPending) return;
    started.current = true;
    startedAt.current = Date.now();
    setActivePail(item);
    setError("");
    setStage("filling");
    refill.mutate(item);
  };

  useEffect(() => {
    if (stage !== "checking" || inventoryLoading || started.current) return;
    if (eligiblePails.length === 1) beginFill(eligiblePails[0]);
    else setStage(eligiblePails.length ? "choose" : "empty");
  }, [stage, inventoryLoading, eligiblePails]);

  const visiblePail = activePail ?? pails[0] ?? null;
  const showArt = (item: WateringPail | null, size: string) => item?.imageUrl
    ? <img data-testid="pet-park-refill-pail-image" src={item.imageUrl}
        alt={item.name} draggable={false} className={`pointer-events-none ${size} object-contain drop-shadow-[0_5px_5px_rgba(0,0,0,.4)]`} />
    : <Droplets aria-hidden="true" size={66} className="text-[#a9d9dc]" />;

  return <div data-testid="pet-park-refill-popup"
    className="pointer-events-auto absolute inset-0 z-[75] flex items-center justify-center px-4 py-5">
    <button type="button" aria-label="Close Water Source" className="absolute inset-0 bg-black/45"
      onClick={() => { if (!refill.isPending) onClose(); }} />
    <section role="dialog" aria-modal="true" aria-label="Refill Water"
      className="relative flex w-full max-w-[300px] flex-col items-center overflow-y-auto rounded-2xl border-2 border-[#d3b372] bg-[radial-gradient(ellipse_at_top,#326546,#122f22_78%)] px-4 py-4 text-center text-[#f6dfa8] shadow-[inset_0_0_0_2px_rgba(241,210,132,.12),0_14px_40px_rgba(0,0,0,.7)]"
      style={{ maxHeight: "min(86dvh, 490px)" }}>
      <button type="button" aria-label="Close refill popup" disabled={refill.isPending}
        onClick={onClose} className="absolute right-2 top-2 z-10 rounded-full border border-[#d3b372]/55 bg-[#173d2a] p-1.5 disabled:opacity-40">
        <X size={16} />
      </button>
      <p className="mb-1 text-[10px] uppercase tracking-[.15em] text-[#e2c783]/75">Pet Park</p>
      <h2 className="font-fantasy text-lg font-semibold">
        {stage === "filled" ? "Watering Pail Filled!" :
          stage === "filling" ? "Filling…" :
          stage === "error" ? "Refill interrupted" :
          stage === "choose" ? "Choose a Pail" :
          stage === "empty" ? "Watering Pail" : "Checking your pail…"}
      </h2>

      {stage === "choose" ? <div className="mt-3 grid w-full grid-cols-2 gap-2">
        {eligiblePails.map(item => <button type="button" key={item.inventoryId}
          data-testid="pet-park-refill-item" aria-label={`Fill ${item.name}`}
          onClick={() => beginFill(item)}
          className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-[#d4b97b]/60 bg-[#1c4631] p-2 active:bg-[#356147]">
          {showArt(item, "h-16 w-16")}
          <span className="mt-1 line-clamp-2 text-[11px] font-semibold">{item.name}</span>
          <span className="text-[10px] text-[#afc9b9]">{item.gardenWaterLeft ?? 0} / 100</span>
        </button>)}
      </div> : <>
        <div className="relative mt-3 flex h-[142px] w-[158px] items-center justify-center"
          data-testid="pet-park-refill-animation" data-stage={stage}>
          {(stage === "filling" || stage === "filled") && <div aria-hidden="true"
            className="pet-park-refill-drops pointer-events-none absolute inset-0 z-[1]">
            <i/><i/><i/>
          </div>}
          <div className={stage === "filling" && !reduceMotion ? "pet-park-refill-pail-motion" : ""}>
            {showArt(visiblePail, "h-[120px] w-[126px]")}
          </div>
          {stage === "filled" && <span aria-hidden="true"
            className="absolute bottom-1 right-0 z-[2] flex h-9 w-9 items-center justify-center rounded-full border border-[#f7dd98] bg-[#285d3d] text-[#f5df96] shadow-[0_0_14px_rgba(233,203,117,.4)]">
            <Check size={22} strokeWidth={2.5} />
          </span>}
        </div>
        {stage === "filling" && <div role="status" aria-live="polite" className="w-full">
          <p className="mb-2 font-fantasy text-sm">Filling watering pail…</p>
          <div role="progressbar" aria-label="Watering pail filling"
            className="h-2.5 overflow-hidden rounded-full border border-[#a7d6c8]/65 bg-[#0d312b]">
            <div className={reduceMotion ? "h-full w-1/2 rounded-full bg-[#8fcbcd]" :
              "pet-park-refill-meter h-full rounded-full bg-gradient-to-r from-[#438e9e] to-[#b8e6df]"} />
          </div>
        </div>}
        {stage === "filled" && <div data-testid="pet-park-refill-complete" role="status" aria-live="polite">
          <p className="font-fantasy text-sm text-[#f8e3ad]">{activePail?.name ?? "Watering Pail"}</p>
          <p className="mt-1 text-xs text-[#b5ddd1]">{result?.waterLeft} / {result?.capacity} drops</p>
        </div>}
        {stage === "checking" && <p role="status" className="text-xs text-[#c0d6bf]">Finding your watering pail…</p>}
        {stage === "empty" && <div data-testid="pet-park-refill-empty" role="status" className="text-xs text-[#e4d5ad]">
          {pails.some(item => (item.gardenWaterLeft ?? 0) >= 100)
            ? "Your watering pail is already full."
            : "No refillable watering pail is ready."}
        </div>}
        {stage === "error" && <div className="w-full">
          <p role="alert" className="mb-2 text-xs text-[#ffceba]">{error || "Could not fill your pail."}</p>
          <button type="button" data-testid="pet-park-refill-retry" className="rounded-lg border border-[#d4b97b]/60 bg-[#285c40] px-4 py-2 text-xs"
            onClick={() => { if (!activePail) return; started.current = false; beginFill(activePail); }}>Try again</button>
        </div>}
      </>}
      {(stage === "filled" || stage === "empty") && <button type="button"
        aria-label="Done refilling" className="mt-3 rounded-full border border-[#d3b372]/55 bg-[#264d36] px-5 py-1.5 text-xs"
        onClick={onClose}>Done</button>}
    </section>
  </div>;
}
