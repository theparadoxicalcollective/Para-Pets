import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Minus, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HOME_OUTDOOR_EFFECT_OPTIONS } from "@/components/HomeInteriorEffect";
import PetParkDecorEffectEditor from "@/components/PetParkDecorEffectEditor";
import type { ParkDecorEffect } from "@shared/petParkDecorEffects";
import { readPetParkImageData as imageData } from "@/lib/petParkImageData";
import { PARK_WATER_EFFECT_OPTIONS, PARK_FIREFLIES_OPTION, DEFAULT_PARK_LIGHT_COLOR, type ParkEffectType } from "@shared/petParkEffects";
import { PARK_BASE_VIEW_HEIGHT } from "@/lib/petParkCamera";
import { PET_PARK_BUILDING_CAPACITY_MIN } from "@shared/petParkBuildingCapacity";

type ParkDraft = {
  settings: { enabledForPlayers: boolean; enabledForModerators: boolean; backgroundUrl: string | null; coinsPerHour: number; essencePerHour: number; petXpPerHour: number };
  items: { id: string; kind: "decor" | "sleep_spot" | "effect" | "terrain" }[];
  buildings: { id: string }[];
};
type CreatedParkObject = { kind: "building" | "item"; id: string; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };

const GOLD_BORDER = "rgba(255,215,0,0.38)";
const GOLD = "#f5cf64";

