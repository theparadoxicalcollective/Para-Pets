import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import MiniPetRenderer from "@/components/MiniPetRenderer";
import PetParkPetPortrait from "@/components/PetParkPetPortrait";
const coinImage = new URL("../../../attached_assets/uploads/MainGameCoinImage.PNG", import.meta.url).href;
import PetParkAdminPanel from "@/components/PetParkAdminPanel";
import PetParkTerrain from "@/components/PetParkTerrain";
import PetParkTerrainBrush from "@/components/PetParkTerrainBrush";
import { isParkTerrainNearViewport } from "@/lib/petParkTerrainVisibility";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import { isParkTerrainDetail, parkTerrainHeightRatio, type ParkTerrainDetailType } from "@shared/petParkTerrainDetails";
import { isParkEffect } from "@shared/petParkEffects";
import { getAlphaBounds } from "@/lib/alphaBounds";
import PetParkGroundShadow from "@/components/PetParkGroundShadow";
import { parkDepthIndex, parkImageGroundContact } from "@/lib/petParkDepth";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";
import type { ParkEffectType } from "@shared/petParkEffects";
import { X, Expand } from "lucide-react";
import PetParkInteriorRoom from "@/components/PetParkInteriorRoom";
import { petParkInteriorDropPoint } from "@/lib/petParkInteriorDrop";
import PetParkBuildingDetails from "@/components/PetParkBuildingDetails";
import type { HouseInteriorEffect } from "@shared/housing";
import { parkPetActivity } from "@/lib/petParkActivity";
import { arrangeParkVisitors, isParkPetNearViewport } from "@/lib/petParkPopulation";
import { isParkSleepPosition, parkPetSizeOnSleepSpot, parkIndoorPetSizeOnSleepSpot } from "@/lib/petParkSleepSpots";
import { parkCameraGeometry, parkClampCamera, parkClampZoom, parkZoomAnchorPan, parkExpansionCameraPan } from "@/lib/petParkCamera";
import { PET_PARK_MAX_GROUND_LEVEL, parkGroundSize } from "@shared/petParkGround";
import { parkSnapPathPoint } from "@/lib/petParkTerrainBrush";
import { HOME_TOUCH_SURFACE_STYLE, homeCameraPointerDelta, observeHomeViewport, safeSetPointerCapture } from "@/lib/homeCrossDevice";

