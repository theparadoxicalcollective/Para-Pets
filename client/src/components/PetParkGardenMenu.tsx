import { useEffect, useState } from "react";
import { Droplets, Leaf, Scissors, Shovel, Sprout, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import {
  gardenActionForPlot, gardenCropProgress,
  type GardenActionResult, type GardenPlayerAction,
  type GardenPlayerCrop, type GardenPlayerPlot,
} from "@shared/garden";

export type GardenOwnedItem = {
  inventoryId: string; shopItemId: string; name: string;
  type?: string; specialType?: string | null; imageUrl?: string | null;
  isListed?: boolean; quantity?: number; gardenWaterLeft?: number | null;
};
type Request = { action: GardenPlayerAction; inventoryId: string; requestId: string };
type Props = {
  plot: GardenPlayerPlot;
  crops: readonly GardenPlayerCrop[];
  inventory: readonly GardenOwnedItem[];
  inventoryLoading: boolean;
  onClose: () => void;
  onChanged: () => void;
};
const actionNames: Record<GardenPlayerAction, string> = {
  hoe: "Hoe", plant: "Plant", water: "Water", harvest: "Harvest",
};
const tools: Record<Exclude<GardenPlayerAction, "plant">, string> = {
  hoe: "hoe", water: "watering_pail", harvest: "scythe",
};
function eligibleItem(item: GardenOwnedItem, action: GardenPlayerAction,
  crops: readonly GardenPlayerCrop[]): boolean {
  if (item.isListed || (item.quantity ?? 0) <= 0) return false;
  if (action === "plant") return item.type === "garden_seed" &&
    crops.some(crop => crop.ready && crop.seedItemId === item.shopItemId);
  return item.type === "garden_tool" && item.specialType === tools[action] &&
    (action !== "water" || (item.gardenWaterLeft ?? 100) > 0);
}

/** A single viewport-sized, accessible choice surface. The buttons form a
 * radial menu but reuse Pet Park's existing modal and inventory APIs rather
 * than inventing a second scene, tool belt or positioning system. */
export default function PetParkGardenMenu({ plot, crops, inventory, inventoryLoading, onClose, onChanged }: Props) {
  const suggested = gardenActionForPlot(plot);
  const [chosenAction, setChosenAction] = useState<GardenPlayerAction | null>(null);
  const [retry, setRetry] = useState<Request | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastReward, setLastReward] = useState<{ quantity: number; fruitName: string; imageUrl: string | null } | null>(null);
  const activeCrop = crops.find(crop => crop.id === plot.cropId);
  const progress = gardenCropProgress(plot, activeCrop);
  const action = chosenAction && suggested === chosenAction ? chosenAction : suggested;
  const eligible = action ? inventory.filter(item => eligibleItem(item, action, crops)) : [];
  const mutation = useMutation({
    mutationFn: async (request: Request) => {
      const response = await apiRequest("POST",
        `/api/pet-park/garden/plots/${encodeURIComponent(plot.plotItemId)}/${request.action}`,
        { requestId: request.requestId, inventoryId: request.inventoryId });
      return response.json() as Promise<GardenActionResult>;
    },
    onSuccess: result => {
      setRetry(null);
      setErrorMessage(null);
      onChanged();
      if (result.reward) {
        const crop = crops.find(entry => entry.fruitItemId === result.reward?.fruitItemId);
        setLastReward({
          quantity: result.reward.quantity, fruitName: crop?.fruitName ?? "Fruit",
          imageUrl: crop?.images.fruit ?? null,
        });
      } else {
        setChosenAction(null);
      }
    },
    onError: (error: Error) => {
      // The server may have committed before a mobile connection dropped.
      // Keep the SAME request ID for an explicit retry, never mint a second
      // seed debit or fruit award. A conflict re-reads the authoritative state.
      setErrorMessage(error.message || "Unable to use that item");
      onChanged();
    },
  });
  useEffect(() => {
    setChosenAction(null);
    setRetry(null);
    setErrorMessage(null);
  }, [plot.plotItemId, plot.phase, plot.waterApplied, plot.harvestReady]);
  const submit = (inventoryId: string) => {
    if (!action || mutation.isPending) return;
    const pending = retry?.action === action && retry.inventoryId === inventoryId
      ? retry : { action, inventoryId, requestId: crypto.randomUUID() };
    setRetry(pending);
    setErrorMessage(null);
    mutation.mutate(pending);
  };
  const buttons: Array<{ action: GardenPlayerAction; Icon: typeof Shovel; placement: string }> = [
    { action: "hoe", Icon: Shovel, placement: "left-1/2 top-0 -translate-x-1/2" },
    { action: "plant", Icon: Sprout, placement: "right-0 top-1/2 -translate-y-1/2" },
    { action: "water", Icon: Droplets, placement: "left-1/2 bottom-0 -translate-x-1/2" },
    { action: "harvest", Icon: Scissors, placement: "left-0 top-1/2 -translate-y-1/2" },
  ];
  const stageLabel = plot.phase === "empty" ? "Unprepared soil"
    : plot.phase === "tilled" ? "Tilled soil"
    : plot.phase === "picked" ? "Recently harvested"
    : plot.harvestReady ? "Ready to harvest"
    : plot.phase === "grown" ? "Fully grown"
    : plot.phase === "partial" ? "Partially grown"
    : plot.phase === "seedling" ? "Seedling" : "Planted seed";
  return <ViewportModalPortal>
    <div className="fixed inset-0 z-[75] flex items-end justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-5 sm:items-center"
      data-testid="pet-park-garden-menu">
      <button type="button" aria-label="Close Garden" onClick={onClose}
        className="absolute inset-0 bg-black/75" />
      <section role="dialog" aria-modal="true" aria-label="Garden Plot"
        className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border-2 border-[#c9a65e] bg-[radial-gradient(ellipse_at_top,#305c40,#102a1c_80%)] p-4 text-[#f4dda6] shadow-[inset_0_0_0_2px_rgba(237,204,119,.15),0_16px_50px_rgba(0,0,0,.75)]"
        style={{ maxHeight: "min(90dvh, 760px)" }}>
        <header className="mb-3 flex shrink-0 items-center justify-between border-b border-[#cead67]/40 pb-3">
          <div className="flex items-center gap-2"><Leaf size={22} aria-hidden="true" className="text-[#dfcf8d]" />
            <div><p className="text-[10px] uppercase tracking-widest text-amber-100/60">Pet Park</p>
              <h2 className="font-fantasy text-lg font-bold text-[#ffdf90]">Garden Plot</h2></div></div>
          <button type="button" aria-label="Close garden menu" onClick={onClose}
            className="rounded-full border border-[#ceb073]/50 bg-[#123321] p-2"><X size={17} /></button>
        </header>
        {lastReward ? <div data-testid="pet-park-garden-harvest" className="flex flex-col items-center gap-3 py-7 text-center">
          {lastReward.imageUrl ? <img src={lastReward.imageUrl} alt="" className="h-24 w-24 object-contain" /> : <Leaf size={58} />}
          <h3 className="font-fantasy text-xl text-[#ffdf90]">Harvest complete!</h3>
          <p className="text-sm">You collected <strong>{lastReward.quantity} × {lastReward.fruitName}</strong>.</p>
          <p className="text-xs text-[#d1d2ad]">Added to your Bag. This soil rests for 30 seconds.</p>
          <button type="button" onClick={onClose}
            className="min-h-11 rounded-xl border border-[#e6c978] bg-[#245037] px-8 font-semibold">Done</button>
        </div> : <>
          <p className="shrink-0 text-center text-sm font-semibold text-[#e9d6a2]">{stageLabel}{activeCrop ? ` · ${activeCrop.fruitName}` : ""}</p>
          <div className="relative mx-auto my-3 h-44 w-56 shrink-0" role="group" aria-label="Garden actions">
            {buttons.map(({ action: buttonAction, Icon, placement }) =>
              <button key={buttonAction} type="button"
                data-testid={`pet-park-garden-${buttonAction}`}
                aria-label={actionNames[buttonAction]} aria-pressed={action === buttonAction}
                disabled={suggested !== buttonAction || mutation.isPending}
                onClick={() => { setChosenAction(buttonAction); setRetry(null); setErrorMessage(null); }}
                className={`absolute ${placement} flex min-h-12 min-w-14 flex-col items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold shadow-lg disabled:opacity-35 ${action === buttonAction ? "border-[#f6d780] bg-[#52704a] text-[#ffe3a1]" : "border-[#c7a760]/50 bg-[#173a2a] text-[#efdda9]"}`}>
                <Icon size={18} aria-hidden="true" />{actionNames[buttonAction]}</button>)}
            <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-[78px] w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[#a98e57]/35 bg-[#132d22]/90 px-1 text-center text-[11px] text-[#dfd0a7]">
              {suggested ? <><strong className="font-fantasy text-[#f7d989]">Next step</strong>
                {actionNames[suggested]}</> : plot.phase === "picked" ? "Resting…" : "Unavailable"}
            </div>
          </div>
          {progress && <div className="mb-3 shrink-0" data-testid="pet-park-garden-progress">
            <div className="mb-1 flex justify-between text-xs text-[#e9d6a2]"><span>Water drops</span>
              <span>{progress.value} / {progress.required}</span></div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={progress.required}
              aria-valuenow={progress.value} className="h-2.5 overflow-hidden rounded-full border border-[#b89d5d]/60 bg-[#061b13]">
              <div className="h-full bg-gradient-to-r from-[#547b54] to-[#c0cf84]"
                style={{ width: `${100 * progress.value / progress.required}%` }} />
            </div>
          </div>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {plot.phase === "picked" ? <p className="py-3 text-center text-xs text-[#e6d6b1]">The soil will be available again 30 seconds after harvest. Return to hoe it again.</p> :
            suggested ? <>
              <p className="mb-2 text-xs text-[#d1d2ad]">Choose your {suggested === "plant" ? "seed packet" : suggested === "water" ? "watering pail" : suggested === "hoe" ? "hoe" : "scythe"}:</p>
              {inventoryLoading ? <p className="py-4 text-center text-xs">Loading your Bag…</p> :
              eligible.length ? <div className="space-y-2">
                {eligible.map(item => <button key={item.inventoryId} type="button"
                  data-testid="pet-park-garden-inventory-item" disabled={mutation.isPending}
                  onClick={() => submit(item.inventoryId)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-[#d4b97b]/50 bg-[#1c4530] p-2 text-left disabled:opacity-50 active:bg-[#365940]">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 object-contain" /> :
                    <Sprout size={25} className="shrink-0 text-[#e6d69c]" />}
                  <span className="min-w-0 flex-1"><strong className="block truncate font-fantasy text-sm text-[#f5d98e]">{item.name}</strong>
                    <small className="text-[11px] text-[#c4ceaf]">{suggested === "water"
                      ? `${item.gardenWaterLeft ?? 100} / 100 drops remaining` : `Owned: ${item.quantity ?? 0}`}</small></span>
                  <span className="rounded-full border border-[#e5c66a]/40 px-2 py-1 text-xs">Use</span>
                </button>)}
              </div> : <p data-testid="pet-park-garden-no-items"
                className="rounded-xl border border-[#b69b61]/40 bg-[#0a261a] p-3 text-center text-xs text-[#e2d3a9]">
                {suggested === "water" ? "No watering pail with water. Refill an eligible pail at a Water Source decoration." :
                  suggested === "plant" ? "No plantable Seed Packs in your Bag. Buy seeds at a shop or market." :
                  `You need a ${suggested === "hoe" ? "Hoe" : "Scythe"} in your Bag.`}
              </p>}
            </> : null}
            {errorMessage && <div role="alert" className="mt-3 rounded-xl border border-[#cfb06d] bg-[#432e23] p-3 text-xs">
              <p>{errorMessage}</p>
              {retry && <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(retry)}
                className="mt-2 min-h-10 rounded-lg border border-[#e6c978] bg-[#245037] px-4 font-semibold">Retry same action safely</button>}
            </div>}
          </div>
        </>}
      </section>
    </div>
  </ViewportModalPortal>;
}
