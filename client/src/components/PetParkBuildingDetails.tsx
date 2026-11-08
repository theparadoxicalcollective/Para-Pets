import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HOME_INTERIOR_EFFECT_OPTIONS } from "@/components/HomeInteriorEffect";
import { PARK_WATER_EFFECT_OPTIONS, isParkWaterEffect } from "@shared/petParkEffects";
import { isParkRoomEffect, PARK_ROOM_DEFAULT_PETS, PARK_ROOM_MIN_PETS, PARK_ROOM_MAX_PETS, type ParkRoomEffect, type ParkInteriorEffect } from "@shared/petParkRooms";
import { PET_PARK_BUILDING_CAPACITY_MIN, PET_PARK_BUILDING_CAPACITY_MAX } from "@shared/petParkBuildingCapacity";
import PetParkInteriorRoom from "@/components/PetParkInteriorRoom";
import PetParkDecorEffectEditor from "@/components/PetParkDecorEffectEditor";
import type { ParkDecorEffect } from "@shared/petParkDecorEffects";
import { readPetParkImageData } from "@/lib/petParkImageData";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import { scenePointToPlacement } from "@/lib/coordinateContracts";
import {
  HOUSE_INTERIOR_DARKNESS_MAX,
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
  isShop?: boolean;
  shopItemIds?: string[];
  interiorDarkness?: number;
  interiorNightDarkness?: number | null;
  interiorEffects: ParkInteriorEffect[];
  exteriorEffects?: ParkDecorEffect[];
};

