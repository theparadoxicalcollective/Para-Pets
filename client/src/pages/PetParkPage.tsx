import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import PetParkAdminPanel from "@/components/PetParkAdminPanel";
import { ParkEffectVisual, type ParkWaterEffect } from "@/components/ParkEffectVisual";
import { HomeInteriorEffectsLayer } from "@/components/HomeInteriorEffect";
import type { HouseInteriorEffect } from "@shared/housing";
import { parkPetActivity } from "@/lib/petParkActivity";
import { arrangeParkVisitors, isParkPetNearViewport } from "@/lib/petParkPopulation";
import { parkCameraGeometry, parkClampCamera, parkImageAspect, PARK_FALLBACK_ASPECT } from "@/lib/petParkCamera";
import { HOME_TOUCH_SURFACE_STYLE, homeCameraPointerDelta, observeHomeViewport, safeSetPointerCapture } from "@/lib/homeCrossDevice";

type ParkItem = { id: string; kind: "decor" | "sleep_spot" | "effect"; effectType?: ParkWaterEffect | null; imageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
type ParkBuilding = { id: string; name: string; imageUrl: string; interiorImageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number; maxPets: number; interiorEffects: HouseInteriorEffect[] };
type ParkDeposit = { id: string; slotNumber: number; petInventoryId: string; petName: string; petTemplateId: string; petNickname: string | null; petLevel: number; checkpointAt: string; pausedAt: string | null; pausedDurationMs: number; buildingId: string | null; interiorXPct: number; interiorYPct: number; pose: "idle" | "sit" | "sleep" };
type SharedParkPet = { petInventoryId: string; petTemplateId: string; petName: string; petNickname: string | null; petLevel: number; ownerName: string; ownerId: string; depositedAt: string; buildingId: string | null; interiorXPct: number; interiorYPct: number; pose: "idle" | "sit" | "sleep" };
type ParkScene = { sharedPets?: SharedParkPet[]; enabledForPlayers: boolean; preview?: boolean; canEditPark?: boolean; backgroundUrl: string | null; items: ParkItem[]; buildings?: ParkBuilding[]; deposits: ParkDeposit[]; unlockedSlots: number; rates?: { coinsPerHour: number; essencePerHour: number; petXpPerHour: number } };
type InventoryPet = { inventoryId: string; shopItemId: string; name: string; petNickname?: string | null; isHatched: boolean; isListed?: boolean; type?: string };

export default function PetParkPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const viewport = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [backgroundAspect, setBackgroundAspect] = useState(PARK_FALLBACK_ASPECT);
  const [selectedPet, setSelectedPet] = useState("");
  const [inspectedPet, setInspectedPet] = useState<SharedParkPet | null>(null);
  const [enteredBuilding, setEnteredBuilding] = useState<ParkBuilding | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [creationPosition, setCreationPosition] = useState({ xPct: 0.5, yPct: 0.5 });
  const [placementMode, setPlacementMode] = useState(false);
  const [selectedPlacement, setSelectedPlacement] = useState<{ kind: "building" | "item"; id: string } | null>(null);
  const [placementDraft, setPlacementDraft] = useState<{ xPct: number; yPct: number; size: number; flipped: boolean; layer: number } | null>(null);
  const placementPointer = useRef<{ id: number; startX: number; startY: number; xPct: number; yPct: number } | null>(null);
  const [editorMode, setEditorMode] = useState<"scene" | "effects" | "decor">("scene");
  const [indoorDrag, setIndoorDrag] = useState<{ petId: string; x: number; y: number } | null>(null);
  const { data: scene, isLoading } = useQuery<ParkScene>({ queryKey: ["/api/pet-park/scene"], refetchInterval: 30_000 });
  const { data: inventory = [] } = useQuery<InventoryPet[]>({ queryKey: ["/api/inventory"], enabled: !!scene?.enabledForPlayers });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize(previous => previous.width === element.clientWidth && previous.height === element.clientHeight
          ? previous : { width: element.clientWidth, height: element.clientHeight });
      }
    };
    // Reuse Pet House's resize, orientation and VisualViewport handling.
    return observeHomeViewport(element, measure, "artwork-scene");
  }, []);

  useEffect(() => {
    let active = true;
    const url = scene?.backgroundUrl;
    if (!url) { setBackgroundAspect(PARK_FALLBACK_ASPECT); return; }
    const image = new Image();
    image.onload = () => { if (active) setBackgroundAspect(parkImageAspect(image.naturalWidth, image.naturalHeight)); };
    image.onerror = () => { if (active) setBackgroundAspect(PARK_FALLBACK_ASPECT); };
    image.src = url;
    return () => { active = false; };
  }, [scene?.backgroundUrl]);

  // Camera uses the image's actual proportions. All scene placements remain
  // normalized 0–1 coordinates, independent of phone/tablet/desktop pixels.
  const geometry = parkCameraGeometry(viewportSize.width, viewportSize.height, backgroundAspect);
  const { scale, sceneWidth, sceneHeight } = geometry;
  const camera = parkClampCamera(pan ?? { x: -geometry.limitX / 2, y: -geometry.limitY / 2 }, geometry);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] }); qc.invalidateQueries({ queryKey: ["/api/pet-park/status"] }); };
  const action = useMutation({
    mutationFn: async ({ method = "POST", path, body }: { method?: "POST" | "PATCH"; path: string; body?: object }) => {
      const res = await apiRequest(method, path, body ?? {});
      return res.json();
    },
    onSuccess: () => { invalidate(); setSelectedPet(""); },
    onError: (error: Error) => toast({ title: "Pet Park action failed", description: error.message, variant: "destructive" }),
  });

  const selectedObject = selectedPlacement?.kind === "building"
    ? scene?.buildings?.find(building => building.id === selectedPlacement.id)
    : scene?.items.find(item => item.id === selectedPlacement?.id);
  const placementSave = useMutation({
    mutationFn: async ({ kind, id, ...placement }: {
      kind: "building" | "item"; id: string; xPct: number; yPct: number; size: number; flipped: boolean; layer: number;
    }) => {
      // The item API validates all five placement fields; X/Y-only updates are rejected.
      const path = kind === "building" ? `/api/admin/pet-park/buildings/${id}` : `/api/admin/pet-park/items/${id}`;
      return apiRequest("PATCH", path, placement);
    },
    onSuccess: () => { invalidate(); setSelectedPlacement(null); setPlacementDraft(null); },
    onError: (error: Error) => toast({ title: "Could not save placement", description: error.message, variant: "destructive" }),
  });
  const placementDelete = useMutation({
    mutationFn: async ({ kind, id }: { kind: "building" | "item"; id: string }) => {
      const path = kind === "building" ? `/api/admin/pet-park/buildings/${id}` : `/api/admin/pet-park/items/${id}`;
      return apiRequest("DELETE", path);
    },
    onSuccess: () => { invalidate(); setSelectedPlacement(null); setPlacementDraft(null); },
    onError: (error: Error) => toast({ title: "Could not remove park object", description: error.message, variant: "destructive" }),
  });
  const startPlacement = (e: React.PointerEvent<HTMLElement>, kind: "building" | "item", object: ParkBuilding | ParkItem) => {
    if (!placementMode || !scene?.canEditPark || !e.isPrimary) return;
    e.stopPropagation();
    const current = selectedPlacement?.kind === kind && selectedPlacement.id === object.id && placementDraft
      ? placementDraft : { xPct: object.xPct, yPct: object.yPct, size: object.size, flipped: object.flipped, layer: object.layer };
    setSelectedPlacement({ kind, id: object.id });
    setPlacementDraft({ ...current });
    placementPointer.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, xPct: current.xPct, yPct: current.yPct };
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  };
  const movePlacement = (e: React.PointerEvent<HTMLElement>) => {
    const drag = placementPointer.current;
    if (!drag || drag.id !== e.pointerId) return;
    e.stopPropagation();
    const delta = homeCameraPointerDelta(e.clientX - drag.startX, e.clientY - drag.startY, viewport.current);
    setPlacementDraft(previous => previous && ({
      ...previous,
      xPct: Math.max(0, Math.min(1, drag.xPct + delta.x / sceneWidth)),
      yPct: Math.max(0, Math.min(1, drag.yPct + delta.y / sceneHeight)),
    }));
  };
  const endPlacement = (e: React.PointerEvent<HTMLElement>) => {
    if (placementPointer.current?.id !== e.pointerId) return;
    e.stopPropagation();
    placementPointer.current = null;
    // Same explicit save/cancel contract as the existing world-map and Home editors.
  };
  const beginCreate = (mode: "scene" | "effects" | "decor") => {
    setEditorMode(mode);
    setCreationPosition({
      xPct: Math.max(0, Math.min(1, (viewportSize.width / 2 - camera.x) / sceneWidth)),
      yPct: Math.max(0, Math.min(1, (viewportSize.height / 2 - camera.y) / sceneHeight)),
    });
    setShowCreator(true);
    setPlacementMode(false);
    setSelectedPlacement(null);
    setPlacementDraft(null);
  };
  const shownPosition = (kind: "building" | "item", object: ParkBuilding | ParkItem) =>
    selectedPlacement?.kind === kind && selectedPlacement.id === object.id && placementDraft ? placementDraft : object;
  const deposits = scene?.deposits ?? [];
  const outdoorPets = (scene?.sharedPets ?? []).filter(pet => !pet.buildingId);
  const parkPositions = useMemo(() => arrangeParkVisitors(outdoorPets, scene?.items ?? []), [scene?.sharedPets, scene?.items]);
  const occupied = new Set(deposits.map(d => d.petInventoryId));
  const availablePets = inventory.filter(p => p.isHatched && !p.isListed && !occupied.has(p.inventoryId) && (p.type == null || p.type === "pet"));

  return <div className="absolute inset-0 overflow-hidden bg-[#13291e] text-amber-100" data-testid="pet-park-page">
    <style>{`
      @keyframes petParkWander {
        0%, 18%, 100% { transform: translate(0, 0); }
        42% { transform: translate(var(--pet-drift-x), var(--pet-drift-y)); }
        72% { transform: translate(-8px, 0); }
      }
      @keyframes petParkRest {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(3px); }
      }
      @keyframes petParkIdle {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
      .pet-park-wander { animation: petParkWander 12s ease-in-out infinite; }
      .pet-park-rest { animation: petParkRest 10s ease-in-out infinite; }
      .pet-park-idle { animation: petParkIdle 9s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .pet-park-wander, .pet-park-rest, .pet-park-idle { animation: none !important; }
      }
    `}</style>
    <div ref={viewport} className="absolute inset-0 overflow-hidden" style={HOME_TOUCH_SURFACE_STYLE}
      onPointerDown={e => {
        if (!e.isPrimary || (e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, panX: camera.x, panY: camera.y, moved: false };
        safeSetPointerCapture(e.currentTarget, e.pointerId);
      }}
      onPointerMove={e => {
        const drag = pointer.current;
        if (!drag || drag.id !== e.pointerId) return;
        const delta = homeCameraPointerDelta(e.clientX - drag.x, e.clientY - drag.y, viewport.current);
        if (Math.hypot(delta.x, delta.y) > 7) drag.moved = true;
        if (!drag.moved) return;
        setPan(parkClampCamera({ x: drag.panX + delta.x, y: drag.panY + delta.y }, geometry));
      }}
      onPointerUp={e => { if (pointer.current?.id === e.pointerId) pointer.current = null; }}
      onPointerCancel={e => { if (pointer.current?.id === e.pointerId) pointer.current = null; }}
      onLostPointerCapture={e => { if (pointer.current?.id === e.pointerId) pointer.current = null; }}>
      {scene && <div className="absolute top-0 left-0 pointer-events-none"
        style={{ width: sceneWidth, height: sceneHeight, transform: `translate(${camera.x}px, ${camera.y}px)`, backgroundImage: scene.backgroundUrl ? `url("${scene.backgroundUrl}")` : undefined, backgroundSize: "100% 100%" }}>
        {(scene.buildings ?? []).map(building => <button key={building.id} type="button" aria-label={`Enter ${building.name}`} onClick={e => { e.stopPropagation(); if (!placementMode) setEnteredBuilding(building); }} onPointerDown={e => startPlacement(e, "building", building)} onPointerMove={movePlacement} onPointerUp={endPlacement} onPointerCancel={endPlacement} className={`absolute pointer-events-auto touch-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${selectedPlacement?.kind === "building" && selectedPlacement.id === building.id && placementMode ? "outline outline-2 outline-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.7)]" : ""}`} style={{ left: `${shownPosition("building", building).xPct * 100}%`, top: `${shownPosition("building", building).yPct * 100}%`, width: shownPosition("building", building).size * scale, height: shownPosition("building", building).size * scale, transform: `translate(-50%, -50%) ${shownPosition("building", building).flipped ? "scaleX(-1)" : ""}`, zIndex: selectedPlacement?.kind === "building" && selectedPlacement.id === building.id && placementMode ? 20000 : shownPosition("building", building).layer + 10002 }}><img src={building.imageUrl} alt={building.name} draggable={false} className="h-full w-full object-contain" /><span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1 text-[10px]" style={{ transform: `translateX(-50%) ${building.flipped ? "scaleX(-1)" : ""}` }}>{building.name}</span></button>)}
        {scene.items.map(item => <div key={item.id} onPointerDown={e => startPlacement(e, "item", item)} onPointerMove={movePlacement} onPointerUp={endPlacement} onPointerCancel={endPlacement} className={`absolute ${placementMode && scene.canEditPark ? "pointer-events-auto touch-none" : "pointer-events-none"} ${selectedPlacement?.kind === "item" && selectedPlacement.id === item.id && placementMode ? "outline outline-2 outline-amber-400 rounded-lg" : ""}`}
          style={{ left: `${shownPosition("item", item).xPct * 100}%`, top: `${shownPosition("item", item).yPct * 100}%`, width: shownPosition("item", item).size * scale, height: shownPosition("item", item).size * scale, transform: `translate(-50%, -50%) ${shownPosition("item", item).flipped ? "scaleX(-1)" : ""}`, zIndex: selectedPlacement?.kind === "item" && selectedPlacement.id === item.id && placementMode ? 20000 : shownPosition("item", item).layer + 10001 }}>
          {item.kind === "effect" && item.effectType ? <ParkEffectVisual type={item.effectType} reducedMotion={reduceMotion} /> : item.imageUrl ? <img alt="" src={item.imageUrl} draggable={false} className="w-full h-full object-contain" /> :
            <div className="w-full h-full rounded-full border border-amber-300/60 bg-amber-900/20" />}
        </div>)}
        {outdoorPets.map((pet, index) => {
          const position = parkPositions.get(pet.petInventoryId);
          if (!position || !isParkPetNearViewport(position, sceneWidth, sceneHeight, camera.x, camera.y, viewportSize.width, viewportSize.height)) return null;
          const activity = parkPetActivity(pet.petInventoryId);
          const isMine = deposits.some(d => d.petInventoryId === pet.petInventoryId);
          return <div key={pet.petInventoryId} className="absolute"
            style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`,
              transform: "translate(-50%, -75%)", width: 140 * scale, height: 165 * scale, zIndex: 11000 + index }}>
            <div className={`pointer-events-none h-[80%] ${reduceMotion ? "" : activity.kind === "wander" ? "pet-park-wander" : activity.kind === "rest" ? "pet-park-rest" : "pet-park-idle"}`}
              style={{ animationDelay: `${activity.delaySeconds}s`, animationDuration: `${activity.durationSeconds}s`,
                ["--pet-drift-x" as string]: `${activity.driftX}px`, ["--pet-drift-y" as string]: `${activity.driftY}px` }}>
              <PetAnimator petTemplateId={pet.petTemplateId} petInventoryId={pet.petInventoryId}
                costumeAccess={isMine ? "owner" : "public"} mode={reduceMotion ? "static" : activity.kind === "rest" ? "sleep" : "idle"} size={140 * scale} fillContainer />
            </div>
            <button type="button" className="pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2 rounded bg-black/65 px-2 py-1 text-[11px] whitespace-nowrap text-amber-100"
              onClick={() => setInspectedPet(pet)}>{pet.petNickname || pet.petName}</button>
          </div>;
        })}
      </div>}
    </div>

    {scene?.enabledForPlayers && <div className="absolute right-3 top-16 z-20 rounded bg-black/70 px-3 py-1 text-xs">
      {(scene?.sharedPets ?? []).length} pets visiting
    </div>}
    {enteredBuilding && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-3" role="dialog" aria-modal="true" aria-label={enteredBuilding.name}>
      <div className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-amber-500 bg-[#13291e]">
        <div className="flex items-center justify-between gap-3 p-3"><h2 className="text-lg font-semibold text-amber-300">{enteredBuilding.name}</h2><button type="button" className="rounded bg-amber-800 px-3 py-2" onClick={() => setEnteredBuilding(null)}>Leave building</button></div>
        <div className="relative min-h-0 flex-1 overflow-y-auto">{enteredBuilding.interiorImageUrl ? <div className="relative mx-auto w-full max-w-3xl touch-none" style={{ aspectRatio: "4 / 3" }} onPointerMove={e => { if (!indoorDrag) return; const rect = e.currentTarget.getBoundingClientRect(); setIndoorDrag({ ...indoorDrag, x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) }); }} onPointerUp={() => { if (!indoorDrag) return; const deposit = deposits.find(item => item.petInventoryId === indoorDrag.petId); if (deposit) action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${deposit.id}/placement`, body: { buildingId: enteredBuilding.id, xPct: indoorDrag.x, yPct: indoorDrag.y, pose: "idle" } }); setIndoorDrag(null); }} onPointerCancel={() => setIndoorDrag(null)}><img src={enteredBuilding.interiorImageUrl} alt={`${enteredBuilding.name} interior`} className="absolute inset-0 h-full w-full object-fill pointer-events-none" /><HomeInteriorEffectsLayer effects={enteredBuilding.interiorEffects ?? []} panX={0} imgWidth={Math.min(900, viewportSize.width - 24)} sceneHeight={Math.min(675, viewportSize.height * 0.7)} />{(scene?.sharedPets ?? []).filter(pet => pet.buildingId === enteredBuilding.id).map(pet => { const ownDeposit = deposits.find(item => item.petInventoryId === pet.petInventoryId); const x = indoorDrag?.petId === pet.petInventoryId ? indoorDrag.x : pet.interiorXPct; const y = indoorDrag?.petId === pet.petInventoryId ? indoorDrag.y : pet.interiorYPct; return <div key={pet.petInventoryId} className="absolute z-10" style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: "translate(-50%, -70%)", width: 90, height: 105 }}><div className="h-[80%]"><PetAnimator petTemplateId={pet.petTemplateId} petInventoryId={pet.petInventoryId} costumeAccess={ownDeposit ? "owner" : "public"} mode={pet.pose === "sleep" ? "sleep" : pet.pose === "sit" ? "house" : "idle"} size={90} fillContainer /></div>{ownDeposit ? <button type="button" aria-label={`Move ${pet.petNickname || pet.petName}`} className="rounded bg-black/75 px-2 py-1 text-xs" onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setIndoorDrag({ petId: pet.petInventoryId, x, y }); }} onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${ownDeposit.id}/placement`, body: { buildingId: enteredBuilding.id, xPct: x, yPct: y, pose: pet.pose } })}>{pet.petNickname || pet.petName} · drag</button> : <span className="rounded bg-black/70 px-1 text-[10px]">{pet.petNickname || pet.petName}</span>}</div>; })}</div> : <p className="p-8 text-center text-sm">This building needs an interior background. An admin can add one in the scene editor.</p>}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-amber-100/70"><span>{(scene?.sharedPets ?? []).filter(pet => pet.buildingId === enteredBuilding.id).length}/{enteredBuilding.maxPets} pets · Park-wide limit remains three per player.</span>{deposits.filter(deposit => deposit.buildingId === enteredBuilding.id).map(deposit => <div key={deposit.id} className="flex flex-wrap gap-1"><button type="button" className="rounded bg-amber-800 px-2 py-2 text-amber-50" onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${deposit.id}/placement`, body: { buildingId: null, xPct: 0.5, yPct: 0.72, pose: "idle" } })}>Move {deposit.petNickname || deposit.petName} outside</button>{(["idle","sit","sleep"] as const).map(pose => <button key={pose} type="button" className="rounded bg-teal-900 px-2 py-2" onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${deposit.id}/placement`, body: { buildingId: enteredBuilding.id, xPct: deposit.interiorXPct, yPct: deposit.interiorYPct, pose } })}>{pose === "idle" ? "Bounce" : pose === "sit" ? "Sit" : "Sleep"}</button>)}</div>)}{deposits.filter(deposit => deposit.buildingId !== enteredBuilding.id).map(deposit => <button key={deposit.id} type="button" className="rounded bg-emerald-800 px-3 py-2" onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${deposit.id}/placement`, body: { buildingId: enteredBuilding.id, xPct: 0.5, yPct: 0.72, pose: "idle" } })}>Move {deposit.petNickname || deposit.petName} inside</button>)}</div>
      </div>
    </div>}
    {inspectedPet && <div className="absolute left-1/2 top-1/3 z-30 w-[min(85%,300px)] -translate-x-1/2 rounded-xl border border-amber-500 bg-[#152d23] p-4 text-center shadow-xl">
      <h2 className="font-semibold text-amber-300">{inspectedPet.petNickname || inspectedPet.petName}</h2>
      <p className="mt-2 text-sm">Level {inspectedPet.petLevel} · Keeper: {inspectedPet.ownerName}</p>
      <button type="button" className="mt-3 rounded bg-amber-800 px-4 py-2" onClick={() => setInspectedPet(null)}>Close</button>
    </div>}
    <div className="absolute top-0 left-0 right-0 z-20 p-3 pt-[max(12px,env(safe-area-inset-top))] pointer-events-none">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => navigate("/")} className="pointer-events-auto rounded-lg bg-black/75 px-3 py-2">← Back</button>
        <h1 className="rounded-lg bg-black/70 px-4 py-2 text-lg font-semibold text-amber-300">Pet Park</h1>
        {scene?.canEditPark ? <div className="pointer-events-auto flex flex-wrap justify-end gap-1">
          <button type="button" aria-pressed={placementMode} onClick={() => { setShowCreator(false); setPlacementMode(value => !value); setSelectedPlacement(null); setPlacementDraft(null); }} className={`rounded-lg px-2 py-2 text-xs ${placementMode ? "bg-teal-700" : "bg-amber-800"}`}>{placementMode ? "Done positioning" : "Move park objects"}</button>
          {([{ mode: "effects", label: "Add Effects" }, { mode: "scene", label: "Add Buildings" }, { mode: "decor", label: "Add Decor" }] as const).map(action => <button key={action.mode} type="button" onClick={() => beginCreate(action.mode)} className="rounded-lg bg-amber-800 px-2 py-2 text-xs">{action.label}</button>)}
          <button type="button" onClick={() => { setShowCreator(false); setShowEditor(true); }} className="rounded-lg bg-slate-800 px-2 py-2 text-xs">Advanced edit</button>
        </div> : <span className="w-12" />}
      </div>
    </div>

    {scene?.canEditPark && placementMode && selectedPlacement && selectedObject && placementDraft && <div
      className={`pointer-events-auto absolute left-3 right-3 z-30 mx-auto flex max-w-sm flex-col gap-2 rounded-xl border border-amber-600 bg-[#10271e]/95 p-3 shadow-xl max-h-[34dvh] overflow-y-auto ${scene.enabledForPlayers ? "bottom-[44%]" : "bottom-[max(12px,env(safe-area-inset-bottom))]"}`}
      aria-label="Edit selected park object">
      <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{selectedPlacement.kind === "building" ? (selectedObject as ParkBuilding).name : (selectedObject as ParkItem).kind} selected</strong><span className="text-xs text-amber-200/80">Drag on the park to move</span></div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" aria-label="Decrease park object size" className="rounded bg-amber-800 px-3 py-2" onClick={() => setPlacementDraft(draft => draft && ({ ...draft, size: Math.max(1, draft.size - 20) }))}>− Size</button>
        <span>Size {placementDraft.size}</span>
        <button type="button" aria-label="Increase park object size" className="rounded bg-amber-800 px-3 py-2" onClick={() => setPlacementDraft(draft => draft && ({ ...draft, size: Math.min(1000, draft.size + 20) }))}>+ Size</button>
        <button type="button" className="rounded bg-amber-800 px-3 py-2" onClick={() => setPlacementDraft(draft => draft && ({ ...draft, flipped: !draft.flipped }))}>Flip</button>
        <button type="button" aria-label="Move park object back one layer" className="rounded bg-slate-700 px-3 py-2" onClick={() => setPlacementDraft(draft => draft && ({ ...draft, layer: Math.max(-10000, draft.layer - 1) }))}>Layer −</button>
        <button type="button" aria-label="Move park object forward one layer" className="rounded bg-slate-700 px-3 py-2" onClick={() => setPlacementDraft(draft => draft && ({ ...draft, layer: Math.min(10000, draft.layer + 1) }))}>Layer +</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={placementSave.isPending || placementDelete.isPending} onClick={() => placementSave.mutate({ ...selectedPlacement, ...placementDraft })} className="rounded bg-amber-700 px-3 py-2 text-sm disabled:opacity-50">Save position</button>
        <button type="button" disabled={placementSave.isPending || placementDelete.isPending} onClick={() => { setSelectedPlacement(null); setPlacementDraft(null); }} className="rounded bg-slate-700 px-3 py-2 text-sm">Cancel</button>
        <button type="button" disabled={placementSave.isPending || placementDelete.isPending} onClick={() => { if (window.confirm("Remove this object from Pet Park?")) placementDelete.mutate(selectedPlacement); }} className="ml-auto rounded bg-red-900 px-3 py-2 text-sm">Remove</button>
      </div>
    </div>}
    {scene?.canEditPark && showCreator && <div
      className="pointer-events-auto absolute top-[max(85px,env(safe-area-inset-top))] left-3 right-3 sm:left-auto z-30 mx-auto sm:mx-0 sm:w-80 max-w-sm max-h-[min(64dvh,540px)] overflow-y-auto overscroll-contain rounded-xl border border-amber-600 bg-[#10271e]/95 p-3 shadow-xl"
      role="dialog" aria-label="Add Pet Park object">
      <div className="flex justify-end"><button type="button" className="rounded bg-slate-700 px-3 py-2 text-xs" onClick={() => setShowCreator(false)}>Close</button></div>
      <PetParkAdminPanel key={editorMode} initialMode={editorMode} mode="create" creationPosition={creationPosition} onCreated={object => {
        setShowCreator(false);
        setPlacementMode(true);
        setSelectedPlacement({ kind: object.kind, id: object.id });
        setPlacementDraft({ xPct: object.xPct, yPct: object.yPct, size: object.size, flipped: object.flipped, layer: object.layer });
      }} />
    </div>}
    {scene?.canEditPark && showEditor && <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-[#0b2119] px-3 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]">
      <div className="sticky top-0 z-10 mb-3 flex justify-end bg-[#0b2119] py-2">
        <button type="button" className="rounded bg-amber-800 px-4 py-2" onClick={() => {
          setShowEditor(false);
          qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
        }}>Close editor & refresh park</button>
      </div>
      <PetParkAdminPanel initialMode={editorMode} mode="editor" />
    </div>}

    {isLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">Loading Pet Park…</div> :
      !scene?.enabledForPlayers && !scene?.canEditPark ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-6 pointer-events-none">
        <div className="rounded-xl border border-amber-500/50 bg-[#152d23] p-6 text-center shadow-xl">
          <h2 className="text-xl font-semibold text-amber-300">Pet Park — Under Construction</h2>
          <p className="mt-3 text-sm">The park is being prepared. Your pets and coins are safe.</p>

        </div>
      </div> : !scene?.enabledForPlayers ? <div className="pointer-events-none absolute bottom-4 left-3 right-3 z-10 flex justify-center"><span className="rounded-lg bg-black/70 px-3 py-2 text-xs text-amber-200">Admin preview · Park closed to players</span></div> : <div className="absolute bottom-0 left-0 right-0 z-20 max-h-[42%] overflow-y-auto rounded-t-xl border-t border-amber-500/40 bg-black/80 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="mb-2 text-xs text-amber-200/80">Drag the park in any direction to explore. Rewards accumulate for up to 24 hours. Collect anytime without removing your pet.</p>
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => {
            const slot = index + 1;
            const pet = deposits.find(d => d.slotNumber === slot);
            const unlocked = slot <= scene.unlockedSlots;
            return <div key={slot} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-700/50 p-2 text-sm">
              <span className="font-semibold">Spot {slot}</span>
              {pet ? <>
                <span className="flex-1">{pet.petNickname || pet.petName} · Lv {pet.petLevel}</span>
                <button type="button" disabled={action.isPending} className="rounded bg-emerald-800 px-3 py-2"
                  onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/claim` })}>Collect rewards</button>
                <button type="button" disabled={action.isPending} className="rounded bg-amber-800 px-3 py-2"
                  onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/withdraw` })}>Retrieve</button>
              </> : !unlocked ? <button type="button" disabled={action.isPending} className="rounded bg-amber-800 px-3 py-2"
                onClick={() => action.mutate({ path: "/api/pet-park/slots/unlock", body: { slot } })}>
                Unlock · {slot === 2 ? "2,500" : "5,000"} coins
              </button> : <>
                <select aria-label={`Choose pet for spot ${slot}`} className="min-w-0 flex-1 rounded bg-slate-900 p-2" value={selectedPet}
                  onChange={e => setSelectedPet(e.target.value)}>
                  <option value="">Choose a pet</option>
                  {availablePets.map(p => <option key={p.inventoryId} value={p.inventoryId}>{p.petNickname || p.name || p.shopItemId}</option>)}
                </select>
                <button type="button" disabled={!selectedPet || action.isPending} className="rounded bg-amber-800 px-3 py-2 disabled:opacity-50"
                  onClick={() => action.mutate({ path: "/api/pet-park/deposits", body: { petInventoryId: selectedPet, slotNumber: slot } })}>Deposit</button>
              </>}
            </div>;
          })}
        </div>
      </div>}
  </div>;
}
