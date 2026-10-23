import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ParkWaterEffect } from "@/components/ParkEffectVisual";
import { readPetParkImageData as imageData } from "@/lib/petParkImageData";

type ParkDraft = {
  settings: { enabledForPlayers: boolean; backgroundUrl: string | null; coinsPerHour: number; essencePerHour: number; petXpPerHour: number };
  items: { id: string }[];
  buildings: { id: string }[];
};
type CreatedParkObject = { kind: "building" | "item"; id: string; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };

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
  const [kind, setKind] = useState<"decor" | "sleep_spot" | "effect">(initialMode === "effects" ? "effect" : "decor");
  const [effectType, setEffectType] = useState<ParkWaterEffect>("waterfall_mist");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState("Park Cottage");
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
      {initialMode === "scene" && <section className="rounded-lg border border-amber-700/60 bg-black/50 p-3 space-y-3" aria-label="Pet Park buildings">
        <h3 className="text-lg font-semibold">Add Buildings</h3>
        <p className="text-sm text-amber-100/75">Create a building with its own interior scene. Capacity is limited to three pets; the separate park-wide limit of three pets per player still applies.</p>
        <label className="block text-sm">Building name<input aria-label="Building name" maxLength={80} value={buildingName} onChange={e => setBuildingName(e.target.value)} className="mt-1 w-full rounded bg-slate-900 p-2" /></label>
        <label className="block text-sm">Exterior artwork<input aria-label="Building exterior image" type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={async e => { const file=e.target.files?.[0]; if(file) { try { setBuildingImage(await imageData(file)); } catch(error) { toast({ title: String(error), variant: "destructive" }); } } e.target.value=""; }} /></label>
        <label className="block text-sm">Interior background<input aria-label="Building interior image" type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={async e => { const file=e.target.files?.[0]; if(file) { try { setInteriorImage(await imageData(file)); } catch(error) { toast({ title: String(error), variant: "destructive" }); } } e.target.value=""; }} /></label>
        <label className="block text-sm">Building pet capacity<select aria-label="Building pet capacity" className="mt-1 w-full rounded bg-slate-900 p-2" value={buildingCapacity} onChange={e => setBuildingCapacity(Number(e.target.value))}><option value={1}>1 pet</option><option value={2}>2 pets</option><option value={3}>3 pets</option></select></label>
        <button type="button" disabled={mutation.isPending || !buildingName.trim() || !buildingImage} className="rounded bg-amber-700 px-4 py-2 disabled:opacity-50" onClick={() => { mutation.mutate({ method: "POST", url: "/api/admin/pet-park/buildings", body: { name: buildingName, imageData: buildingImage, interiorImageData: interiorImage, maxPets: buildingCapacity, xPct: creationPosition?.xPct ?? 0.5, yPct: creationPosition?.yPct ?? 0.5, size: 120, flipped: false, layer: buildings.length } }); }}>Create building</button>
      </section>}
      {initialMode !== "scene" && <div className="scroll-mt-24 rounded-lg border border-amber-700/60 bg-black/50 p-3 space-y-3">
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