/** Contextual building editor; no separate park viewport, reward ledger, or placement API. */
export default function PetParkBuildingDetails({
  building, onClose, onUpdated, onPreview, initialSelectedEffectId = null, initialShowEffectChoices = false,
  nightStrength = 0, sunlightStrength = 1,
}: {
  building: ParkBuildingDetails;
  onClose: () => void;
  onUpdated: () => void;
  onPreview?: () => void;
  nightStrength?: number;
  sunlightStrength?: number;
  initialSelectedEffectId?: string | null;
  initialShowEffectChoices?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(building.name);
  const [maxPets, setMaxPets] = useState(building.maxPets);
  const [isShop, setIsShop] = useState(Boolean(building.isShop));
  const [darkness, setDarkness] = useState(building.interiorDarkness ?? 35);
  const darknessRef = useRef(building.interiorDarkness ?? 35);
  const savedDarkness = useRef(building.interiorDarkness ?? 35);
  const [nightDarkness, setNightDarkness] = useState<number | null>(building.interiorNightDarkness ?? null);
  const nightDarknessRef = useRef<number | null>(building.interiorNightDarkness ?? null);
  const savedNightDarkness = useRef<number | null>(building.interiorNightDarkness ?? null);
  const [previewClock, setPreviewClock] = useState<"live" | "day" | "night">("live");
  const previewNightStrength = previewClock === "night" ? 1 : previewClock === "day" ? 0 : nightStrength;
  const previewSunlightStrength = previewClock === "night" ? 0 : previewClock === "day" ? 1 : sunlightStrength;
  const darknessSaveInFlight = useRef(false);
  const [effects, setEffects] = useState<ParkInteriorEffect[]>(building.interiorEffects ?? []);
  const [exteriorEffects, setExteriorEffects] = useState<ParkDecorEffect[]>(building.exteriorEffects ?? []);
  // Keep a confirmed server snapshot. Cancel must never revert to mount-time data.
  const savedEffects = useRef<ParkInteriorEffect[]>(building.interiorEffects ?? []);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(initialSelectedEffectId);
  const [showEffectChoices, setShowEffectChoices] = useState(initialShowEffectChoices);
  const [effectMode, setEffectMode] = useState(Boolean(initialShowEffectChoices || initialSelectedEffectId));
  const exitAfterSave = useRef(false);
  const finishEffectEditing = () => {
    if (mutation.isPending) return;
    if (JSON.stringify(effects) !== JSON.stringify(savedEffects.current)) {
      exitAfterSave.current = true;
      mutation.mutate({ interiorEffects: effects });
    } else if (onPreview) onPreview();
    else onClose();
  };

  useEffect(() => {
    const latest = building.interiorEffects ?? [];
    // The scene refreshes periodically. Preserve local unsaved edits instead of
    // overwriting them, but update clean drafts when server data changes.
    const previousSaved = savedEffects.current;
    setEffects(current => JSON.stringify(current) === JSON.stringify(previousSaved) ? latest : current);
    savedEffects.current = latest;
  }, [building.interiorEffects]);
  useEffect(() => {
    // Background scene refreshes must not overwrite an unsaved slider draft.
    if (darknessSaveInFlight.current) return;
    const incoming = building.interiorDarkness ?? 35;
    const previousSaved = savedDarkness.current;
    savedDarkness.current = incoming;
    if (darknessRef.current === previousSaved) {
      darknessRef.current = incoming;
      setDarkness(incoming);
    }
  }, [building.id, building.interiorDarkness]);
  useEffect(() => {
    if (darknessSaveInFlight.current) return;
    const incoming = building.interiorNightDarkness ?? null;
    const previouslySaved = savedNightDarkness.current;
    savedNightDarkness.current = incoming;
    if (nightDarknessRef.current === previouslySaved) {
      nightDarknessRef.current = incoming;
      setNightDarkness(incoming);
    }
  }, [building.id, building.interiorNightDarkness]);
  const [imagePreview, setImagePreview] = useState(building.interiorImageUrl);
  const dragRef = useRef<{
    id: string; pointerId: number; startX: number; startY: number; x: number; y: number;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/admin/pet-park/buildings/${building.id}`, updates);
      return res.json();
    },
    onSuccess: (updated, variables) => {
      // The PATCH response is authoritative (and may sanitize uploaded effects).
      if (variables.interiorEffects !== undefined) {
        const confirmed = (updated.interiorEffects ?? []) as ParkInteriorEffect[];
        savedEffects.current = confirmed;
        setEffects(confirmed);
        setSelectedEffectId(variables.roomImageData !== undefined ? String(variables.roomEffectId) : null);
      }
      if (variables.exteriorEffects !== undefined) setExteriorEffects(updated.exteriorEffects ?? []);
      if (typeof updated.name === "string") setName(updated.name);
      if (typeof updated.maxPets === "number") setMaxPets(updated.maxPets);
      if (typeof updated.isShop === "boolean") setIsShop(updated.isShop);
      // Unrelated PATCH responses carry an older darkness snapshot and must
      // never undo the active preview or a pending darkness-specific save.
      if (variables.interiorDarkness !== undefined && typeof updated.interiorDarkness === "number") {
        savedDarkness.current = updated.interiorDarkness;
        if (darknessRef.current === variables.interiorDarkness) {
          darknessRef.current = updated.interiorDarkness;
          setDarkness(updated.interiorDarkness);
        }
      }
      if (variables.interiorNightDarkness !== undefined && typeof updated.interiorNightDarkness === "number") {
        savedNightDarkness.current = updated.interiorNightDarkness;
        if (nightDarknessRef.current === variables.interiorNightDarkness) {
          nightDarknessRef.current = updated.interiorNightDarkness;
          setNightDarkness(updated.interiorNightDarkness);
        }
      }
      if (updated.interiorImageUrl !== undefined) setImagePreview(updated.interiorImageUrl);
      qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      onUpdated();
      if (exitAfterSave.current && variables.interiorEffects !== undefined) {
        exitAfterSave.current = false;
        if (onPreview) onPreview();
        else onClose();
      }
    },
    onError: (error: Error, variables) => {
      exitAfterSave.current = false;
      if (variables.isShop !== undefined) setIsShop(Boolean(building.isShop));
      if (variables.interiorDarkness !== undefined && darknessRef.current === variables.interiorDarkness) {
        darknessRef.current = savedDarkness.current;
        setDarkness(savedDarkness.current);
      }
      if (variables.interiorNightDarkness !== undefined && nightDarknessRef.current === variables.interiorNightDarkness) {
        nightDarknessRef.current = savedNightDarkness.current;
        setNightDarkness(savedNightDarkness.current);
      }
      toast({ title: "Could not update building", description: error.message, variant: "destructive" });
    },
  });

  const commitDarkness = (field: "interiorDarkness" | "interiorNightDarkness" = "interiorDarkness") => {
    const value = field === "interiorDarkness" ? darknessRef.current : nightDarknessRef.current;
    const saved = field === "interiorDarkness" ? savedDarkness.current : savedNightDarkness.current;
    if (darknessSaveInFlight.current || mutation.isPending || value === null || value === saved) return;
    darknessSaveInFlight.current = true;
    mutation.mutate({ [field]: value }, {
      onSettled: () => { darknessSaveInFlight.current = false; },
    });
  };

  const selectedEffect = effects.find(effect => effect.id === selectedEffectId);
  const addEffect = (type: ParkInteriorEffect["type"], defaultSize: number) => {
    if (effects.length >= HOUSE_INTERIOR_EFFECT_MAX_COUNT) return;
    const id = `park-room-effect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const effect: ParkInteriorEffect = type === "room"
      ? { id, type: "room", x: 0.5, y: 0.5, size: defaultSize, name: "Magical Room",
          view: "full_page", imageUrl: null, maxPets: PARK_ROOM_DEFAULT_PETS }
      : isParkWaterEffect(type) ? { id, type, x: 0.5, y: 0.5, size: defaultSize }
      : { id, type, x: 0.5, y: 0.5, size: defaultSize };
    setEffects(previous => [...previous, effect]);
    setSelectedEffectId(effect.id);
  };
  const changeSize = (delta: number) => {
    if (!selectedEffectId) return;
    setEffects(previous => previous.map(effect => effect.id === selectedEffectId
      ? { ...effect, size: Math.max(HOUSE_INTERIOR_EFFECT_MIN_SIZE, Math.min(HOUSE_INTERIOR_EFFECT_MAX_SIZE, effect.size + delta)) }
      : effect));
  };
  const onEffectPointerDown = (event: ReactPointerEvent<HTMLDivElement>, effect: ParkInteriorEffect) => {
    if (!event.isPrimary || mutation.isPending) return;
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
    const point = scenePointToPlacement({
      x: drag.x * bounds.width + (event.clientX - drag.startX),
      y: drag.y * bounds.height + (event.clientY - drag.startY),
    }, { left: 0, top: 0, width: bounds.width, height: bounds.height });
    if (!point) return;
    setEffects(previous => previous.map(effect => effect.id === drag.id
      ? { ...effect, x: point.xPct, y: point.yPct } : effect));
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
  const updateSelectedRoom = (patch: Partial<ParkRoomEffect>) => {
    if (!selectedEffectId) return;
    setEffects(previous => previous.map(effect => effect.id === selectedEffectId && isParkRoomEffect(effect)
      ? { ...effect, ...patch } : effect));
  };
  const uploadRoom = async (file: File | undefined) => {
    if (!file || !selectedEffect || !isParkRoomEffect(selectedEffect)) return;
    try {
      const roomImageData = await readPetParkImageData(file);
      mutation.mutate({ interiorEffects: effects, roomEffectId: selectedEffect.id, roomImageData });
    } catch (error) {
      toast({ title: "Room image upload failed", description: String(error), variant: "destructive" });
    }
  };
  const upload = async (file: File | undefined, field: "imageData" | "interiorImageData") => {
    if (!file) return;
    try { mutation.mutate({ [field]: await readPetParkImageData(file) }); }
    catch (error) { toast({ title: "Image upload failed", description: String(error), variant: "destructive" }); }
  };

  if (effectMode && imagePreview) return <div className="fixed inset-0 z-[120] overflow-hidden bg-[#10271e]"
    role="dialog" aria-modal="true" aria-label={`Edit effects on ${building.name}`}
    data-testid="pet-park-building-details" data-testid-full-room-editor="true">
    <PetParkInteriorRoom key={imagePreview} imageUrl={imagePreview} name={building.name} effects={effects}
      darkness={darkness} nightDarkness={nightDarkness}
      nightStrength={previewNightStrength} sunlightStrength={previewSunlightStrength}
      selectedEffectId={selectedEffectId} editEffects expanded
      onEffectPointerDown={onEffectPointerDown}
      onEffectPointerMove={onEffectPointerMove}
      onEffectPointerUp={onEffectPointerUp}
      onEffectPointerCancel={onEffectPointerCancel} />
    <div className="pointer-events-none absolute inset-x-3 z-30 flex items-center justify-between gap-2"
      style={{ top: "max(62px, calc(env(safe-area-inset-top, 0px) + 12px))" }}>
      <span className="pointer-events-auto max-w-[40%] truncate rounded-full border border-amber-500/50 bg-[#10291d]/95 px-3 py-2 text-xs font-semibold text-[#f5cf64]">{building.name}</span>
      <div className="pointer-events-auto flex gap-2">
        <button type="button" aria-label="Add effect inside building" disabled={mutation.isPending}
          onClick={() => setShowEffectChoices(value => !value)}
          className="rounded-full border border-amber-500/65 bg-[#245037]/95 px-3 py-2 text-xs font-semibold text-[#f5cf64]">+ Add effect</button>
        <button type="button" aria-label="Finish editing room effects" disabled={mutation.isPending}
          onClick={finishEffectEditing} className="rounded-full border border-amber-500/65 bg-[#10291d]/95 px-3 py-2 text-xs font-semibold text-[#f5cf64] disabled:opacity-50">
          {mutation.isPending ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
    <div aria-label="Edit building interior effects"
      className="pointer-events-auto absolute inset-x-3 z-30 mx-auto max-w-xl overflow-y-auto overscroll-contain rounded-xl border border-amber-500/60 bg-[#10291d]/95 px-3 py-3 text-amber-100 shadow-2xl"
      style={{ bottom: "max(12px, env(safe-area-inset-bottom, 0px))", maxHeight: showEffectChoices ? "48dvh" : "38dvh" }}>
      <p className="mb-2 text-xs text-amber-100/75">Tap an effect to select it, then drag it directly on the room. Save when finished.</p>
      <div className="mb-3 rounded-xl border border-[#b99a4c]/45 bg-[#153523] p-2.5">
        <label htmlFor="pet-park-interior-darkness" className="mb-1 flex justify-between gap-2 text-xs font-semibold text-[#f0d69d]">
          <span>Daytime darkness</span><span>{darkness}%</span>
        </label>
        <input id="pet-park-interior-darkness" data-testid="slider-park-interior-darkness"
          type="range" min={0} max={HOUSE_INTERIOR_DARKNESS_MAX} step={5} value={darkness}
          disabled={mutation.isPending}
          onPointerDown={event => event.stopPropagation()}
          onChange={event => {
            const next = Number(event.currentTarget.value);
            darknessRef.current = next;
            setDarkness(next);
          }}
          onPointerUp={event => { event.stopPropagation(); commitDarkness(); }}
          onPointerCancel={event => { event.stopPropagation(); commitDarkness(); }}
          onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) commitDarkness(); }}
          onBlur={commitDarkness}
          className="w-full accent-[#dcb970]" />
        <label htmlFor="pet-park-interior-night-darkness" className="mt-3 mb-1 flex justify-between gap-2 text-xs font-semibold text-[#f0d69d]">
          <span>Peak nighttime darkness</span><span>{Math.max(darkness, nightDarkness ?? darkness)}%</span>
        </label>
        <input id="pet-park-interior-night-darkness"
          data-testid="slider-park-interior-night-darkness"
          type="range" min={darkness} max={HOUSE_INTERIOR_DARKNESS_MAX} step={5}
          value={Math.max(darkness, nightDarkness ?? darkness)}
          disabled={mutation.isPending}
          onPointerDown={event => event.stopPropagation()}
          onChange={event => {
            const next = Number(event.currentTarget.value);
            nightDarknessRef.current = next;
            setNightDarkness(next);
          }}
          onPointerUp={event => { event.stopPropagation(); commitDarkness("interiorNightDarkness"); }}
          onPointerCancel={event => { event.stopPropagation(); commitDarkness("interiorNightDarkness"); }}
          onKeyUp={event => {
            if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key))
              commitDarkness("interiorNightDarkness");
          }}
          onBlur={() => commitDarkness("interiorNightDarkness")}
          className="w-full accent-[#dcb970]" />
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#f0d69d]">
          <span className="mr-auto">Preview</span>
          {(["live", "day", "night"] as const).map(mode => <button key={mode} type="button"
            aria-label={`Preview ${mode} interior lighting`} aria-pressed={previewClock === mode}
            onClick={() => setPreviewClock(mode)}
            className={`rounded border px-2 py-1 capitalize ${previewClock === mode
              ? "border-[#f5cf64] bg-[#245037]" : "border-[#b99a4c]/40 bg-[#112c20]"}`}>{mode}</button>)}
        </div>
        <p className="mt-1 text-[10px] text-amber-100/65">
          Both settings adjust the same darkness mask. Nighttime smoothly deepens the room without another overlay.
        </p>
      </div>
            {showEffectChoices && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[...HOME_INTERIOR_EFFECT_OPTIONS, ...PARK_WATER_EFFECT_OPTIONS.map(option => ({ ...option, defaultSize: option.interiorSize })), { type: "room" as const, label: "Room", description: "Magical doorway to an interior or a popup", defaultSize: 14 }].map(option => <button key={option.type} type="button"
                className="rounded bg-teal-900 px-2 py-2 text-left text-xs disabled:opacity-50"
                disabled={effects.length >= HOUSE_INTERIOR_EFFECT_MAX_COUNT || mutation.isPending}
                onClick={() => { addEffect(option.type, option.defaultSize); setShowEffectChoices(false); }}>{option.label}</button>)}
            </div>}
            <p className="text-xs text-amber-100/70">{effects.length}/{HOUSE_INTERIOR_EFFECT_MAX_COUNT} effects</p>
            {selectedEffect && <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">{selectedEffect.type.replaceAll("_", " ")}</span>
              <button type="button" disabled={mutation.isPending} aria-label="Decrease interior effect size" className="rounded bg-amber-800 px-3 py-2"
                onClick={() => changeSize(-2)}>− Size</button>
              <span>{selectedEffect.size}%</span>
              <button type="button" disabled={mutation.isPending} aria-label="Increase interior effect size" className="rounded bg-amber-800 px-3 py-2"
                onClick={() => changeSize(2)}>+ Size</button>
              {isParkRoomEffect(selectedEffect) && <div className="w-full space-y-3 rounded-lg border border-amber-500/45 bg-[#123324] p-3">
                <h4 className="font-semibold text-[#f5cf64]">Room settings</h4>
                <label className="block">Room name
                  <input aria-label="Room name" maxLength={60} value={selectedEffect.name}
                    onChange={event => updateSelectedRoom({ name: event.target.value })}
                    className="mt-1 w-full rounded bg-[#091e17] p-2" />
                </label>
                <label className="block">Room image
                  <input type="file" accept="image/*" aria-label="Upload room image"
                    disabled={mutation.isPending}
                    onChange={event => { void uploadRoom(event.target.files?.[0]); event.target.value = ""; }}
                    className="mt-1 block w-full text-xs" />
                </label>
                {selectedEffect.imageUrl && <img src={selectedEffect.imageUrl} alt="Room artwork preview" className="max-h-36 w-full rounded-lg object-contain" />}
                <p className="text-amber-200/70">Select how this room opens when a player taps its sparkle.</p>
                <div className="grid grid-cols-2 gap-2" aria-label="Room opening mode">
                  <button type="button" aria-pressed={selectedEffect.view === "full_page"}
                    className={`rounded-lg border px-3 py-2 ${selectedEffect.view === "full_page" ? "border-amber-300 bg-[#245037]" : "border-amber-700/40"}`}
                    onClick={() => updateSelectedRoom({ view: "full_page" })}>Full page</button>
                  <button type="button" aria-pressed={selectedEffect.view === "popup"}
                    className={`rounded-lg border px-3 py-2 ${selectedEffect.view === "popup" ? "border-amber-300 bg-[#245037]" : "border-amber-700/40"}`}
                    onClick={() => updateSelectedRoom({ view: "popup" })}>Popup</button>
                </div>
                {selectedEffect.view === "full_page" ? <label className="block w-full">
                  Maximum pets in this room ({PARK_ROOM_MIN_PETS}–{PARK_ROOM_MAX_PETS})
                  <input type="number" aria-label="Room pet capacity" min={PARK_ROOM_MIN_PETS} max={PARK_ROOM_MAX_PETS}
                    inputMode="numeric" value={selectedEffect.maxPets}
                    onChange={event => {
                      const nextCapacity = Number(event.target.value);
                      updateSelectedRoom({ maxPets: Math.max(PARK_ROOM_MIN_PETS,
                        Math.min(PARK_ROOM_MAX_PETS, Math.round(nextCapacity || PARK_ROOM_MIN_PETS))) });
                    }}
                    className="mt-1 w-full rounded bg-[#091e17] p-2" />
                </label> : <p className="text-amber-200/70">Popups are view-only. Pets cannot enter them.</p>}
                <p className="text-amber-200/70">Save effects to publish the room artwork, name, opening mode and portal placement.</p>
              </div>}
              <button type="button" disabled={mutation.isPending} className="rounded bg-red-900 px-3 py-2" onClick={() => {
                setEffects(previous => previous.filter(effect => effect.id !== selectedEffect.id)); setSelectedEffectId(null);
              }}>Remove effect</button>
            </div>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded bg-amber-700 px-3 py-2 text-sm disabled:opacity-50"
                disabled={mutation.isPending} onClick={() => mutation.mutate({ interiorEffects: effects })}>Save interior effects</button>
              <button type="button" className="rounded bg-slate-700 px-3 py-2 text-sm"
                disabled={mutation.isPending} onClick={() => { setEffects(savedEffects.current); setSelectedEffectId(null); }}>Cancel effect changes</button>
            </div>

    </div>
  </div>;

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))]"
    role="dialog" aria-modal="true" aria-label={`Edit ${building.name}`} data-testid="pet-park-building-details"
    onPointerDown={event => {
      if (event.target !== event.currentTarget || mutation.isPending) return;
      const dirty = name !== building.name || maxPets !== building.maxPets ||
        JSON.stringify(effects) !== JSON.stringify(savedEffects.current);
      if (dirty) {
        toast({ title: "Unsaved building changes", description: "Save or cancel your edits before closing." });
        return;
      }
      onClose();
    }}>
    <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-amber-500 bg-[#10271e] text-amber-100 shadow-xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-700/50 p-3">
        <h2 className="font-semibold text-amber-300">Edit building: {building.name}</h2>
        <div className="flex items-center gap-2">
          {onPreview && <button type="button" onClick={onPreview} className="rounded border border-amber-500/50 bg-[#245037] px-3 py-2 text-sm">View inside</button>}
          <button type="button" onClick={onClose} className="rounded bg-slate-700 px-3 py-2 text-sm">Close</button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-3">
        <section data-testid="pet-park-building-exterior-lamps"
          className="order-1 space-y-2 rounded-xl border border-[#b99a4c]/60 bg-[#153625] p-3">
          <h3 className="text-sm font-semibold text-amber-200">Exterior building lights & effects</h3>
          <p className="text-[11px] text-amber-100/75">
            Position lamps over the building artwork. Their brightness follows the automatic
            outdoor day/night cycle, and each lamp illuminates an area based on its size.
          </p>
          <PetParkDecorEffectEditor key={building.id} imageUrl={building.imageUrl}
            effects={exteriorEffects} disabled={mutation.isPending}
            onChange={next => {
              setExteriorEffects(next);
              mutation.mutate({ exteriorEffects: next });
            }}/>
        </section>
        <div className={`space-y-2 rounded-lg border border-amber-800/60 p-3 ${initialShowEffectChoices || initialSelectedEffectId ? "order-2" : "order-1"}`}>
          <label className="block text-sm">Name
            <input aria-label="Park building name" className="mt-1 w-full rounded bg-slate-900 p-2" maxLength={80}
              value={name} onChange={event => setName(event.target.value)} />
          </label>
          <label className="block text-sm">Maximum pets in this building ({PET_PARK_BUILDING_CAPACITY_MIN}–{PET_PARK_BUILDING_CAPACITY_MAX})
            <input type="number" aria-label="Park building capacity" min={PET_PARK_BUILDING_CAPACITY_MIN}
              max={PET_PARK_BUILDING_CAPACITY_MAX} inputMode="numeric" value={maxPets}
              onChange={event => setMaxPets(Math.max(PET_PARK_BUILDING_CAPACITY_MIN,
                Math.min(PET_PARK_BUILDING_CAPACITY_MAX, Math.round(Number(event.target.value) || PET_PARK_BUILDING_CAPACITY_MIN))))}
              className="mt-1 w-full rounded bg-[#091e17] p-2" />
          </label>
          <div className={`rounded-xl border p-3 ${isShop ? "border-[#dbbc70] bg-[#245037]" : "border-[#887552]/65 bg-[#142b20]"}`}
            data-testid="pet-park-building-shop-setting">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
              <span className="flex flex-col gap-1">
                <strong>Is Shop</strong>
                <span className={`text-xs ${isShop ? "text-[#f5d77b]" : "text-amber-100/65"}`}
                  role="status" data-testid="pet-park-shop-status">
                  {mutation.isPending ? (isShop ? "ON · Saving shop…" : "OFF · Saving building…") : isShop ? "ON · Shop enabled" : "OFF · Regular building"}
                </span>
              </span>
              <span className={`relative flex h-8 w-14 shrink-0 items-center rounded-full border-2 p-1 transition-colors ${isShop ? "border-[#e5c66a] bg-[#47734b]" : "border-[#887552] bg-[#253529]"}`}>
                <input type="checkbox" role="switch" aria-label="Is Shop building"
                  checked={isShop} disabled={mutation.isPending}
                  onChange={event => {
                    const next = event.target.checked;
                    setIsShop(next);
                    // Save the shop toggle immediately. Previously the tiny
                    // checkbox looked active but was not committed until the
                    // separate building-details Save button was pressed.
                    mutation.mutate({ isShop: next });
                  }}
                  className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait" />
                <span aria-hidden="true" className={`pointer-events-none h-5 w-5 rounded-full bg-[#f5dfad] shadow-sm transition-transform ${isShop ? "translate-x-6" : "translate-x-0"}`} />
              </span>
            </label>
            <p className="mt-2 text-[11px] text-amber-100/75">
              {isShop
                ? "Shop is ON. Enter its interior, use + Add Item, then drag the item images to stock and arrange the room."
                : "Turn on to make this building a shop. Normal buildings do not show an item shelf."}
            </p>
            {isShop && !imagePreview && <p className="mt-1 text-[11px] text-[#f5d77b]">Upload an interior background before stocking items.</p>}
          </div>
          <p className="text-xs text-amber-100/70">{isShop
            ? "Shops cannot hold pets. Any existing pets are returned to their earning spots when Shop is enabled."
            : "Regular buildings can house pets. Full-page rooms also have individual pet limits."}</p>
          <button type="button" className="rounded bg-amber-700 px-3 py-2 text-sm disabled:opacity-50"
            disabled={mutation.isPending || !name.trim() || name.trim().length > 80}
            onClick={() => mutation.mutate({ name: name.trim(), maxPets })}>Save name & capacity</button>
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
        <div className="order-2 space-y-2 rounded-lg border border-amber-800/60 p-3">
          <h3 className="font-semibold text-amber-300">Interior effects</h3>
          <p className="text-xs text-amber-100/75">Place and drag effects directly on the full-height room, like Pet Home editing.</p>
          <button type="button" aria-label="Edit effects on full-size room" disabled={!imagePreview}
            className="w-full rounded-lg border border-amber-500/60 bg-[#245037] px-4 py-3 text-sm font-semibold text-[#f5cf64] disabled:opacity-50"
            onClick={() => { setEffectMode(true); setShowEffectChoices(false); }}>Edit effects on room</button>
          {!imagePreview && <p className="text-xs text-amber-100/60">Upload an interior background first.</p>}
        </div>
      </div>
    </div>
  </div>;
}