type ParkItem = { id: string; kind: "decor" | "sleep_spot" | "effect" | "terrain"; effectType?: ParkEffectType | ParkTerrainDetailType | null; imageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
type ParkBuilding = { id: string; name: string; imageUrl: string; interiorImageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number; maxPets: number; interiorEffects: HouseInteriorEffect[] };
type ParkDeposit = { id: string; slotNumber: number; petInventoryId: string; petName: string; petTemplateId: string | null; hatchedImageUrl: string | null; petNickname: string | null; petLevel: number; checkpointAt: string; pausedAt: string | null; pausedDurationMs: number; buildingId: string | null; showInPark: boolean; parkXPct: number | null; parkYPct: number | null; interiorXPct: number; interiorYPct: number; pose: "idle" | "sit" | "sleep" };
type SharedParkPet = { petInventoryId: string; petTemplateId: string | null; hatchedImageUrl: string | null; petName: string; petNickname: string | null; petLevel: number; ownerName: string; ownerId: string; depositedAt: string; buildingId: string | null; parkXPct: number | null; parkYPct: number | null; interiorXPct: number; interiorYPct: number; pose: "idle" | "sit" | "sleep" };
type ParkPlacement = { xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
type ParkScene = { sharedPets?: SharedParkPet[]; enabledForPlayers: boolean; canEnterPark?: boolean; preview?: boolean; canEditPark?: boolean; backgroundUrl: string | null; groundLevel: number; items: ParkItem[]; buildings?: ParkBuilding[]; deposits: ParkDeposit[]; unlockedSlots: number; rates?: { coinsPerHour: number; essencePerHour: number; petXpPerHour: number } };
type InventoryPet = { inventoryId: string; shopItemId: string; petTemplateId?: string | null; hatchedImageUrl?: string | null; name: string; petNickname?: string | null; petLevel?: number; starRarity?: number; rarity?: number; isHatched: boolean; isListed?: boolean; type?: string };

export default function PetParkPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const viewport = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number; pan: { x: number; y: number }; midpoint: { x: number; y: number } } | null>(null);
  const [imageContacts, setImageContacts] = useState<Record<string, number>>({});
  const observeContact = (image: HTMLImageElement, url: string) => {
    const width = image.naturalWidth, height = image.naturalHeight;
    void getAlphaBounds(url, image).then(bounds => {
      const contact = parkImageGroundContact(width, height, bounds);
      setImageContacts(old => old[url] === contact ? old : { ...old, [url]: contact });
    });
  };
  const [selectedPet, setSelectedPet] = useState("");
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [showPetChoices, setShowPetChoices] = useState(false);
  const [offParkInteriorLights, setOffParkInteriorLights] = useState<Record<string, string[]>>({});
  const [inspectedPet, setInspectedPet] = useState<SharedParkPet | null>(null);
  const [enteredBuilding, setEnteredBuilding] = useState<ParkBuilding | null>(null);
  const [indoorSelectedPetId, setIndoorSelectedPetId] = useState<string | null>(null);
  const [detailsBuildingId, setDetailsBuildingId] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [expandingGround, setExpandingGround] = useState(false);
  const [creationPosition, setCreationPosition] = useState({ xPct: 0.5, yPct: 0.5 });
  const [paintMode, setPaintMode] = useState(false);
  const [selectedPlacement, setSelectedPlacement] = useState<{ kind: "building" | "item"; id: string } | null>(null);
  const [placementDraft, setPlacementDraft] = useState<ParkPlacement | null>(null);
  const placementPointer = useRef<{ id: number; kind: "building" | "item"; objectId: string; startX: number; startY: number; placement: ParkPlacement } | null>(null);
  const [editorMode, setEditorMode] = useState<"scene" | "effects" | "decor">("scene");
  const [indoorDrag, setIndoorDrag] = useState<{ petId: string; x: number; y: number } | null>(null);
  const [slotDragGhost, setSlotDragGhost] = useState<{ petId: string; x: number; y: number } | null>(null);
  const suppressSlotClickUntil = useRef(0);
  const slotDrag = useRef<{ id: number; petId: string; x: number; y: number } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const { data: scene, isLoading } = useQuery<ParkScene>({ queryKey: ["/api/pet-park/scene"], refetchInterval: 30_000 });
  const { data: inventory = [] } = useQuery<InventoryPet[]>({ queryKey: ["/api/inventory"], enabled: !!scene?.canEnterPark && !scene?.canEditPark });

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

  // Ground extent comes from an admin-set tier. Camera zoom is viewport-only.
  // Saved placement coordinates remain normalized to the whole grass world.
  const groundLevel = scene?.groundLevel ?? 1;
  const geometry = parkCameraGeometry(viewportSize.width, viewportSize.height, groundLevel, zoom);
  const { scale, sceneWidth, sceneHeight } = geometry;
  const camera = parkClampCamera(pan ?? { x: -geometry.limitX / 2, y: -geometry.limitY / 2 }, geometry);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] }); qc.invalidateQueries({ queryKey: ["/api/pet-park/status"] }); };
  const action = useMutation({
    mutationFn: async ({ method = "POST", path, body }: { method?: "POST" | "PATCH"; path: string; body?: object }) => {
      const res = await apiRequest(method, path, body ?? {});
      return res.json();
    },
    onSuccess: (result: any, variables) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      setSelectedPet("");
      setShowPetChoices(false);
      if (variables.path === "/api/pet-park/deposits") {
        setActiveSlot(null);
        toast({ title: "Pet equipped", description: "Drag the equipped oval onto the park or into a building to place your pet." });
      } else if (result?.rewards) {
        toast({ title: variables.path.endsWith("/swap") ? "Pet swapped · rewards collected" : "Park rewards collected",
          description: `+${result.rewards.coins} coins · +${result.rewards.essence} essence · +${result.rewards.petXp} pet XP` });
      }
    },
    onError: (error: Error) => toast({ title: "Pet Park action failed", description: error.message, variant: "destructive" }),
  });

  const expandGround = async () => {
    if (!scene?.canEditPark || expandingGround || groundLevel >= PET_PARK_MAX_GROUND_LEVEL) return;
    setExpandingGround(true);
    try {
      const nextLevel = groundLevel + 1;
      await apiRequest("PATCH", "/api/admin/pet-park/ground", { groundLevel: nextLevel });
      const nextGeometry = parkCameraGeometry(viewportSize.width, viewportSize.height, nextLevel, zoom);
      setPan(parkExpansionCameraPan(camera, scale, parkGroundSize(groundLevel), parkGroundSize(nextLevel), nextGeometry));
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
    } catch (error) {
      toast({ title: "Could not expand the park", description: String(error), variant: "destructive" });
    } finally {
      setExpandingGround(false);
    }
  };

  const changeZoom = (requested: number, anchor = { x: viewportSize.width / 2, y: viewportSize.height / 2 }) => {
    const nextZoom = parkClampZoom(requested);
    if (nextZoom === zoom) return;
    const nextGeometry = parkCameraGeometry(viewportSize.width, viewportSize.height, groundLevel, nextZoom);
    setPan(parkZoomAnchorPan(camera, scale, nextGeometry.scale, anchor, nextGeometry));
    setZoom(nextZoom);
  };

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
    onSuccess: invalidate,
    onError: (error: Error) => {
      setSelectedPlacement(null); setPlacementDraft(null);
      toast({ title: "Could not save placement", description: error.message, variant: "destructive" });
    },
  });
  const placementDelete = useMutation({
    mutationFn: async ({ kind, id }: { kind: "building" | "item"; id: string }) => {
      const path = kind === "building" ? `/api/admin/pet-park/buildings/${id}` : `/api/admin/pet-park/items/${id}`;
      return apiRequest("DELETE", path);
    },
    onSuccess: () => { invalidate(); setSelectedPlacement(null); setPlacementDraft(null); },
    onError: (error: Error) => toast({ title: "Could not remove park object", description: error.message, variant: "destructive" }),
  });
  const clearTerrain = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/pet-park/terrain"),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      setSelectedPlacement(null);
      setPlacementDraft(null);
      toast({ title: "All terrain patches cleared" });
    },
    onError: (error: Error) => toast({ title: "Could not clear terrain", description: error.message, variant: "destructive" }),
  });
  const updatePlacement = (changes: Partial<ParkPlacement>) => {
    if (!selectedPlacement || !placementDraft || placementSave.isPending || placementDelete.isPending) return;
    const next = { ...placementDraft, ...changes };
    setPlacementDraft(next);
    placementSave.mutate({ ...selectedPlacement, ...next });
  };
  // Admins can select and drag an existing object directly. The world coordinates
  // and existing authenticated PATCH route remain the single placement system.
  const startPlacement = (e: React.PointerEvent<HTMLElement>, kind: "building" | "item", object: ParkBuilding | ParkItem) => {
    if (!scene?.canEditPark || paintMode || showCreator || activeBuilding ||
        placementSave.isPending || placementDelete.isPending || !e.isPrimary) return;
    // Allow touch pointer-down to reach the viewport's pinch tracker, while
    // preventing mouse drags from also starting a camera pan.
    if (e.pointerType !== "touch") e.stopPropagation();
    const current = selectedPlacement?.kind === kind && selectedPlacement.id === object.id && placementDraft
      ? placementDraft : { xPct: object.xPct, yPct: object.yPct, size: object.size, flipped: object.flipped, layer: object.layer };
    setSelectedPlacement({ kind, id: object.id });
    setPlacementDraft({ ...current });
    placementPointer.current = { id: e.pointerId, kind, objectId: object.id,
      startX: e.clientX, startY: e.clientY, placement: { ...current } };
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  };
  const placementAt = (drag: NonNullable<typeof placementPointer.current>, clientX: number, clientY: number) => {
    const delta = homeCameraPointerDelta(clientX - drag.startX, clientY - drag.startY, viewport.current);
    const dirt = drag.kind === "item" && scene?.items.some(item => item.id === drag.objectId && item.kind === "terrain" && item.effectType === "dirt_path");
    const point = {
      xPct: Math.max(0, Math.min(1, drag.placement.xPct + delta.x / sceneWidth)),
      yPct: Math.max(0, Math.min(1, drag.placement.yPct + delta.y / sceneHeight)),
    };
    return {
      delta,
      placement: {
        ...drag.placement,
        ...(dirt ? parkSnapPathPoint(point, { width: geometry.worldWidth, height: geometry.worldHeight }, drag.placement.size) : point),
      },
    };
  };
  const movePlacement = (e: React.PointerEvent<HTMLElement>) => {
    const drag = placementPointer.current;
    if (!drag || drag.id !== e.pointerId) return;
    if (e.pointerType === "touch") {
      touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current) return; // let the viewport control a two-finger zoom
    }
    e.stopPropagation();
    const { delta, placement } = placementAt(drag, e.clientX, e.clientY);
    if (Math.hypot(delta.x, delta.y) < 5) return;
    setPlacementDraft(placement);
  };
  const endPlacement = (e: React.PointerEvent<HTMLElement>) => {
    const drag = placementPointer.current;
    if (!drag || drag.id !== e.pointerId) return;
    e.stopPropagation();
    placementPointer.current = null;
    const { delta, placement } = placementAt(drag, e.clientX, e.clientY);
    if (Math.hypot(delta.x, delta.y) < 5) return; // tap selects; it never silently moves
    setPlacementDraft(placement);
    placementSave.mutate({ kind: drag.kind, id: drag.objectId, ...placement });
  };
  const cancelPlacement = (e: React.PointerEvent<HTMLElement>) => {
    if (placementPointer.current?.id !== e.pointerId) return;
    e.stopPropagation();
    placementPointer.current = null;
    setSelectedPlacement(null);
    setPlacementDraft(null);
  };
  const beginCreate = (mode: "scene" | "effects" | "decor") => {
    setPaintMode(false);
    setEditorMode(mode);
    setCreationPosition({
      xPct: Math.max(0, Math.min(1, (viewportSize.width / 2 - camera.x) / sceneWidth)),
      yPct: Math.max(0, Math.min(1, (viewportSize.height / 2 - camera.y) / sceneHeight)),
    });
    setShowCreator(true);
    setSelectedPlacement(null);
    setPlacementDraft(null);
  };
  const shownPosition = (kind: "building" | "item", object: ParkBuilding | ParkItem) =>
    selectedPlacement?.kind === kind && selectedPlacement.id === object.id && placementDraft ? placementDraft : object;
  const dirtPatches = useMemo(() => (scene?.items ?? [])
    .filter(item => item.kind === "terrain" && item.effectType === "dirt_path")
    .map(item => selectedPlacement?.kind === "item" && selectedPlacement.id === item.id && placementDraft
      ? { ...item, ...placementDraft } : item),
  [scene?.items, selectedPlacement, placementDraft]);
  const detailsBuilding = scene?.buildings?.find(building => building.id === detailsBuildingId);
  // Always use the latest scene record so saved interior changes show when the room is open.
  const activeBuilding = enteredBuilding ? (scene?.buildings?.find(building => building.id === enteredBuilding.id) ?? enteredBuilding) : null;
  const deposits = scene?.deposits ?? [];
  const outdoorPets = (scene?.sharedPets ?? []).filter(pet => !pet.buildingId);
  const parkPositions = useMemo(() => arrangeParkVisitors(outdoorPets, scene?.items ?? []), [scene?.sharedPets, scene?.items]);
  const occupied = new Set(deposits.map(d => d.petInventoryId));
  const dropEquippedPet = (petId: string, clientX: number, clientY: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    const xPct = (clientX - rect.left - camera.x) / sceneWidth;
    const yPct = (clientY - rect.top - camera.y) / sceneHeight;
    if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) return;
    action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${petId}/display`, body: { display: "park", xPct, yPct } });
    setActiveSlot(null);
  };
  const dropEquippedPetInside = (petId: string, clientX: number, clientY: number, building: ParkBuilding) => {
    const room = document.querySelector<HTMLElement>('[data-testid="pet-park-interior-room"]');
    const artwork = room?.querySelector<HTMLElement>("[data-park-interior-artwork]");
    const footer = document.querySelector<HTMLElement>('[data-testid="pet-park-interior-slots"]');
    if (!room || !artwork) return;
    const viewportRect = room.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const visibleHeight = footerRect
      ? Math.min(viewportRect.height, Math.max(0, footerRect.top - viewportRect.top))
      : viewportRect.height;
    const point = petParkInteriorDropPoint({ x: clientX, y: clientY },
      { left: viewportRect.left, top: viewportRect.top, width: viewportRect.width, height: visibleHeight },
      artwork.getBoundingClientRect());
    if (!point) return;
    action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${petId}/placement`,
      body: { buildingId: building.id, ...point, pose: "idle" } });
  };
  const startEquippedPetDrag = (event: React.PointerEvent<HTMLButtonElement>, pet: ParkDeposit) => {
    if (!event.isPrimary || action.isPending) return;
    slotDrag.current = { id: event.pointerId, petId: pet.id, x: event.clientX, y: event.clientY };
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const moveEquippedPetDrag = (event: React.PointerEvent<HTMLButtonElement>, slot: number) => {
    const drag = slotDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 12) return;
    setDraggingSlot(slot);
    setSlotDragGhost({ petId: drag.petId, x: event.clientX, y: event.clientY });
  };
  const endEquippedPetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = slotDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    slotDrag.current = null;
    const moved = Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 12;
    setSlotDragGhost(null);
    setDraggingSlot(null);
    if (!moved) return;
    suppressSlotClickUntil.current = Date.now() + 400;
    if (activeBuilding) dropEquippedPetInside(drag.petId, event.clientX, event.clientY, activeBuilding);
    else dropEquippedPet(drag.petId, event.clientX, event.clientY);
  };
  const cancelEquippedPetDrag = () => {
    slotDrag.current = null;
    setSlotDragGhost(null);
    setDraggingSlot(null);
  };
  const toggleParkInteriorLight = (buildingId: string, effect: HouseInteriorEffect) =>
    setOffParkInteriorLights(current => {
      const off = new Set(current[buildingId] ?? []);
      if (off.has(effect.id)) off.delete(effect.id);
      else off.add(effect.id);
      return { ...current, [buildingId]: Array.from(off) };
    });
  const availablePets = inventory.filter(p => p.isHatched && (p.petLevel ?? 1) >= 10 && !p.isListed && !occupied.has(p.inventoryId) && (p.type == null || p.type === "pet"));

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
        if (scene?.canEditPark && !paintMode && !showCreator && e.target === e.currentTarget) {
          setSelectedPlacement(null); setPlacementDraft(null);
        }
        const isControl = !!(e.target as HTMLElement).closest("button, input, select, textarea, a, [data-park-draggable]");
        if (e.pointerType === "touch" && !isControl) {
          touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (touchPoints.current.size === 2) {
            // Switching to a pinch must never commit an in-progress item drag.
            if (placementPointer.current) {
              setPlacementDraft(placementPointer.current.placement);
              placementPointer.current = null;
            }
            const points = Array.from(touchPoints.current.values());
            const bounds = viewport.current?.getBoundingClientRect();
            pinch.current = {
              distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
              zoom, pan: { ...camera },
              midpoint: { x: (points[0].x + points[1].x) / 2 - (bounds?.left ?? 0),
                y: (points[0].y + points[1].y) / 2 - (bounds?.top ?? 0) },
            };
            pointer.current = null;
          }
        }
        if (!e.isPrimary || isControl || pinch.current) return;
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, panX: camera.x, panY: camera.y, moved: false };
        safeSetPointerCapture(e.currentTarget, e.pointerId);
      }}
      onPointerMove={e => {
        if (touchPoints.current.has(e.pointerId)) {
          touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current && touchPoints.current.size === 2) {
            const points = Array.from(touchPoints.current.values());
            const bounds = viewport.current?.getBoundingClientRect();
            const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            const nextZoom = parkClampZoom(pinch.current.zoom * distance / Math.max(1, pinch.current.distance));
            const nextGeometry = parkCameraGeometry(viewportSize.width, viewportSize.height, groundLevel, nextZoom);
            const center = { x: (points[0].x + points[1].x) / 2 - (bounds?.left ?? 0),
              y: (points[0].y + points[1].y) / 2 - (bounds?.top ?? 0) };
            const zoomRatio = nextZoom / pinch.current.zoom;
            setPan(parkClampCamera({
              x: center.x - (pinch.current.midpoint.x - pinch.current.pan.x) * zoomRatio,
              y: center.y - (pinch.current.midpoint.y - pinch.current.pan.y) * zoomRatio,
            }, nextGeometry));
            setZoom(nextZoom);
            return;
          }
        }
        const drag = pointer.current;
        if (!drag || drag.id !== e.pointerId) return;
        const delta = homeCameraPointerDelta(e.clientX - drag.x, e.clientY - drag.y, viewport.current);
        if (Math.hypot(delta.x, delta.y) > 7) drag.moved = true;
        if (!drag.moved) return;
        setPan(parkClampCamera({ x: drag.panX + delta.x, y: drag.panY + delta.y }, geometry));
      }}
      onPointerUp={e => {
        touchPoints.current.delete(e.pointerId);
        if (touchPoints.current.size < 2) pinch.current = null;
        if (pointer.current?.id === e.pointerId) pointer.current = null;
      }}
      onPointerCancel={e => {
        touchPoints.current.delete(e.pointerId);
        if (touchPoints.current.size < 2) pinch.current = null;
        if (pointer.current?.id === e.pointerId) pointer.current = null;
      }}
      onLostPointerCapture={e => {
        touchPoints.current.delete(e.pointerId);
        if (touchPoints.current.size < 2) pinch.current = null;
        if (pointer.current?.id === e.pointerId) pointer.current = null;
      }}
      onWheel={e => {
        e.preventDefault();
        const bounds = viewport.current?.getBoundingClientRect();
        changeZoom(zoom * (e.deltaY > 0 ? 0.91 : 1.09),
          { x: e.clientX - (bounds?.left ?? 0), y: e.clientY - (bounds?.top ?? 0) });
      }}>
      {scene && <PetParkTerrain viewportWidth={viewportSize.width} viewportHeight={viewportSize.height}
        worldWidth={geometry.worldWidth} worldHeight={geometry.worldHeight}
        scale={scale} panX={camera.x} panY={camera.y} dirtPatches={dirtPatches} />}
      {scene && <div className="absolute top-0 left-0 pointer-events-none"
        style={{ width: sceneWidth, height: sceneHeight, transform: `translate(${camera.x}px, ${camera.y}px)` }}>
        {(scene.buildings ?? []).map(building => <button key={building.id} type="button" data-park-draggable aria-label={`Enter ${building.name}`} onClick={e => { e.stopPropagation(); if (!scene.canEditPark) setEnteredBuilding(building); }} onPointerDown={e => startPlacement(e, "building", building)} onPointerMove={movePlacement} onPointerUp={endPlacement} onPointerCancel={cancelPlacement} onLostPointerCapture={cancelPlacement} className={`absolute pointer-events-auto touch-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${selectedPlacement?.kind === "building" && selectedPlacement.id === building.id ? "outline outline-2 outline-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.7)]" : ""}`} style={{ left: `${shownPosition("building", building).xPct * 100}%`, top: `${shownPosition("building", building).yPct * 100}%`, width: shownPosition("building", building).size * scale, height: shownPosition("building", building).size * scale, transform: `translate(-50%, -50%) ${shownPosition("building", building).flipped ? "scaleX(-1)" : ""}`, zIndex: parkDepthIndex({ yPct: shownPosition("building", building).yPct, worldHeight: geometry.worldHeight, size: shownPosition("building", building).size, kind: "building", contact: imageContacts[building.imageUrl] }) }}><img onLoad={event => observeContact(event.currentTarget, building.imageUrl)} src={building.imageUrl} alt={building.name} draggable={false} className="relative z-[1] h-full w-full object-contain" /><span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1 text-[10px]" style={{ transform: `translateX(-50%) ${building.flipped ? "scaleX(-1)" : ""}` }}>{building.name}</span></button>)}
        {scene.items.map(item => {
          const position = shownPosition("item", item);
          if (item.kind === "terrain" && !isParkTerrainNearViewport(
            { ...position, effectType: item.effectType }, { width: viewportSize.width, height: viewportSize.height },
            { width: sceneWidth, height: sceneHeight, scale }, camera,
          )) return null;
          return <div key={item.id} data-park-draggable onPointerDown={e => startPlacement(e, "item", item)} onPointerMove={movePlacement} onPointerUp={endPlacement} onPointerCancel={cancelPlacement} onLostPointerCapture={cancelPlacement} className={`absolute ${scene.canEditPark && !paintMode && !showCreator ? "pointer-events-auto touch-none" : "pointer-events-none"} ${selectedPlacement?.kind === "item" && selectedPlacement.id === item.id ? "outline outline-2 outline-amber-400 rounded-lg" : ""}`}
          style={{ left: `${shownPosition("item", item).xPct * 100}%`, top: `${shownPosition("item", item).yPct * 100}%`, width: shownPosition("item", item).size * scale, height: shownPosition("item", item).size * scale * (item.kind === "terrain" ? parkTerrainHeightRatio(item.effectType) : 1), transform: `translate(-50%, -50%) ${shownPosition("item", item).flipped ? "scaleX(-1)" : ""}`, zIndex: item.kind === "terrain" || item.effectType === "water_ripple" || item.effectType === "water_shimmer" ? 500 : parkDepthIndex({ yPct: shownPosition("item", item).yPct, worldHeight: geometry.worldHeight, size: shownPosition("item", item).size, kind: "item", contact: item.imageUrl ? imageContacts[item.imageUrl] : undefined }) }}>
          {item.kind === "terrain" && item.effectType === "dirt_path" ? null : item.kind === "terrain" && isParkTerrainDetail(item.effectType) ? <PetParkTerrainDetail type={item.effectType} /> : item.kind === "effect" && item.effectType && isParkEffect(item.effectType) ? <ParkEffectVisual type={item.effectType} reducedMotion={reduceMotion} adminPreview={Boolean(scene.canEditPark)} /> : item.imageUrl ? <><img onLoad={event => observeContact(event.currentTarget, item.imageUrl!)} alt="" src={item.imageUrl} draggable={false} className="relative z-[1] w-full h-full object-contain" /></> :
            item.kind === "sleep_spot" ? <ParkEffectVisual type="sleep" reducedMotion={reduceMotion} adminPreview={Boolean(scene.canEditPark)} /> : null}
        </div>;
        })}
        {outdoorPets.map(pet => {
          const position = pet.parkXPct != null && pet.parkYPct != null
            ? { x: pet.parkXPct, y: pet.parkYPct } : parkPositions.get(pet.petInventoryId);
          if (!position || !isParkPetNearViewport(position, sceneWidth, sceneHeight, camera.x, camera.y, viewportSize.width, viewportSize.height)) return null;
          const activity = parkPetActivity(pet.petInventoryId);
          const sleepWorld = { width: geometry.worldWidth, height: geometry.worldHeight };
          const sleeping = pet.pose === "sleep" || isParkSleepPosition(position, scene.items, sleepWorld);
          // This size belongs to the admin's rest area, not to a player-adjustable pet setting.
          const petSize = parkPetSizeOnSleepSpot(position, scene.items, sleepWorld, 200);
          const petHeight = petSize * 225 / 200;
          const isMine = deposits.some(d => d.petInventoryId === pet.petInventoryId);
          return <div key={pet.petInventoryId} className="absolute"
            style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`,
              transform: "translate(-50%, -75%)", width: petSize * scale, height: petHeight * scale, zIndex: parkDepthIndex({ yPct: position.y, worldHeight: geometry.worldHeight, size: petHeight, kind: "pet" }) }}>
            <PetParkGroundShadow kind="pet" />
            <div className={`relative z-[1] pointer-events-none h-[80%] ${reduceMotion ? "" : sleeping ? "pet-park-rest" : activity.kind === "wander" ? "pet-park-wander" : "pet-park-idle"}`}
              style={{ animationDelay: `${activity.delaySeconds}s`, animationDuration: `${activity.durationSeconds}s`,
                ["--pet-drift-x" as string]: `${activity.driftX}px`, ["--pet-drift-y" as string]: `${activity.driftY}px` }}>
              <PetAnimator petTemplateId={pet.petTemplateId} petInventoryId={pet.petInventoryId}
                costumeAccess={isMine ? "owner" : "public"} mode={reduceMotion ? "static" : sleeping ? "sleep" : "idle"} size={petSize * scale} fillContainer />
            </div>
            <button type="button" className="pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2 rounded bg-black/65 px-2 py-1 text-[11px] whitespace-nowrap text-amber-100"
              onClick={() => setInspectedPet(pet)}>{pet.petNickname || pet.petName}</button>
          </div>;
        })}
      </div>}
      {paintMode && scene?.canEditPark && <PetParkTerrainBrush
        viewportWidth={viewportSize.width} viewportHeight={viewportSize.height}
        sceneWidth={sceneWidth} sceneHeight={sceneHeight}
        worldWidth={geometry.worldWidth} worldHeight={geometry.worldHeight}
        panX={camera.x} panY={camera.y} scale={scale}
        raised={scene.enabledForPlayers && deposits.length > 0}
        onSaved={invalidate} onExit={() => setPaintMode(false)} />}
    </div>

    {scene?.enabledForPlayers && <div className="absolute right-3 top-16 z-20 rounded bg-black/70 px-3 py-1 text-xs">
      {(scene?.sharedPets ?? []).length} pets visiting
    </div>}
    {activeBuilding && <div className="fixed inset-0 z-40 bg-[#13291e]" role="dialog" aria-modal="true" aria-label={activeBuilding.name}>
      <button type="button" aria-label="Exit building" onClick={() => { setEnteredBuilding(null); setIndoorSelectedPetId(null); cancelEquippedPetDrag(); }}
        className="absolute right-3 z-50 rounded-full border border-amber-400/70 bg-[#10291d]/95 px-5 py-2.5 font-fantasy text-sm font-semibold text-[#f5cf64] shadow-xl"
        style={{ top: "max(64px, calc(env(safe-area-inset-top, 0px) + 12px))" }}>Exit</button>
      {activeBuilding.interiorImageUrl ? <PetParkInteriorRoom expanded
        imageUrl={activeBuilding.interiorImageUrl} name={activeBuilding.name}
        effects={activeBuilding.interiorEffects ?? []}
        offEffectIds={new Set(offParkInteriorLights[activeBuilding.id] ?? [])}
        onToggleEffect={effect => toggleParkInteriorLight(activeBuilding.id, effect)}
        onPointerMove={event => {
          if (!indoorDrag) return;
          const rect = event.currentTarget.getBoundingClientRect();
          setIndoorDrag({ ...indoorDrag,
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
          });
        }}
        onPointerUp={() => {
          if (!indoorDrag) return;
          const deposit = deposits.find(item => item.petInventoryId === indoorDrag.petId);
          if (deposit) action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${deposit.id}/placement`,
            body: { buildingId: activeBuilding.id, xPct: indoorDrag.x, yPct: indoorDrag.y, pose: "idle" } });
          setIndoorDrag(null);
        }}
        onPointerCancel={() => setIndoorDrag(null)}>
        {({ imageWidth, sceneHeight }) => (scene?.sharedPets ?? []).filter(pet => pet.buildingId === activeBuilding.id).map(pet => {
          const ownDeposit = deposits.find(item => item.petInventoryId === pet.petInventoryId);
          const x = indoorDrag?.petId === pet.petInventoryId ? indoorDrag.x : pet.interiorXPct;
          const y = indoorDrag?.petId === pet.petInventoryId ? indoorDrag.y : pet.interiorYPct;
          const petSize = parkIndoorPetSizeOnSleepSpot({ x, y }, activeBuilding.interiorEffects ?? [],
            { width: imageWidth, height: sceneHeight }, 225);
          return <div key={pet.petInventoryId} data-park-pet className="absolute z-10"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: "translate(-50%, -70%)",
              width: petSize, height: petSize * 260 / 225 }}>
            <div className="relative h-[80%]">
              {pet.petTemplateId ? <PetAnimator petTemplateId={pet.petTemplateId} petInventoryId={pet.petInventoryId}
                costumeAccess={ownDeposit ? "owner" : "public"}
                mode={pet.pose === "sleep" ? "sleep" : pet.pose === "sit" ? "house" : "idle"}
                size={petSize} fillContainer /> :
                pet.hatchedImageUrl ? <img src={pet.hatchedImageUrl} alt="" className="h-full w-full object-contain" /> : null}
              <div className="pointer-events-none absolute bottom-0 left-0 h-[25%] w-[25%]">
                <MiniPetRenderer petInventoryId={pet.petInventoryId} access={ownDeposit ? "owner" : "public"} animated={!reduceMotion} />
              </div>
            </div>
            {ownDeposit ? <button type="button" aria-label={`Move ${pet.petNickname || pet.petName}`}
              className="rounded bg-black/75 px-2 py-1 text-xs text-amber-100"
              onPointerDown={event => { event.stopPropagation(); safeSetPointerCapture(event.currentTarget, event.pointerId);
                setIndoorDrag({ petId: pet.petInventoryId, x, y }); }}
              onClick={() => setIndoorSelectedPetId(pet.petInventoryId)}>
                {pet.petNickname || pet.petName} · drag
              </button> : <span className="rounded bg-black/70 px-1 text-[10px]">{pet.petNickname || pet.petName}</span>}
          </div>;
        })}
      </PetParkInteriorRoom> : <p className="p-8 pt-28 text-center text-sm">This building needs an interior background. An admin can upload one with Edit building.</p>}
      <div data-testid="pet-park-interior-slots" className="absolute inset-x-2 z-50 rounded-xl border border-amber-500/55 bg-[#10291d]/95 p-2 shadow-2xl"
        style={{ bottom: "max(10px, env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center justify-between gap-2 px-1 pb-1 text-[11px] text-amber-100/75">
          <span>{(scene?.sharedPets ?? []).filter(pet => pet.buildingId === activeBuilding.id).length}/{activeBuilding.maxPets} pets inside</span>
          <span>Drag an equipped pet into the room</span>
        </div>
        {(() => {
          const deposit = deposits.find(item => item.petInventoryId === indoorSelectedPetId);
          if (!deposit) return null;
          return <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-amber-500/35 p-2 text-[11px]">
            <span className="mr-1 font-semibold">{deposit.petNickname || deposit.petName}</span>
            {deposit.buildingId === activeBuilding.id ? <>
              <button type="button" className="rounded bg-amber-800 px-2 py-1.5"
                onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${deposit.id}/placement`,
                  body: { buildingId: null, xPct: 0.5, yPct: 0.72, pose: "idle" } })}>Move {deposit.petNickname || deposit.petName} outside</button>
              {(["idle","sit","sleep"] as const).map(pose => <button key={pose} type="button"
                className="rounded bg-[#245037] px-2 py-1.5"
                onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${deposit.id}/placement`,
                  body: { buildingId: activeBuilding.id, xPct: deposit.interiorXPct, yPct: deposit.interiorYPct, pose } })}>
                {pose === "idle" ? "Bounce" : pose === "sit" ? "Sit" : "Sleep"}
              </button>)}
            </> : <button type="button" className="rounded bg-[#245037] px-2 py-1.5"
              onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${deposit.id}/placement`,
                body: { buildingId: activeBuilding.id, xPct: 0.5, yPct: 0.72, pose: "idle" } })}>
              Move {deposit.petNickname || deposit.petName} inside
            </button>}
            <button type="button" className="ml-auto rounded border border-amber-500/40 px-2 py-1.5"
              onClick={() => setIndoorSelectedPetId(null)}>Close</button>
          </div>;
        })()}
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain">
          {deposits.length === 0 && <p className="p-3 text-xs text-amber-100/65">Equip a level 10+ pet in the park first.</p>}
          {deposits.map(deposit => <button type="button" key={deposit.id}
            data-testid={`pet-park-room-slot-${deposit.slotNumber}`}
            className="flex min-w-[118px] shrink-0 touch-none items-center gap-1 rounded-[50%] border border-amber-500/65 bg-[#1c3d2a] px-2 py-1 text-left text-[11px] text-amber-100"
            onPointerDown={event => startEquippedPetDrag(event, deposit)}
            onPointerMove={event => moveEquippedPetDrag(event, deposit.slotNumber)}
            onPointerUp={endEquippedPetDrag}
            onPointerCancel={cancelEquippedPetDrag}
            onLostPointerCapture={cancelEquippedPetDrag}
            onClick={() => { if (Date.now() < suppressSlotClickUntil.current) return; setIndoorSelectedPetId(deposit.petInventoryId); }}>
            <PetParkPetPortrait petTemplateId={deposit.petTemplateId} hatchedImageUrl={deposit.hatchedImageUrl}
              petInventoryId={deposit.petInventoryId} size={52} />
            <span className="min-w-0"><span className="block text-[10px] font-semibold">Spot {deposit.slotNumber}</span>
              <span className="block max-w-[64px] truncate">{deposit.petNickname || deposit.petName}</span>
              <span className="block text-[9px] text-amber-300/75">{deposit.buildingId === activeBuilding.id ? "Inside" : "Drag in"}</span>
            </span>
          </button>)}
        </div>
      </div>
      {slotDragGhost && <div className="pointer-events-none fixed z-[70] flex items-center gap-1 rounded-full border border-amber-300 bg-[#1e452e]/90 p-2 text-xs font-semibold text-amber-100 shadow-xl"
        style={{ left: slotDragGhost.x, top: slotDragGhost.y, transform: "translate(-50%, -110%)" }}>
        {deposits.find(item => item.id === slotDragGhost.petId)?.petNickname ||
          deposits.find(item => item.id === slotDragGhost.petId)?.petName || "Pet"}
      </div>}
    </div>}
    {inspectedPet && <div className="absolute left-1/2 top-1/3 z-30 w-[min(85%,300px)] -translate-x-1/2 rounded-xl border border-amber-500 bg-[#152d23] p-4 text-center shadow-xl">
      <h2 className="font-semibold text-amber-300">{inspectedPet.petNickname || inspectedPet.petName}</h2>
      <p className="mt-2 text-sm">Level {inspectedPet.petLevel} · Keeper: {inspectedPet.ownerName}</p>
      <button type="button" className="mt-3 rounded bg-amber-800 px-4 py-2" onClick={() => setInspectedPet(null)}>Close</button>
    </div>}
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 font-fantasy px-3 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-2">
        <button type="button" disabled={paintMode} onClick={() => navigate("/")}
          className="pointer-events-auto rounded-full border border-amber-500/30 bg-black/75 px-4 py-2 text-sm text-[#f5cf64] disabled:opacity-40">← Back</button>
        <h1 className="rounded-full bg-black/65 px-3 py-2 text-sm font-semibold tracking-wider text-[#f5cf64]">Pet Park</h1>
        {scene?.canEditPark ? <button type="button" aria-label="Expand Ground" title="Add more grassy park area"
          onClick={() => void expandGround()}
          disabled={paintMode || expandingGround || groundLevel >= PET_PARK_MAX_GROUND_LEVEL}
          className="pointer-events-auto rounded-full border border-amber-500/30 bg-black/75 px-3 py-2 text-sm text-[#f5cf64] disabled:opacity-50">
          <Expand size={15} className="mr-1 inline" />{expandingGround ? "Expanding…" : groundLevel >= PET_PARK_MAX_GROUND_LEVEL ? "Full" : "Expand"}
        </button> : <span className="w-16" />}
      </div>
    </div>
    {scene?.canEditPark && !showCreator && !selectedPlacement && !paintMode && !activeBuilding && <div
      className={`pointer-events-auto absolute inset-x-3 z-20 mx-auto grid max-w-lg grid-cols-3 gap-1.5 sm:grid-cols-5 ${scene.enabledForPlayers && deposits.length > 0 ? "bottom-[calc(42%_+_14px)]" : "bottom-[max(64px,env(safe-area-inset-bottom))]"}`}
      aria-label="Park editing toolbar">
      {([
        ["scene", "+ Building"], ["decor", "+ Decor"], ["effects", "+ Effects"],
      ] as const).map(([mode, label]) => <button key={mode} type="button" onClick={() => beginCreate(mode)}
        className="min-h-12 rounded-xl border border-[#b99a4c]/65 bg-[#10291d]/95 px-2 py-2 text-xs font-semibold text-[#f5d77b] shadow-lg">
        {label}
      </button>)}
      <button type="button" aria-label="Paint terrain" onClick={() => {
        setPaintMode(true); setSelectedPlacement(null); setPlacementDraft(null); setShowCreator(false);
      }} className="min-h-12 rounded-xl border border-[#b99a4c]/65 bg-[#20442e]/95 px-2 py-2 text-xs font-semibold text-[#f5d77b] shadow-lg">Paint terrain</button>
      <button type="button" aria-label="Clear all Pet Park terrain" disabled={clearTerrain.isPending || !scene.items.some(item => item.kind === "terrain")}
        onClick={() => clearTerrain.mutate()}
        className="min-h-12 rounded-xl border border-[#be8d62]/65 bg-[#463028]/95 px-2 py-2 text-xs font-semibold text-[#f9d6a6] shadow-lg disabled:opacity-40">
        {clearTerrain.isPending ? "Clearing…" : "Clear terrain"}
      </button>
    </div>}
    {scene?.canEditPark && selectedPlacement && selectedObject && placementDraft && !paintMode && !showCreator && <div
      className={`pointer-events-auto absolute left-3 right-3 z-30 mx-auto flex max-w-sm flex-col gap-2 rounded-xl border border-[#b99a4c]/75 bg-[#10291d]/95 p-3 text-[#f5d77b] shadow-xl max-h-[32dvh] overflow-y-auto ${scene.enabledForPlayers && deposits.length > 0 ? "bottom-[44%]" : "bottom-[max(12px,env(safe-area-inset-bottom))]"}`}
      aria-label="Edit selected park object">
      <div className="flex items-center justify-between gap-2">
        <strong className="truncate text-sm capitalize">{selectedPlacement.kind === "building" ? (selectedObject as ParkBuilding).name : ((selectedObject as ParkItem).effectType ?? (selectedObject as ParkItem).kind).replace(/_/g, " ")}</strong>
        <span className="text-[11px] text-amber-100/80">{placementSave.isPending ? "Saving…" : "Drag to move · auto-saves"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" aria-label="Decrease park object size" disabled={placementSave.isPending} className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 disabled:opacity-50" onClick={() => updatePlacement({ size: Math.max(1, placementDraft.size - 20) })}>− Size</button>
        <span className="tabular-nums">Size {placementDraft.size}</span>
        <button type="button" aria-label="Increase park object size" disabled={placementSave.isPending} className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 disabled:opacity-50" onClick={() => updatePlacement({ size: Math.min(1000, placementDraft.size + 20) })}>+ Size</button>
        <button type="button" disabled={placementSave.isPending} className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 disabled:opacity-50" onClick={() => updatePlacement({ flipped: !placementDraft.flipped })}>Flip</button>
      </div>
      <p className="text-xs text-amber-100/75">Depth follows ground position automatically. Move lower to bring in front.</p>
      <div className="flex flex-wrap items-center gap-2">
        {selectedPlacement.kind === "building" && <>
          <button type="button" className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 text-xs" onClick={() => setEnteredBuilding(selectedObject as ParkBuilding)}>Enter building</button>
          <button type="button" className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 text-xs" onClick={() => setDetailsBuildingId(selectedPlacement.id)}>Edit building</button>
        </>}
        <button type="button" disabled={placementSave.isPending || placementDelete.isPending}
          onClick={() => { setSelectedPlacement(null); setPlacementDraft(null); }}
          className="rounded-lg border border-[#b99a4c]/60 bg-[#245037] px-3 py-2 text-sm disabled:opacity-50">Done</button>
        <button type="button" disabled={placementSave.isPending || placementDelete.isPending}
          onClick={() => {
            if (selectedPlacement.kind === "item" && (selectedObject as ParkItem).kind === "terrain") {
              placementDelete.mutate(selectedPlacement);
            } else if (window.confirm("Remove this object from Pet Park?")) placementDelete.mutate(selectedPlacement);
          }}
          className="ml-auto rounded-lg border border-[#be8d62]/65 bg-[#463028] px-3 py-2 text-sm text-[#f9d6a6] disabled:opacity-50">Remove</button>
      </div>
    </div>}
        {scene?.canEditPark && showCreator && <div className="fixed inset-0 z-[70] flex items-end justify-center"
      role="dialog" aria-modal="true" aria-label="Add Pet Park object">
      <button type="button" aria-label="Close add object" onClick={() => setShowCreator(false)} className="absolute inset-0 bg-black/65" />
      <div onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
        className="relative z-10 flex font-fantasy max-h-[min(78dvh,780px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-amber-500/45 bg-[#10291d] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 p-4">
          <h2 className="text-base font-semibold tracking-wide text-[#f5cf64]">
            {editorMode === "effects" ? "Outdoor Effects" : editorMode === "scene" ? "Add Building" : "Decor / Objects"}
          </h2>
          <button type="button" aria-label="Close editor" onClick={() => setShowCreator(false)}
            className="rounded-full border border-amber-500/35 bg-amber-500/15 p-2 text-[#f5cf64]"><X size={17} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(24px,env(safe-area-inset-bottom))]">
          <PetParkAdminPanel key={editorMode} initialMode={editorMode} mode="create" creationPosition={creationPosition} onCreated={object => {
            setShowCreator(false);
            setSelectedPlacement({ kind: object.kind, id: object.id });
            setPlacementDraft({ xPct: object.xPct, yPct: object.yPct, size: object.size, flipped: object.flipped, layer: object.layer });
          }} />
        </div>
      </div>
    </div>}
    {scene?.canEditPark && detailsBuilding && <PetParkBuildingDetails key={detailsBuilding.id}
      building={detailsBuilding}
      occupantCount={(scene.sharedPets ?? []).filter(pet => pet.buildingId === detailsBuilding.id).length}
      onClose={() => setDetailsBuildingId(null)} onUpdated={invalidate} />}

    {isLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">Loading Pet Park…</div> :
      !scene?.canEnterPark && !scene?.canEditPark ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-6 pointer-events-none">
        <div className="rounded-xl border border-amber-500/50 bg-[#152d23] p-6 text-center shadow-xl">
          <h2 className="text-xl font-semibold text-amber-300">Pet Park — Under Construction</h2>
          <p className="mt-3 text-sm">The park is being prepared. Your pets and coins are safe.</p>
        </div>
      </div> : scene?.canEditPark ? (!scene.enabledForPlayers ? <div className="pointer-events-none absolute bottom-4 left-3 right-3 z-10 flex justify-center"><span className="rounded-lg bg-black/70 px-3 py-2 text-xs text-amber-200">Admin preview · Park closed to players</span></div> : null) : scene && !activeBuilding && !paintMode && !showCreator && !selectedPlacement && <div className="absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-3 right-3 z-20 mx-auto flex max-w-sm flex-col" data-testid="pet-park-player-slots">
        <div className="order-2 grid grid-cols-3 gap-2" aria-label="Your three park pet spots">
          {Array.from({ length: 3 }, (_, index) => {
            const slot = index + 1;
            const pet = deposits.find(d => d.slotNumber === slot);
            const unlocked = slot <= scene.unlockedSlots;
            return <button key={slot} type="button" aria-label={`Pet Park spot ${slot}`} data-testid={`pet-park-slot-${slot}`}
              onClick={() => { if (draggingSlot === slot) return; setActiveSlot(slot); setSelectedPet(""); setShowPetChoices(false); }}
              onPointerDown={event => { if (!pet || !event.isPrimary) return; slotDrag.current = { id: event.pointerId, petId: pet.id, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={event => { if (slotDrag.current?.id !== event.pointerId) return; if (Math.hypot(event.clientX - slotDrag.current.x, event.clientY - slotDrag.current.y) > 12) setDraggingSlot(slot); }}
              onPointerUp={event => { const current = slotDrag.current; if (!current || current.id !== event.pointerId) return; slotDrag.current = null; if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 12) dropEquippedPet(current.petId, event.clientX, event.clientY); window.setTimeout(() => setDraggingSlot(null), 0); }}
              onPointerCancel={() => { slotDrag.current = null; setDraggingSlot(null); }}
              onDoubleClick={() => { if (pet) { setActiveSlot(slot); setSelectedPet(""); setShowPetChoices(true); } }}
              className={`relative flex min-h-[76px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[50%] border-2 bg-[radial-gradient(ellipse_at_50%_20%,#315e43_0%,#173b29_48%,#091e17_100%)] px-1 py-2 text-center font-fantasy text-[#f5d77b] shadow-[inset_0_2px_8px_rgba(245,206,105,0.15),0_5px_15px_rgba(0,0,0,0.45)] ${activeSlot === slot ? "border-amber-300 ring-2 ring-amber-300/45" : "border-[#c6a552]/75"}`}>
              <span className="text-[10px] uppercase tracking-wide text-amber-200/80">Spot {slot}</span>
              <span className="max-w-full truncate text-xs font-semibold">{pet ? pet.petNickname || pet.petName : unlocked ? "+ Equip" : "Locked"}</span>
              {!pet && !unlocked && <span className="flex items-center gap-1 text-[11px]"><img src={coinImage} alt="Coins" className="h-5 w-5 object-contain" />{slot === 2 ? "2,500" : "5,000"}</span>}
            </button>;
          })}
        </div>
        {activeSlot != null && <div role="dialog" aria-label={`Park pet spot ${activeSlot}`}
          className="order-1 mb-2 max-h-[min(62dvh,570px)] overflow-y-auto rounded-xl border border-[#c6a552]/75 bg-[#10291d]/95 p-3 text-sm text-amber-100 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="font-fantasy text-[#f5d77b]">Pet Spot {activeSlot}</strong>
            <button type="button" aria-label="Close pet spot" onClick={() => setActiveSlot(null)} className="rounded-full border border-amber-700/60 px-3 py-1">×</button>
          </div>
          {(() => {
            const pet = deposits.find(d => d.slotNumber === activeSlot);
            if (pet) return <div className="space-y-2">
              <p>{pet.petNickname || pet.petName} · Level {pet.petLevel} · {pet.showInPark ? "In park" : "Idle — earning"}</p><p className="text-xs text-amber-200/75">Drag this equipped spot onto the park to place your pet.</p>
              <button type="button" className="rounded-lg border border-amber-500/60 bg-[#245037] px-3 py-2 text-xs" onClick={() => setShowPetChoices(value => !value)}>Change pet · double-tap spot</button>
              {showPetChoices && <div className="space-y-2">
                <p className="text-xs text-amber-100/75">Choose a replacement. Swapping automatically collects rewards and returns your current pet.</p>
                <div className="max-h-[min(26dvh,220px)] space-y-2 overflow-y-auto">
                  {availablePets.length === 0 && <p className="text-xs text-amber-100/65">No other eligible level 10+ pets available.</p>}
                  {availablePets.map(candidate => <button type="button" key={candidate.inventoryId} aria-pressed={selectedPet === candidate.inventoryId}
                    onClick={() => setSelectedPet(candidate.inventoryId)}
                    className={`flex w-full items-center gap-2 rounded border p-2 text-left ${selectedPet === candidate.inventoryId ? "border-amber-300 bg-[#315e43]" : "border-amber-500/25 bg-[#0b2016]"}`}>
                    <PetParkPetPortrait petTemplateId={candidate.petTemplateId} hatchedImageUrl={candidate.hatchedImageUrl} petInventoryId={candidate.inventoryId} size={92} />
                    <span className="text-xs">{candidate.petNickname || candidate.name} · Lv. {candidate.petLevel}</span>
                  </button>)}
                </div>
                <button type="button" disabled={!selectedPet || action.isPending} className="rounded-lg border border-amber-400/60 bg-[#245037] px-4 py-2 font-semibold disabled:opacity-50"
                  onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/swap`, body: { petInventoryId: selectedPet } })}>
                  {action.isPending ? "Swapping…" : "Confirm swap · collect rewards"}
                </button>
              </div>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={action.isPending} className="rounded-lg bg-[#245037] px-3 py-2 disabled:opacity-50"
                  onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${pet.id}/display`, body: { display: pet.showInPark ? "idle" : "park" } })}>
                  {pet.showInPark ? "Return to idle" : "Show in park"}
                </button>
                <button type="button" disabled={action.isPending} className="rounded-lg bg-emerald-800 px-3 py-2 disabled:opacity-50"
                  onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/claim` })}>Collect rewards</button>
                <button type="button" disabled={action.isPending} className="rounded-lg bg-amber-800 px-3 py-2 disabled:opacity-50"
                  onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/withdraw` })}>Retrieve</button>
              </div>
            </div>;
            if (activeSlot > scene.unlockedSlots) return <div className="space-y-2">
              <p>{activeSlot > scene.unlockedSlots + 1 ? "Unlock the preceding pet spot first." : "Unlock this spot to equip another hatched pet."}</p>
              <button type="button" disabled={action.isPending || activeSlot > scene.unlockedSlots + 1}
                className="rounded-lg bg-amber-800 px-4 py-2 disabled:opacity-50"
                onClick={() => action.mutate({ path: "/api/pet-park/slots/unlock", body: { slot: activeSlot } })}>
                Unlock · {activeSlot === 2 ? "2,500" : "5,000"} coins
              </button>
            </div>;
            return <div className="space-y-2">
              <p className="text-xs text-amber-200/75">Choose a hatched, unlisted pet at level 10 or above.</p>
              <div role="group" aria-label={`Choose pet for spot ${activeSlot}`} className="max-h-[min(38dvh,360px)] space-y-2 overflow-y-auto overscroll-contain rounded-lg border border-amber-600/40 p-2">
                {availablePets.length === 0 && <p className="p-3 text-xs text-amber-100/70">No eligible pets. Hatch and level up a pet to level 10 first.</p>}
                {availablePets.map(p => <button type="button" key={p.inventoryId} aria-pressed={selectedPet === p.inventoryId} onClick={() => setSelectedPet(p.inventoryId)}
                  className={`flex w-full min-h-[120px] items-center gap-3 rounded-lg border p-2 text-left ${selectedPet === p.inventoryId ? "border-amber-300 bg-[#315e43]" : "border-amber-600/30 bg-[#0b2016]"}`}>
                  <PetParkPetPortrait petTemplateId={p.petTemplateId} hatchedImageUrl={p.hatchedImageUrl} petInventoryId={p.inventoryId} size={118} />
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{p.petNickname || p.name}</p><p className="text-xs text-amber-200/75">Level {p.petLevel} · {p.starRarity ?? p.rarity ?? "?"}★</p></div>
                </button>)}
              </div>

              <button type="button" disabled={!selectedPet || action.isPending} className="sticky bottom-0 z-10 w-full rounded-lg border border-amber-400/50 bg-[#245037] px-4 py-3 font-semibold shadow-lg disabled:opacity-50"
                onClick={() => action.mutate({ path: "/api/pet-park/deposits", body: { petInventoryId: selectedPet, slotNumber: activeSlot } })}>{action.isPending ? "Equipping…" : "Equip selected pet"}</button>
            </div>;
          })()}
        </div>}
      </div>}
  </div>;
}
