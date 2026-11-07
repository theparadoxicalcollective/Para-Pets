import { useEffect, useRef, useState } from "react";
import { Droplets, Scissors, Shovel, Sprout, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import {
  gardenActionForPlot,
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
type ToolMotion = { action: GardenPlayerAction; imageUrl: string | null; requestId: string };
type Props = {
  plot: GardenPlayerPlot;
  crops: readonly GardenPlayerCrop[];
  inventory: readonly GardenOwnedItem[];
  inventoryLoading: boolean;
  // Position is projected from the EXISTING Pet Park camera in screen pixels.
  // It is never saved and cannot alter the scene or admin plot placement.
  anchor: { x: number; y: number; plotX: number; plotY: number; side: "right" | "left" };
  onClose: () => void;
  onChanged: () => void;
  onWateringState: (plotId: string | null) => void;
};
const actionNames: Record<GardenPlayerAction, string> = {
  hoe: "Hoe", plant: "Plant", water: "Water", harvest: "Harvest",
};
const tools: Record<Exclude<GardenPlayerAction, "plant">, string> = {
  hoe: "hoe", water: "watering_pail", harvest: "scythe",
};
// Compact vertical arc beside the plot, instead of a horizontal row over it.
// The arc is mirrored when the plot sits near the viewport's right edge.
const BUTTONS: Array<{ action: GardenPlayerAction; Icon: typeof Shovel; x: number; y: number }> = [
  { action: "hoe", Icon: Shovel, x: 4, y: 0 },
  { action: "plant", Icon: Sprout, x: 50, y: 43 },
  { action: "water", Icon: Droplets, x: 55, y: 99 },
  { action: "harvest", Icon: Scissors, x: 5, y: 151 },
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
  plot, crops, inventory, inventoryLoading, anchor, onClose, onChanged, onWateringState,
}: Props) {
  const suggested = gardenActionForPlot(plot);
  const [showSeeds, setShowSeeds] = useState(false);
  const [retry, setRetry] = useState<Request | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [motion, setMotion] = useState<ToolMotion | null>(null);
  const [lastReward, setLastReward] = useState<{ quantity: number; fruitName: string; imageUrl: string | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      finishTimer.current = setTimeout(() => { setMotion(null); onWateringState(null); }, 1280);
    },
    onError: (error: Error) => {
      // A mobile request may commit before its response is lost. An explicit
      // retry must reuse the very same UUID, never charge another water drop.
      setErrorMessage(error.message || "Garden action could not be completed.");
      setMotion(null);
      onWateringState(null);
      onChanged();
    },
  });
  useEffect(() => {
    setShowSeeds(false);
    setRetry(null);
    setErrorMessage(null);
  }, [plot.plotItemId, plot.phase, plot.waterApplied, plot.harvestReady]);
  // Pass-through dismissal: tap outside the actual tool bubbles (or press
  // Escape) to close; do not add a full-screen hit-blocking backdrop or
  // swallow Pet Park camera pans, other plots or pinch gestures.
  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      if (menuRef.current && event.target instanceof Node &&
          !menuRef.current.contains(event.target)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);
  useEffect(() => () => {
    if (finishTimer.current) clearTimeout(finishTimer.current);
    if (rewardTimer.current) clearTimeout(rewardTimer.current);
    onWateringState(null);
  }, [onWateringState]);
  const submit = (action: GardenPlayerAction, item: GardenOwnedItem) => {
    if (action !== suggested || mutation.isPending || motion || inventoryLoading ||
        !eligibleItem(item, action, crops)) return;
    const pending = retry?.action === action && retry.inventoryId === item.inventoryId
      ? retry : { action, inventoryId: item.inventoryId, requestId: crypto.randomUUID() };
    setRetry(pending);
    setErrorMessage(null);
    setShowSeeds(false);
    if (action === "water") onWateringState(plot.plotItemId);
    setMotion({ action, imageUrl: item.imageUrl ?? null, requestId: pending.requestId });
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
  return <ViewportModalPortal blocking={false}>
    <div ref={menuRef} data-testid="pet-park-garden-menu" className="pointer-events-none absolute inset-0 z-[76]"
      aria-label="Garden Plot tools">
      <div data-testid="pet-park-garden-anchor" className="pointer-events-none absolute w-[125px]"
        data-side={anchor.side} style={{ left: anchor.x, top: anchor.y }}>
        <div className="relative h-[199px]" role="group" aria-label="Garden tools">
          {!motion && BUTTONS.map(({ action, Icon, x, y }) => {
            const items = owned(action);
            const available = !inventoryLoading && suggested === action && items.length > 0 && !isBusy && !mutation.isPending;
            const catalogItem = items[0] ?? inventory.find(item => action === "plant"
              ? item.type === "garden_seed" && !item.isListed
              : item.type === "garden_tool" && item.specialType === tools[action as Exclude<GardenPlayerAction, "plant">]);
            const sourceImage = catalogItem?.imageUrl ?? (action === "plant" ? crops[0]?.images.seedPack : null);
            return <button type="button" key={action}
              data-testid={"pet-park-garden-action-" + action}
              aria-label={actionNames[action]} aria-disabled={!available}
              aria-current={suggested === action ? "step" : undefined}
              disabled={!available}
              title={actionNames[action]}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); chooseAction(action); }}
              className={"garden-tool-bubble pointer-events-auto absolute flex h-[48px] w-[48px] flex-col items-center justify-center rounded-full border text-[10px] font-semibold shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2d48a] " +
                (available ? "bg-[#1f5135] text-[#ffe9b0]" :
                  "bg-[#22382b]/90 text-[#a5ae96] opacity-45 grayscale") +
                (suggested === action ? " border-[1.5px] border-[#f1d18a] ring-1 ring-[#cda55e]/80" :
                  " border border-[#7e816e]/70")}
              style={{ left: anchor.side === "right" ? x : 125 - x - 48, top: y }}>
              {sourceImage ? <img src={sourceImage} alt="" draggable={false}
                className="h-[28px] w-[30px] object-contain" /> :
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />}
              <span className="leading-none">{actionNames[action]}</span>
            </button>;
          })}
        </div>
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
                if (retry.action === "water") onWateringState(plot.plotItemId);
                setMotion({ action: retry.action, requestId: retry.requestId, imageUrl: original.imageUrl ?? null });
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
        style={{ left: anchor.plotX + 31, top: anchor.plotY - 20, transform: "translate(-50%, -50%)" }}>
        <div className={"garden-tool-motion garden-tool-motion-" + motion.action}>
          {motion.imageUrl ? <img src={motion.imageUrl} alt="" draggable={false} className="h-full w-full object-contain" /> :
            motion.action === "water" ? <Droplets size={55} /> : motion.action === "hoe" ? <Shovel size={55} /> :
            motion.action === "harvest" ? <Scissors size={55} /> : <Sprout size={55} />}
        </div>
        {motion.action === "water" && <div className="garden-pour-drops">
          <span /><span /><span />
        </div>}
        {motion.action === "plant" && <div className="garden-plant-sparkle">✦</div>}
      </div>}
      {lastReward && <div data-testid="pet-park-garden-harvest"
        className="pointer-events-auto absolute z-[2] flex min-w-[180px] max-w-[240px] items-center gap-2 rounded-xl border-2 border-[#d8b873] bg-[#123d2b]/95 px-3 py-2 text-[#f2d69a] shadow-xl"
        role="status" style={{ left: anchor.plotX, top: anchor.plotY + 36, transform: "translateX(-50%)" }}>
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
