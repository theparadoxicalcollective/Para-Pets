import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HOME_INTERIOR_EFFECT_OPTIONS } from "@/components/HomeInteriorEffect";
import PetParkInteriorRoom from "@/components/PetParkInteriorRoom";
import { readPetParkImageData } from "@/lib/petParkImageData";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import {
  HOUSE_INTERIOR_EFFECT_MAX_COUNT,
  HOUSE_INTERIOR_EFFECT_MIN_SIZE,
  HOUSE_INTERIOR_EFFECT_MAX_SIZE,
  type HouseInteriorEffect,
} from "@shared/housing";

export type ParkBuildingDetails = {
  id: string;
  name: string;
  imageUrl: string;
  interiorImageUrl: string | null;
  maxPets: number;
  interiorEffects: HouseInteriorEffect[];
};

/** Contextual building editor; no separate park viewport, reward ledger, or placement API. */
export default function PetParkBuildingDetails({
  building, onClose, onUpdated,
}: {
  building: ParkBuildingDetails;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(building.name);
  const [capacity, setCapacity] = useState(building.maxPets);
  const [effects, setEffects] = useState<HouseInteriorEffect[]>(building.interiorEffects ?? []);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState(building.interiorImageUrl);
  const dragRef = useRef<{
    id: string; pointerId: number; startX: number; startY: number; x: number; y: number;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/admin/pet-park/buildings/${building.id}`, updates);
      return res.json();
    },
    onSuccess: updated => {
      qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      if (updated?.interiorImageUrl !== undefined) setImagePreview(updated.interiorImageUrl);
      onUpdated();
    },
    onError: (error: Error) => toast({ title: "Could not update building", description: error.message, variant: "destructive" }),
  });

  const selectedEffect = effects.find(effect => effect.id === selectedEffectId);
  const addEffect = (type: HouseInteriorEffect["type"], defaultSize: number) => {
    if (effects.length >= HOUSE_INTERIOR_EFFECT_MAX_COUNT) return;
    const effect: HouseInteriorEffect = {
      id: `park-room-effect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type, x: 0.5, y: 0.5, size: defaultSize,
    };
    setEffects(previous => [...previous, effect]);
    setSelectedEffectId(effect.id);
  };
  const changeSize = (delta: number) => {
    if (!selectedEffectId) return;
    setEffects(previous => previous.map(effect => effect.id === selectedEffectId
      ? { ...effect, size: Math.max(HOUSE_INTERIOR_EFFECT_MIN_SIZE, Math.min(HOUSE_INTERIOR_EFFECT_MAX_SIZE, effect.size + delta)) }
      : effect));
  };
  const onEffectPointerDown = (event: ReactPointerEvent<HTMLDivElement>, effect: HouseInteriorEffect) => {
    if (!event.isPrimary) return;
    event.stopPropagation();
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    dragRef.current = {
      id: effect.id, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: effect.x, y: effect.y,
    };
    setSelectedEffectId(effect.id);
  };
  const onEffectPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    setEffects(previous => previous.map(effect => effect.id === drag.id
      ? {
        ...effect,
        x: Math.max(0, Math.min(1, drag.x + (event.clientX - drag.startX) / bounds.width)),
        y: Math.max(0, Math.min(1, drag.y + (event.clientY - drag.startY) / bounds.height)),
      }
      : effect));
  };
  const onEffectPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dragRef.current = null; // Save remains explicit.
  };
  const onEffectPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dragRef.current = null;
    setEffects(previous => previous.map(effect => effect.id === drag.id ? { ...effect, x: drag.x, y: drag.y } : effect));
  };
  const upload = async (file: File | undefined, field: "imageData" | "interiorImageData") => {
    if (!file) return;
    try { mutation.mutate({ [field]: await readPetParkImageData(file) }); }
    catch (error) { toast({ title: "Image upload failed", description: String(error), variant: "destructive" }); }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))]"
    role="dialog" aria-modal="true" aria-label={`Edit ${building.name}`} data-testid="pet-park-building-details">
    <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-amber-500 bg-[#10271e] text-amber-100 shadow-xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-700/50 p-3">
        <h2 className="font-semibold text-amber-300">Edit building: {building.name}</h2>
        <button type="button" onClick={onClose} className="rounded bg-slate-700 px-3 py-2 text-sm">Close</button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        <div className="space-y-2 rounded-lg border border-amber-800/60 p-3">
          <label className="block text-sm">Name
            <input aria-label="Park building name" className="mt-1 w-full rounded bg-slate-900 p-2" maxLength={80}
              value={name} onChange={event => setName(event.target.value)} />
          </label>
          <label className="block text-sm">Shared indoor capacity
            <select aria-label="Park building capacity" className="mt-1 w-full rounded bg-slate-900 p-2"
              value={capacity} onChange={event => setCapacity(Number(event.target.value))}>
              {[1, 2, 3].map(value => <option key={value} value={value}>{value} {value === 1 ? "pet" : "pets"}</option>)}
            </select>
          </label>
          <button type="button" className="rounded bg-amber-700 px-3 py-2 text-sm disabled:opacity-50"
            disabled={mutation.isPending || !name.trim() || name.trim().length > 80}
            onClick={() => mutation.mutate({ name: name.trim(), maxPets: capacity })}>Save building details</button>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">Replace exterior artwork
              <input type="file" accept="image/*" aria-label="Replace park building exterior" className="mt-1 block w-full text-xs"
                disabled={mutation.isPending} onChange={event => { const file = event.target.files?.[0]; void upload(file, "imageData"); event.target.value = ""; }} />
            </label>
            <label className="block text-sm">Replace interior background
              <input type="file" accept="image/*" aria-label="Replace park building interior" className="mt-1 block w-full text-xs"
                disabled={mutation.isPending} onChange={event => { const file = event.target.files?.[0]; void upload(file, "interiorImageData"); event.target.value = ""; }} />
            </label>
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-amber-800/60 p-3" aria-label="Edit building interior effects">
          <h3 className="font-semibold text-amber-300">Interior effects</h3>
          {imagePreview ? <>
            <p className="text-xs text-amber-100/75">Add an effect, then drag it on the real room artwork. Changes are not published until you save effects.</p>
            <PetParkInteriorRoom imageUrl={imagePreview} name={building.name} effects={effects}
              selectedEffectId={selectedEffectId} editEffects
              onEffectPointerDown={onEffectPointerDown}
              onEffectPointerMove={onEffectPointerMove}
              onEffectPointerUp={onEffectPointerUp}
              onEffectPointerCancel={onEffectPointerCancel} />
          </> : <p className="text-sm text-amber-100/70">Upload an interior background to place effects directly on the room.</p>}
          {imagePreview && <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {HOME_INTERIOR_EFFECT_OPTIONS.map(option => <button key={option.type} type="button"
                className="rounded bg-teal-900 px-2 py-2 text-left text-xs disabled:opacity-50"
                disabled={effects.length >= HOUSE_INTERIOR_EFFECT_MAX_COUNT || mutation.isPending}
                onClick={() => addEffect(option.type, option.defaultSize)}>{option.label}</button>)}
            </div>
            <p className="text-xs text-amber-100/70">{effects.length}/{HOUSE_INTERIOR_EFFECT_MAX_COUNT} effects</p>
            {selectedEffect && <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">{selectedEffect.type.replaceAll("_", " ")}</span>
              <button type="button" aria-label="Decrease interior effect size" className="rounded bg-amber-800 px-3 py-2"
                onClick={() => changeSize(-2)}>− Size</button>
              <span>{selectedEffect.size}%</span>
              <button type="button" aria-label="Increase interior effect size" className="rounded bg-amber-800 px-3 py-2"
                onClick={() => changeSize(2)}>+ Size</button>
              <button type="button" className="rounded bg-red-900 px-3 py-2" onClick={() => {
                setEffects(previous => previous.filter(effect => effect.id !== selectedEffect.id)); setSelectedEffectId(null);
              }}>Remove effect</button>
            </div>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded bg-amber-700 px-3 py-2 text-sm disabled:opacity-50"
                disabled={mutation.isPending} onClick={() => mutation.mutate({ interiorEffects: effects })}>Save interior effects</button>
              <button type="button" className="rounded bg-slate-700 px-3 py-2 text-sm"
                disabled={mutation.isPending} onClick={() => { setEffects(building.interiorEffects ?? []); setSelectedEffectId(null); }}>Cancel effect changes</button>
            </div>
          </>}
        </div>
      </div>
    </div>
  </div>;
}