export default function PetParkAdminPanel({ initialMode = "scene", mode, creationPosition, onCreated }: {
  initialMode?: "scene" | "effects" | "decor";
  mode: "create" | "settings";
  creationPosition?: { xPct: number; yPct: number };
  onCreated?: (object: CreatedParkObject) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<ParkDraft>({ queryKey: ["/api/admin/pet-park"] });
  const [rates, setRates] = useState<{ coinsPerHour: number; essencePerHour: number; petXpPerHour: number } | null>(null);
  const [publish, setPublish] = useState<boolean | null>(null);
  const [moderatorPreview, setModeratorPreview] = useState<boolean | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingTapImage, setPendingTapImage] = useState<string | null>(null);
  const [newWaterSource, setNewWaterSource] = useState(false);
  const [newDecorEffects, setNewDecorEffects] = useState<ParkDecorEffect[]>([]);
  const [lampLightColor, setColoredLightColor] = useState(DEFAULT_PARK_LIGHT_COLOR);
  const [itemSize, setItemSize] = useState(100);
  const [buildingName, setBuildingName] = useState("");
  const [buildingSize, setBuildingSize] = useState(300);
  const [buildingIsShop, setBuildingIsShop] = useState(false);
  const [buildingImage, setBuildingImage] = useState<string | null>(null);
  const [interiorImage, setInteriorImage] = useState<string | null>(null);
  const [nightInteriorImage, setNightInteriorImage] = useState<string | null>(null);

  const items = data?.items ?? [];
  const buildings = data?.buildings ?? [];
  const mutation = useMutation({
    mutationFn: async ({ method, url, body }: { method: "POST" | "PUT"; url: string; body?: unknown }) => {
      const response = await apiRequest(method, url, body);
      return response.json();
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      if (variables.method !== "POST") {
        setRates(null); setPublish(null); setModeratorPreview(null);
        setSettingsSaved(true);
        qc.invalidateQueries({ queryKey: ["/api/pet-park/status"] });
        qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
        return;
      }
      const isBuilding = variables.url === "/api/admin/pet-park/buildings";
      const isItem = variables.url === "/api/admin/pet-park/items";
      if (!isBuilding && !isItem) return;
      const created = result?.building ?? result?.item ?? result;
      if (isBuilding) { setBuildingImage(null); setInteriorImage(null); setBuildingIsShop(false); }
      if (isItem) { setPendingImage(null); setPendingTapImage(null); setNewWaterSource(false); setNewDecorEffects([]); }
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
      kind: "effect", effectType: type, effectColor: (type === "colored_light" || type === "lamp_light") ? lampLightColor : null, imageData: null,
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
          <button type="button" className="rounded bg-[#245037] px-3 py-2 text-sm" onClick={() => { setSettingsSaved(false); setRates({ coinsPerHour: 60, essencePerHour: 24, petXpPerHour: 300 }); }}>Use recommended reward rates</button>
          {(["coinsPerHour", "essencePerHour", "petXpPerHour"] as const).map(key => <label key={key} className="flex items-center justify-between gap-2 text-sm">
            <span>{key === "coinsPerHour" ? "Coins / hour" : key === "essencePerHour" ? "Essence / hour" : "Pet XP / hour"}</span>
            <input type="number" min={0} max={10000} step={1} aria-label={key} className="w-24 rounded bg-[#0b2016] p-2"
              value={(rates ?? data?.settings)?.[key] ?? 0}
              onChange={e => { setSettingsSaved(false); setRates({ coinsPerHour: (rates ?? data?.settings)?.coinsPerHour ?? 0,
                essencePerHour: (rates ?? data?.settings)?.essencePerHour ?? 0,
                petXpPerHour: (rates ?? data?.settings)?.petXpPerHour ?? 0, [key]: Number(e.target.value) }); }} />
          </label>)}
          {([
            { key: "players", label: "Open Pet Park to players", checked: publish ?? data?.settings.enabledForPlayers ?? false,
              setChecked: setPublish, description: "Allow all players to enter the park." },
            { key: "moderators", label: "Open Pet Park to moderators", checked: moderatorPreview ?? data?.settings.enabledForModerators ?? false,
              setChecked: setModeratorPreview, description: "Allow moderators to enter the normal player park while public access is closed." },
          ] as const).map(option => <div key={option.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/45 bg-[#10291d]/75 p-3">
            <div className="min-w-0">
              <div id={`park-access-${option.key}`} className="text-sm font-semibold text-amber-100">{option.label}</div>
              <div className="mt-1 text-xs text-amber-100/65">{option.description}</div>
              <div className="mt-1 text-xs font-semibold text-[#f5cf64]">{option.checked ? "On" : "Off"}</div>
            </div>
            <button type="button" role="switch" aria-checked={option.checked}
              aria-labelledby={`park-access-${option.key}`}
              aria-label={option.key === "players" ? "Allow players into Pet Park" : "Allow moderators into Pet Park"}
              disabled={!data || mutation.isPending}
              onClick={() => { setSettingsSaved(false); option.setChecked(!option.checked); }}
              className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5cf64] disabled:opacity-50 ${option.checked ? "border-[#f5cf64] bg-[#245037]" : "border-amber-800/70 bg-[#24312b]"}`}>
              <span aria-hidden="true" className={`absolute top-1 h-6 w-6 rounded-full shadow transition-[left] ${option.checked ? "left-7 bg-[#f5cf64]" : "left-1 bg-[#c5bda4]"}`} />
            </button>
          </div>)}
          {(publish !== null || moderatorPreview !== null) && <p role="status" className="text-xs text-[#f5cf64]">Unsaved access changes — tap Save below to apply.</p>}
          {settingsSaved && <p role="status" className="text-xs font-semibold text-[#b6dcab]">Pet Park settings saved.</p>}
          <p className="text-xs text-amber-100/70">Moderator access allows staff to preview the normal player park without editing controls. It does not publish the park to everyone.</p>
          <button type="button" className="rounded bg-[#245037] px-4 py-2 disabled:opacity-50" disabled={mutation.isPending || !data}
            onClick={() => {
              mutation.mutate({ method: "PUT", url: "/api/admin/pet-park/publishing",
                body: { enabledForPlayers: publish ?? data!.settings.enabledForPlayers,
                  enabledForModerators: moderatorPreview ?? data!.settings.enabledForModerators,
                  coinsPerHour: (rates ?? data!.settings).coinsPerHour,
                  essencePerHour: (rates ?? data!.settings).essencePerHour,
                  petXpPerHour: (rates ?? data!.settings).petXpPerHour } });
              // Keep local edits until the server confirms success; the response invalidates both park views.
            }}>Save reward rates & park availability</button>
        </div>
        <p className="rounded-lg border border-emerald-700/45 bg-emerald-950/35 p-3 text-sm text-emerald-100">
          Pet Park starts with grassy ground. Build your scene using the existing Building, Decor, and Effects controls.
          Expand the ground from Pet Park itself whenever you need more space.
        </p>
      </div>

      </> : <>
      {initialMode === "effects" ? <section aria-label="Park outdoor effects" className="space-y-3">
        <div className="text-center text-xs uppercase tracking-[0.2em] text-[#f5cf64]">Outdoor Effects</div>
        <label className="flex items-center justify-between rounded-xl border border-[#b99a4c]/55 bg-[#173b28] p-3 text-xs">
          Lamp Light color
          <input type="color" aria-label="New Pet Park lamp light color"
            data-testid="park-standalone-light-color" value={lampLightColor}
            onChange={event => setColoredLightColor(event.target.value)}
            className="h-9 w-14 rounded border border-[#b99a4c]/60 bg-transparent" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {HOME_OUTDOOR_EFFECT_OPTIONS.map(option => <button key={option.type} type="button"
            data-testid={`add-park-effect-${option.type}`}
            disabled={mutation.isPending} onClick={() => addEffect(option.type, Math.max(24, Math.min(1000, Math.round(option.defaultSize / 100 * (PARK_BASE_VIEW_HEIGHT)))))}
            className="min-h-20 rounded-xl border p-3 text-left transition-transform active:scale-95 disabled:opacity-40"
            style={{ background: "rgba(26,64,41,0.82)", borderColor: GOLD_BORDER }}>
            <span className="block text-sm text-[#f5cf64]">{option.type === "sleep" ? "Rest Spot (Sleep Square)" : option.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[#bd9d50]">{option.description}</span>
          </button>)}
          <button type="button" data-testid="add-park-effect-fireflies"
            disabled={mutation.isPending}
            onClick={() => addEffect("fireflies", PARK_FIREFLIES_OPTION.defaultSize)}
            className="min-h-20 rounded-xl border p-3 text-left transition-transform active:scale-95 disabled:opacity-40"
            style={{ background: "rgba(26,64,41,0.82)", borderColor: GOLD_BORDER }}>
            <span className="block text-sm text-[#f5cf64]">{PARK_FIREFLIES_OPTION.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[#bd9d50]">{PARK_FIREFLIES_OPTION.description}</span>
          </button>
        </div>
        <div className="pt-2 text-center text-xs uppercase tracking-[0.2em] text-[#f5cf64]">Water Effects</div>
        <div className="grid grid-cols-2 gap-2">
          {PARK_WATER_EFFECT_OPTIONS.map(option => <button key={option.type} type="button"
            data-testid={`add-park-effect-${option.type}`}
            disabled={mutation.isPending} onClick={() => addEffect(option.type, option.defaultSize)}
            className="min-h-20 rounded-xl border p-3 text-left transition-transform active:scale-95 disabled:opacity-40"
            style={{ background: "rgba(26,64,41,0.82)", borderColor: GOLD_BORDER }}>
            <span className="block text-sm text-[#f5cf64]">{option.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-[#bd9d50]">{option.description}</span>
          </button>)}
        </div>
        <p className="text-center text-xs text-amber-100/60">{mutation.isPending ? "Adding effect…" : "Tap to add an effect, then drag it to the right spot on the park."} · {items.filter(item => item.kind === "effect").length} effects</p>
      </section> : initialMode === "scene" ? <section aria-label="Add Pet Park building" className="space-y-4">
        {buildingImage ? <div className="relative h-32 rounded-xl border bg-black/40" style={{ borderColor: GOLD_BORDER }}>
          <img src={buildingImage} alt="New building preview" className="h-full w-full object-contain" />
          <button type="button" aria-label="Clear building image" onClick={() => setBuildingImage(null)} className="absolute right-2 top-2 rounded-full bg-black/80 p-2"><X size={16} /></button>
        </div> : <label className="block cursor-pointer rounded-xl border border-dashed px-4 py-4 text-center text-sm" style={{ background: "rgba(26,64,41,0.82)", borderColor: GOLD_BORDER }}>
          <Image className="mr-2 inline h-4 w-4" /> Upload Building Image (PNG/JPEG)
          <input aria-label="Building exterior image" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e => { void selectFile(e.target.files?.[0], setBuildingImage); e.target.value = ""; }} />
        </label>}
        <label className="block space-y-1 text-sm">Building Name
          <input aria-label="Building name" placeholder="e.g. Woodland Cottage" maxLength={80} value={buildingName} onChange={e => setBuildingName(e.target.value)}
            className="w-full rounded-xl border bg-[#10291d] p-3 placeholder:text-amber-100/45" style={{ borderColor: GOLD_BORDER }} />
        </label>
        <div className="space-y-2 rounded-xl border border-[#b99a4c]/50 bg-[#173b2a]/85 p-3">
          <label htmlFor="park-building-starting-size" className="flex justify-between gap-2 text-sm">
            <span>Starting building size</span><strong>{buildingSize} world units</strong>
          </label>
          <input id="park-building-starting-size" aria-label="Building starting size" type="range"
            min={120} max={700} step={20} value={buildingSize}
            onChange={event => setBuildingSize(Number(event.target.value))}
            className="w-full accent-[#d6b66e]" />
          <p className="text-[11px] text-amber-100/65">Larger starting size helps the artwork match the park. You can still adjust individual building sizes after placing them.</p>
        </div>
        <label className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border p-3 text-sm ${buildingIsShop ? "border-[#e0bf76] bg-[#28543a]" : "border-[#b99a4c]/50 bg-[#173b2a]/85"}`}>
          <span className="flex flex-col gap-1"><strong>Is Shop</strong>
            <span className="text-xs text-[#f3dbad]" role="status" data-testid="pet-park-new-building-shop-status">
              {buildingIsShop ? "ON · New building will be a shop" : "OFF · Regular building"}
            </span>
          </span>
          <span className={`relative flex h-8 w-14 shrink-0 items-center rounded-full border-2 p-1 ${buildingIsShop ? "border-[#e5c66a] bg-[#47734b]" : "border-[#887552] bg-[#253529]"}`}>
            <input type="checkbox" role="switch" aria-label="Is Shop building" checked={buildingIsShop}
              onChange={event => setBuildingIsShop(event.target.checked)}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
            <span aria-hidden="true" className={`pointer-events-none h-5 w-5 rounded-full bg-[#f5dfad] shadow-sm transition-transform ${buildingIsShop ? "translate-x-6" : "translate-x-0"}`} />
          </span>
        </label>
        <p className="text-[11px] text-amber-100/70">After creating a shop, enter its uploaded interior to select merchandise with + Add Item.</p>
        <p className="text-xs text-amber-100/75">{buildingIsShop
          ? "Shops display merchandise indoors and do not house pets."
          : "Regular buildings can house park pets and display interior effects and magical rooms."}</p>
        <label className="block cursor-pointer space-y-1 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: GOLD_BORDER }}>
          {interiorImage ? "Daytime interior selected — tap to replace" : "Daytime Interior Background (optional)"}
          <input aria-label="Building interior image" type="file" accept="image/*" className="block w-full text-xs" onChange={e => { void selectFile(e.target.files?.[0], setInteriorImage); e.target.value = ""; }} />
        </label>
        <label className="block cursor-pointer space-y-1 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: GOLD_BORDER }}>
          {nightInteriorImage ? "Nighttime interior selected — tap to replace" : "Nighttime Interior Background (optional)"}
          <input aria-label="New park nighttime interior image" type="file" accept="image/*" className="block w-full text-xs"
            onChange={e => { void selectFile(e.target.files?.[0], setNightInteriorImage); e.target.value = ""; }} />
        </label>
        <button type="button" disabled={mutation.isPending || !buildingName.trim() || !buildingImage}
          data-testid="button-create-park-building" className="w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-35"
          style={{ background: "rgba(26,64,41,0.85)", borderColor: GOLD_BORDER }}
          onClick={() => mutation.mutate({ method: "POST", url: "/api/admin/pet-park/buildings", body: {
            name: buildingName.trim(), imageData: buildingImage, interiorImageData: interiorImage, nightInteriorImageData: nightInteriorImage, maxPets: PET_PARK_BUILDING_CAPACITY_MIN,
            xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5, size: buildingSize, isShop: buildingIsShop, flipped: false, layer: 0,
          } })}>{mutation.isPending ? "Adding Building…" : "Add Building"}</button>
      </section> : <section aria-label="Add Pet Park decoration" className="space-y-4">
        <p className="text-xs text-amber-100/75">Upload decoration or object artwork. For pet resting areas, use + Effects → Rest Spot (Sleep Square).</p>
        {pendingImage ? <div aria-label="Pet Park decor size preview" className="relative flex h-48 items-center justify-center overflow-hidden rounded-xl border bg-[#263e29]" style={{ borderColor: GOLD_BORDER }}>
          <img src={pendingImage} alt="New park object preview" draggable={false} className="max-h-full object-contain drop-shadow-lg"
            style={{ width: Math.min(180, Math.max(42, itemSize * 0.7)), height: Math.min(180, Math.max(42, itemSize * 0.7)) }} />
          <span className="absolute bottom-2 left-3 text-[10px] text-amber-100/80">Starting size preview · {itemSize} world units</span>
          <button type="button" aria-label="Clear park object image" onClick={() => setPendingImage(null)} className="absolute right-2 top-2 rounded-full bg-black/80 p-2"><X size={16} /></button>
        </div> : <label className="block cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center text-sm" style={{ background: "rgba(26,64,41,0.82)", borderColor: GOLD_BORDER }}>
          <Image className="mr-2 inline h-4 w-4" /> Upload Image (PNG/JPEG)
          <input aria-label="Scene item artwork" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e => { void selectFile(e.target.files?.[0], setPendingImage); e.target.value = ""; }} />
        </label>}
        <div className="space-y-2 rounded-xl border border-[#b99a4c]/50 bg-[#173b2a]/85 p-3">
          <strong className="block text-sm text-[#f5d98e]">Tap Image <span className="text-[11px] font-normal text-amber-100/70">(optional)</span></strong>
          <p className="text-[11px] text-amber-100/75">Alternate art shown when a player taps this decoration. Tap again to switch back (for example, an open gate).</p>
          {pendingTapImage && <div className="relative flex h-28 items-center justify-center rounded-lg border border-[#c9a65e]/40 bg-[#0b2418] p-2">
            <img src={pendingTapImage} alt="Alternate Tap Image preview" draggable={false} className="h-full w-full object-contain" />
            <button type="button" aria-label="Remove Tap Image" onClick={() => setPendingTapImage(null)} className="absolute right-1 top-1 rounded-full border border-[#c9a65e]/50 bg-[#153521] p-2"><X size={16} /></button>
          </div>}
          <label className="block cursor-pointer rounded-lg border border-dashed border-[#b99a4c]/60 bg-[#143324] px-3 py-3 text-center text-xs text-[#efd599]">
            <Image size={15} className="mr-1 inline" />{pendingTapImage ? "Replace Tap Image" : "Upload Tap Image (PNG/JPEG)"}
            <input aria-label="Decoration Tap Image" type="file" accept="image/png,image/jpeg" className="sr-only"
              onChange={event => { void selectFile(event.target.files?.[0], setPendingTapImage); event.target.value = ""; }} />
          </label>
        </div>
        <PetParkDecorEffectEditor imageUrl={pendingImage} effects={newDecorEffects}
          onChange={setNewDecorEffects} />
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
          <p className="text-[11px] text-amber-100/60">Size is saved when the object is created. Use Move park objects to position, resize or flip it afterward. Depth follows ground position automatically.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#b99a4c]/50 bg-[#173b2a]/85 p-3 text-xs text-[#f4d795]">
          <input aria-label="Water Source" type="checkbox" checked={newWaterSource}
            onChange={event => setNewWaterSource(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#d8bc67]" />
          <span><strong className="block text-sm">Water Source</strong>
            <span className="block text-[11px] text-amber-100/75">Allow refillable garden tools to collect water here. This decoration keeps its artwork and placement.</span>
          </span>
        </label>
        <button type="button" disabled={mutation.isPending || !pendingImage}
          data-testid="button-create-park-item" className="w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-35"
          style={{ background: "rgba(26,64,41,0.85)", borderColor: GOLD_BORDER }}
          onClick={() => mutation.mutate({ method: "POST", url: "/api/admin/pet-park/items", body: {
            kind: "decor", imageData: pendingImage, tapImageData: pendingTapImage,
            decorEffects: newDecorEffects, effectType: null, isWaterSource: newWaterSource,
            xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5,
            size: itemSize, flipped: false, layer: 0,
          } })}>{mutation.isPending ? "Adding…" : "Add Decoration"}</button>
      </section>}
      </>}
    </div>
  );
}
