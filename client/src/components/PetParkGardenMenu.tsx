import { useEffect, useRef, useState } from "react";
import { Droplets, Scissors, Shovel, Sprout, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import {
  gardenActionForPlot, gardenCropProgress,
  type GardenActionResult, type GardenPlayerAction,
  type GardenPlayerCrop, type GardenPlayerPlot,
} from "@shared/garden";
import "./PetParkGardenMenu.css";

export type GardenOwnedItem = {
  inventoryId: string; shopItemId: string; name: string;
  type?: string; specialType?: string | null; imageUrl?: string | null;
  isListed?: boolean; quantity?: number; gardenWaterLeft?: number | null;
};
type Request = { action: GardenPlayerAction; inventoryId: string; requestId: string };
type ToolMotion = {
  action: GardenPlayerAction; imageUrl: string | null;
  requestId: string; waterBefore: number | null; waterAfter: number | null;
  confirmed: boolean;
};
type Props = {
  plot: GardenPlayerPlot;
  crops: readonly GardenPlayerCrop[];
  inventory: readonly GardenOwnedItem[];
  inventoryLoading: boolean;
  // Position is projected from the EXISTING Pet Park camera in screen pixels.
  // It is never saved and cannot alter the scene or admin plot placement.
  anchor: { x: number; y: number };
  onClose: () => void;
  onChanged: () => void;
};
const actionNames: Record<GardenPlayerAction, string> = {
  hoe: "Hoe", plant: "Plant", water: "Water", harvest: "Harvest",
};
const tools: Record<Exclude<GardenPlayerAction, "plant">, string> = {
  hoe: "hoe", water: "watering_pail", harvest: "scythe",
};
const BUTTONS: Array<{ action: GardenPlayerAction; Icon: typeof Shovel; x: number; y: number }> = [
  { action: "hoe", Icon: Shovel, x: 7, y: 29 },
  { action: "plant", Icon: Sprout, x: 70, y: 4 },
  { action: "water", Icon: Droplets, x: 136, y: 4 },
  { action: "harvest", Icon: Scissors, x: 199, y: 29 },
];
function eligibleItem(item: GardenOwnedItem, action: GardenPlayerAction,
  crops: readonly GardenPlayerCrop[]): boolean {
  if (item.isListed || (item.quantity ?? 0) <= 0) return false;
  if (action === "plant") return item.type === "garden_seed" &&
    crops.some(crop => crop.ready && crop.seedItemId === item.shopItemId);
  return item.type === "garden_tool" && item.specialType === tools[action] &&
    (action !== "water" || (item.gardenWaterLeft ?? 100) > 0);
}

export default function PetParkGardenMenu({
  plot, crops, inventory, inventoryLoading, anchor, onClose, onChanged,
}: Props) {
  const suggested = gardenActionForPlot(plot);
  const [showSeeds, setShowSeeds] = useState(false);
  const [retry, setRetry] = useState<Request | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [motion, setMotion] = useState<ToolMotion | null>(null);
  const [lastReward, setLastReward] = useState<{ quantity: number; fruitName: string; imageUrl: string | null } | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCrop = crops.find(crop => crop.id === plot.cropId);
  const progress = gardenCropProgress(plot, activeCrop);
  const owned = (action: GardenPlayerAction) => inventory.filter(item => eligibleItem(item, action, crops));
  const seeds = owned("plant");
  const hasTools = inventory.some(item => !item.isListed && (item.quantity ?? 0) > 0 && item.type === "garden_tool");
  const hasEmptyPail = inventory.some(item => !item.isListed && (item.quantity ?? 0) > 0 &&
    item.type === "garden_tool" && item.specialType === "watering_pail" && (item.gardenWaterLeft ?? 100) === 0);
  const neededItems = suggested ? owned(suggested) : [];
  const missingMessage = inventoryLoading ? "Checking your gardening tools…" :
    !hasTools ? "Come back when you have your gardening tools." :
    suggested === "water" && hasEmptyPail && neededItems.length === 0
      ? "Find a Water Source to refill your pail." :
    suggested === "plant" && neededItems.length === 0 ? "Bring a Seed Pack to plant here." :
    suggested === "hoe" && neededItems.length === 0 ? "Bring a Hoe to prepare the soil." :
    suggested === "harvest" && neededItems.length === 0 ? "Bring a Scythe to harvest." :
    plot.phase === "picked" ? "The soil is resting after harvest." : null;
  const isBusy = !!motion;
  const mutation = useMutation({
    mutationFn: async (request: Request) => {
      const response = await apiRequest("POST",
        "/api/pet-park/garden/plots/" + encodeURIComponent(plot.plotItemId) + "/" + request.action,
        { requestId: request.requestId, inventoryId: request.inventoryId });
      return response.json() as Promise<GardenActionResult>;
    },
    onSuccess: (result, request) => {
      setRetry(null);
      setErrorMessage(null);
      setShowSeeds(false);
      setMotion(previous => previous?.requestId === request.requestId
        ? { ...previous, waterAfter: typeof result.waterLeft === "number" ? result.waterLeft : null, confirmed: true }
        : previous);
      onChanged();
      if (result.reward) {
        const crop = crops.find(entry => entry.fruitItemId === result.reward?.fruitItemId);
        setLastReward({
          quantity: result.reward.quantity, fruitName: crop?.fruitName ?? "Fruit",
          imageUrl: crop?.images.fruit ?? null,
        });
        if (rewardTimer.current) clearTimeout(rewardTimer.current);
        rewardTimer.current = setTimeout(() => setLastReward(null), 3400);
      }
      if (finishTimer.current) clearTimeout(finishTimer.current);
      finishTimer.current = setTimeout(() => setMotion(null), 1280);
    },
    onError: (error: Error) => {
      // A mobile request may commit before its response is lost. An explicit
      // retry must reuse the very same UUID, never charge another water drop.
      setErrorMessage(error.message || "Garden action could not be completed.");
      setMotion(null);
      onChanged();
    },
  });
  useEffect(() => {
    setShowSeeds(false);
    setRetry(null);
    setErrorMessage(null);
  }, [plot.plotItemId, plot.phase, plot.waterApplied, plot.harvestReady]);
  useEffect(() => () => {
    if (finishTimer.current) clearTimeout(finishTimer.current);
    if (rewardTimer.current) clearTimeout(rewardTimer.current);
  }, []);
  const submit = (action: GardenPlayerAction, item: GardenOwnedItem) => {
    if (action !== suggested || mutation.isPending || motion || inventoryLoading ||
        !eligibleItem(item, action, crops)) return;
    const pending = retry?.action === action && retry.inventoryId === item.inventoryId
      ? retry : { action, inventoryId: item.inventoryId, requestId: crypto.randomUUID() };
    setRetry(pending);
    setErrorMessage(null);
    setShowSeeds(false);
    setMotion({
      action, imageUrl: item.imageUrl ?? null, requestId: pending.requestId,
      waterBefore: action === "water" ? (item.gardenWaterLeft ?? 100) : null,
      waterAfter: null, confirmed: false,
    });
    mutation.mutate(pending);
  };
  const chooseAction = (action: GardenPlayerAction) => {
    if (action !== suggested || isBusy || mutation.isPending || inventoryLoading) return;
    const items = owned(action);
    if (action === "plant" && items.length > 1) {
      setShowSeeds(previous => !previous);
    } else if (items[0]) {
      submit(action, items[0]);
    }
  };
  const stageLabel = plot.phase === "empty" ? "Unprepared soil"
    : plot.phase === "tilled" ? "Tilled soil"
    : plot.phase === "picked" ? "Recently harvested"
    : plot.harvestReady ? "Ready to harvest"
    : plot.phase === "grown" ? "Fully grown"
    : plot.phase === "partial" ? "Partially grown"
    : plot.phase === "seedling" ? "Seedling" : "Planted seed";
  return <ViewportModalPortal blocking={false}>
    <div data-testid="pet-park-garden-menu" className="pointer-events-none absolute inset-0 z-[76]"
      aria-label="Garden Plot tools">
      <div data-testid="pet-park-garden-anchor" className="pointer-events-none absolute w-[260px]"
        style={{ left: anchor.x, top: anchor.y, transform: "translate(-50%, -100%)" }}>
        <div className="relative h-[107px]" role="group" aria-label="Garden tools">
          {BUTTONS.map(({ action, Icon, x, y }) => {
            const items = owned(action);
            const available = !inventoryLoading && suggested === action && items.length > 0 && !isBusy && !mutation.isPending;
            const catalogItem = items[0] ?? inventory.find(item => action === "plant"
              ? item.type === "garden_seed" && !item.isListed
              : item.type === "garden_tool" && item.specialType === tools[action as Exclude<GardenPlayerAction, "plant">]);
            const sourceImage = catalogItem?.imageUrl ?? (action === "plant" ? crops[0]?.images.seedPack : null);
            return <button type="button" key={action}
              data-testid={"pet-park-garden-action-" + action}
              aria-label={actionNames[action]} aria-disabled={!available}
              disabled={!available}
              title={actionNames[action]}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); chooseAction(action); }}
              className={"garden-tool-bubble pointer-events-auto absolute flex h-[57px] w-[57px] flex-col items-center justify-center rounded-full border text-[10px] font-semibold shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2d48a] " +
                (available ? "border-[#f1d18a] bg-[#1f5135] text-[#ffe9b0]" :
                  "border-[#7e816e]/70 bg-[#22382b]/90 text-[#a5ae96] opacity-45 grayscale")}
              style={{ left: x, top: y }}>
              {sourceImage ? <img src={sourceImage} alt="" draggable={false}
                className="h-[34px] w-[38px] object-contain" /> :
                <Icon size={25} strokeWidth={1.8} aria-hidden="true" />}
              <span className="leading-none">{actionNames[action]}</span>
            </button>;
          })}
          <button type="button" aria-label="Close garden tools" onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); if (!mutation.isPending) onClose(); }}
            className="pointer-events-auto absolute right-0 top-[-2px] flex h-7 w-7 items-center justify-center rounded-full border border-[#b89b61]/70 bg-[#09281b]/95 text-[#ead59f] shadow-md">
            <X size={15} />
          </button>
        </div>
        <div className="mx-auto w-fit max-w-[240px] rounded-full border border-[#bd9e62]/70 bg-[#092719]/90 px-3 py-1 text-center font-fantasy text-[11px] text-[#f4d69c] shadow-lg"
          data-testid="pet-park-garden-stage">{stageLabel}</div>
        {progress && <div className="mx-auto mt-1.5 w-fit max-w-[220px] rounded-full border border-[#b5ae80]/35 bg-[#102e23]/90 px-3 py-1 text-center text-[10px] text-[#e3d7b1]"
          data-testid="pet-park-garden-progress">
          Water: {progress.value} / {progress.required} drops
        </div>}
        {missingMessage && !motion && <div data-testid="pet-park-garden-no-items"
          role="status" className="mx-auto mt-2 max-w-[255px] rounded-xl border border-[#c7a96b]/65 bg-[#102d20]/95 px-3 py-2 text-center text-xs text-[#f0dba9] shadow-lg">
          {missingMessage}
        </div>}
        {showSeeds && suggested === "plant" && seeds.length > 1 && !motion &&
          <div data-testid="pet-park-garden-seed-choices" className="pointer-events-auto mx-auto mt-2 flex max-h-[125px] w-fit max-w-[260px] flex-wrap justify-center gap-1.5 overflow-y-auto rounded-xl border border-[#bfa068]/60 bg-[#0e3222]/95 p-1.5">
            {seeds.map(seed => <button type="button" key={seed.inventoryId}
              data-testid="pet-park-garden-seed-choice" title={seed.name}
              aria-label={"Plant " + seed.name}
              disabled={mutation.isPending} onClick={() => submit("plant", seed)}
              className="flex min-h-12 min-w-14 max-w-20 flex-col items-center rounded-full border border-[#d9b977]/70 bg-[#1c4931] p-1 text-[9px] text-[#f2dba6]">
              {seed.imageUrl ? <img src={seed.imageUrl} alt="" className="h-7 w-8 object-contain" /> : <Sprout size={21} />}
              <span className="max-w-[65px] truncate">{seed.name}</span>
            </button>)}
          </div>}
        {errorMessage && <div role="alert"
          className="pointer-events-auto mx-auto mt-2 max-w-[260px] rounded-xl border border-[#cfb06d] bg-[#492b23]/95 p-2 text-center text-xs text-[#fae1b6] shadow-lg">
          <p>{errorMessage}</p>
          {retry && retry.action === suggested && <button type="button" disabled={mutation.isPending}
            onClick={() => {
              const original = inventory.find(item => item.inventoryId === retry.inventoryId);
              if (original && !motion) {
                setMotion({ action: retry.action, requestId: retry.requestId, imageUrl: original.imageUrl ?? null,
                  waterBefore: retry.action === "water" ? (original.gardenWaterLeft ?? 100) : null,
                  waterAfter: null, confirmed: false });
                mutation.mutate(retry);
              }
            }}
            className="mt-1.5 min-h-9 rounded-full border border-[#f0d388] bg-[#214e35] px-3 font-semibold">
            Retry safely
          </button>}
        </div>}
      </div>
      {motion && <div data-testid="pet-park-garden-animation" data-action={motion.action}
        aria-hidden="true" className="pointer-events-none absolute"
        style={{ left: anchor.x, top: anchor.y + 12, transform: "translate(-50%, -50%)" }}>
        {motion.action === "water" && <div className="absolute bottom-[110px] left-1/2 z-20 w-[88px] -translate-x-1/2 rounded-lg border border-[#d3bf80] bg-[#102d24]/95 px-2 py-1 shadow-lg"
          data-testid="pet-park-garden-water-gauge">
          <div className="text-center text-[9px] font-bold text-[#eddaa5]">{motion.waterAfter ?? motion.waterBefore ?? 100} / 100</div>
          <div className="mt-0.5 h-[6px] overflow-hidden rounded-full bg-[#27453b]">
            <div className="h-full rounded-full bg-[#83c6c7] transition-[width] duration-700 ease-in-out"
              style={{ width: (((motion.waterAfter ?? motion.waterBefore ?? 100) / 100) * 100) + "%" }} />
          </div>
        </div>}
        <div className={"garden-tool-motion garden-tool-motion-" + motion.action}>
          {motion.imageUrl ? <img src={motion.imageUrl} alt="" draggable={false} className="h-full w-full object-contain" /> :
            motion.action === "water" ? <Droplets size={75} /> : motion.action === "hoe" ? <Shovel size={75} /> :
            motion.action === "harvest" ? <Scissors size={75} /> : <Sprout size={75} />}
        </div>
        {motion.action === "water" && <div className="garden-pour-drops">
          <span /><span /><span />
        </div>}
        {motion.action === "plant" && <div className="garden-plant-sparkle">✦</div>}
      </div>}
      {lastReward && <div data-testid="pet-park-garden-harvest"
        className="pointer-events-auto absolute z-[2] flex min-w-[180px] max-w-[240px] items-center gap-2 rounded-xl border-2 border-[#d8b873] bg-[#123d2b]/95 px-3 py-2 text-[#f2d69a] shadow-xl"
        role="status" style={{ left: anchor.x, top: anchor.y + 36, transform: "translateX(-50%)" }}>
        {lastReward.imageUrl ? <img src={lastReward.imageUrl} alt="" className="h-11 w-11 object-contain" /> : <Sprout size={31} />}
        <div className="min-w-0 flex-1"><strong className="font-fantasy text-sm">Harvested!</strong>
          <p className="text-[11px]">{lastReward.quantity} × {lastReward.fruitName}</p>
          <p className="text-[9px] text-[#bed5b6]">Added to your Bag</p></div>
        <button type="button" aria-label="Close harvest notice" onClick={() => setLastReward(null)}
          className="rounded-full p-1"><X size={14} /></button>
      </div>}
    </div>
  </ViewportModalPortal>;
}
