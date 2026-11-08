import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import MiniPetRenderer from "@/components/MiniPetRenderer";
import PetParkPetPortrait from "@/components/PetParkPetPortrait";
import PetParkRewardBars from "@/components/PetParkRewardBars";
import PetParkSlotProgress from "@/components/PetParkSlotProgress";
import PetParkShopShelf from "@/components/PetParkShopShelf";
import PetParkWaterRefillPopup from "@/components/PetParkWaterRefillPopup";
import emptyParkPetArtwork from "@assets/generated_images/hub_para_pet_transparent.png";
const coinImage = new URL("../../../attached_assets/uploads/MainGameCoinImage.PNG", import.meta.url).href;
import PetParkAdminPanel from "@/components/PetParkAdminPanel";
import PetParkTerrain from "@/components/PetParkTerrain";
import PetParkTerrainBrush from "@/components/PetParkTerrainBrush";
import { isParkTerrainNearViewport } from "@/lib/petParkTerrainVisibility";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import { isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio, type ParkTerrainDetailType } from "@shared/petParkTerrainDetails";
import { isParkEffect, DEFAULT_PARK_LIGHT_COLOR } from "@shared/petParkEffects";
import { getAlphaBounds } from "@/lib/alphaBounds";
import { parkImageHitAt, parkImageHitClipPath, parkImageVisualCenter } from "@/lib/petParkImageHit";
import { pickParkAdminArtwork } from "@/lib/petParkAdminSelection";
import { parkDepthIndex, parkImageGroundContact } from "@/lib/petParkDepth";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";
import { HomeOutdoorAtmosphereLayer, useHomeOutdoorLighting } from "@/components/HomeOutdoorAtmosphere";
import { parkOutdoorLightEffects, parkOutdoorFireflyFields } from "@shared/petParkAtmosphere";
import { parkOutdoorEffectOpacity, parkSceneDarkness } from "@/lib/parkSceneLighting";
import type { ParkDecorEffect } from "@shared/petParkDecorEffects";
import PetParkDecorEffects from "@/components/PetParkDecorEffects";
import PetParkDecorEffectEditor from "@/components/PetParkDecorEffectEditor";
import type { ParkEffectType } from "@shared/petParkEffects";
import { X, Expand, LockKeyhole, Droplets, RotateCcw } from "lucide-react";
import PetParkInteriorRoom from "@/components/PetParkInteriorRoom";
import PetParkBuildingDetails from "@/components/PetParkBuildingDetails";
import type { HouseInteriorEffect } from "@shared/housing";
import { isParkRoomEffect, type ParkInteriorEffect } from "@shared/petParkRooms";
import { parkPetActivity } from "@/lib/petParkActivity";
import { animateParkOutdoorPet, parkOutdoorPetSize } from "@/lib/petParkOutdoorPresentation";
import { arrangeParkVisitors, isParkPetNearViewport } from "@/lib/petParkPopulation";
import { isParkSleepPosition, parkPetSizeOnSleepSpot, parkIndoorPetSizeOnSleepSpot, parkIndoorScenePetSize, isParkIndoorSleepPosition } from "@/lib/petParkSleepSpots";
import { parkProjectedPetBounds, parkVisiblePetArtworkBounds, parkPetWouldObscureAnother, parkInteriorArtworkRect } from "@/lib/petParkVisibleOverlap";
import PetParkRarityStars from "@/components/PetParkRarityStars";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import { petParkInteriorDropPoint } from "@/lib/petParkInteriorDrop";
import { parkCameraGeometry, parkClampCamera, parkClampZoom, parkZoomAnchorPan, parkExpansionCameraPan } from "@/lib/petParkCamera";
import { PET_PARK_MAX_GROUND_LEVEL, parkGroundSize, parkGroundTheme, type ParkGroundTheme } from "@shared/petParkGround";
import { parkSnapPathPoint } from "@/lib/petParkTerrainBrush";
import { HOME_TOUCH_SURFACE_STYLE, homeCameraPointerDelta, observeHomeViewport, safeSetPointerCapture } from "@/lib/homeCrossDevice";
import { gardenCropProgress, gardenItemNeedsRefill, type GardenPlayerState } from "@shared/garden";
import type { ParkShopPlacement } from "@shared/petParkShopPlacements";
import PetParkCropArtwork from "@/components/PetParkCropArtwork";
import { readPetParkImageData } from "@/lib/petParkImageData";
import PetParkGardenMenu from "@/components/PetParkGardenMenu";

