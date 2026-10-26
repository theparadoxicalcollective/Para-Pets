import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Minus, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HOME_OUTDOOR_EFFECT_OPTIONS, HomeOutdoorEffectVisual } from "@/components/HomeInteriorEffect";
import { readPetParkImageData as imageData } from "@/lib/petParkImageData";
import { type ParkEffectType } from "@shared/petParkEffects";
import { PARK_TERRAIN_DETAIL_OPTIONS, type ParkTerrainDetailType } from "@shared/petParkTerrainDetails";
import { PARK_BASE_VIEW_HEIGHT } from "@/lib/petParkCamera";
import { isValidPetParkBuildingCapacity, PET_PARK_BUILDING_CAPACITY_MAX, PET_PARK_BUILDING_CAPACITY_MIN } from "@shared/petParkBuildingCapacity";

type ParkDraft = {
  settings: { enabledForPlayers: boolean; backgroundUrl: string | null; coinsPerHour: number; essencePerHour: number; petXpPerHour: number };
  items: { id: string; kind: "decor" | "sleep_spot" | "effect" | "terrain" }[];
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

export default function PetParkAdminPanel({ initialMode = "scene", mode, creationPosition, onCreated }: {
  initialMode?: "scene" | "effects" | "decor" | "terrain";
  mode: "create" | "settings";
  creationPosition?: { xPct: number; yPct: number };
  onCreated?: (object: CreatedParkObject) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<ParkDraft>({ queryKey: ["/api/admin/pet-park"] });
  const [rates, setRates] = useState<{ coinsPerHour: number; essencePerHour: number; petXpPerHour: number } | null>(null);
  const [publish, setPublish] = useState<boolean | null>(null);
  const [kind, setKind] = useState<"decor" | "sleep_spot">( "decor" );
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [itemSize, setItemSize] = useState(100);
  const [buildingName, setBuildingName] = useState("");
  const [buildingImage, setBuildingImage] = useState<string | null>(null);
  const [interiorImage, setInteriorImage] = useState<string | null>(null);
  const [buildingCapacity, setBuildingCapacity] = useState(PET_PARK_BUILDING_CAPACITY_MIN);

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
  const addTerrain = (type: ParkTerrainDetailType, size: number) => {
    if (mutation.isPending) return;
    mutation.mutate({ method: "POST", url: "/api/admin/pet-park/items", body: {
      kind: "terrain", effectType: type, imageData: null,
      xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5,
      size, flipped: false, layer: 0,
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
        <p className="rounded-lg border border-emerald-700/45 bg-emerald-950/35 p-3 text-sm text-emerald-100">
          Pet Park starts with grassy ground. Build your scene using the existing Building, Decor, and Effects controls.
          Expand the ground from Pet Park itself whenever you need more space.
        </p>
      </div>

      </> : <>
      {initialMode === "terrain" ? <section aria-label="Park terrain details" className="space-y-3">
        <p className="text-center text-xs text-amber-100/75">Add a soft-edged ground patch, then move, resize or remove it directly in Pet Park. Overlap path patches for trails.</p>
        <div className="grid grid-cols-2 gap-2">
          {PARK_TERRAIN_DETAIL_OPTIONS.map(option => <button key={option.type} type="button"
            data-testid={`add-park-terrain-${option.type}`} disabled={mutation.isPending}
            onClick={() => addTerrain(option.type, option.size)}
            className="min-h-20 rounded-xl border p-3 text-left transition-transform active:scale-95 disabled:opacity-40"
            style={{ background: "rgba(255,215,0,0.10)", borderColor: GOLD_BORDER }}>
            <span className="block text-sm text-[#f5cf64]">{option.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[#bd9d50]">{option.description}</span>
          </button>)}
        </div>
        <p className="text-center text-xs text-amber-100/60">{mutation.isPending ? "Adding terrain…" : "Select a patch to move it, change size, or remove it."} · {items.filter(item => item.kind === "terrain").length} patches</p>
      </section> : initialMode === "effects" ? <section aria-label="Park outdoor effects" className="space-y-3">
        <div className="text-center text-xs uppercase tracking-[0.2em] text-[#f5cf64]">Outdoor Effects</div>
        <div className="grid grid-cols-2 gap-2">
          {HOME_OUTDOOR_EFFECT_OPTIONS.map(option => <button key={option.type} type="button"
            data-testid={`add-park-effect-${option.type}`}
            disabled={mutation.isPending} onClick={() => addEffect(option.type, Math.max(24, Math.min(1000, Math.round(option.defaultSize / 100 * (PARK_BASE_VIEW_HEIGHT)))))}
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
        <div className="space-y-2">
          <label htmlFor="pet-park-new-building-capacity" className="block text-sm">Building pet capacity ({PET_PARK_BUILDING_CAPACITY_MIN}–{PET_PARK_BUILDING_CAPACITY_MAX})</label>
          <input id="pet-park-new-building-capacity" type="number" inputMode="numeric"
            aria-label="Building pet capacity" min={PET_PARK_BUILDING_CAPACITY_MIN} max={PET_PARK_BUILDING_CAPACITY_MAX} step={1}
            value={buildingCapacity} onChange={event => setBuildingCapacity(Number(event.target.value))}
            className="w-full rounded-xl border bg-[#302701] p-3 text-[#f5cf64]" style={{ borderColor: GOLD_BORDER }} />
          <div className="grid grid-cols-3 gap-2" aria-label="Quick building capacities">
            {[10, 15, 20, 25].map(capacity => <button key={capacity} type="button" aria-pressed={buildingCapacity === capacity} onClick={() => setBuildingCapacity(capacity)}
              className="rounded-xl border px-2 py-2 text-center text-sm" style={{ background: buildingCapacity === capacity ? "rgba(255,215,0,.2)" : "rgba(255,215,0,.07)", borderColor: buildingCapacity === capacity ? GOLD : GOLD_BORDER }}>
              {capacity} {capacity === 1 ? "pet" : "pets"}
            </button>)}
          </div>
          <p className="text-xs text-amber-100/60">Capacity is shared by all visitors. Each player can still deposit up to three pets in the park.</p>
        </div>
        <label className="block cursor-pointer space-y-1 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: GOLD_BORDER }}>
          {interiorImage ? "Interior image selected — tap to replace" : "Interior Background (optional)"}
          <input aria-label="Building interior image" type="file" accept="image/*" className="block w-full text-xs" onChange={e => { void selectFile(e.target.files?.[0], setInteriorImage); e.target.value = ""; }} />
        </label>
        <button type="button" disabled={mutation.isPending || !buildingName.trim() || !buildingImage || !isValidPetParkBuildingCapacity(buildingCapacity)}
          data-testid="button-create-park-building" className="w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-35"
          style={{ background: "rgba(255,215,0,.15)", borderColor: GOLD_BORDER }}
          onClick={() => mutation.mutate({ method: "POST", url: "/api/admin/pet-park/buildings", body: {
            name: buildingName.trim(), imageData: buildingImage, interiorImageData: interiorImage, maxPets: buildingCapacity,
            xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5, size: 120, flipped: false, layer: buildings.length,
          } })}>{mutation.isPending ? "Adding Building…" : "Add Building"}</button>
      </section> : <section aria-label="Add Pet Park decoration" className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {([{ value: "decor", label: "Decoration / Object" }, { value: "sleep_spot", label: "Rest Spot" }] as const).map(option => <button type="button" key={option.value}
            aria-pressed={kind === option.value} onClick={() => setKind(option.value)}
            className="rounded-xl border px-2 py-3 text-sm" style={{ background: kind === option.value ? "rgba(255,215,0,.2)" : "rgba(255,215,0,.07)", borderColor: kind === option.value ? GOLD : GOLD_BORDER }}>{option.label}</button>)}
        </div>
        {pendingImage ? <div aria-label="Pet Park decor size preview" className="relative flex h-48 items-center justify-center overflow-hidden rounded-xl border bg-[#263e29]" style={{ borderColor: GOLD_BORDER }}>
          <img src={pendingImage} alt="New park object preview" draggable={false} className="max-h-full object-contain drop-shadow-lg"
            style={{ width: Math.min(180, Math.max(42, itemSize * 0.7)), height: Math.min(180, Math.max(42, itemSize * 0.7)) }} />
          <span className="absolute bottom-2 left-3 text-[10px] text-amber-100/80">Starting size preview · {itemSize} world units</span>
          <button type="button" aria-label="Clear park object image" onClick={() => setPendingImage(null)} className="absolute right-2 top-2 rounded-full bg-black/80 p-2"><X size={16} /></button>
        </div> : <label className="block cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center text-sm" style={{ background: "rgba(255,215,0,.08)", borderColor: GOLD_BORDER }}>
          <Image className="mr-2 inline h-4 w-4" /> Upload Image (PNG/JPEG)
          <input aria-label="Scene item artwork" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e => { void selectFile(e.target.files?.[0], setPendingImage); e.target.value = ""; }} />
        </label>}
        {kind === "sleep_spot" && <>
          <p className="text-xs text-amber-100/70">Rest spots are sleep interaction areas: pets resting inside the spot sleep. An image is optional; without one the editor shows a Sleep Square.</p>
          {!pendingImage && <div aria-label="Sleep Square preview" className="mx-auto h-28 w-28"><HomeOutdoorEffectVisual type="sleep" adminPreview /></div>}
        </>}
        <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: GOLD_BORDER, background: "rgba(255,215,0,.04)" }}>
          <div className="flex items-center justify-between text-sm"><label htmlFor="park-decor-size">Starting size</label><span className="font-semibold">{itemSize} world units</span></div>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Decrease park item size" disabled={itemSize <= 40} onClick={() => setItemSize(size => Math.max(40, size - 10))}
              className="rounded-xl border p-2 disabled:opacity-40" style={{ borderColor: GOLD_BORDER }}><Minus size={17} /></button>
            <input id="park-decor-size" type="range" min={40} max={500} step={10} value={itemSize}
              onChange={event => setItemSize(Number(event.target.value))} className="min-w-0 flex-1" />
            <button type="button" aria-label="Increase park item size" disabled={itemSize >= 500} onClick={() => setItemSize(size => Math.min(500, size + 10))}
              className="rounded-xl border p-2 disabled:opacity-40" style={{ borderColor: GOLD_BORDER }}><Plus size={17} /></button>
          </div>
          <p className="text-[11px] text-amber-100/60">Size is saved when the object is created. Use Move park objects to position, resize, flip or layer it afterward.</p>
        </div>
        <button type="button" disabled={mutation.isPending || (kind === "decor" && !pendingImage)}
          data-testid="button-create-park-item" className="w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-35"
          style={{ background: "rgba(255,215,0,.15)", borderColor: GOLD_BORDER }}
          onClick={() => mutation.mutate({ method: "POST", url: "/api/admin/pet-park/items", body: {
            kind, imageData: pendingImage, effectType: null,
            xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5,
            size: itemSize, flipped: false, layer: items.length,
          } })}>{mutation.isPending ? "Adding…" : kind === "decor" ? "Add Decoration" : "Add Rest Spot"}</button>
      </section>}
      </>}
    </div>
  );
}
