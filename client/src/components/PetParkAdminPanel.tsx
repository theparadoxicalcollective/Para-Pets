import { useEffect, useRef, useState } from "react";
import { parkImageAspect, PARK_FALLBACK_ASPECT, PARK_WORLD_WIDTH } from "@/lib/petParkCamera";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ParkEffectVisual, type ParkWaterEffect } from "@/components/ParkEffectVisual";
import { HomeInteriorEffectsLayer } from "@/components/HomeInteriorEffect";
import { readPetParkImageData as imageData } from "@/lib/petParkImageData";

type ParkItem = {
  id: string; kind: "decor" | "sleep_spot" | "effect"; effectType?: ParkWaterEffect | null; imageUrl: string | null;
  xPct: number; yPct: number; size: number; flipped: boolean; layer: number;
};
type ParkBuilding = { id: string; name: string; imageUrl: string; interiorImageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number; maxPets: number; interiorEffects: { id: string; type: "fire" | "candle_light" | "lamp_light" | "warm_glow" | "sparkles" | "dust_motes" | "soft_mist" | "sleep"; x: number; y: number; size: number }[] };
type ParkDraft = {
  buildings: ParkBuilding[];
  settings: { enabledForPlayers: boolean; backgroundUrl: string | null; coinsPerHour: number; essencePerHour: number; petXpPerHour: number };
  items: ParkItem[];
};
type CreatedParkObject = { kind: "building" | "item"; id: string; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
export default function PetParkAdminPanel({ initialMode = "scene", mode = "editor", creationPosition, onCreated }: {
  initialMode?: "scene" | "effects" | "decor";
  mode?: "editor" | "settings" | "create";
  creationPosition?: { xPct: number; yPct: number };
  onCreated?: (object: CreatedParkObject) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ParkDraft>({ queryKey: ["/api/admin/pet-park"] });
  const [rates, setRates] = useState<{ coinsPerHour: number; essencePerHour: number; petXpPerHour: number } | null>(null);
  const [publish, setPublish] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState<"decor" | "sleep_spot" | "effect">(initialMode === "effects" ? "effect" : "decor");
  const [effectType, setEffectType] = useState<ParkWaterEffect>("waterfall_mist");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState("Park Cottage");
  const [buildingImage, setBuildingImage] = useState<string | null>(null);
  const [interiorImage, setInteriorImage] = useState<string | null>(null);
  const [buildingCapacity, setBuildingCapacity] = useState(3);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [buildingNameDraft, setBuildingNameDraft] = useState("");
  const [interiorEffectType, setInteriorEffectType] = useState<ParkBuilding["interiorEffects"][number]["type"]>("fire");
  const [backgroundAspect, setBackgroundAspect] = useState(PARK_FALLBACK_ASPECT);
  const [editing, setEditing] = useState<ParkItem | null>(null);
  const dragStart = useRef<{ x: number; y: number; id: string; xPct: number; yPct: number } | null>(null);
  const scene = useRef<HTMLDivElement>(null);
  const editorTop = useRef<HTMLDivElement>(null);
  const effectsSection = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== "editor") return;
    setKind(initialMode === "effects" ? "effect" : "decor");
    // Defer until the panel has mounted and its scroll container is measurable.
    // Keep the scene visible; scrolling straight to the form hid the drag canvas.
    requestAnimationFrame(() => editorTop.current?.scrollIntoView({ block: "start", behavior: "instant" }));
  }, [initialMode, mode]);

  useEffect(() => {
    let active = true;
    const url = data?.settings.backgroundUrl;
    if (!url) { setBackgroundAspect(PARK_FALLBACK_ASPECT); return; }
    const image = new Image();
    image.onload = () => { if (active) setBackgroundAspect(parkImageAspect(image.naturalWidth, image.naturalHeight)); };
    image.onerror = () => { if (active) setBackgroundAspect(PARK_FALLBACK_ASPECT); };
    image.src = url;
    return () => { active = false; };
  }, [data?.settings.backgroundUrl]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
  const mutation = useMutation({
    mutationFn: async ({ method, url, body }: { method: "POST" | "PUT" | "PATCH" | "DELETE"; url: string; body?: unknown }) => {
      const response = await apiRequest(method, url, body);
      return response.json();
    },
    onSuccess: (result, variables) => {
      refresh();
      if (variables.method === "POST") {
        const isBuilding = variables.url === "/api/admin/pet-park/buildings";
        const isItem = variables.url === "/api/admin/pet-park/items";
        if (isBuilding || isItem) {
          const created = result?.building ?? result?.item ?? result;
          if (isBuilding) { setBuildingImage(null); setInteriorImage(null); }
          if (isItem) setPendingImage(null);
          qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
          if (typeof created?.id === "string") {
            if (mode === "create") onCreated?.({ kind: isBuilding ? "building" : "item", id: created.id, xPct: created.xPct, yPct: created.yPct, size: created.size, flipped: created.flipped, layer: created.layer });
            else if (isItem) {
              setSelected(created.id);
              requestAnimationFrame(() => scene.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
            }
          }
        }
      }
      // Routine placement updates are confirmed in the scene; avoid an interrupting toast.
    },
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });
  const savePlacement = (item: ParkItem) => mutation.mutate({
    method: "PATCH", url: `/api/admin/pet-park/items/${item.id}`,
    body: { xPct: item.xPct, yPct: item.yPct, size: item.size, flipped: item.flipped, layer: item.layer },
  });
  const current = editing ?? data?.items.find(item => item.id === selected) ?? null;
  const items = data?.items ?? [];
  const buildings = data?.buildings ?? [];
  const selectedBuilding = buildings.find(building => building.id === selectedBuildingId) ?? null;

  return (
    <div className="space-y-4 pb-8 text-amber-100" data-testid="pet-park-admin">
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
      {mode === "create" && <div className="space-y-1">
        <h2 className="text-lg font-semibold text-amber-300">{initialMode === "scene" ? "Add building" : initialMode === "effects" ? "Add park effect" : "Add decoration"}</h2>
        <p className="text-xs text-amber-100/80">Create an object at the center of your current park view, then drag it into place on the actual map. Nothing is published by opening this panel.</p>
      </div>}
      {mode === "editor" && <>
        <h2 ref={editorTop} className="text-xl font-semibold text-amber-300">Pet Park — Scene Editor</h2>
        <p className="text-sm text-amber-100/75">Drag items on the scene, then save their placement. The park stays closed to players until enabled in the Administration Realm.</p>
      <p className="text-xs text-amber-200/80">Select an effect, decoration or rest spot on the background. Drag to position; use the controls immediately below to resize, flip or save.</p>
      {isLoading ? <p>Loading park draft…</p> : (
        <div ref={scene} className="sticky top-2 z-20 relative w-full max-w-full max-h-[48vh] overflow-hidden rounded-xl border border-amber-600 bg-emerald-950 touch-none"
          style={{ aspectRatio: `1 / ${backgroundAspect}`, width: `min(100%, ${48 / backgroundAspect}vh)`, backgroundImage: data?.settings.backgroundUrl ? `url("${data.settings.backgroundUrl}")` : undefined, backgroundSize: "100% 100%", backgroundPosition: "center" }}
          aria-label="Pet Park scene preview">
          {items.map(item => {
            const shown = editing?.id === item.id ? editing : item;
            return <button key={item.id} type="button" aria-label={`Select ${item.kind}`}
              onPointerDown={e => { dragStart.current = { x: e.clientX, y: e.clientY, id: item.id, xPct: shown.xPct, yPct: shown.yPct }; e.currentTarget.setPointerCapture(e.pointerId); setSelected(item.id); setEditing(shown); }}
              onPointerMove={e => {
                const start = dragStart.current;
                if (!start || start.id !== item.id || !scene.current) return;
                const rect = scene.current.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                setEditing(previous => previous?.id === item.id ? { ...previous,
                  xPct: Math.max(0, Math.min(1, start.xPct + (e.clientX - start.x) / rect.width)),
                  yPct: Math.max(0, Math.min(1, start.yPct + (e.clientY - start.y) / rect.height)),
                } : previous);
              }}
              onPointerCancel={() => { dragStart.current = null; setEditing(null); }}
              onPointerUp={e => {
                const start = dragStart.current; dragStart.current = null;
                if (!start || start.id !== item.id || !scene.current) return;
                const rect = scene.current.getBoundingClientRect();
                const xPct = Math.max(0, Math.min(1, start.xPct + (e.clientX - start.x) / rect.width));
                const yPct = Math.max(0, Math.min(1, start.yPct + (e.clientY - start.y) / rect.height));
                if (xPct !== start.xPct || yPct !== start.yPct) savePlacement({ ...shown, xPct, yPct });
              }}
              style={{
                position: "absolute", left: `${shown.xPct * 100}%`, top: `${shown.yPct * 100}%`,
                width: `${shown.size / PARK_WORLD_WIDTH * 100}%`, aspectRatio: "1 / 1",
                transform: "translate(-50%, -50%)", zIndex: shown.layer + 10001,
                border: selected === item.id ? "2px solid gold" : "1px dashed rgba(255,255,255,.5)",
                borderRadius: 8, background: shown.kind === "sleep_spot" ? "rgba(217,119,6,.45)" : "transparent",
                touchAction: "none",
              }}>
              {shown.kind === "effect" && shown.effectType ? <ParkEffectVisual type={shown.effectType} /> : shown.imageUrl ? <img src={shown.imageUrl} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" style={{ transform: shown.flipped ? "scaleX(-1)" : undefined }} /> : <span className="text-xs">Rest</span>}
            </button>;
          })}
          {!data?.settings.backgroundUrl && <p className="absolute bottom-2 left-2 text-xs">Upload a background to begin.</p>}
        </div>
      )}
      {current && <div className="rounded-lg border border-amber-600 bg-black/60 p-3 space-y-3">
        <h3 className="font-semibold">Selected {current.kind === "decor" ? "decoration / building" : current.kind === "effect" ? "water effect" : "rest spot"}</h3>
        {(["xPct", "yPct", "size", "layer"] as const).map(field => <label key={field} className="flex items-center gap-3 text-sm">
          <span className="w-16">{field}</span>
          <input aria-label={field} className="min-w-0 flex-1 rounded bg-slate-900 p-2" type="number"
            min={field === "size" ? 1 : field === "layer" ? -10000 : 0}
            max={field === "size" ? 1000 : field === "layer" ? 10000 : 1}
            step={field === "xPct" || field === "yPct" ? 0.01 : 1}
            value={current[field]} onChange={e => setEditing({ ...current, [field]: Number(e.target.value) })} />
        </label>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-label="Decrease selected park item size" className="rounded bg-amber-800 px-3 py-2"
            onClick={() => setEditing({ ...current, size: Math.max(1, current.size - 20) })}>− Size</button>
          <button type="button" aria-label="Increase selected park item size" className="rounded bg-amber-800 px-3 py-2"
            onClick={() => setEditing({ ...current, size: Math.min(1000, current.size + 20) })}>+ Size</button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={current.flipped} onChange={e => setEditing({ ...current, flipped: e.target.checked })} /> Flip horizontally
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={mutation.isPending} className="rounded bg-amber-700 px-4 py-2" onClick={() => { savePlacement(current); setEditing(null); }}>Save placement</button>
          <button type="button" disabled={mutation.isPending} className="rounded bg-red-900 px-4 py-2" onClick={() => {
            if (window.confirm("Remove this park item?")) { mutation.mutate({ method: "DELETE", url: `/api/admin/pet-park/items/${current.id}` }); setSelected(null); setEditing(null); }
          }}>Remove item</button>
        </div>
      </div>}
      </>}
      {(mode === "editor" || initialMode === "scene") && <section className="rounded-lg border border-amber-700/60 bg-black/50 p-3 space-y-3" aria-label="Pet Park buildings">
        <h3 className="text-lg font-semibold">Add Buildings</h3>
        <p className="text-sm text-amber-100/75">Create a building with its own interior scene. Capacity is limited to three pets; the separate park-wide limit of three pets per player still applies.</p>
        <label className="block text-sm">Building name<input aria-label="Building name" maxLength={80} value={buildingName} onChange={e => setBuildingName(e.target.value)} className="mt-1 w-full rounded bg-slate-900 p-2" /></label>
        <label className="block text-sm">Exterior artwork<input aria-label="Building exterior image" type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={async e => { const file=e.target.files?.[0]; if(file) { try { setBuildingImage(await imageData(file)); } catch(error) { toast({ title: String(error), variant: "destructive" }); } } e.target.value=""; }} /></label>
        <label className="block text-sm">Interior background<input aria-label="Building interior image" type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={async e => { const file=e.target.files?.[0]; if(file) { try { setInteriorImage(await imageData(file)); } catch(error) { toast({ title: String(error), variant: "destructive" }); } } e.target.value=""; }} /></label>
        <label className="block text-sm">Building pet capacity<select aria-label="Building pet capacity" className="mt-1 w-full rounded bg-slate-900 p-2" value={buildingCapacity} onChange={e => setBuildingCapacity(Number(e.target.value))}><option value={1}>1 pet</option><option value={2}>2 pets</option><option value={3}>3 pets</option></select></label>
        <button type="button" disabled={mutation.isPending || !buildingName.trim() || !buildingImage} className="rounded bg-amber-700 px-4 py-2 disabled:opacity-50" onClick={() => { mutation.mutate({ method: "POST", url: "/api/admin/pet-park/buildings", body: { name: buildingName, imageData: buildingImage, interiorImageData: interiorImage, maxPets: buildingCapacity, xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5, size: 120, flipped: false, layer: buildings.length } }); }}>Create building</button>
        {mode === "editor" && <div className="space-y-2">{buildings.map(building => <div key={building.id} className="rounded border border-amber-800/60 p-2 space-y-2">
          <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => { const next = selectedBuildingId === building.id ? null : building.id; setSelectedBuildingId(next); setBuildingNameDraft(next ? building.name : ""); }}><img src={building.imageUrl} alt="" className="h-14 w-14 rounded object-contain" /><span className="min-w-0 flex-1"><strong>{building.name}</strong><span className="block text-xs text-amber-100/70">{building.interiorImageUrl ? "Interior uploaded" : "Interior background not set"} · capacity {building.maxPets}</span></span></button>
          {selectedBuildingId === building.id && <div className="space-y-2">
            <label className="block text-sm">Name<input aria-label="Edit building name" maxLength={80} className="mt-1 w-full rounded bg-slate-900 p-2" value={buildingNameDraft} onChange={e => setBuildingNameDraft(e.target.value)} /><button type="button" className="mt-1 rounded bg-amber-800 px-3 py-2" disabled={!buildingNameDraft.trim() || mutation.isPending} onClick={() => mutation.mutate({ method: "PATCH", url: `/api/admin/pet-park/buildings/${building.id}`, body: { name: buildingNameDraft.trim() } })}>Save name</button></label>
            <label className="block text-sm">Capacity<select aria-label="Edit building capacity" className="mt-1 w-full rounded bg-slate-900 p-2" value={building.maxPets} onChange={e => mutation.mutate({ method: "PATCH", url: `/api/admin/pet-park/buildings/${building.id}`, body: { maxPets: Number(e.target.value) } })}><option value={1}>1 pet</option><option value={2}>2 pets</option><option value={3}>3 pets</option></select></label>
            <label className="block text-sm">Replace interior background<input aria-label="Replace building interior image" type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={async e => { const file=e.target.files?.[0]; if(file) { try { mutation.mutate({ method: "PATCH", url: `/api/admin/pet-park/buildings/${building.id}`, body: { interiorImageData: await imageData(file) } }); } catch(error) { toast({ title: String(error), variant: "destructive" }); } } e.target.value=""; }} /></label>
            <div className="flex flex-wrap items-center gap-2"><label className="text-sm">Interior effect<select aria-label="Interior effect type" className="ml-2 rounded bg-slate-900 p-2" value={interiorEffectType} onChange={e => setInteriorEffectType(e.target.value as typeof interiorEffectType)}>{["fire","candle_light","lamp_light","warm_glow","sparkles","dust_motes","soft_mist","sleep"].map(type => <option key={type} value={type}>{type.replaceAll("_"," ")}</option>)}</select></label>
            <button type="button" className="rounded bg-teal-800 px-3 py-2 text-sm" onClick={() => mutation.mutate({ method: "PATCH", url: `/api/admin/pet-park/buildings/${building.id}`, body: { interiorEffects: [...building.interiorEffects, { id: `park-effect-${Date.now()}`, type: interiorEffectType, x: 0.5, y: 0.5, size: 12 }] } })}>Add interior effect</button></div>
            <div className="flex flex-wrap gap-2">{building.interiorEffects.map(effect => <button key={effect.id} type="button" className="rounded bg-slate-800 px-2 py-1 text-xs" onClick={() => mutation.mutate({ method: "PATCH", url: `/api/admin/pet-park/buildings/${building.id}`, body: { interiorEffects: building.interiorEffects.filter(item => item.id !== effect.id) } })}>Remove {effect.type.replaceAll("_"," ")}</button>)}</div>
            {building.interiorImageUrl && <div className="relative overflow-hidden rounded border border-amber-800"><img src={building.interiorImageUrl} alt={`${building.name} interior preview`} className="block max-h-64 w-full object-contain" /><HomeInteriorEffectsLayer effects={building.interiorEffects ?? []} panX={0} imgWidth={500} sceneHeight={260} /></div>}
            <div className="grid grid-cols-2 gap-2">{(["xPct","yPct","size","layer"] as const).map(field => <label key={field} className="text-xs">{field}<input type="number" className="mt-1 w-full rounded bg-slate-900 p-2" value={building[field]} min={field === "size" ? 1 : field === "layer" ? -10000 : 0} max={field === "size" ? 1000 : field === "layer" ? 10000 : 1} step={field === "xPct" || field === "yPct" ? 0.01 : 1} onChange={e => mutation.mutate({ method: "PATCH", url: `/api/admin/pet-park/buildings/${building.id}`, body: { [field]: Number(e.target.value) } })} /></label>)}</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={building.flipped} onChange={e => mutation.mutate({ method: "PATCH", url: `/api/admin/pet-park/buildings/${building.id}`, body: { flipped: e.target.checked } })}/>Flip exterior</label>
            <button type="button" className="rounded bg-red-900 px-3 py-2 text-sm" onClick={() => { if(window.confirm(`Delete ${building.name}?`)) { mutation.mutate({ method: "DELETE", url: `/api/admin/pet-park/buildings/${building.id}` }); setSelectedBuildingId(null); } }}>Delete building</button>
          </div>}
        </div>)}</div>}
      </section>}
      {(mode === "editor" || initialMode !== "scene") && <div ref={effectsSection} className="scroll-mt-24 rounded-lg border border-amber-700/60 bg-black/50 p-3 space-y-3">
        <h3 className="font-semibold">{initialMode === "effects" ? "Add effects & rest spots" : initialMode === "decor" ? "Add decoration" : "Add park scenery"}</h3>
        <select aria-label="Scene item type" className="w-full rounded bg-slate-900 p-2" value={kind} onChange={e => setKind(e.target.value as "decor" | "sleep_spot" | "effect")}>
          <option value="decor">Decoration</option><option value="sleep_spot">Interactive rest spot</option><option value="effect">Water effect</option>
        </select>
        {kind === "effect" && <label className="block text-sm">Water effect
          <select aria-label="Water effect type" value={effectType} onChange={e => setEffectType(e.target.value as ParkWaterEffect)}
            className="mt-1 w-full rounded bg-slate-900 p-2">
            <option value="waterfall_mist">Waterfall base mist</option>
            <option value="water_ripple">Expanding water ripples</option>
            <option value="water_shimmer">Water shimmer</option>
          </select>
        </label>}
        {kind !== "effect" && <input aria-label="Scene item artwork" type="file" accept="image/*" className="w-full text-xs"
          onChange={async e => {
            const file = e.target.files?.[0]; if (!file) return;
            try { setPendingImage(await imageData(file)); } catch (error) { toast({ title: String(error), variant: "destructive" }); }
            e.target.value = "";
          }} />}
        <button type="button" disabled={mutation.isPending || (kind === "decor" && !pendingImage)}
          className="rounded bg-amber-700 px-4 py-2 disabled:opacity-50"
          onClick={() => { mutation.mutate({ method: "POST", url: "/api/admin/pet-park/items", body: { kind, effectType: kind === "effect" ? effectType : null, imageData: kind === "effect" ? null : pendingImage, xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5, size: 100, flipped: false, layer: items.length } }); }}>
          Add to park
        </button>
      </div>}

      </>}
    </div>
  );
}