type ParkItem = { id: string; kind: "decor" | "sleep_spot" | "effect" | "terrain"; isWaterSource?: boolean; tapImageUrl?: string | null; appearanceGroupId?: string | null; decorEffects?: ParkDecorEffect[]; effectType?: ParkEffectType | ParkTerrainDetailType | null; effectColor?: string | null; imageUrl: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
type ParkBuilding = { id: string; name: string; imageUrl: string; interiorImageUrl: string | null; nightInteriorImageUrl?: string | null; xPct: number; yPct: number; size: number; flipped: boolean; layer: number; maxPets: number; isShop?: boolean; shopItemIds?: string[]; shopItemPlacements?: ParkShopPlacement[]; interiorDarkness?: number; interiorNightDarkness?: number | null; interiorEffects: ParkInteriorEffect[]; exteriorEffects?: ParkDecorEffect[] };
type ParkDeposit = { id: string; slotNumber: number; petInventoryId: string; petName: string; petTemplateId: string | null; hatchedImageUrl: string | null; petNickname: string | null; petLevel: number; checkpointAt: string; pausedAt: string | null; pausedDurationMs: number; earnedDurationMs: number; buildingId: string | null; roomEffectId: string | null; showInPark: boolean; parkXPct: number | null; parkYPct: number | null; interiorXPct: number; interiorYPct: number; pose: "idle" | "sit" | "sleep" };
type SharedParkPet = { petInventoryId: string; petTemplateId: string | null; hatchedImageUrl: string | null; petName: string; petNickname: string | null; petLevel: number; rarity: number | null; ownerName: string; ownerId: string; depositedAt: string; buildingId: string | null; roomEffectId: string | null; parkXPct: number | null; parkYPct: number | null; interiorXPct: number; interiorYPct: number; pose: "idle" | "sit" | "sleep" };
type ParkPlacement = { xPct: number; yPct: number; size: number; flipped: boolean; layer: number };
type ParkScene = { sharedPets?: SharedParkPet[]; enabledForPlayers: boolean; canEnterPark?: boolean; preview?: boolean; canEditPark?: boolean; backgroundUrl: string | null; groundLevel: number; groundTheme?: ParkGroundTheme; items: ParkItem[]; buildings?: ParkBuilding[]; deposits: ParkDeposit[]; unlockedSlots: number; rates?: { coinsPerHour: number; essencePerHour: number; petXpPerHour: number }; serverNow?: string };
type InventoryPet = { inventoryId: string; shopItemId: string; imageUrl?: string | null; isRefillable?: boolean; specialType?: string | null; gardenWaterLeft?: number | null; quantity?: number; petTemplateId?: string | null; hatchedImageUrl?: string | null; name: string; petNickname?: string | null; petLevel?: number; starRarity?: number; rarity?: number; isHatched: boolean; isListed?: boolean; type?: string };

export default function PetParkPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const viewport = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  // Automatic clock only. Park visitors have no day/night override control.
  const parkLighting = useHomeOutdoorLighting("auto");
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number; pan: { x: number; y: number }; midpoint: { x: number; y: number } } | null>(null);
  const [imageContacts, setImageContacts] = useState<Record<string, number>>({});
  const [imageHitClips, setImageHitClips] = useState<Record<string, string>>({});
  const [imageVisualCenters, setImageVisualCenters] = useState<Record<string, { xPct: number; yPct: number }>>({});
  const observeContact = (image: HTMLImageElement, url: string) => {
    const width = image.naturalWidth, height = image.naturalHeight;
    void getAlphaBounds(url, image).then(bounds => {
      const contact = parkImageGroundContact(width, height, bounds);
      setImageContacts(old => old[url] === contact ? old : { ...old, [url]: contact });
      const clipPath = parkImageHitClipPath(bounds, width, height);
      if (clipPath) setImageHitClips(old => old[url] === clipPath ? old : { ...old, [url]: clipPath });
      const center = parkImageVisualCenter(bounds, width, height);
      setImageVisualCenters(old => old[url]?.xPct === center.xPct && old[url]?.yPct === center.yPct
        ? old : { ...old, [url]: center });
    });
  };
  const [selectedPet, setSelectedPet] = useState("");
  const [petSearch, setPetSearch] = useState("");
  // Gestures can dispatch many events between refreshes. Commit the latest
  // camera once per animation frame instead of rerendering every scene item
  // on every pointer sample (notably expensive on older iPhones/tablets).
  const cameraFrame = useRef<number | null>(null);
  const queuedCamera = useRef<{ pan: { x: number; y: number }; zoom?: number } | null>(null);
  const queueCameraUpdate = (nextPan: { x: number; y: number }, nextZoom?: number) => {
    queuedCamera.current = { pan: nextPan, zoom: nextZoom };
    if (cameraFrame.current !== null) return;
    cameraFrame.current = window.requestAnimationFrame(() => {
      cameraFrame.current = null;
      const next = queuedCamera.current;
      queuedCamera.current = null;
      if (!next) return;
      setPan(next.pan);
      if (next.zoom !== undefined) setZoom(next.zoom);
    });
  };
  useEffect(() => () => {
    if (cameraFrame.current !== null) window.cancelAnimationFrame(cameraFrame.current);
  }, []);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [showPetChoices, setShowPetChoices] = useState(false);
  const [offParkInteriorLights, setOffParkInteriorLights] = useState<Record<string, string[]>>({});
  const [inspectedPet, setInspectedPet] = useState<SharedParkPet | null>(null);
  // Tapping your own placed pet shows just its one management action.
  // Other players' pets continue to open the public player profile.
  const [selectedOwnPetId, setSelectedOwnPetId] = useState<string | null>(null);
  const [selectedWaterSourceId, setSelectedWaterSourceId] = useState<string | null>(null);
  const [showShopPicker, setShowShopPicker] = useState(false);
  // Viewer-local visual state: gates switch appearance without changing shared
  // decor placement or another player’s park scene.
  const [tappedDecorIds, setTappedDecorIds] = useState<Set<string>>(() => new Set());
  const toggleTappedDecor = (id: string) => setTappedDecorIds(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [selectedGardenPlotId, setSelectedGardenPlotId] = useState<string | null>(null);
  const [wateringGardenPlotId, setWateringGardenPlotId] = useState<string | null>(null);
  const suppressGardenPlotClickUntil = useRef(0);
  const [enteredBuilding, setEnteredBuilding] = useState<ParkBuilding | null>(null);
  const [openedRoomId, setOpenedRoomId] = useState<string | null>(null);
  const [focusedRoomEffectId, setFocusedRoomEffectId] = useState<string | null>(null);
  const [openInteriorEffectChoices, setOpenInteriorEffectChoices] = useState(false);
  const [detailsBuildingId, setDetailsBuildingId] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [expandingGround, setExpandingGround] = useState(false);
  const [creationPosition, setCreationPosition] = useState({ xPct: 0.5, yPct: 0.5 });
  const [paintMode, setPaintMode] = useState(false);
  const [selectedPlacement, setSelectedPlacement] = useState<{ kind: "building" | "item"; id: string } | null>(null);
  const [placementDraft, setPlacementDraft] = useState<ParkPlacement | null>(null);
  const [moveArmed, setMoveArmed] = useState<{ kind: "building" | "item"; id: string } | null>(null);
  const lastObjectTap = useRef<{ kind: "building" | "item"; id: string; at: number; x: number; y: number } | null>(null);
  const placementPointer = useRef<{ id: number; kind: "building" | "item"; objectId: string; startX: number; startY: number; placement: ParkPlacement } | null>(null);
  const [editorMode, setEditorMode] = useState<"scene" | "effects" | "decor">("scene");
  const [slotDragGhost, setSlotDragGhost] = useState<{ petId: string; x: number; y: number } | null>(null);
  const suppressSlotClickUntil = useRef(0);
  const slotDrag = useRef<{ id: number; petId: string; x: number; y: number } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [slotTapEffect, setSlotTapEffect] = useState<{ slot: number; nonce: number } | null>(null);
  const outdoorPetPointer = useRef<{ id: number; depositId: string; petInventoryId: string; x: number; y: number; initialX: number; initialY: number } | null>(null);
  const suppressOutdoorInspectUntil = useRef(0);
  const suppressIndoorInspectUntil = useRef(0);
  const [outdoorPetDraft, setOutdoorPetDraft] = useState<{ petInventoryId: string; x: number; y: number } | null>(null);
  const indoorSlotPointer = useRef<{ pointerId: number; petId: string; x: number; y: number } | null>(null);
  const [indoorDragGhost, setIndoorDragGhost] = useState<{ x: number; y: number; petId: string } | null>(null);
  const indoorPlacedPointer = useRef<{ id: number; petInventoryId: string; depositId: string;
    startX: number; startY: number; position: { x: number; y: number } } | null>(null);
  const [indoorPetDraft, setIndoorPetDraft] = useState<{ petInventoryId: string; x: number; y: number } | null>(null);
  const { data: scene, isLoading } = useQuery<ParkScene>({ queryKey: ["/api/pet-park/scene"], refetchInterval: 30_000 });
  const { data: inventory = [], isFetching: isGardenInventoryLoading } = useQuery<InventoryPet[]>({ queryKey: ["/api/inventory"], enabled: !!scene?.canEnterPark && !scene?.canEditPark });
  // Server owns stage transitions and the picked cooldown. Refetch without
  // inferring growth or advancing a plot on a local device clock.
  const { data: garden, isLoading: isGardenLoading } = useQuery<GardenPlayerState>({
    queryKey: ["/api/pet-park/garden"], enabled: !!scene?.canEnterPark && !scene?.canEditPark && !enteredBuilding,
    // Only the active plot needs near-live progress. Its own server mutations
    // still invalidate immediately; background 5s polling needlessly redraws
    // every building, terrain stamp and pet for idle park visitors.
    refetchInterval: selectedGardenPlotId ? 5000 : 30_000,
  });
  const chosenGardenPlot = garden?.plots?.find(plot => plot.plotItemId === selectedGardenPlotId);
  useEffect(() => {
    if (!selectedGardenPlotId || chosenGardenPlot) return;
    // The garden state can briefly be pending just after selecting a tile.
    // Its compact notice also closes by tapping away, without a modal.
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element &&
          event.target.closest('[data-testid="pet-park-garden-loading"]')) return;
      suppressGardenPlotClickUntil.current = Date.now() + 300;
      setSelectedGardenPlotId(null);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [selectedGardenPlotId, chosenGardenPlot]);

  const invalidateGarden = () => {
    qc.invalidateQueries({ queryKey: ["/api/pet-park/garden"] });
    qc.invalidateQueries({ queryKey: ["/api/inventory"] });
  };
  const availableRefillables = inventory.filter(item =>
    item.type === "garden_tool" && item.specialType === "watering_pail" && gardenItemNeedsRefill(item));
  // The shared player card needs the viewer id to hide friend actions on self.
  const { data: viewingUser } = useQuery<{ id: string }>({ queryKey: ["/api/auth/me"], enabled: !!inspectedPet, staleTime: 60_000 });

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
  const { parkLights, parkFireflies } = useMemo(() => {
    const items = [
      ...(scene?.items ?? []).map(item => selectedPlacement?.kind === "item" && selectedPlacement.id === item.id && placementDraft
        ? { ...item, ...placementDraft } : item),
      ...(scene?.buildings ?? []).map(building => ({
        ...building,
        ...(selectedPlacement?.kind === "building" && selectedPlacement.id === building.id && placementDraft ? placementDraft : {}),
        kind: "building",
      })),
    ];
    const shape = { width: sceneWidth, height: sceneHeight, scale };
    return { parkLights: parkOutdoorLightEffects(items, shape, camera, viewportSize),
      parkFireflies: parkOutdoorFireflyFields(items, shape, camera, viewportSize) };
  }, [scene?.items, scene?.buildings, selectedPlacement, placementDraft, sceneWidth, sceneHeight, scale, camera.x, camera.y, viewportSize.width, viewportSize.height]);
  // The compact action arc uses the existing camera's world-to-screen
  // projection. Prefer the RIGHT side of the touched plot; flip left only
  // when it would otherwise be clipped at a mobile/tablet edge.
  const gardenToolAnchor = chosenGardenPlot ? (() => {
    const plotX = camera.x + chosenGardenPlot.xPct * sceneWidth;
    const plotY = camera.y + chosenGardenPlot.yPct * sceneHeight;
    const side: "right" | "left" = plotX + 158 <= viewportSize.width ? "right" : "left";
    const preferredX = side === "right" ? plotX + 42 : plotX - 167;
    return {
      plotX, plotY, side,
      x: Math.max(6, Math.min(Math.max(6, viewportSize.width - 131), preferredX)),
      y: Math.max(48, Math.min(Math.max(48, viewportSize.height - 224), plotY - 97)),
    };
  })() : null;
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] }); qc.invalidateQueries({ queryKey: ["/api/pet-park/status"] }); };
  const action = useMutation({
    mutationFn: async ({ method = "POST", path, body }: { method?: "POST" | "PATCH"; path: string; body?: object }) => {
      const res = await apiRequest(method, path, body ?? {});
      return res.json();
    },
    onSuccess: (result: unknown, variables) => {
      // Ordinary equip, swap, collect and display actions are reflected in
      // the slot HUD, not noisy success toasts. Keep errors visible.
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      setSelectedPet("");
      setShowPetChoices(false);
      setPetSearch("");
      if (variables.path === "/api/pet-park/deposits") setActiveSlot(null);
      if (variables.path === "/api/pet-park/slots/unlock") {
        // The server has already committed the coin debit + unlocked spot.
        // Reflect its result in the existing scene cache immediately rather
        // than rendering a large pet picker through a stale locked scene.
        const unlockedSlots = (result as { unlockedSlots?: unknown } | null)?.unlockedSlots;
        if (typeof unlockedSlots === "number" && Number.isInteger(unlockedSlots) &&
            unlockedSlots >= 1 && unlockedSlots <= 3) {
          qc.setQueryData<ParkScene>(["/api/pet-park/scene"],
            old => old ? { ...old, unlockedSlots } : old);
        }
        setActiveSlot(null);
        toast({ title: "Pet spot unlocked", description: "Tap the new spot to choose a pet." });
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
      setSelectedPlacement(null); setPlacementDraft(null); setMoveArmed(null);
      toast({ title: "Could not save placement", description: error.message, variant: "destructive" });
    },
  });
  const tapImageSave = useMutation({
    mutationFn: async ({ id, imageData }: { id: string; imageData: string | null }) =>
      apiRequest("PATCH", `/api/admin/pet-park/items/${id}/tap-image`, { imageData }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
    },
    onError: (error: Error) => toast({
      title: "Unable to update Tap Image", description: error.message, variant: "destructive",
    }),
  });
  const updateTapImage = async (id: string, file?: File) => {
    if (!file || tapImageSave.isPending) return;
    try {
      const imageData = await readPetParkImageData(file);
      tapImageSave.mutate({ id, imageData });
    } catch (error) {
      toast({ title: "Unable to read Tap Image", description: String(error), variant: "destructive" });
    }
  };
  const decorAppearanceSave = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; imageData?: string;
      tapImageData?: string | null; decorEffects?: ParkDecorEffect[] }) =>
      apiRequest("PATCH", `/api/admin/pet-park/items/${id}/appearance`, patch),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
    },
    onError: (error: Error) => toast({
      title: "Could not update decoration appearance",
      description: error.message, variant: "destructive",
    }),
  });
  const replaceDecorArtwork = async (id: string, file?: File) => {
    if (!file || decorAppearanceSave.isPending) return;
    try {
      decorAppearanceSave.mutate({ id, imageData: await readPetParkImageData(file) });
    } catch (error) {
      toast({ title: "Could not read decoration artwork",
        description: String(error), variant: "destructive" });
    }
  };
  const standaloneLightColorSave = useMutation({
    mutationFn: async ({ id, effectColor }: { id: string; effectColor: string }) =>
      apiRequest("PATCH", `/api/admin/pet-park/items/${id}/color`, { effectColor }),
    onSuccess: invalidate,
    onError: (error: Error) => toast({
      title: "Unable to update lamp light", description: error.message, variant: "destructive",
    }),
  });
  const waterSourceSave = useMutation({
    mutationFn: async ({ id, isWaterSource }: { id: string; isWaterSource: boolean }) =>
      apiRequest("PATCH", `/api/admin/pet-park/items/${id}/water-source`, { isWaterSource }),
    onSuccess: invalidate,
    onError: (error: Error) => toast({
      title: "Unable to update Water Source", description: error.message, variant: "destructive",
    }),
  });
  const placementDelete = useMutation({
    mutationFn: async ({ kind, id }: { kind: "building" | "item"; id: string }) => {
      const path = kind === "building" ? `/api/admin/pet-park/buildings/${id}` : `/api/admin/pet-park/items/${id}`;
      return apiRequest("DELETE", path);
    },
    onSuccess: () => { invalidate(); setSelectedPlacement(null); setPlacementDraft(null); },
    onError: (error: Error) => toast({ title: "Could not remove park object", description: error.message, variant: "destructive" }),
  });
  const duplicateDecor = useMutation({
    mutationFn: async ({ id, xPct, yPct }: { id: string; xPct: number; yPct: number }) => {
      const response = await apiRequest("POST", `/api/admin/pet-park/items/${id}/duplicate`, { xPct, yPct });
      return response.json() as Promise<ParkItem>;
    },
    onSuccess: (item) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      setSelectedPlacement({ kind: "item", id: item.id });
      setPlacementDraft({ xPct: item.xPct, yPct: item.yPct, size: item.size, flipped: item.flipped, layer: item.layer });
    },
    onError: (error: Error) => toast({ title: "Could not duplicate decoration", description: error.message, variant: "destructive" }),
  });
  const clearTerrain = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/pet-park/terrain"),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      setSelectedPlacement(null);
      setPlacementDraft(null);
    },
    onError: (error: Error) => toast({ title: "Could not clear terrain", description: error.message, variant: "destructive" }),
  });
  const updatePlacement = (changes: Partial<ParkPlacement>) => {
    if (!selectedPlacement || !placementDraft || placementSave.isPending || placementDelete.isPending) return;
    const next = { ...placementDraft, ...changes };
    setPlacementDraft(next);
    placementSave.mutate({ ...selectedPlacement, ...next });
  };
  // A first tap selects an object; a double-tap on its visible art arms moving.
  // The next drag moves it once, without interfering with normal camera panning.
  const startPlacement = (e: React.PointerEvent<HTMLElement>, kind: "building" | "item",
    object: ParkBuilding | ParkItem, selectedImage?: HTMLImageElement | null) => {
    if (!scene?.canEditPark || paintMode || showCreator || activeBuilding ||
        placementSave.isPending || placementDelete.isPending || !e.isPrimary) return;
    const image = selectedImage === undefined ? e.currentTarget.querySelector("img") : selectedImage;
    if (image && !parkImageHitAt(image, e.clientX, e.clientY, object.flipped)) return;
    const current = selectedPlacement?.kind === kind && selectedPlacement.id === object.id && placementDraft
      ? placementDraft : { xPct: object.xPct, yPct: object.yPct, size: object.size, flipped: object.flipped, layer: object.layer };
    if (moveArmed?.kind === kind && moveArmed.id === object.id) {
      e.stopPropagation();
      placementPointer.current = { id: e.pointerId, kind, objectId: object.id,
        startX: e.clientX, startY: e.clientY, placement: { ...current } };
      safeSetPointerCapture(e.currentTarget, e.pointerId);
      return;
    }
    const previous = lastObjectTap.current;
    const doubleTap = !!previous && previous.kind === kind && previous.id === object.id &&
      Date.now() - previous.at < 400 && Math.hypot(e.clientX - previous.x, e.clientY - previous.y) < 22;
    lastObjectTap.current = doubleTap ? null :
      { kind, id: object.id, at: Date.now(), x: e.clientX, y: e.clientY };
    setMoveArmed(doubleTap ? { kind, id: object.id } : null);
    setSelectedPlacement({ kind, id: object.id });
    setPlacementDraft({ ...current });
    if (doubleTap) {
      // Allow holding and dragging on the *second* tap too; a quick second
      // tap leaves move mode armed for the next drag instead.
      e.stopPropagation();
      placementPointer.current = { id: e.pointerId, kind, objectId: object.id,
        startX: e.clientX, startY: e.clientY, placement: { ...current } };
      safeSetPointerCapture(e.currentTarget, e.pointerId);
    }
  };
  const placementAt = (drag: NonNullable<typeof placementPointer.current>, clientX: number, clientY: number) => {
    const delta = homeCameraPointerDelta(clientX - drag.startX, clientY - drag.startY, viewport.current);
    const connectedPath = drag.kind === "item" && scene?.items.some(item => item.id === drag.objectId && item.kind === "terrain" && isParkConnectedPath(item.effectType));
    const point = {
      xPct: Math.max(0, Math.min(1, drag.placement.xPct + delta.x / sceneWidth)),
      yPct: Math.max(0, Math.min(1, drag.placement.yPct + delta.y / sceneHeight)),
    };
    return {
      delta,
      placement: {
        ...drag.placement,
        ...(connectedPath ? parkSnapPathPoint(point, { width: geometry.worldWidth, height: geometry.worldHeight }, drag.placement.size) : point),
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
    setMoveArmed(null);
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
  const { dirtPatches, stonePatches, waterPatches } = useMemo(() => {
    const paths = {
      dirtPatches: [] as ParkItem[], stonePatches: [] as ParkItem[], waterPatches: [] as ParkItem[],
    };
    for (const item of scene?.items ?? []) {
      if (item.kind !== "terrain" || !isParkConnectedPath(item.effectType)) continue;
      const shown = selectedPlacement?.kind === "item" && selectedPlacement.id === item.id && placementDraft
        ? { ...item, ...placementDraft } : item;
      if (item.effectType === "dirt_path") paths.dirtPatches.push(shown);
      else if (item.effectType === "stone_path") paths.stonePatches.push(shown);
      else paths.waterPatches.push(shown);
    }
    return paths;
  }, [scene?.items, selectedPlacement, placementDraft]);
  const detailsBuilding = scene?.buildings?.find(building => building.id === detailsBuildingId);
  // Always use the latest scene record so saved interior changes show when the room is open.
  const activeBuilding = enteredBuilding ? (scene?.buildings?.find(building => building.id === enteredBuilding.id) ?? enteredBuilding) : null;
  const activeRoom = activeBuilding?.interiorEffects.find(effect => effect.id === openedRoomId && isParkRoomEffect(effect));
  const fullPageRoom = activeRoom && isParkRoomEffect(activeRoom) && activeRoom.view === "full_page" && activeRoom.imageUrl ? activeRoom : null;
  const popupRoom = activeRoom && isParkRoomEffect(activeRoom) && activeRoom.view === "popup" && activeRoom.imageUrl ? activeRoom : null;
  const currentRoomId = fullPageRoom?.id ?? null;
  // Merchandise-only shops never show or accept pets. The server also rejects
  // placement there, including forged requests from older clients.
  const buildingOccupants = activeBuilding?.isShop ? [] :
    (scene?.sharedPets ?? []).filter(pet => pet.buildingId === activeBuilding?.id);
  const indoorVisiblePets = buildingOccupants.filter(pet => (pet.roomEffectId ?? null) === currentRoomId);
  const deposits = scene?.deposits ?? [];
  const equippedForInterior = deposits.filter(pet => pet.slotNumber <= (scene?.unlockedSlots ?? 1));
  const outdoorPets = (scene?.sharedPets ?? []).filter(pet => !pet.buildingId);
  const parkPositions = useMemo(() => arrangeParkVisitors(outdoorPets, scene?.items ?? []), [scene?.sharedPets, scene?.items]);
  const occupied = new Set(deposits.map(d => d.petInventoryId));
  const indoorGhostPet = indoorDragGhost
    ? deposits.find(pet => pet.id === indoorDragGhost.petId) : null;
  const returnPetToIdle = (depositId: string) => {
    if (action.isPending) return;
    setSelectedOwnPetId(null);
    action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${depositId}/display`,
      body: { display: "idle" } });
  };
  const toggleOwnPetAction = (petInventoryId: string) => {
    setInspectedPet(null);
    setSelectedOwnPetId(current => current === petInventoryId ? null : petInventoryId);
  };
  const outdoorOverlapsAnotherPet = (petInventoryId: string, point: { xPct: number; yPct: number }) => {
    const worldElement = document.querySelector<HTMLElement>("[data-park-world-artwork]");
    if (!worldElement || !scene) return false;
    const position = { x: point.xPct, y: point.yPct };
    const size = parkOutdoorPetSize(parkPetSizeOnSleepSpot(position, scene.items,
      { width: geometry.worldWidth, height: geometry.worldHeight }, 200)) * scale;
    const pets = Array.from(worldElement.querySelectorAll<HTMLElement>("[data-park-pet]"));
    const source = pets.find(element => element.dataset.parkPet === petInventoryId);
    const projected = parkProjectedPetBounds(
      position, size, parkInteriorArtworkRect(worldElement),
      source ? { element: source, currentSize: source.getBoundingClientRect().width, anchorYRatio: .75 } : null,
    );
    return pets.some(element => element !== source &&
      parkPetWouldObscureAnother(projected, parkVisiblePetArtworkBounds(element)));
  };
  const dropEquippedPet = (petId: string, clientX: number, clientY: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    // A drop onto the oval or its open equip panel is not park placement.
    // This also prevents accidental public visibility from a short finger
    // movement while operating the lower UI on a narrow phone.
    const slots = document.querySelector<HTMLElement>('[data-testid="pet-park-player-slots"]');
    if (slots && clientY >= slots.getBoundingClientRect().top - 6) return;
    const xPct = (clientX - rect.left - camera.x) / sceneWidth;
    const yPct = (clientY - rect.top - camera.y) / sceneHeight;
    if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) return;
    const inventoryId = deposits.find(item => item.id === petId)?.petInventoryId;
    if (inventoryId && outdoorOverlapsAnotherPet(inventoryId, { xPct, yPct })) {
      toast({ title: "That spot is occupied", description: "Place your pet a little to the side." });
      return;
    }
    action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${petId}/display`, body: { display: "park", xPct, yPct } });
    setActiveSlot(null);
  };
  // Reuse the existing owner-only indoor placement endpoint for BOTH the
  // equipped tray and a pet already resting in the room. Keep the pointer
  // geometry in the real, panned room-image coordinate system.
  const indoorArtworkGeometry = () => {
    const viewportElement = document.querySelector<HTMLElement>('[data-testid="pet-park-interior-room"]');
    const artworkElement = viewportElement?.querySelector<HTMLElement>('[data-park-interior-artwork]');
    if (!viewportElement || !artworkElement) return null;
    const viewportBounds = viewportElement.getBoundingClientRect();
    const artworkBounds = artworkElement.getBoundingClientRect();
    return { artworkElement, viewportBounds, artworkBounds };
  };
  const commitIndoorPetPosition = (
    depositId: string, petInventoryId: string, point: { xPct: number; yPct: number },
  ) => {
    if (!activeBuilding || activeBuilding.isShop || popupRoom || action.isPending) return;
    const geometry = indoorArtworkGeometry();
    if (!geometry) return;
    const { artworkElement, artworkBounds } = geometry;
    const effects = fullPageRoom ? [] : activeBuilding.interiorEffects.filter(effect => !isParkRoomEffect(effect));
    const dimensions = { width: artworkBounds.width, height: artworkBounds.height };
    const position = { x: point.xPct, y: point.yPct };
    const size = parkIndoorScenePetSize(parkIndoorPetSizeOnSleepSpot(position, effects, dimensions,
      Math.max(68, Math.min(104, dimensions.height * .12))));
    const existing = Array.from(artworkElement.querySelectorAll<HTMLElement>("[data-park-pet]"));
    const source = existing.find(element => element.dataset.parkPet === petInventoryId);
    const sourceSize = source ? source.getBoundingClientRect().width : 0;
    const projected = parkProjectedPetBounds(
      position, size, parkInteriorArtworkRect(artworkElement),
      source ? { element: source, currentSize: sourceSize } : null,
    );
    if (existing.some(element => element !== source &&
      parkPetWouldObscureAnother(projected, parkVisiblePetArtworkBounds(element)))) {
      toast({ title: "That spot is occupied", description: "Move slightly to the side so both pets remain visible." });
      return;
    }
    action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${depositId}/placement`,
      body: { buildingId: activeBuilding.id, roomEffectId: currentRoomId, ...point,
        pose: isParkIndoorSleepPosition(position, effects, dimensions) ? "sleep" : "idle" } });
  };
  const startIndoorPetDrag = (event: React.PointerEvent<HTMLButtonElement>, petId: string) => {
    if (!event.isPrimary || action.isPending || !activeBuilding || activeBuilding.isShop || popupRoom) return;
    event.stopPropagation();
    indoorSlotPointer.current = { pointerId: event.pointerId, petId, x: event.clientX, y: event.clientY };
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const moveIndoorPetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = indoorSlotPointer.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 9)
      setIndoorDragGhost({ x: event.clientX, y: event.clientY, petId: drag.petId });
  };
  const endIndoorPetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = indoorSlotPointer.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    indoorSlotPointer.current = null;
    setIndoorDragGhost(null);
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 9 || !activeBuilding || activeBuilding.isShop || popupRoom) return;
    const geometry = indoorArtworkGeometry();
    if (!geometry) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    // Other *pet* artwork is not a UI blocker. The previous generic
    // 'button' test rejected drops onto placed pet drag handles.
    if (hit?.closest('[data-testid="pet-park-interior-slots"], [data-park-room-portal], [aria-label="Exit building"], [aria-label="Exit room"]')) return;
    const { viewportBounds, artworkBounds } = geometry;
    const point = petParkInteriorDropPoint(
      { x: event.clientX, y: event.clientY }, viewportBounds, artworkBounds);
    if (!point) return;
    const pet = deposits.find(item => item.id === drag.petId);
    if (pet) commitIndoorPetPosition(drag.petId, pet.petInventoryId, point);
  };
  const cancelIndoorPetDrag = () => {
    indoorSlotPointer.current = null;
    setIndoorDragGhost(null);
  };
  const startPlacedIndoorPetDrag = (event: React.PointerEvent<HTMLButtonElement>, pet: SharedParkPet, depositId: string,
    position: { x: number; y: number }) => {
    if (!event.isPrimary || action.isPending || !activeBuilding || activeBuilding.isShop || popupRoom) return;
    event.stopPropagation();
    indoorPlacedPointer.current = {
      id: event.pointerId, petInventoryId: pet.petInventoryId, depositId,
      startX: event.clientX, startY: event.clientY, position,
    };
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const placedIndoorPetPosition = (drag: NonNullable<typeof indoorPlacedPointer.current>, x: number, y: number) => {
    const geometry = indoorArtworkGeometry();
    if (!geometry) return drag.position;
    const dx = homeCameraPointerDelta(x - drag.startX, y - drag.startY, viewport.current);
    return {
      x: Math.max(0, Math.min(1, drag.position.x + dx.x / geometry.artworkBounds.width)),
      y: Math.max(0, Math.min(1, drag.position.y + dx.y / geometry.artworkBounds.height)),
    };
  };
  const movePlacedIndoorPet = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = indoorPlacedPointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    const next = placedIndoorPetPosition(drag, event.clientX, event.clientY);
    setIndoorPetDraft({ petInventoryId: drag.petInventoryId, ...next });
  };
  const endPlacedIndoorPet = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = indoorPlacedPointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    indoorPlacedPointer.current = null;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 6;
    if (moved) suppressIndoorInspectUntil.current = Date.now() + 450;
    const point = placedIndoorPetPosition(drag, event.clientX, event.clientY);
    setIndoorPetDraft(null);
    if (moved) commitIndoorPetPosition(drag.depositId, drag.petInventoryId, { xPct: point.x, yPct: point.y });
  };
  const cancelPlacedIndoorPet = () => {
    indoorPlacedPointer.current = null;
    setIndoorPetDraft(null);
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
    dropEquippedPet(drag.petId, event.clientX, event.clientY);
  };
  const startOutdoorPetDrag = (event: React.PointerEvent<HTMLButtonElement>, pet: ParkDeposit,
    position: { x: number; y: number }) => {
    if (!event.isPrimary || action.isPending) return;
    event.stopPropagation();
    outdoorPetPointer.current = { id: event.pointerId, depositId: pet.id, petInventoryId: pet.petInventoryId,
      x: event.clientX, y: event.clientY, initialX: position.x, initialY: position.y };
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const outdoorPetPosition = (drag: NonNullable<typeof outdoorPetPointer.current>, x: number, y: number) => {
    const delta = homeCameraPointerDelta(x - drag.x, y - drag.y, viewport.current);
    return {
      x: Math.max(0, Math.min(1, drag.initialX + delta.x / sceneWidth)),
      y: Math.max(0, Math.min(1, drag.initialY + delta.y / sceneHeight)),
    };
  };
  const moveOutdoorPetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = outdoorPetPointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    const next = outdoorPetPosition(drag, event.clientX, event.clientY);
    setOutdoorPetDraft({ petInventoryId: drag.petInventoryId, ...next });
  };
  const endOutdoorPetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = outdoorPetPointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    outdoorPetPointer.current = null;
    const moved = Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6;
    setOutdoorPetDraft(null);
    if (!moved) return;
    const next = outdoorPetPosition(drag, event.clientX, event.clientY);
    suppressOutdoorInspectUntil.current = Date.now() + 450;
    if (outdoorOverlapsAnotherPet(drag.petInventoryId, { xPct: next.x, yPct: next.y })) {
      toast({ title: "That spot is occupied", description: "Move slightly to the side so both pets stay visible." });
      return;
    }
    action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${drag.depositId}/display`,
      body: { display: "park", xPct: next.x, yPct: next.y } });
  };
  const cancelOutdoorPetDrag = () => {
    outdoorPetPointer.current = null;
    setOutdoorPetDraft(null);
  };
  const cancelEquippedPetDrag = () => {
    slotDrag.current = null;
    setSlotDragGhost(null);
    setDraggingSlot(null);
  };
  const showRoomEffect = (room: Extract<ParkInteriorEffect, { type: "room" }>) => {
    if (!activeBuilding) return;
    if (scene?.canEditPark) {
      setFocusedRoomEffectId(room.id);
      setOpenInteriorEffectChoices(false);
      setDetailsBuildingId(activeBuilding.id);
    } else if (room.imageUrl) {
      setOpenedRoomId(room.id);
    }
  };
  const toggleParkInteriorLight = (buildingId: string, effect: HouseInteriorEffect) => {
    if (effect.type === "warm_glow") return;
    setOffParkInteriorLights(current => {
      const off = new Set(current[buildingId] ?? []);
      if (off.has(effect.id)) off.delete(effect.id);
      else off.add(effect.id);
      return { ...current, [buildingId]: Array.from(off) };
    });
  };
  const availablePets = inventory.filter(p => p.isHatched && (p.petLevel ?? 1) >= 10 && !p.isListed && !occupied.has(p.inventoryId) && (p.type == null || p.type === "pet"));
  const matchingPets = availablePets.filter(p => !petSearch.trim() || `${p.petNickname || p.name} ${p.petLevel ?? ""}`.toLowerCase().includes(petSearch.trim().toLowerCase()));
  const visiblePetChoices = matchingPets.slice(0, 24);

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
      onPointerDownCapture={e => {
        if (!scene?.canEditPark || paintMode || showCreator || activeBuilding || !e.isPrimary) return;
        const target = e.target as HTMLElement;
        // HUD, pets and independent player controls keep their own gestures.
        if (target.closest("[data-park-pet]") ||
            (target.closest("button, input, select, textarea, a") &&
              !target.closest("[data-park-draggable]"))) return;
        const artwork = viewport.current?.querySelector("[data-park-world-artwork]");
        if (!artwork) return;
        const hit = pickParkAdminArtwork(artwork, e.clientX, e.clientY, (kind, id) =>
          kind === "building"
            ? scene.buildings?.find(building => building.id === id) ?? null
            : scene.items.find(item => item.id === id) ?? null);
        if (!hit) return; // transparent area behaves like empty grass
        const object = hit.kind === "building"
          ? scene.buildings?.find(building => building.id === hit.id)
          : scene.items.find(item => item.id === hit.id);
        if (!object) return;
        if (e.pointerType === "touch") {
          touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        startPlacement(e, hit.kind, object, hit.image);
        // A hit belongs to the truly visible object even when a larger
        // transparent PNG above it received the browser's pointer event.
        e.stopPropagation();
      }}
      onPointerMoveCapture={e => {
        if (placementPointer.current?.id === e.pointerId) movePlacement(e);
      }}
      onPointerUpCapture={e => {
        if (placementPointer.current?.id !== e.pointerId) return;
        endPlacement(e);
        touchPoints.current.delete(e.pointerId);
        if (touchPoints.current.size < 2) pinch.current = null;
      }}
      onPointerCancelCapture={e => {
        if (placementPointer.current?.id !== e.pointerId) return;
        cancelPlacement(e);
        touchPoints.current.delete(e.pointerId);
        if (touchPoints.current.size < 2) pinch.current = null;
      }}
      onPointerDown={e => {
        if (scene?.canEditPark && !paintMode && !showCreator && e.target === e.currentTarget) {
          setSelectedPlacement(null); setPlacementDraft(null);
        }
        const draggableArtwork = (e.target as HTMLElement).closest("[data-park-draggable]");
      // Touching unarmed artwork may still pan the camera. Pointer capture
      // stays with the object only after the double-tap has armed a move.
      const isControl = !!(e.target as HTMLElement).closest("button, input, select, textarea, a")
        && (!draggableArtwork || !scene?.canEditPark);
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
            queueCameraUpdate(parkClampCamera({
              x: center.x - (pinch.current.midpoint.x - pinch.current.pan.x) * zoomRatio,
              y: center.y - (pinch.current.midpoint.y - pinch.current.pan.y) * zoomRatio,
            }, nextGeometry), nextZoom);
            return;
          }
        }
        const drag = pointer.current;
        if (!drag || drag.id !== e.pointerId) return;
        const delta = homeCameraPointerDelta(e.clientX - drag.x, e.clientY - drag.y, viewport.current);
        if (Math.hypot(delta.x, delta.y) > 7) drag.moved = true;
        if (!drag.moved) return;
        queueCameraUpdate(parkClampCamera({ x: drag.panX + delta.x, y: drag.panY + delta.y }, geometry));
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
        if (placementPointer.current?.id === e.pointerId) cancelPlacement(e);
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
      {scene && !activeBuilding && <PetParkTerrain viewportWidth={viewportSize.width} viewportHeight={viewportSize.height}
        worldWidth={geometry.worldWidth} worldHeight={geometry.worldHeight}
        scale={scale} panX={camera.x} panY={camera.y} groundTheme={parkGroundTheme(scene.groundTheme)}
        dirtPatches={dirtPatches} stonePatches={stonePatches} waterPatches={waterPatches} />}
      {scene && !activeBuilding && <div data-park-world-artwork className="absolute top-0 left-0 pointer-events-none"
        style={{ width: sceneWidth, height: sceneHeight, transform: `translate(${camera.x}px, ${camera.y}px)` }}>
        {(scene.buildings ?? []).map(building => <button key={building.id} type="button" data-park-draggable data-park-object-kind="building"
          data-park-object-id={building.id} aria-label={`Enter ${building.name}`} onClick={e => { e.stopPropagation(); if (!scene.canEditPark &&
          parkImageHitAt(e.currentTarget.querySelector("img")!, e.clientX, e.clientY, building.flipped)) {
            setOpenedRoomId(null); setEnteredBuilding(building);
          } }} onPointerDown={e => startPlacement(e, "building", building)} onPointerMove={movePlacement} onPointerUp={endPlacement} onPointerCancel={cancelPlacement} onLostPointerCapture={cancelPlacement} className={`absolute pointer-events-auto touch-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 `} style={{ left: `${shownPosition("building", building).xPct * 100}%`, top: `${shownPosition("building", building).yPct * 100}%`, width: shownPosition("building", building).size * scale, height: shownPosition("building", building).size * scale, transform: `translate(-50%, -50%) ${shownPosition("building", building).flipped ? "scaleX(-1)" : ""}`, clipPath: scene.canEditPark ? undefined : imageHitClips[building.imageUrl], zIndex: parkDepthIndex({ yPct: shownPosition("building", building).yPct, worldHeight: geometry.worldHeight, size: shownPosition("building", building).size, kind: "building", contact: imageContacts[building.imageUrl] }) }}><img onLoad={event => observeContact(event.currentTarget, building.imageUrl)} src={building.imageUrl} alt={building.name} draggable={false} className={`relative z-[1] h-full w-full object-contain ${selectedPlacement?.kind === "building" && selectedPlacement.id === building.id ? "drop-shadow-[0_0_7px_rgba(245,194,68,0.95)]" : ""}`} />
          <PetParkDecorEffects effects={building.exteriorEffects ?? []}
            sunlightStrength={parkLighting.daylightStrength} nightStrength={parkLighting.nightStrength}
            fireflyStrength={parkLighting.fireflyStrength} lampStrength={parkLighting.lampStrength}
            reducedMotion={reduceMotion || zoom <= .85} />
        </button>)}
        {scene.items.map(item => {
          const position = shownPosition("item", item);
          const visibleDecorImage = !scene.canEditPark && item.kind === "decor" &&
            item.tapImageUrl && tappedDecorIds.has(item.id) ? item.tapImageUrl : item.imageUrl;
          const isGardenPlot = item.kind === "terrain" && item.effectType === "garden_plot";
          const isWaterTile = item.kind === "terrain" && item.effectType === "water_path";
          const savedGardenPlot = isGardenPlot ? garden?.plots?.find(plot => plot.plotItemId === item.id) : undefined;
          if (item.kind === "terrain" && !isParkTerrainNearViewport(
            { ...position, effectType: item.effectType }, { width: viewportSize.width, height: viewportSize.height },
            { width: sceneWidth, height: sceneHeight, scale }, camera,
          )) return null;
          return <div key={item.id} data-park-draggable data-park-object-kind="item" data-park-object-id={item.id}
            onPointerDown={e => startPlacement(e, "item", item)} onPointerMove={movePlacement} onPointerUp={endPlacement} onPointerCancel={cancelPlacement} onLostPointerCapture={cancelPlacement} className={`absolute ${scene.canEditPark && !paintMode && !showCreator ? "pointer-events-auto touch-none" : "pointer-events-none"} ${selectedPlacement?.kind === "item" && selectedPlacement.id === item.id && !item.imageUrl ? "outline outline-2 outline-amber-400 rounded-lg" : ""}`}
          style={{ left: `${shownPosition("item", item).xPct * 100}%`, top: `${shownPosition("item", item).yPct * 100}%`, width: shownPosition("item", item).size * scale, height: shownPosition("item", item).size * scale * (item.kind === "terrain" ? parkTerrainHeightRatio(item.effectType) : 1), transform: `translate(-50%, -50%) ${shownPosition("item", item).flipped ? "scaleX(-1)" : ""}`, zIndex: item.kind === "effect" || item.kind === "sleep_spot" ? 12_000_000 : item.kind === "terrain" ? 500 : parkDepthIndex({ yPct: shownPosition("item", item).yPct, worldHeight: geometry.worldHeight, size: shownPosition("item", item).size, kind: "item", contact: visibleDecorImage ? imageContacts[visibleDecorImage] : undefined }) }}>
          {item.kind === "terrain" && isParkConnectedPath(item.effectType) ? null : item.kind === "terrain" && isParkTerrainDetail(item.effectType) ? <PetParkTerrainDetail type={item.effectType} tilled={isGardenPlot && !!savedGardenPlot && savedGardenPlot.phase !== "empty" && savedGardenPlot.phase !== "picked"} /> : item.kind === "effect" && item.effectType && isParkEffect(item.effectType) ? <div
              data-testid={`park-standalone-effect-${item.id}`}
              className="pointer-events-none h-full w-full"
              style={{ opacity: parkOutdoorEffectOpacity(item.effectType, parkLighting.nightStrength, parkLighting.fireflyStrength, parkLighting.lampStrength),
                transition: "opacity 1200ms linear" }}>
              <ParkEffectVisual type={item.effectType} color={item.effectColor ?? undefined} reducedMotion={reduceMotion} adminPreview={Boolean(scene.canEditPark)} fireflyStrength={parkLighting.fireflyStrength} sceneFireflies />
            </div> : visibleDecorImage ? <><img onLoad={event => observeContact(event.currentTarget, visibleDecorImage)} alt="" src={visibleDecorImage} draggable={false} className={`relative z-[1] w-full h-full object-contain ${selectedPlacement?.kind === "item" && selectedPlacement.id === item.id ? "drop-shadow-[0_0_7px_rgba(245,194,68,0.95)]" : ""}`} />
              {item.kind === "decor" && <PetParkDecorEffects effects={item.decorEffects ?? []}
                sunlightStrength={parkLighting.daylightStrength} nightStrength={parkLighting.nightStrength}
            fireflyStrength={parkLighting.fireflyStrength} lampStrength={parkLighting.lampStrength}
                reducedMotion={reduceMotion || zoom <= 0.85} />}
            </> :
            item.kind === "sleep_spot" ? <ParkEffectVisual type="sleep" reducedMotion={reduceMotion} adminPreview={Boolean(scene.canEditPark)} /> : null}
          {!scene.canEditPark && scene.canEnterPark && isGardenPlot && <button
            type="button" data-testid="pet-park-garden-plot" aria-label="Open Garden Plot"
            className="pointer-events-auto absolute inset-0 z-[2] cursor-pointer touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            style={{ clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)" }}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); if (Date.now() >= suppressGardenPlotClickUntil.current) setSelectedGardenPlotId(item.id); }} />}
          {!scene.canEditPark && scene.canEnterPark && item.kind === "decor" &&
            !item.isWaterSource && item.imageUrl && item.tapImageUrl && <button
            type="button" data-testid="pet-park-tappable-decor"
            aria-label={tappedDecorIds.has(item.id) ? "Restore decoration" : "Tap decoration"}
            aria-pressed={tappedDecorIds.has(item.id)}
            className="pointer-events-auto absolute inset-0 z-[3] touch-manipulation rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            style={{ clipPath: visibleDecorImage ? imageHitClips[visibleDecorImage] : undefined }}
            onClick={event => {
              event.stopPropagation();
              const image = event.currentTarget.parentElement?.querySelector("img");
              if (image && (event.detail === 0 ||
                  parkImageHitAt(image, event.clientX, event.clientY, item.flipped))) {
                toggleTappedDecor(item.id);
              }
            }} />}
          {!scene.canEditPark && scene.canEnterPark && item.kind === "decor" && item.isWaterSource && item.imageUrl && <button
            type="button" data-testid="pet-park-water-source"
            aria-label="Refill at Water Source"
            className="pointer-events-auto absolute inset-0 z-[3] touch-manipulation rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            style={{ clipPath: visibleDecorImage ? imageHitClips[visibleDecorImage] : undefined }}
            onClick={event => {
              event.stopPropagation();
              const image = event.currentTarget.parentElement?.querySelector("img");
              if (image && (event.detail === 0 || parkImageHitAt(image, event.clientX, event.clientY, item.flipped))) {
                if (item.tapImageUrl) toggleTappedDecor(item.id);
                setSelectedWaterSourceId(item.id);
              }
            }}>
            <span data-testid="pet-park-water-source-indicator"
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c1d9b4]/65 bg-[#133b31]/85 p-1 text-[#b3e5d8] shadow-md"
              style={{ left: `${imageVisualCenters[visibleDecorImage ?? ""]?.xPct ?? 50}%`,
                top: `${imageVisualCenters[visibleDecorImage ?? ""]?.yPct ?? 50}%` }} aria-hidden="true">
              <Droplets size={13} />
            </span>
          </button>}
          {!scene.canEditPark && scene.canEnterPark && isWaterTile && <button
            type="button" data-testid="pet-park-water-tile-source"
            aria-label="Refill at Water Tile"
            className="pointer-events-auto absolute inset-0 z-[2] touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation();
              setSelectedWaterSourceId(item.id);
            }} />}
        </div>;
        })}
        {/* Crop artwork is a depth-sorted world object above the soil, not
            a child of the terrain stamp's fixed z=500 background layer. */}
        {!scene.canEditPark && (garden?.plots ?? []).map(plot => {
          if (!["planted", "seedling", "partial", "grown", "picked"].includes(plot.phase)) return null;
          const crop = garden?.crops?.find(entry => entry.id === plot.cropId);
          const image = crop?.images[plot.phase as "planted" | "seedling" | "partial" | "grown" | "picked"];
          if (!image || !isParkTerrainNearViewport(
            { ...plot, effectType: "garden_plot" },
            { width: viewportSize.width, height: viewportSize.height },
            { width: sceneWidth, height: sceneHeight, scale }, camera)) return null;
          return <PetParkCropArtwork key={plot.plotItemId + ":" + plot.phase}
            image={image} xPct={plot.xPct} yPct={plot.yPct} size={plot.size} scale={scale}
            zIndex={parkDepthIndex({ yPct: plot.yPct, worldHeight: geometry.worldHeight,
              size: plot.size, kind: "item" })}
            placement={crop?.stagePlacements?.[plot.phase as "planted" | "seedling" | "partial" | "grown" | "picked"]}
            progress={gardenCropProgress(plot, crop)}
            showWaterProgress={wateringGardenPlotId === plot.plotItemId} />;
        })}
        {outdoorPets.map(pet => {
          const position = outdoorPetDraft?.petInventoryId === pet.petInventoryId
            ? { x: outdoorPetDraft.x, y: outdoorPetDraft.y }
            : pet.parkXPct != null && pet.parkYPct != null
              ? { x: pet.parkXPct, y: pet.parkYPct } : parkPositions.get(pet.petInventoryId);
          if (!position || !isParkPetNearViewport(position, sceneWidth, sceneHeight, camera.x, camera.y, viewportSize.width, viewportSize.height)) return null;
          const activity = parkPetActivity(pet.petInventoryId);
          const sleepWorld = { width: geometry.worldWidth, height: geometry.worldHeight };
          const sleeping = pet.pose === "sleep" || isParkSleepPosition(position, scene.items, sleepWorld);
          // This size belongs to the admin's rest area, not to a player-adjustable pet setting.
          const petSize = parkOutdoorPetSize(parkPetSizeOnSleepSpot(position, scene.items, sleepWorld, 200));
          const petHeight = petSize * 225 / 200;
          const myDeposit = deposits.find(d => d.petInventoryId === pet.petInventoryId);
          const isMine = !!myDeposit;
          const animateOutdoor = animateParkOutdoorPet(zoom, reduceMotion, isMine);
          return <div key={pet.petInventoryId} data-park-pet={pet.petInventoryId} className="absolute"
            style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`,
              transform: "translate(-50%, -75%)", width: petSize * scale, height: petHeight * scale, zIndex: parkDepthIndex({ yPct: position.y, worldHeight: geometry.worldHeight, size: petHeight, kind: "pet" }) }}>
            {/* The camera transforms the PET ONCE as one world-unit object.
                PetAnimator, public costumes, mini pets, hit targets and stars
                otherwise mix separately zoomed pixel sizes on pinch gestures. */}
            <div data-park-pet-world-scale className="relative"
              style={{ width: petSize, height: petHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <div data-park-pet-artwork className={`relative z-[1] pointer-events-none h-[80%] ${!animateOutdoor ? "" : sleeping ? "pet-park-rest" : activity.kind === "wander" ? "pet-park-wander" : "pet-park-idle"}`}
              style={{ animationDelay: `${activity.delaySeconds}s`, animationDuration: `${activity.durationSeconds}s`,
                ["--pet-drift-x" as string]: `${activity.driftX}px`, ["--pet-drift-y" as string]: `${activity.driftY}px` }}>
              {pet.petTemplateId ? <PetAnimator petTemplateId={pet.petTemplateId} petInventoryId={pet.petInventoryId}
                costumeAccess={isMine ? "owner" : "public"} mode={!animateOutdoor ? "static" : sleeping ? "sleep" : "idle"} size={petSize} fillContainer /> :
                pet.hatchedImageUrl ? <img src={pet.hatchedImageUrl} alt="" className="h-full w-full object-contain"
                  onLoad={event => { if (pet.hatchedImageUrl) void getAlphaBounds(pet.hatchedImageUrl, event.currentTarget); }} /> : null}
              <div className="pointer-events-none absolute bottom-0 left-0 h-[25%] w-[25%]">
                <MiniPetRenderer petInventoryId={pet.petInventoryId} access={isMine ? "owner" : "public"} animated={animateOutdoor} />
              </div>
            </div>
            <button type="button"
              aria-label={myDeposit ? `Move or return ${pet.petNickname || pet.petName} to idle` : `Inspect ${pet.petNickname || pet.petName}`}
              data-testid={myDeposit ? "pet-park-outdoor-drag" : "pet-park-outdoor-inspect"}
              className="pointer-events-auto absolute left-[12%] top-[5%] z-[2] h-[70%] w-[76%] touch-none"
              onPointerDown={myDeposit ? event => startOutdoorPetDrag(event, myDeposit, position) : undefined}
              onPointerMove={myDeposit ? moveOutdoorPetDrag : undefined}
              onPointerUp={myDeposit ? endOutdoorPetDrag : undefined}
              onPointerCancel={myDeposit ? cancelOutdoorPetDrag : undefined}
              onLostPointerCapture={myDeposit ? cancelOutdoorPetDrag : undefined}
              onClick={() => {
                if (Date.now() < suppressOutdoorInspectUntil.current) return;
                if (myDeposit) toggleOwnPetAction(pet.petInventoryId);
                else setInspectedPet(pet);
              }} />
            <PetParkRarityStars rarity={pet.rarity} petSize={petSize} />
            </div>
            {myDeposit && selectedOwnPetId === pet.petInventoryId && <button type="button"
              data-testid="pet-park-own-return-idle" aria-label={`Return ${pet.petNickname || pet.petName} to idle`}
              disabled={action.isPending}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); returnPetToIdle(myDeposit.id); }}
              className="pointer-events-auto absolute left-1/2 top-[96%] z-[12] min-h-9 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#e0c37a] bg-[#183a2a]/95 px-3 py-2 text-[11px] font-semibold text-[#f8df9d] shadow-lg disabled:opacity-50">
              Return to idle
            </button>}
          </div>;
        })}
      </div>}
      {/* One camera-following Home atmosphere layer dims terrain, buildings,
          pets and decor together. It stays below all player/admin controls. */}
      {scene && !activeBuilding && <div data-testid="pet-park-auto-day-night"
        className="pointer-events-none absolute inset-0 z-[10] overflow-hidden">
        <HomeOutdoorAtmosphereLayer parkLampFalloff darkness={parkSceneDarkness(parkLighting.nightStrength)}
          nightStrength={parkLighting.nightStrength}
          effects={parkLights} fireflies={parkFireflies} fireflyStrength={parkLighting.fireflyStrength}
           lampStrength={parkLighting.lampStrength} lampStrength={parkLighting.lampStrength}
           reducedMotion={reduceMotion || zoom <= .85} panX={camera.x} panY={camera.y}
          imgWidth={sceneWidth} sceneHeight={sceneHeight}
          transitionMs={parkLighting.transitionMs} zIndex={2} />
      </div>}
      {paintMode && scene?.canEditPark && <PetParkTerrainBrush
        viewportWidth={viewportSize.width} viewportHeight={viewportSize.height}
        sceneWidth={sceneWidth} sceneHeight={sceneHeight}
        worldWidth={geometry.worldWidth} worldHeight={geometry.worldHeight}
        panX={camera.x} panY={camera.y} scale={scale}
        raised={scene.enabledForPlayers && deposits.length > 0}
        groundTheme={parkGroundTheme(scene.groundTheme)} onSaved={invalidate} onExit={() => setPaintMode(false)} />}
    </div>

    {scene?.enabledForPlayers && <div className="absolute right-3 top-16 z-20 rounded bg-black/70 px-3 py-1 text-xs">
      {(scene?.sharedPets ?? []).length} pets visiting
    </div>}
    {activeBuilding && <div className="fixed inset-0 z-40 bg-[#13291e]" role="dialog" aria-modal="true" aria-label={activeBuilding.name}>
      <button type="button" aria-label={fullPageRoom ? "Exit room" : "Exit building"}
        onClick={() => { if (fullPageRoom) setOpenedRoomId(null); else setEnteredBuilding(null);
          setShowShopPicker(false); cancelEquippedPetDrag(); }}
        className="absolute right-3 z-50 rounded-full border border-amber-400/70 bg-[#10291d]/95 px-5 py-2.5 font-fantasy text-sm font-semibold text-[#f5cf64] shadow-xl"
        style={{ top: "max(64px, calc(env(safe-area-inset-top, 0px) + 12px))" }}>{fullPageRoom ? "Back" : "Exit"}</button>
      {scene?.canEditPark && !fullPageRoom && <button type="button" aria-label="Add effect inside building"
        onClick={() => { setFocusedRoomEffectId(null); setOpenInteriorEffectChoices(true); setDetailsBuildingId(activeBuilding.id); }}
        className="absolute left-3 z-50 rounded-full border border-amber-400/70 bg-[#10291d]/95 px-4 py-2.5 text-sm font-semibold text-[#f5cf64]"
        style={{ top: "max(64px, calc(env(safe-area-inset-top, 0px) + 12px))" }}>+ Add effect</button>}
      {scene?.canEditPark && activeBuilding.isShop && !fullPageRoom && <button type="button"
        aria-label="Add shop merchandise" data-testid="pet-park-shop-add-item"
        onClick={() => setShowShopPicker(true)}
        className="absolute left-3 z-50 rounded-full border border-[#e6c77f]/75 bg-[#214d35]/95 px-3 py-2.5 text-xs font-semibold text-[#f5d795] shadow-xl"
        style={{ top: "max(117px, calc(env(safe-area-inset-top, 0px) + 65px))" }}>+ Add Item</button>}
      {(fullPageRoom?.imageUrl ?? activeBuilding.interiorImageUrl) ? <PetParkInteriorRoom
        key={fullPageRoom?.id ?? activeBuilding.id} expanded
        imageUrl={fullPageRoom?.imageUrl ?? activeBuilding.interiorImageUrl ?? ""}
        nightImageUrl={fullPageRoom ? null : activeBuilding.nightInteriorImageUrl}
        name={fullPageRoom?.name ?? activeBuilding.name}
        darkness={activeBuilding.interiorDarkness ?? 35}
        nightArtworkActive={parkLighting.nightInteriorArtworkActive}
        effects={fullPageRoom ? [] : activeBuilding.interiorEffects ?? []}
        onOpenRoom={showRoomEffect}
        offEffectIds={new Set(offParkInteriorLights[activeBuilding.id] ?? [])}
        onToggleEffect={effect => toggleParkInteriorLight(activeBuilding.id, effect)}
        sunlightStrength={parkLighting.daylightStrength}>
        {({ imageWidth, sceneHeight: roomHeight }) => <>
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 5 }}>
          {indoorVisiblePets.map(pet => {
          const position = indoorPetDraft?.petInventoryId === pet.petInventoryId
            ? { x: indoorPetDraft.x, y: indoorPetDraft.y }
            : { x: pet.interiorXPct, y: pet.interiorYPct };
          const effects = fullPageRoom ? [] : activeBuilding.interiorEffects.filter(effect => !isParkRoomEffect(effect));
          const dimensions = { width: imageWidth, height: roomHeight };
          const basePetSize = Math.max(68, Math.min(104, roomHeight * 0.12));
          const petSize = parkIndoorScenePetSize(parkIndoorPetSizeOnSleepSpot(position, effects, dimensions, basePetSize));
          const sleeping = isParkIndoorSleepPosition(position, effects, dimensions);
          const deposit = deposits.find(item => item.petInventoryId === pet.petInventoryId);
          const isMine = !!deposit;
          return <div key={pet.petInventoryId} data-park-pet={pet.petInventoryId} className="pointer-events-none absolute"
            style={{ left: position.x * imageWidth, top: position.y * roomHeight,
              width: petSize, height: petSize,
              transform: "translate(-50%, -88%)", zIndex: 1 + Math.round(position.y * 1000) }}>
            <div data-park-pet-artwork className="relative h-full w-full">
              <PetParkPetPortrait petTemplateId={pet.petTemplateId} petInventoryId={pet.petInventoryId}
                hatchedImageUrl={pet.hatchedImageUrl} size={petSize}
                mode={sleeping ? "sleep" : "static"} reducedMotion={reduceMotion}
                access={isMine ? "owner" : "public"} />
            </div>
            <PetParkRarityStars rarity={pet.rarity} petSize={petSize} />
            {deposit && <button type="button" data-testid="pet-park-indoor-pet-drag"
              aria-label={`Move ${pet.petNickname || pet.petName} inside the room`}
              className="pointer-events-auto absolute left-[12%] top-[5%] z-[3] h-[85%] w-[76%] touch-none rounded-full"
              onPointerDown={event => startPlacedIndoorPetDrag(event, pet, deposit.id, position)}
              onPointerMove={movePlacedIndoorPet} onPointerUp={endPlacedIndoorPet}
              onPointerCancel={cancelPlacedIndoorPet} onLostPointerCapture={cancelPlacedIndoorPet}
              onClick={() => {
                if (Date.now() >= suppressIndoorInspectUntil.current) toggleOwnPetAction(pet.petInventoryId);
              }} />}
            {!deposit && <button type="button" data-testid="pet-park-indoor-inspect"
              aria-label={`View ${pet.ownerName}'s player profile`}
              className="pointer-events-auto absolute left-[12%] top-[5%] z-[3] h-[85%] w-[76%] rounded-full"
              onClick={() => setInspectedPet(pet)} />}
            {deposit && selectedOwnPetId === pet.petInventoryId && <button type="button"
              data-testid="pet-park-own-return-idle" aria-label={`Return ${pet.petNickname || pet.petName} to idle`}
              disabled={action.isPending}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); returnPetToIdle(deposit.id); }}
              className="pointer-events-auto absolute left-1/2 top-[96%] z-[5] min-h-9 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#e0c37a] bg-[#183a2a]/95 px-3 py-2 text-[11px] font-semibold text-[#f8df9d] shadow-lg disabled:opacity-50">
              Return to idle
            </button>}
          </div>;
          })}
        </div>
        {activeBuilding.isShop && !fullPageRoom && <PetParkShopShelf
          buildingId={activeBuilding.id}
          itemIds={activeBuilding.shopItemIds ?? []}
          placements={activeBuilding.shopItemPlacements ?? []}
          canEditPark={Boolean(scene?.canEditPark)}
          imageWidth={imageWidth} imageHeight={roomHeight}
          showPicker={showShopPicker} onShowPickerChange={setShowShopPicker} />}
        </>}
      </PetParkInteriorRoom>
        : <p className="p-8 pt-28 text-center text-sm">This building needs an interior background. An admin can upload one with Edit building.</p>}
      {!popupRoom && !activeBuilding.isShop && <div data-testid="pet-park-interior-slots"
        className="absolute inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom,0px))] z-50 mx-auto max-w-xl rounded-xl border border-[#b99a4c]/65 bg-[#10291d]/95 p-2 shadow-xl">
        <div className="flex items-center justify-between gap-2 text-[11px] text-amber-200/80">
          <span>{currentRoomId ? `${indoorVisiblePets.length}/${fullPageRoom?.maxPets ?? 0} pets in room` :
            `${buildingOccupants.length}/${activeBuilding.maxPets} pets inside`}</span>
          <span>Drag an equipped pet onto the room</span>
        </div>
        <div className="mt-1 flex gap-2 overflow-x-auto overscroll-contain">
          {equippedForInterior.map(pet => <div key={pet.id} className="flex shrink-0 flex-col items-center gap-1">
            <button type="button" data-testid={`pet-park-room-slot-${pet.slotNumber}`}
              aria-label={`Drag ${pet.petNickname || pet.petName} into the room`}
              title={pet.petNickname || pet.petName}
              disabled={action.isPending} onPointerDown={event => startIndoorPetDrag(event, pet.id)}
              onPointerMove={moveIndoorPetDrag} onPointerUp={endIndoorPetDrag}
              onPointerCancel={cancelIndoorPetDrag} onLostPointerCapture={cancelIndoorPetDrag}
              className="flex h-[68px] w-[68px] shrink-0 touch-none items-center justify-center overflow-hidden rounded-full border-2 border-[#c6aa68]/75 bg-[radial-gradient(ellipse,#3b6949,#122d20)] p-1 shadow-[inset_0_1px_8px_rgba(0,0,0,.45)] active:border-[#f1db96] disabled:opacity-50">
              <PetParkPetPortrait petTemplateId={pet.petTemplateId} petInventoryId={pet.petInventoryId}
                hatchedImageUrl={pet.hatchedImageUrl} size={58} reducedMotion />
            </button>
            {pet.buildingId && <button type="button" disabled={action.isPending}
              data-testid="pet-park-room-slot-return-idle"
              aria-label={`Return ${pet.petNickname || pet.petName} to idle`}
              title="Return to idle"
              onClick={() => returnPetToIdle(pet.id)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#bfa36a]/60 bg-[#173c2b] text-[#edcf84] disabled:opacity-50">
              <RotateCcw size={14} aria-hidden="true" />
            </button>}
          </div>)}
          {equippedForInterior.length === 0 && <p className="px-2 py-3 text-xs text-amber-200/70">Equip a level 10+ pet in an outdoor oval first.</p>}
        </div>
      </div>}
      {!activeBuilding.isShop && indoorDragGhost && indoorGhostPet && <div
        data-testid="pet-park-indoor-portrait-ghost"
        aria-hidden="true"
        className="pointer-events-none fixed z-[100] flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-[#edcd80]/85 bg-[#123a27]/95 p-1 shadow-xl"
        style={{ left: indoorDragGhost.x, top: indoorDragGhost.y, transform: "translate(-50%, -115%)" }}>
        <PetParkPetPortrait petTemplateId={indoorGhostPet.petTemplateId}
          hatchedImageUrl={indoorGhostPet.hatchedImageUrl} petInventoryId={indoorGhostPet.petInventoryId}
          size={60} reducedMotion />
      </div>}
      {popupRoom && <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 pt-[max(72px,env(safe-area-inset-top))] pb-[max(22px,env(safe-area-inset-bottom))]"
        role="dialog" aria-modal="true" aria-label={popupRoom.name}
        onPointerDown={event => { if (event.target === event.currentTarget) setOpenedRoomId(null); }}>
        <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-amber-400/75 bg-[#10291d] shadow-2xl">
          <div className="flex shrink-0 items-center justify-between gap-3 p-3">
            <h2 className="font-fantasy font-semibold text-[#f5cf64]">{popupRoom.name}</h2>
            <button type="button" aria-label="Close room popup" onClick={() => setOpenedRoomId(null)}
              className="rounded-full border border-amber-500/55 px-4 py-2 text-sm text-amber-100">Close</button>
          </div>
          <img src={popupRoom.imageUrl ?? ""} alt={popupRoom.name} draggable={false}
            className="min-h-0 w-full flex-1 object-contain" style={{ maxHeight: "72dvh" }} />
          <p className="px-3 pb-3 text-xs text-amber-100/60">View-only · No pet placement</p>
        </div>
      </div>}
    </div>}
    {selectedGardenPlotId && !scene?.canEditPark && scene?.canEnterPark && (
      chosenGardenPlot && gardenToolAnchor ? <PetParkGardenMenu
        key={chosenGardenPlot.plotItemId} plot={chosenGardenPlot}
        anchor={gardenToolAnchor}
        crops={garden?.crops ?? []} inventory={inventory} inventoryLoading={isGardenInventoryLoading}
        onClose={() => { suppressGardenPlotClickUntil.current = Date.now() + 300; setSelectedGardenPlotId(null); }}
        onChanged={invalidateGarden} onWateringState={setWateringGardenPlotId} /> :
      <ViewportModalPortal blocking={false}><div data-testid="pet-park-garden-loading"
        className="pointer-events-none absolute inset-x-3 top-[28%] z-[76] flex justify-center">
        <div className="pointer-events-auto flex max-w-[260px] items-center gap-2 rounded-xl border border-[#c9a65e]/80 bg-[#143925]/95 p-2 text-xs text-[#f4dda6] shadow-lg"
          role="status">
          <span>{isGardenLoading ? "Checking Garden Plot…" : "Garden Plot unavailable."}</span>
        </div>
      </div></ViewportModalPortal>
    )}
    {selectedWaterSourceId && !scene?.canEditPark && <ViewportModalPortal>
      <PetParkWaterRefillPopup key={selectedWaterSourceId}
        sourceId={selectedWaterSourceId}
        pails={inventory.filter(item => item.type === "garden_tool" && item.specialType === "watering_pail")}
        eligiblePails={availableRefillables}
        inventoryLoading={isGardenInventoryLoading}
        reduceMotion={reduceMotion}
        onClose={() => setSelectedWaterSourceId(null)}
        onRefilled={() => qc.invalidateQueries({ queryKey: ["/api/inventory"] })} />
    </ViewportModalPortal>}
    {inspectedPet && <ViewportModalPortal>
      <PlayerDetailPanel userId={inspectedPet.ownerId} currentUserId={viewingUser?.id}
        presentation="popup" onClose={() => setInspectedPet(null)} />
    </ViewportModalPortal>}
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
        <span className="text-[11px] text-amber-100/80">{placementSave.isPending ? "Saving…" : moveArmed?.kind === selectedPlacement.kind && moveArmed.id === selectedPlacement.id ? "Move armed · drag artwork" : "Double-tap artwork to move"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {selectedPlacement.kind === "item" && (selectedObject as ParkItem).kind === "terrain" &&
          isParkConnectedPath((selectedObject as ParkItem).effectType) ?
          <span className="text-amber-100/70">Snapped path tile · move or remove</span> : <>
          <button type="button" aria-label="Decrease park object size" disabled={placementSave.isPending} className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 disabled:opacity-50" onClick={() => updatePlacement({ size: Math.max(1, placementDraft.size - 20) })}>− Size</button>
          <span className="tabular-nums">Size {placementDraft.size}</span>
          <button type="button" aria-label="Increase park object size" disabled={placementSave.isPending} className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 disabled:opacity-50" onClick={() => updatePlacement({ size: Math.min(1000, placementDraft.size + 20) })}>+ Size</button>
          <button type="button" disabled={placementSave.isPending} className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 disabled:opacity-50" onClick={() => updatePlacement({ flipped: !placementDraft.flipped })}>Flip</button>
        </>}
      </div>
      {selectedPlacement.kind === "item" && (selectedObject as ParkItem).kind === "effect" &&
        ((selectedObject as ParkItem).effectType === "lamp_light" || (selectedObject as ParkItem).effectType === "colored_light") && <label
        className="flex items-center justify-between gap-3 rounded-lg border border-[#b99a4c]/55 bg-[#173b28] p-2 text-xs">
        Lamp Light color
        <input type="color" aria-label="Edit Pet Park lamp light color"
          value={(selectedObject as ParkItem).effectColor ?? DEFAULT_PARK_LIGHT_COLOR}
          disabled={standaloneLightColorSave.isPending}
          onChange={event => standaloneLightColorSave.mutate({
            id: selectedPlacement.id, effectColor: event.target.value,
          })}
          className="h-9 w-14 rounded border border-[#b99a4c]/55 bg-transparent"/>
      </label>}
      {selectedPlacement.kind === "item" && (selectedObject as ParkItem).kind === "decor" && <button
        type="button" aria-label="Water Source" aria-pressed={Boolean((selectedObject as ParkItem).isWaterSource)}
        data-testid="park-decoration-water-source"
        disabled={waterSourceSave.isPending || placementSave.isPending || placementDelete.isPending}
        onClick={() => waterSourceSave.mutate({
          id: selectedPlacement.id, isWaterSource: !(selectedObject as ParkItem).isWaterSource,
        })}
        className="flex items-center justify-between rounded-lg border border-[#b99a4c]/60 bg-[#1c3c2c] px-3 py-2 text-left text-xs font-semibold disabled:opacity-50">
        <span>Water Source <span className="font-normal text-amber-100/70">· Refill station</span></span>
        <span className={`rounded-full px-2 py-1 ${(selectedObject as ParkItem).isWaterSource ? "bg-[#d9ba65] text-[#172d1e]" : "bg-[#17291e] text-[#c8bd95]"}`}>
          {(selectedObject as ParkItem).isWaterSource ? "On" : "Off"}
        </span>
      </button>}
      {selectedPlacement.kind === "item" && (selectedObject as ParkItem).kind === "decor" && <div
        className="space-y-2 rounded-lg border border-[#b99a4c]/55 bg-[#153523] p-2"
        data-testid="park-decoration-artwork-editor">
        <span className="block text-xs font-semibold">Artwork · all linked copies</span>
        <img src={(selectedObject as ParkItem).imageUrl ?? ""} alt="Selected decoration artwork"
          className="mx-auto h-20 w-full object-contain" />
        <label className="block cursor-pointer rounded-lg border border-dashed border-[#b99a4c]/65 bg-[#245037] p-2 text-center text-xs">
          {decorAppearanceSave.isPending ? "Updating artwork…" : "Replace Decoration Artwork"}
          <input type="file" className="sr-only" accept="image/png,image/jpeg"
            aria-label="Replace linked decoration artwork"
            disabled={decorAppearanceSave.isPending}
            onChange={event => { void replaceDecorArtwork(selectedPlacement.id, event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>}
      {selectedPlacement.kind === "item" && (selectedObject as ParkItem).kind === "decor" && <PetParkDecorEffectEditor
        key={selectedPlacement.id} imageUrl={(selectedObject as ParkItem).imageUrl}
        effects={(selectedObject as ParkItem).decorEffects ?? []}
        disabled={decorAppearanceSave.isPending}
        onChange={decorEffects => decorAppearanceSave.mutate({ id: selectedPlacement.id, decorEffects })} />}
      {selectedPlacement.kind === "item" && (selectedObject as ParkItem).kind === "decor" && <div
        className="space-y-2 rounded-lg border border-[#b99a4c]/55 bg-[#153523] p-2"
        data-testid="park-decoration-tap-image-editor">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#f5d98e]">Tap Image <span className="font-normal text-amber-100/70">(optional)</span></span>
          {(selectedObject as ParkItem).tapImageUrl && <button type="button"
            aria-label="Remove decoration Tap Image"
            disabled={tapImageSave.isPending || placementDelete.isPending}
            onClick={() => tapImageSave.mutate({ id: selectedPlacement.id, imageData: null })}
            className="rounded-lg border border-[#b99a4c]/55 bg-[#332920] px-2 py-1 text-[11px] disabled:opacity-50">Remove</button>}
        </div>
        {(selectedObject as ParkItem).tapImageUrl && <img
          src={(selectedObject as ParkItem).tapImageUrl!} alt="Current decoration Tap Image"
          className="mx-auto h-20 w-full object-contain" />}
        <label className={`block cursor-pointer rounded-lg border border-dashed border-[#b99a4c]/65 bg-[#245037] px-3 py-2 text-center text-xs ${tapImageSave.isPending ? "opacity-60" : ""}`}>
          {tapImageSave.isPending ? "Saving Tap Image…" : (selectedObject as ParkItem).tapImageUrl ? "Replace Tap Image" : "Upload Tap Image"}
          <input type="file" aria-label="Edit decoration Tap Image" accept="image/png,image/jpeg"
            className="sr-only" disabled={tapImageSave.isPending || placementDelete.isPending}
            onChange={event => { void updateTapImage(selectedPlacement.id, event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <p className="text-[11px] text-amber-100/70">Alternate artwork changes all linked copies. Each copy keeps its own position, size and orientation.</p>
      </div>}
      <p className="text-xs text-amber-100/75">Depth follows ground position automatically. Move lower to bring in front.</p>
      <div className="flex flex-wrap items-center gap-2">
        {selectedPlacement.kind === "item" && (selectedObject as ParkItem).kind === "decor" && <button
          type="button" aria-label="Duplicate park decoration"
          disabled={placementSave.isPending || placementDelete.isPending || duplicateDecor.isPending}
          onClick={() => {
            const item = selectedObject as ParkItem;
            // Offset by a small world-relative amount so the new copy is
            // visible and can immediately be dragged, without camera changes.
            const offset = Math.min(40, Math.max(18, item.size * 0.12));
            duplicateDecor.mutate({
              id: item.id,
              xPct: Math.max(0, Math.min(1, placementDraft.xPct + offset / Math.max(1, sceneWidth))),
              yPct: Math.max(0, Math.min(1, placementDraft.yPct + offset / Math.max(1, sceneHeight))),
            });
          }}
          className="rounded-lg border border-[#b99a4c]/60 bg-[#245037] px-3 py-2 text-xs font-semibold disabled:opacity-50">
          {duplicateDecor.isPending ? "Duplicating…" : "Duplicate"}
        </button>}
        {selectedPlacement.kind === "building" && <>
          <button type="button" className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 text-xs" onClick={() => { setOpenedRoomId(null); setEnteredBuilding(selectedObject as ParkBuilding); }}>Enter building</button>
          <button type="button" className="rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-3 py-2 text-xs" onClick={() => setDetailsBuildingId(selectedPlacement.id)}>Edit building</button>
        </>}
        <button type="button" disabled={placementSave.isPending || placementDelete.isPending}
          onClick={() => { setSelectedPlacement(null); setPlacementDraft(null); setMoveArmed(null); }}
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
    {scene?.canEditPark && detailsBuilding && <PetParkBuildingDetails key={`${detailsBuilding.id}:${focusedRoomEffectId ?? ""}`}
      building={detailsBuilding} initialSelectedEffectId={focusedRoomEffectId} initialShowEffectChoices={openInteriorEffectChoices}
      nightStrength={parkLighting.nightStrength} sunlightStrength={parkLighting.daylightStrength}
       nightInteriorArtworkActive={parkLighting.nightInteriorArtworkActive}
      onPreview={() => { setDetailsBuildingId(null); setFocusedRoomEffectId(null); setOpenInteriorEffectChoices(false); setOpenedRoomId(null); setEnteredBuilding(detailsBuilding); }}
      onClose={() => { setDetailsBuildingId(null); setFocusedRoomEffectId(null); setOpenInteriorEffectChoices(false); }} onUpdated={invalidate} />}

    {isLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">Loading Pet Park…</div> :
      !scene?.canEnterPark && !scene?.canEditPark ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-6 pointer-events-none">
        <div className="rounded-xl border border-amber-500/50 bg-[#152d23] p-6 text-center shadow-xl">
          <h2 className="text-xl font-semibold text-amber-300">Pet Park — Under Construction</h2>
          <p className="mt-3 text-sm">The park is being prepared. Your pets and coins are safe.</p>
        </div>
      </div> : scene?.canEditPark ? (!scene.enabledForPlayers ? <div className="pointer-events-none absolute bottom-4 left-3 right-3 z-10 flex justify-center"><span className="rounded-lg bg-black/70 px-3 py-2 text-xs text-amber-200">Admin preview · Park closed to players</span></div> : null) : scene && !activeBuilding && !paintMode && !showCreator && !selectedPlacement && <div className="absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-3 right-3 z-20 mx-auto flex max-w-sm flex-col" data-testid="pet-park-player-slots">
        <div className="order-2 mx-auto grid w-full max-w-[294px] grid-cols-3 gap-2" aria-label="Your three park pet spots">
          {Array.from({ length: 3 }, (_, index) => {
            const slot = index + 1;
            const pet = deposits.find(d => d.slotNumber === slot);
            const unlocked = slot <= scene.unlockedSlots;
            return <button key={slot} type="button" aria-label={`Pet Park spot ${slot}`}
              aria-pressed={activeSlot === slot}
              data-testid={`pet-park-slot-${slot}`}
              onClick={() => {
                if (Date.now() < suppressSlotClickUntil.current) return;
                setSlotTapEffect(previous => ({ slot, nonce: (previous?.nonce ?? 0) + 1 }));
                setActiveSlot(slot); setSelectedPet(""); setShowPetChoices(false); setPetSearch("");
              }}
              onPointerDown={event => { if (pet) startEquippedPetDrag(event, pet); }}
              onPointerMove={event => moveEquippedPetDrag(event, slot)}
              onPointerUp={endEquippedPetDrag}
              onPointerCancel={cancelEquippedPetDrag}
              onLostPointerCapture={cancelEquippedPetDrag}
              onDoubleClick={() => { if (pet) { setActiveSlot(slot); setSelectedPet(""); setShowPetChoices(true); } }}
              className={`pet-park-slot relative flex min-h-[96px] touch-none flex-col items-center justify-center gap-0 overflow-hidden px-1 py-1 text-center font-fantasy text-[#f7d986] ${activeSlot === slot ? "pet-park-slot--active" : ""}`}>
              {pet ? <div className="pointer-events-none relative z-[2] flex h-[68px] w-full items-center justify-center pt-1">
                <div className="absolute left-1/2 top-0.5 z-[3] w-[88%] -translate-x-1/2">
                  <PetParkSlotProgress timing={pet} rates={scene.rates ?? { coinsPerHour: 0, essencePerHour: 0, petXpPerHour: 0 }} serverNow={scene.serverNow} />
                </div>
                <PetParkPetPortrait petTemplateId={pet.petTemplateId}
                  hatchedImageUrl={pet.hatchedImageUrl} petInventoryId={pet.petInventoryId} size={58} />
              </div> : <span className="pointer-events-none relative z-[2] flex h-[68px] w-full items-center justify-center">
                <img src={emptyParkPetArtwork} alt="" draggable={false}
                  className="pet-park-slot__empty-art h-[56px] w-[60px] object-contain" />
                {unlocked
                  ? <span aria-hidden="true" className="pet-park-slot__add-symbol">+</span>
                  : <span aria-hidden="true" className="absolute right-2 top-0 rounded-full border border-[#bda168]/70 bg-[#091a13]/90 p-1 text-[#e3c576]"><LockKeyhole size={12} /></span>}
              </span>}
              {!pet && !unlocked && <span className="pointer-events-none relative z-[2] -mt-1 flex items-center gap-0.5 text-[10px] text-amber-200/90">
                <img src={coinImage} alt="" className="h-4 w-4 object-contain" />{slot === 2 ? "2,500" : "5,000"}
              </span>}
              <span className="sr-only">{pet ? `${pet.petNickname || pet.petName}, tap to view reward progress` : unlocked ? "Empty spot, tap to equip a pet" : "Locked pet spot"}</span>
              {slotTapEffect?.slot === slot && <span aria-hidden="true" key={slotTapEffect.nonce} className="pet-park-slot__tap-sparkles">
                <i /><i /><i /><i /><i />
              </span>}
            </button>;
          })}
        </div>
        {activeSlot != null && <div role="dialog" aria-label={`Park pet spot ${activeSlot}`}
          className="pet-park-reward-panel order-1 mb-3 max-h-[min(67dvh,590px)] overflow-y-auto overscroll-contain rounded-2xl p-3 text-sm text-amber-100">
          <div className="relative z-[1] mb-3 flex items-center justify-between gap-3 border-b border-[#bd9d55]/30 pb-3">
            <div className="flex items-center gap-2">
              <span className="pet-park-reward-panel__jewel" aria-hidden="true">✦</span>
              <div>
                <p className="font-fantasy text-[9px] uppercase tracking-[.18em] text-[#cfb976]/80">The Pet Park</p>
                <strong className="font-fantasy text-lg leading-tight text-[#f6d783]">Spot {activeSlot} · Rewards</strong>
              </div>
            </div>
            <button type="button" aria-label="Close pet spot" onClick={() => setActiveSlot(null)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#b99a4c]/65 bg-[#071d14]/85 text-[#f3d68a] active:scale-95"><X size={17} /></button>
          </div>
          {(() => {
            const pet = deposits.find(d => d.slotNumber === activeSlot);
            if (pet) return <div className="relative z-[1] space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-[#b99a4c]/35 bg-[#071e15]/50 p-2 shadow-[inset_0_1px_8px_rgba(0,0,0,.35)]">
                <div className="flex h-[78px] w-[78px] shrink-0 items-center justify-center rounded-full border border-[#a88c4d]/45 bg-[radial-gradient(ellipse,#31543b,#112a1c)]">
                  <PetParkPetPortrait petTemplateId={pet.petTemplateId}
                    hatchedImageUrl={pet.hatchedImageUrl} petInventoryId={pet.petInventoryId} size={74} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-fantasy text-sm font-semibold text-[#f6d783]">{pet.petNickname || pet.petName}</p>
                  <p className="font-fantasy text-[10px] text-amber-100/70">Level {pet.petLevel}</p>
                  <p className="mt-1 text-[10px] text-[#a6c7a5]">{pet.buildingId ? "Resting inside" : pet.showInPark && pet.parkXPct != null ? "Exploring the park" : "Equipped · earning rewards"}</p>
                </div>
              </div>
              <PetParkRewardBars timing={pet} rates={scene.rates ?? { coinsPerHour: 0, essencePerHour: 0, petXpPerHour: 0 }} serverNow={scene.serverNow} />
              <button type="button" disabled={action.isPending} data-testid="pet-park-collect-button"
                className="pet-park-collect-button flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
                onClick={() => action.mutate({ path: `/api/pet-park/deposits/${pet.id}/claim` })}>
                <img src={coinImage} alt="" className="h-6 w-6 object-contain" />
                {action.isPending ? "Collecting…" : "Collect rewards"}
              </button>
              <p className="text-center text-[10px] leading-snug text-amber-100/60">Drag this pet into the park to display it. Collecting does not interrupt earning.</p>
              <button type="button" className="rounded-lg border border-amber-500/60 bg-[#245037]/90 px-3 py-2 text-xs text-[#f6d783]" onClick={() => setShowPetChoices(value => !value)}>Change equipped pet</button>
              {showPetChoices && <div className="space-y-2">
                <p className="text-xs text-amber-100/75">Choose a replacement. Swapping automatically collects rewards and returns your current pet.</p>
                <input type="search" aria-label="Search park replacement pets" value={petSearch}
                  onChange={event => setPetSearch(event.target.value)} placeholder="Find pet by name or level"
                  className="w-full rounded-lg border border-[#bda567]/60 bg-[#0b2016] px-3 py-2 text-xs" />
                <div className="max-h-[min(26dvh,220px)] space-y-2 overflow-y-auto">
                  {matchingPets.length === 0 && <p className="text-xs text-amber-100/65">{availablePets.length ? "No pets match your search." : "No other eligible level 10+ pets available."}</p>}
                  {visiblePetChoices.map(candidate => <button type="button" key={candidate.inventoryId} aria-pressed={selectedPet === candidate.inventoryId}
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
                {pet.showInPark && !pet.buildingId && pet.parkXPct != null && <button type="button" disabled={action.isPending}
                  className="rounded-lg bg-[#245037] px-3 py-2 disabled:opacity-50"
                  onClick={() => action.mutate({ method: "PATCH", path: `/api/pet-park/deposits/${pet.id}/display`, body: { display: "idle" } })}>Return to oval</button>}
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
              <input type="search" aria-label="Search pets to equip" value={petSearch}
                onChange={event => setPetSearch(event.target.value)} placeholder="Find pet by name or level"
                className="w-full rounded-lg border border-[#bda567]/60 bg-[#0b2016] px-3 py-2 text-xs" />
              {matchingPets.length > 24 && <p className="text-xs text-amber-100/70">
                Showing 24 of {matchingPets.length} pets. Search to find others.
              </p>}
              <div role="group" aria-label={`Choose pet for spot ${activeSlot}`} className="max-h-[min(38dvh,360px)] space-y-2 overflow-y-auto overscroll-contain rounded-lg border border-amber-600/40 p-2">
                {matchingPets.length === 0 && <p className="p-3 text-xs text-amber-100/70">
                  {availablePets.length ? "No pets match your search." : "No eligible pets. Hatch and level up a pet to level 10 first."}
                </p>}
                {visiblePetChoices.map(p => <button type="button" key={p.inventoryId} aria-pressed={selectedPet === p.inventoryId} onClick={() => setSelectedPet(p.inventoryId)}
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
      {slotDragGhost && !activeBuilding && <div className="pointer-events-none fixed z-[70] rounded-full border border-amber-300 bg-[#1e452e]/95 px-3 py-2 text-xs font-semibold text-amber-100 shadow-xl"
        style={{ left: slotDragGhost.x, top: slotDragGhost.y, transform: "translate(-50%, -110%)" }}>
        {deposits.find(item => item.id === slotDragGhost.petId)?.petNickname ||
          deposits.find(item => item.id === slotDragGhost.petId)?.petName || "Pet"}
      </div>}
  </div>;
}
