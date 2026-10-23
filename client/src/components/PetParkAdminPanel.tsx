import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HOME_OUTDOOR_EFFECT_OPTIONS } from "@/components/HomeInteriorEffect";
import { readPetParkImageData as imageData } from "@/lib/petParkImageData";
import { type ParkEffectType } from "@shared/petParkEffects";
import { parkWorldHeight, PARK_FALLBACK_ASPECT } from "@/lib/petParkCamera";

type ParkDraft = {
  settings: { enabledForPlayers: boolean; backgroundUrl: string | null; coinsPerHour: number; essencePerHour: number; petXpPerHour: number };
  items: { id: string; kind: "decor" | "sleep_spot" | "effect" }[];
  buildings: { id: string }[];
};
type CreatedParkObject = { kind: "building" | "item"; id: string; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };

const WATER_EFFECT_OPTIONS: Array<{ type: ParkEffectType; label: string; description: string; defaultSize: number }> = [
  { type: "waterfall_mist", label: "Waterfall Mist", description: "Soft mist at waterfalls and cascades", defaultSize: 130 },
  { type: "water_ripple", label: "Water Ripples", description: "Expanding rings over water", defaultSize: 110 },
  { type: "water_shimmer", label: "Water Shimmer", description: "Gentle highlights on water", defaultSize: 140 },
];
const GOLD_BORDER = "rgba(255,215,0,0.38)";
const GOLD = "#f5cf64";

export default function PetParkAdminPanel({ initialMode = "scene", mode, creationPosition, worldHeight, onCreated }: {
  initialMode?: "scene" | "effects" | "decor";
  mode: "create" | "settings";
  creationPosition?: { xPct: number; yPct: number };
  worldHeight?: number;
  onCreated?: (object: CreatedParkObject) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<ParkDraft>({ queryKey: ["/api/admin/pet-park"] });
  const [rates, setRates] = useState<{ coinsPerHour: number; essencePerHour: number; petXpPerHour: number } | null>(null);
  const [publish, setPublish] = useState<boolean | null>(null);
  const [kind, setKind] = useState<"decor" | "sleep_spot">( "decor" );
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState("");
  const [buildingImage, setBuildingImage] = useState<string | null>(null);
  const [interiorImage, setInteriorImage] = useState<string | null>(null);
  const [buildingCapacity, setBuildingCapacity] = useState(3);

  const items = data?.items ?? [];
  const buildings = data?.buildings ?? [];
  const mutation = useMutation({
    mutationFn: async ({ method, url, body }: { method: "POST" | "PUT"; url: string; body?: unknown }) => {
      const response = await apiRequest(method, url, body);
      return response.json();
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      if (variables.method !== "POST") return;
      const isBuilding = variables.url === "/api/admin/pet-park/buildings";
      const isItem = variables.url === "/api/admin/pet-park/items";
      if (!isBuilding && !isItem) return;
      const created = result?.building ?? result?.item ?? result;
      if (isBuilding) { setBuildingImage(null); setInteriorImage(null); }
      if (isItem) setPendingImage(null);
      qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
      if (typeof created?.id === "string") {
        onCreated?.({
          kind: isBuilding ? "building" : "item", id: created.id, xPct: created.xPct, yPct: created.yPct,
          size: created.size, flipped: created.flipped, layer: created.layer,
        });
      }
    },
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });
  const addEffect = (type: ParkEffectType, size: number) => {
    if (mutation.isPending) return;
    mutation.mutate({ method: "POST", url: "/api/admin/pet-park/items", body: {
      kind: "effect", effectType: type, imageData: null,
      xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5,
      size, flipped: false, layer: items.length,
    } });
  };
  const selectFile = async (file: File | undefined, apply: (value: string) => void) => {
    if (!file) return;
    try { apply(await imageData(file)); }
    catch (error) { toast({ title: "Unable to read image", description: String(error), variant: "destructive" }); }
  };

  return (
    <div className={mode === "create" ? "space-y-4 font-fantasy text-[#f5cf64]" : "space-y-4 pb-8 text-amber-100"} data-testid="pet-park-admin">
      {mode === "settings" ? <>
        <h2 className="text-xl font-semibold text-amber-300">Pet Park — Administration</h2>
        <p className="text-sm text-amber-100/75">Player access and earning rates are managed here. Scene placement is managed directly from Pet Park.</p>
      <div className="rounded-lg border border-amber-700/60 bg-black/50 p-3 space-y-3">
        <div className="text-sm">Player access: <strong>{data?.settings.enabledForPlayers ? "Open (check readiness)" : "Closed — Under Construction"}</strong></div>
        <div className="rounded-lg border border-amber-600/40 p-3 space-y-2">
          <h3 className="font-semibold">Park rewards & player access</h3>
          <p className="text-xs">Rates are stored per hour. The recommended preset equals 1 coin/minute, 5 pet XP/minute and 2 essence/5 minutes. Closing pauses earning but preserves deposits and rewards.</p>
          <button type="button" className="rounded bg-teal-800 px-3 py-2 text-sm" onClick={() => setRates({ coinsPerHour: 60, essencePerHour: 24, petXpPerHour: 300 })}>Use recommended reward rates</button>
          {(["coinsPerHour", "essencePerHour", "petXpPerHour"] as const).map(key => <label key={key} className="flex items-center justify-between gap-2 text-sm">
            <span>{key === "coinsPerHour" ? "Coins / hour" : key === "essencePerHour" ? "Essence / hour" : "Pet XP / hour"}</span>
            <input type="number" min={0} max={10000} step={1} aria-label={key} className="w-24 rounded bg-slate-900 p-2"
              value={(rates ?? data?.settings)?.[key] ?? 0}
              onChange={e => setRates({ coinsPerHour: (rates ?? data?.settings)?.coinsPerHour ?? 0,
                essencePerHour: (rates ?? data?.settings)?.essencePerHour ?? 0,
                petXpPerHour: (rates ?? data?.settings)?.petXpPerHour ?? 0, [key]: Number(e.target.value) })} />
          </label>)}
          <label className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-950/30 p-3 text-sm font-semibold">
            <input type="checkbox" aria-label="Allow players into Pet Park" className="h-5 w-5 accent-amber-500" checked={publish ?? data?.settings.enabledForPlayers ?? false}
              onChange={e => setPublish(e.target.checked)} /> Open Pet Park to players
          </label>
          <button type="button" className="rounded bg-amber-700 px-4 py-2 disabled:opacity-50" disabled={mutation.isPending || !data}
            onClick={() => {
              mutation.mutate({ method: "PUT", url: "/api/admin/pet-park/publishing",
                body: { enabledForPlayers: publish ?? data!.settings.enabledForPlayers,
                  coinsPerHour: (rates ?? data!.settings).coinsPerHour,
                  essencePerHour: (rates ?? data!.settings).essencePerHour,
                  petXpPerHour: (rates ?? data!.settings).petXpPerHour } });
              setRates(null); setPublish(null);
            }}>Save reward rates & park availability</button>
        </div>
        <label className="block text-sm font-semibold">Park background image
          <input aria-label="Upload park background" type="file" accept="image/*" className="mt-2 block w-full text-xs" disabled={mutation.isPending}
            onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return;
              try { mutation.mutate({ method: "PUT", url: "/api/admin/pet-park/background", body: { imageData: await imageData(file) } }); }
              catch (error) { toast({ title: String(error), variant: "destructive" }); }
              e.target.value = "";
            }} />
        </label>
      </div>

      </> : <>
      {initialMode === "effects" ? <section aria-label="Park outdoor effects" className="space-y-3">
        <div className="text-center text-xs uppercase tracking-[0.2em] text-[#f5cf64]">Outdoor Effects</div>
        <div className="grid grid-cols-2 gap-2">
          {HOME_OUTDOOR_EFFECT_OPTIONS.map(option => <button key={option.type} type="button"
            data-testid={`add-park-effect-${option.type}`}
            disabled={mutation.isPending} onClick={() => addEffect(option.type, Math.max(24, Math.min(1000, Math.round(option.defaultSize / 100 * (worldHeight ?? parkWorldHeight(PARK_FALLBACK_ASPECT))))))}
            className="min-h-20 rounded-xl border p-3 text-left transition-transform active:scale-95 disabled:opacity-40"
            style={{ background: "rgba(255,215,0,0.10)", borderColor: GOLD_BORDER }}>
            <span className="block text-sm text-[#f5cf64]">{option.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[#bd9d50]">{option.description}</span>
          </button>)}
        </div>
        <div className="pt-2 text-center text-xs uppercase tracking-[0.2em] text-[#f5cf64]">Water Effects</div>
        <div className="grid grid-cols-2 gap-2">
          {WATER_EFFECT_OPTIONS.map(option => <button key={option.type} type="button"
            data-testid={`add-park-effect-${option.type}`}
            disabled={mutation.isPending} onClick={() => addEffect(option.type, option.defaultSize)}
            className="min-h-20 rounded-xl border p-3 text-left transition-transform active:scale-95 disabled:opacity-40"
            style={{ background: "rgba(255,215,0,0.10)", borderColor: GOLD_BORDER }}>
            <span className="block text-sm text-[#f5cf64]">{option.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[#bd9d50]">{option.description}</span>
          </button>)}
        </div>
        <p className="text-center text-xs text-amber-100/60">{mutation.isPending ? "Adding effect…" : "Tap to add an effect, then drag it to the right spot on the park."} · {items.filter(item => item.kind === "effect").length} effects</p>
      </section> : initialMode === "scene" ? <section aria-label="Add Pet Park building" className="space-y-4">
        {buildingImage ? <div className="relative h-32 rounded-xl border bg-black/40" style={{ borderColor: GOLD_BORDER }}>
          <img src={buildingImage} alt="New building preview" className="h-full w-full object-contain" />
          <button type="button" aria-label="Clear building image" onClick={() => setBuildingImage(null)} className="absolute right-2 top-2 rounded-full bg-black/80 p-2"><X size={16} /></button>
        </div> : <label className="block cursor-pointer rounded-xl border border-dashed px-4 py-4 text-center text-sm" style={{ background: "rgba(255,215,0,.08)", borderColor: GOLD_BORDER }}>
          <Image className="mr-2 inline h-4 w-4" /> Upload Building Image (PNG/JPEG)
          <input aria-label="Building exterior image" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e => { void selectFile(e.target.files?.[0], setBuildingImage); e.target.value = ""; }} />
        </label>}
        <label className="block space-y-1 text-sm">Building Name
          <input aria-label="Building name" placeholder="e.g. Woodland Cottage" maxLength={80} value={buildingName} onChange={e => setBuildingName(e.target.value)}
            className="w-full rounded-xl border bg-[#302701] p-3 placeholder:text-amber-100/45" style={{ borderColor: GOLD_BORDER }} />
        </label>
        <div className="space-y-1">
          <div className="text-sm">Building pet capacity</div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(capacity => <button key={capacity} type="button" aria-pressed={buildingCapacity === capacity} onClick={() => setBuildingCapacity(capacity)}
              className="rounded-xl border px-2 py-3 text-center text-sm" style={{ background: buildingCapacity === capacity ? "rgba(255,215,0,.2)" : "rgba(255,215,0,.07)", borderColor: buildingCapacity === capacity ? GOLD : GOLD_BORDER }}>
              {capacity} {capacity === 1 ? "pet" : "pets"}
            </button>)}
          </div>
          <p className="text-xs text-amber-100/60">Capacity is shared by all visitors. Each player can deposit up to three pets in the park.</p>
        </div>
        <label className="block cursor-pointer space-y-1 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: GOLD_BORDER }}>
          {interiorImage ? "Interior image selected — tap to replace" : "Interior Background (optional)"}
          <input aria-label="Building interior image" type="file" accept="image/*" className="block w-full text-xs" onChange={e => { void selectFile(e.target.files?.[0], setInteriorImage); e.target.value = ""; }} />
        </label>
        <button type="button" disabled={mutation.isPending || !buildingName.trim() || !buildingImage}
          data-testid="button-create-park-building" className="w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-35"
          style={{ background: "rgba(255,215,0,.15)", borderColor: GOLD_BORDER }}
          onClick={() => mutation.mutate({ method: "POST", url: "/api/admin/pet-park/buildings", body: {
            name: buildingName.trim(), imageData: buildingImage, interiorImageData: interiorImage, maxPets: buildingCapacity,
            xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5, size: 120, flipped: false, layer: buildings.length,
          } })}>{mutation.isPending ? "Adding Building…" : "Add Building"}</button>
      </section> : <section aria-label="Add Pet Park decoration" className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {([{ value: "decor", label: "Decoration / Object" }, { value: "sleep_spot", label: "Rest Spot" }] as const).map(option => <button type="button" key={option.value}
            aria-pressed={kind === option.value} onClick={() => { setKind(option.value); setPendingImage(null); }}
            className="rounded-xl border px-2 py-3 text-sm" style={{ background: kind === option.value ? "rgba(255,215,0,.2)" : "rgba(255,215,0,.07)", borderColor: kind === option.value ? GOLD : GOLD_BORDER }}>{option.label}</button>)}
        </div>
        {pendingImage ? <div className="relative h-36 rounded-xl border" style={{ borderColor: GOLD_BORDER }}>
          <img src={pendingImage} alt="New park object preview" className="h-full w-full object-contain" />
          <button type="button" aria-label="Clear park object image" onClick={() => setPendingImage(null)} className="absolute right-2 top-2 rounded-full bg-black/80 p-2"><X size={16} /></button>
        </div> : <label className="block cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center text-sm" style={{ background: "rgba(255,215,0,.08)", borderColor: GOLD_BORDER }}>
          <Image className="mr-2 inline h-4 w-4" /> Upload Image (PNG/JPEG)
          <input aria-label="Scene item artwork" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e => { void selectFile(e.target.files?.[0], setPendingImage); e.target.value = ""; }} />
        </label>}
        {kind === "sleep_spot" && <p className="text-xs text-amber-100/60">Rest spots help pets find places to rest. An image is optional.</p>}
        <button type="button" disabled={mutation.isPending || (kind === "decor" && !pendingImage)}
          data-testid="button-create-park-item" className="w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-35"
          style={{ background: "rgba(255,215,0,.15)", borderColor: GOLD_BORDER }}
          onClick={() => mutation.mutate({ method: "POST", url: "/api/admin/pet-park/items", body: {
            kind, imageData: pendingImage, effectType: null,
            xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5,
            size: 100, flipped: false, layer: items.length,
          } })}>{mutation.isPending ? "Adding…" : kind === "decor" ? "Add Decoration" : "Add Rest Spot"}</button>
      </section>}
      </>}
    </div>
  );
}
