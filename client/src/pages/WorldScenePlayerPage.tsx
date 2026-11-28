import WorldSwimFish from "@/components/WorldSwimFish";
import type { WorldSwimScene } from "@shared/worlds/worldSwimAreas";
import { MiniPetArtwork, SceneCharacterMotionStyles, sceneNpcIdleClass } from "@/components/MiniPetRenderer";
import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PetParkTerrainComponent from "@/components/PetParkTerrain";
import { worldWaterStyle } from "@/lib/petParkWaterTexture";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import PetParkGardenMenu, { type GardenOwnedItem } from "@/components/PetParkGardenMenu";
import PetParkCropArtwork from "@/components/PetParkCropArtwork";
import PetParkWaterRefillPopup from "@/components/PetParkWaterRefillPopup";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import { gardenCropProgress, gardenItemNeedsRefill, type GardenPlayerState } from "@shared/garden";
import { HomeInteriorDarknessLayer } from "@/components/HomeInteriorEffect";
import { parkDepthIndex } from "@/lib/petParkDepth";
import { decorDrawDepth } from "@shared/decorSurface";
import { worldInteriorLights } from "@/lib/worldInteriorLighting";
import type { ParkEffectType } from "@shared/petParkEffects";
import { chooseNpcMessage, getNpcQuestAssociations, parseNpcMetadata } from "@/lib/npcMetadata";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";
import WorldDecorEffects from "@/components/world-editor/WorldDecorEffects";
import { HomeOutdoorAtmosphereLayer as OutdoorAtmosphere, useHomeOutdoorLighting } from "@/components/HomeOutdoorAtmosphere";
import { parkOutdoorLightEffects, parkOutdoorFireflyFields } from "@shared/petParkAtmosphere";
import { parkOutdoorEffectOpacity, parkSceneDarkness } from "@/lib/parkSceneLighting";
import { worldGroundPalette, worldGroundRenderTheme } from "@/lib/worldGroundPalette";
import { isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio } from "@shared/petParkTerrainDetails";
import {
  worldEditorCameraGeometry, worldEditorClampCamera, worldEditorMinZoom, worldEditorZoomAnchorPan,
} from "@/lib/worldEditorCamera";
import { clampPlayerWorldZoom, PLAYER_WORLD_ZOOM_STEP } from "@shared/worlds/worldScenePublication";
import { worldSceneRotationCss, worldSceneRotatedSquareExtent } from "@shared/worlds/worldSceneContent";
import type { WorldSceneAsset, WorldSceneInteriorItem, WorldScenePlacement } from "@shared/worlds/worldSceneContent";
import { resolveWorldSceneAction, resolveWorldSceneInteriorAction, type WorldSceneFishingAction } from "@shared/worlds/worldSceneActions";
import WorldSceneArtwork from "@/components/world/WorldSceneArtwork";
import { playerWorldSceneQuery, playerWorldArtworkVisibility, playerWorldCullOrigin, PLAYER_WORLD_CULL_CELL, PLAYER_WORLD_INITIAL_ZOOM, playerWorldRoomCamera, type PlayerScene } from "@/lib/playerWorldScene";
import BeauPrizeWheelDialog from "@/components/world/BeauPrizeWheelDialog";
import { useWorldSceneBeauWheel } from "@/components/world/useWorldSceneBeauWheel";

import FloatingWalkJoystick, { FLOATING_WALK_JOYSTICK_SIZE, FLOATING_WALK_JOYSTICK_EDGE_GAP } from "@/components/FloatingWalkJoystick";
import PlayerCharacterRenderer from "@/components/PlayerCharacterRenderer";
import { fetchPlayerAvatar, playerAvatarQueryKey, wardrobeLayers, type PlayerAvatarState } from "@/lib/playerAvatarWardrobe";
import { usePetWalkController } from "@/hooks/usePetWalkController";
import { parkSquareArtworkSampler } from "@/lib/petParkImageHit";
import { WORLD_AVATAR_SIZE, WORLD_WALK_SPAWN, worldWalkBounds, worldWalkCameraPan, worldWalkCollision, worldWalkSpawn, worldWalkStep } from "@/lib/worldSceneWalk";

const WorldSceneSoulExchange = lazy(() => import("@/components/world/WorldSceneSoulExchange"));
const WorldSceneFishingDialog = lazy(() => import("@/components/world/WorldSceneFishingDialog"));

type Point = { x: number; y: number };
const WalkingCharacter = memo(PlayerCharacterRenderer);
const PetParkTerrain = memo(PetParkTerrainComponent);
const HomeOutdoorAtmosphereLayer = memo(OutdoorAtmosphere);

/** Player runtime, separate from admin editing. Garden actions use private player state.
 * All coordinates and terrain painting use the SAME ground/camera system as
 * World Editor. Legacy game locations retain their original stable IDs.
 */
export default function WorldScenePlayerPage({
  worldId, userId, onContentReady,
}: { worldId: string; userId?: string; onContentReady?: () => void }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const viewportRef = useRef<HTMLDivElement>(null);
  const notified = useRef(false);
  // Start unmeasured instead of flashing a legacy phone-sized scene on
  // tablets; actual viewport dimensions come from this page's ResizeObserver.
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(PLAYER_WORLD_INITIAL_ZOOM);
  const [pan, setPan] = useState<Point | null>(null);
  const points = useRef(new Map<number, Point>());
  const drag = useRef<{ id: number; x: number; y: number; pan: Point; walk?: boolean } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number; center: Point; pan: Point; scale: number } | null>(null);
  const cameraFrame = useRef<number | null>(null);
  const pendingCamera = useRef<{ pan: Point; zoom: number } | null>(null);
  const latestCamera = useRef<{ pan: Point; zoom: number }>({ pan: {x: 0, y: 0}, zoom: PLAYER_WORLD_INITIAL_ZOOM });
  const gestureRect = useRef<DOMRect | null>(null);
  const moved = useRef(false);
  const touchTapPending = useRef(false);
  const walkingPointer = useRef<number | null>(null);
  const [joystickCenter, setJoystickCenter] = useState<Point>({ x: 0, y: 0 });
  const [selectedNpc, setSelectedNpc] = useState<{ name: string; message: string } | null>(null);
  const artworkMasks = useRef(new Map<string, (x: number, y: number) => boolean>());
  const [inside, setInside] = useState<string | null>(null);
  const [selectedGardenPlotId, setSelectedGardenPlotId] = useState<string | null>(null);
  const [wateringGardenPlotId, setWateringGardenPlotId] = useState<string | null>(null);
  const [selectedWaterSourceId, setSelectedWaterSourceId] = useState<string | null>(null);
  const [fishingAction, setFishingAction] = useState<WorldSceneFishingAction | null>(null);

  const scene = useQuery<PlayerScene>({
    ...playerWorldSceneQuery(worldId),
    // Refresh saved admin changes while the player stays in the scene.
    refetchOnMount: true,
    refetchOnWindowFocus: true, refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    setZoom(PLAYER_WORLD_INITIAL_ZOOM); setPan(null); setInside(null);
    setSelectedGardenPlotId(null); setWateringGardenPlotId(null); setSelectedWaterSourceId(null);
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = null; pendingCamera.current = null; gestureRect.current = null;
    points.current.clear(); drag.current = null; pinch.current = null; walkingPointer.current = null; notified.current = false;
  }, [worldId]);
  useEffect(() => () => {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
  }, []);
  useEffect(() => {
    const target = viewportRef.current;
    if (!target) return;
    const resize = () => {
      const rect = target.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      setViewport(old => old.width === rect.width && old.height === rect.height
        ? old : { width: rect.width, height: rect.height });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Existing Janson quest actions use these events. Route into the original
  // implementation with an explicit intent rather than losing a market click
  // or duplicating fishing/economy code.
  useEffect(() => {
    if (worldId !== "swamp") return;
    const go = (intent: string) => navigate(`/world/${worldId}?legacyView=1&returnWorld=${worldId}&${intent}=1`);
    const market = () => go("openFishMarket");
    const fish = () => go("fishHint");
    window.addEventListener("para:open-fish-market", market);
    window.addEventListener("para:show-fishing-spots", fish);
    return () => {
      window.removeEventListener("para:open-fish-market", market);
      window.removeEventListener("para:show-fishing-spots", fish);
    };
  }, [worldId, navigate]);

  const viewportReady = viewport.width > 1 && viewport.height > 1;
  const readyCallback = useRef(onContentReady);
  readyCallback.current = onContentReady;
  useEffect(() => {
    if (notified.current || (!scene.isError && (!scene.data || !viewportReady))) return;
    // Let the measured terrain and the initial visible artwork mount before
    // removing the overlay. Don't wait for distant images or a fixed timer.
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        notified.current = true;
        readyCallback.current?.();
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); };
  }, [worldId, scene.data, scene.isError, viewportReady]);
  const groundLevel = scene.data?.groundLevel ?? 1;
  const groundTheme = scene.data?.groundTheme ?? "grass";
  const minimum = worldEditorMinZoom(viewport.width, viewport.height, groundLevel);
  const safeZoom = clampPlayerWorldZoom(zoom, minimum);
  const camera = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, safeZoom);
  const initial = { x: -camera.limitX / 2, y: -camera.limitY / 2 };
  const actualPan = worldEditorClampCamera(pan ?? initial, camera, viewport);
  latestCamera.current = pendingCamera.current ?? { pan: actualPan, zoom: safeZoom };
  const avatarQuery = useQuery<PlayerAvatarState>({
    queryKey: playerAvatarQueryKey(userId ?? ""),
    queryFn: ({ signal }) => fetchPlayerAvatar(signal),
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const avatar = userId && avatarQuery.data?.created && avatarQuery.data.base?.parts.length === 8
    ? avatarQuery.data : null;
  const equippedLayers = useMemo(() => avatar ? wardrobeLayers(avatar) : [], [avatar]);
  const lighting = useHomeOutdoorLighting("auto");
  const sceneContent = scene.data;
  const placements = useMemo(() => sceneContent?.placements ?? [], [sceneContent?.placements]);
  const renderPlacements = useMemo(() => placements.filter(p =>
    p.kind !== "terrain" || !isParkConnectedPath(p.effectType)), [placements]);
  const assetsById = useMemo(() => new Map((sceneContent?.assets ?? []).map(a => [a.id, a])),
    [sceneContent?.assets]);
  const sceneActions = useMemo(() => new Map(placements.flatMap(p => {
    const asset = assetsById.get(p.assetId ?? "");
    const action = p.worldId === worldId
      ? resolveWorldSceneAction(worldId, p.kind, asset?.imageUrl ? asset : null, p.effectType) : null;
    return action ? [[p.id, action] as const] : [];
  })), [worldId, placements, assetsById]);
  const hasHauntedSpin = [...sceneActions.values()].includes("beau-prize-wheel");
  const beauWheel = useWorldSceneBeauWheel(hasHauntedSpin);
  const miniPetsById = useMemo(() => new Map((sceneContent?.miniPets ?? []).map(pet => [pet.shopItemId, pet])), [sceneContent?.miniPets]);
  const npcsById = useMemo(() => new Map((sceneContent?.npcs ?? []).map(n => [n.id, n])),
    [sceneContent?.npcs]);
  const linkedById = useMemo(() => new Map((sceneContent?.linkedPages ?? []).map(p => [p.id, p])),
    [sceneContent?.linkedPages]);
  const legacyMounts = useMemo(() => {
    const result = new Map<string, string>();
    for (const placement of placements) {
      const legacyId = placement.kind === "npc"
        ? npcsById.get(placement.npcId ?? "")?.legacyLocationId : placement.legacyLocationId;
      if (legacyId && linkedById.get(legacyId)?.worldId === worldId && !result.has(legacyId))
        result.set(legacyId, placement.id);
    }
    return result;
  }, [placements, npcsById, linkedById, worldId]);
  const activeBuilding = placements.find(item => item.id === inside && item.kind === "building") ?? null;
  const activeAsset = activeBuilding?.assetId ? assetsById.get(activeBuilding.assetId) : null;
  const linkedPage = activeBuilding?.legacyLocationId ? linkedById.get(activeBuilding.legacyLocationId) : null;
  // Preserve authored room art and its day/night pair; linked art is a fallback.
  const interiorUrl = activeAsset?.interiorImageUrl ?? linkedPage?.bgUrl ?? null;

  const terrain = useMemo(() => ({
    dirt: placements.filter(p => p.kind === "terrain" && p.effectType === "dirt_path"),
    stone: placements.filter(p => p.kind === "terrain" && p.effectType === "stone_path"),
    water: placements.filter(p => p.kind === "terrain" && p.effectType === "water_path"),
  }), [placements]);
  const worldSize = useMemo(() => ({ width: camera.worldWidth, height: camera.worldHeight }),
    [camera.worldWidth, camera.worldHeight]);
  const bounds = useMemo(() => worldWalkBounds(worldSize), [worldSize]);
  const blocked = useMemo(() => worldWalkCollision(placements, worldSize, p => {
    const url = assetsById.get(p.assetId ?? "")?.imageUrl;
    return url ? artworkMasks.current.get(url) : undefined;
  }), [placements, worldSize, assetsById]);
  const walkEnabled = !!(avatar && sceneContent && viewportReady && !activeBuilding &&
    !selectedGardenPlotId && !selectedWaterSourceId && !selectedNpc && !fishingAction &&
    !beauWheel.state && !beauWheel.isOpening);
  const walk = usePetWalkController({
    bounds, spawn: WORLD_WALK_SPAWN, speed: 1, enabled: walkEnabled, keyboardEnabled: false,
    resolveStep: (from, attempted) => worldWalkStep(from, attempted, worldSize, blocked),
    onPositionChange: position => {
      const current = latestCamera.current;
      const geometry = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, current.zoom);
      const next = worldWalkCameraPan(position, current.pan, geometry, viewport);
      if (next.x === current.pan.x && next.y === current.pan.y) return;
      // Same animation tick as the character: don't queue a second camera RAF.
      latestCamera.current = { pan: next, zoom: current.zoom };
      setPan(next);
    },
  });
  const resetWalk = useRef(walk.resetPosition);
  resetWalk.current = walk.resetPosition;
  // Spawn once per account/world/ground size, not after live scene refetches.
  const spawnReady = !!(avatar && sceneContent && viewportReady);
  useEffect(() => {
    if (!spawnReady) return;
    const spawn = worldWalkSpawn(worldSize, blocked);
    resetWalk.current(spawn);
    const current = latestCamera.current;
    const geometry = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, current.zoom);
    setPan(worldWalkCameraPan(spawn, current.pan, geometry, viewport));
    // The collision callback reads the latest loaded masks, but a live edit
    // must not teleport a player who is already in the world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, userId, worldSize, spawnReady]);
  useEffect(() => {
    if (!walkEnabled && walkingPointer.current !== null) {
      walkingPointer.current = null;
      points.current.clear(); drag.current = null; pinch.current = null; gestureRect.current = null;
    }
  }, [walkEnabled]);
  useEffect(() => {
    const clear = () => {
      walkingPointer.current = null; points.current.clear();
      drag.current = null; pinch.current = null; gestureRect.current = null;
      moved.current = true;
    };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  // Keep the exact same Pet Park tools and private crop state, scoped by world.
  const gardenPrefix = `/api/worlds/${encodeURIComponent(worldId)}/garden`;
  const gardenKey = [gardenPrefix];
  const plotPlacements = useMemo(() => new Map(placements.filter(p =>
    p.kind === "terrain" && p.effectType === "garden_plot").map(p => [p.id, p])), [placements]);
  const hasGardenPlots = plotPlacements.size > 0;
  const garden = useQuery<GardenPlayerState>({
    queryKey: gardenKey, enabled: hasGardenPlots && !activeBuilding, staleTime: 5000,
    refetchOnMount: true, refetchOnWindowFocus: true,
    refetchInterval: selectedGardenPlotId ? 5000 : 30_000,
    refetchIntervalInBackground: false,
  });
  const inventory = useQuery<Array<GardenOwnedItem & { isRefillable?: boolean | null }>>({
    queryKey: ["/api/inventory"], enabled: !!(selectedGardenPlotId || selectedWaterSourceId),
  });
  const savedPlots = useMemo(() => new Map((garden.data?.plots ?? []).map(plot => [plot.plotItemId, plot])), [garden.data?.plots]);
  const gardenCrops = useMemo(() => new Map((garden.data?.crops ?? []).map(crop => [crop.id, crop])), [garden.data?.crops]);
  const chosenPlot = selectedGardenPlotId && plotPlacements.has(selectedGardenPlotId)
    ? savedPlots.get(selectedGardenPlotId) : undefined;
  // Position the shared garden arc in viewport pixels, not scene coordinates.
  const gardenAnchor = chosenPlot ? (() => {
    const placement = plotPlacements.get(chosenPlot.plotItemId)!;
    const plotX = actualPan.x + placement.xPct * camera.sceneWidth;
    const plotY = actualPan.y + placement.yPct * camera.sceneHeight;
    const side: "right" | "left" = plotX + 158 <= viewport.width ? "right" : "left";
    return { plotX, plotY, side,
      x: Math.max(6, Math.min(Math.max(6, viewport.width - 131), side === "right" ? plotX + 42 : plotX - 167)),
      y: Math.max(48, Math.min(Math.max(48, viewport.height - 224), plotY - 97)) };
  })() : null;
  const inventoryItems = inventory.data ?? [];
  const pails = inventoryItems.filter(item => item.type === "garden_tool" && item.specialType === "watering_pail");
  const invalidateGarden = () => {
    void queryClient.invalidateQueries({ queryKey: gardenKey });
    void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
  };
  const atmospherePlacements = useMemo(() => renderPlacements.filter(p =>
    p.kind === "effect" || p.decorEffects.length > 0), [renderPlacements]);
  const cullX = playerWorldCullOrigin(actualPan.x);
  const cullY = playerWorldCullOrigin(actualPan.y);
  const sceneWindow = useMemo(() => ({
    x: -cullX - PLAYER_WORLD_CULL_CELL, y: -cullY - PLAYER_WORLD_CULL_CELL,
    width: viewport.width + 2 * PLAYER_WORLD_CULL_CELL,
    height: viewport.height + 2 * PLAYER_WORLD_CULL_CELL,
  }), [cullX, cullY, viewport.width, viewport.height]);
  const atmosphereShape = useMemo(() => ({
    width: camera.sceneWidth, height: camera.sceneHeight, scale: camera.scale,
  }), [camera.sceneWidth, camera.sceneHeight, camera.scale]);
  // Lamps must cover the overscanned mask, so their list is stable within a
  // camera cell. Fireflies retain the existing cap, sampled at the cell center.
  const lights = useMemo(() => parkOutdoorLightEffects(atmospherePlacements, atmosphereShape,
    { x: -sceneWindow.x, y: -sceneWindow.y }, sceneWindow),
    [atmospherePlacements, atmosphereShape, sceneWindow]);
  const fireflies = useMemo(() => parkOutdoorFireflyFields(atmospherePlacements, atmosphereShape,
    { x: cullX + PLAYER_WORLD_CULL_CELL / 2, y: cullY + PLAYER_WORLD_CULL_CELL / 2 }, viewport),
    [atmospherePlacements, atmosphereShape, cullX, cullY, viewport]);

  function queueCamera(nextPan: Point, nextZoom: number) {
    const previous = latestCamera.current;
    if (previous.zoom === nextZoom && previous.pan.x === nextPan.x && previous.pan.y === nextPan.y) return;
    const next = { pan: nextPan, zoom: nextZoom };
    latestCamera.current = next;
    pendingCamera.current = next;
    if (cameraFrame.current !== null) return;
    cameraFrame.current = requestAnimationFrame(() => {
      cameraFrame.current = null;
      const value = pendingCamera.current;
      pendingCamera.current = null;
      if (!value) return;
      setPan(value.pan);
      setZoom(value.zoom);
    });
  }
  function changeZoom(next: number, anchor: Point) {
    const current = latestCamera.current;
    const oldCamera = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, current.zoom);
    const newZoom = clampPlayerWorldZoom(next, minimum);
    const nextCamera = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, newZoom);
    queueCamera(worldEditorZoomAnchorPan(current.pan, oldCamera.scale, nextCamera.scale, anchor, nextCamera, viewport), newZoom);
  }
  const local = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = gestureRect.current ?? event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function onDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.pointerType === "mouse" && event.button !== 0) || points.current.size >= 2) return;
    if (!points.current.size) {
      moved.current = false;
      gestureRect.current = event.currentTarget.getBoundingClientRect();
    }
    points.current.set(event.pointerId, local(event));
    const active = [...points.current.values()];
    const current = latestCamera.current;
    if (active.length === 1) {
      drag.current = { id: event.pointerId, x: active[0].x, y: active[0].y, pan: current.pan, walk: !!avatar && event.pointerType !== "mouse" };
      pinch.current = null;
    } else if (active.length === 2) {
      walk.stopMovement(); walkingPointer.current = null;
      drag.current = null;
      pinch.current = {
        distance: Math.max(1, Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y)),
        zoom: current.zoom, pan: current.pan,
        scale: worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, current.zoom).scale,
        center: { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 },
      };
      moved.current = true;
    }
  }
  function captureGesture(target: HTMLDivElement) {
    for (const id of points.current.keys()) {
      try { if (!target.hasPointerCapture(id)) target.setPointerCapture(id); } catch {}
    }
  }
  function onMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!points.current.has(event.pointerId)) return;
    points.current.set(event.pointerId, local(event));
    const active = [...points.current.values()];
    if (active.length === 2 && pinch.current) {
      const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
      const center = { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 };
      const newZoom = clampPlayerWorldZoom(pinch.current.zoom * distance / pinch.current.distance, minimum);
      const nextCamera = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, newZoom);
      const ratio = nextCamera.scale / pinch.current.scale;
      moved.current = true;
      captureGesture(event.currentTarget);
      queueCamera(worldEditorClampCamera({
        x: center.x - (pinch.current.center.x - pinch.current.pan.x) * ratio,
        y: center.y - (pinch.current.center.y - pinch.current.pan.y) * ratio,
      }, nextCamera, viewport), newZoom);
      event.preventDefault();
    } else if (active.length === 1 && drag.current?.id === event.pointerId) {
      const dx = active[0].x - drag.current.x, dy = active[0].y - drag.current.y;
      if (drag.current.walk) {
        if (!walkEnabled) { moved.current = true; return; }
        if (walkingPointer.current !== event.pointerId) {
          if (Math.hypot(dx, dy) < 6) return; // a tap still activates artwork
          const rect = gestureRect.current ?? event.currentTarget.getBoundingClientRect();
          const inset = FLOATING_WALK_JOYSTICK_SIZE / 2 + FLOATING_WALK_JOYSTICK_EDGE_GAP;
          setJoystickCenter({
            x: Math.max(inset, Math.min(Math.max(inset, viewport.width - inset), drag.current.x)),
            y: Math.max(inset, Math.min(Math.max(inset, viewport.height - inset), drag.current.y)),
          });
          walk.onJoystickPointerDown(event, { x: rect.left + drag.current.x, y: rect.top + drag.current.y });
          walkingPointer.current = event.pointerId;
        }
        moved.current = true;
        walk.onJoystickPointerMove(event);
        event.preventDefault();
        return;
      }
      if (Math.hypot(dx, dy) < 6 && !moved.current) return;
      moved.current = true;
      captureGesture(event.currentTarget);
      const current = latestCamera.current;
      const geometry = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, current.zoom);
      const next = worldEditorClampCamera({
        x: drag.current.pan.x + dx, y: drag.current.pan.y + dy,
      }, geometry, viewport);
      // Rebase on the clamped position: reversing direction at a world edge
      // must move immediately instead of retracing discarded overscroll.
      drag.current = { id: event.pointerId, x: active[0].x, y: active[0].y, pan: next };
      queueCamera(next, current.zoom);
      event.preventDefault();
    }
  }
  function onEnd(event: ReactPointerEvent<HTMLDivElement>) {
    // Touch pointers initially belong to the object being touched. Transferring
    // capture to the viewport emits a bubbling lostpointercapture FROM that
    // object, not a cancelled gesture. Only the viewport's own loss ends it.
    if (event.type === "lostpointercapture" && event.target !== event.currentTarget) return;
    if (!points.current.delete(event.pointerId)) return;
    const tap = !moved.current && event.type === "pointerup" &&
      event.pointerType !== "mouse" && points.current.size === 0;
    if (walkingPointer.current === event.pointerId) {
      walk.onJoystickPointerUp(event); walkingPointer.current = null;
    }
    if (event.type !== "pointerup") moved.current = true;
    pinch.current = null;
    drag.current = null;
    if (points.current.size === 1 && !avatar) {
      const [id, position] = [...points.current][0];
      drag.current = { id, x: position.x, y: position.y, pan: latestCamera.current.pan };
    } else gestureRect.current = null;
    // After a swipe, mobile browser compatibility clicks may be suppressed.
    // Resolve a real touch tap at pointerup, but never turn a drag/pinch into
    // a page launch or dispatch a second action from the synthesized click.
    if (tap && event.target instanceof Element && event.currentTarget.contains(event.target)) {
      const button = event.target.closest<HTMLButtonElement>("button[data-player-world-placement]");
      if (button && !button.disabled) {
        const placement = placements.find(p => p.id === button.dataset.playerWorldPlacement);
        if (placement) {
          touchTapPending.current = true;
          event.preventDefault();
          activate(placement);
        }
      } else if (!event.target.closest("button, a, input, select, textarea, [data-interactive]")) {
        touchTapPending.current = true;
        event.preventDefault();
        hitWaterAt(event.clientX, event.clientY, event.currentTarget);
      }
    }
  }
  function onTerrainClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (moved.current) { moved.current = false; return; }
    hitWaterAt(event.clientX, event.clientY, event.currentTarget);
  }
  function hitWaterAt(clientX: number, clientY: number, target: HTMLDivElement) {
    const rect = target.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    // Connected water is painted into one canvas. Hit-test its saved diamond
    // tiles on taps rather than mounting hundreds of extra DOM buttons.
    const tile = terrain.water.find(p => {
      const size = p.size * camera.scale;
      return Math.abs(px - actualPan.x - p.xPct * camera.sceneWidth) / (size / 2) +
        Math.abs(py - actualPan.y - p.yPct * camera.sceneHeight) / (size / 4) <= 1;
    });
    if (tile) { setSelectedGardenPlotId(null); setSelectedWaterSourceId(tile.id); }
  }
  function activate(item: WorldScenePlacement) {
    if (moved.current) { moved.current = false; return; }
    if (item.kind === "terrain" && item.effectType === "garden_plot") {
      setSelectedWaterSourceId(null);
      setSelectedGardenPlotId(item.id);
      return;
    }
    if (item.kind === "decor" && item.isWaterSource) {
      setSelectedGardenPlotId(null);
      setSelectedWaterSourceId(item.id);
      return;
    }
    setSelectedGardenPlotId(null);
    const action = sceneActions.get(item.id);
    if (action === "beau-prize-wheel") {
      void beauWheel.open();
      return;
    }
    if (action === "fishing-leaderboard" || action === "fishing-spot") {
      setFishingAction(action);
      return;
    }
    if (item.kind === "building") setInside(item.id);
    if (item.kind === "npc") {
      const npc = item.npcId ? npcsById.get(item.npcId) : null;
      if (!npc) return;
      // Linked NPCs expose their original location mount for the existing
      // quest/dialogue overlays. If a quest overlay isn't ready yet, keep the
      // original interaction reachable without guessing a quest state.
      if (npc.legacyLocationId && getNpcQuestAssociations(npc.name, worldId).length) {
        navigate(`/world/${encodeURIComponent(worldId)}?questNpc=${encodeURIComponent(npc.legacyLocationId)}&returnWorld=${encodeURIComponent(worldId)}`);
        return;
      }
      const message = chooseNpcMessage(parseNpcMetadata(npc.specialSkill).messages,
        selectedNpc?.name === npc.name ? selectedNpc.message : null);
      if (message) setSelectedNpc({ name: npc.name, message });
    }
  }
  useEffect(() => setSelectedNpc(null), [worldId]);

  // The actual camera moves the single artwork layer every frame. Rebuild
  // its immutable children only when the overscanned camera cell, zoom,
  // authored data, or live interaction/effect state changes.
  const activateLatest = useRef(activate);
  activateLatest.current = activate;
  const placementArtwork = useMemo(() => {
    const cullViewport = { width: viewport.width + 2 * PLAYER_WORLD_CULL_CELL,
      height: viewport.height + 2 * PLAYER_WORLD_CULL_CELL };
    return renderPlacements.map(p => {
      const x = cullX + p.xPct * camera.sceneWidth + PLAYER_WORLD_CULL_CELL;
      const y = cullY + p.yPct * camera.sceneHeight + PLAYER_WORLD_CULL_CELL;
      const size = p.size * camera.scale;
      const height = p.kind === "terrain" ? size * parkTerrainHeightRatio(p.effectType) : size;
      const rotatedExtent = worldSceneRotatedSquareExtent(size, p.rotation);
      const { visible, nearby } = playerWorldArtworkVisibility(x, y, rotatedExtent, p.rotation ? rotatedExtent : height, cullViewport);
      // Attached glows and effects can extend beyond the artwork square.
      // Keep the original wider effect boundary so they don't pop out at
      // the edges of the viewport, while deferring distant raster art.
      const effectsNearby = (p.kind === "effect" || p.decorEffects.length > 0) &&
        x >= -size && x <= cullViewport.width + size && y >= -size && y <= cullViewport.height + size;
      if (!nearby && !effectsNearby && p.kind !== "npc" && !p.legacyLocationId) return null;
      const asset = p.assetId ? assetsById.get(p.assetId) : null;
      const npc = p.npcId ? npcsById.get(p.npcId) : null;
      const miniPet = p.kind === "mini_pet" && p.miniPetId ? miniPetsById.get(p.miniPetId) : undefined;
      const art = asset?.imageUrl ?? npc?.imageUrl ?? null;
      const action = sceneActions.get(p.id);
      const isGardenPlot = p.kind === "terrain" && p.effectType === "garden_plot";
      const savedPlot = isGardenPlot ? savedPlots.get(p.id) : undefined;
      const isWaterSource = p.kind === "decor" && p.isWaterSource;
      const isInteractive = p.kind === "building" || p.kind === "npc" || !!action || isGardenPlot || isWaterSource;
      const legacyId = p.kind === "npc" ? npc?.legacyLocationId : p.legacyLocationId;
      // Portal mounts are the stable original location IDs used by Ginny,
      // Lonelle, Janson and their guide arrows. Keep only one mount per ID.
      const localLegacyId = legacyId && legacyMounts.get(legacyId) === p.id ? legacyId : null;
      return <div key={p.id}
        data-testid={localLegacyId ? `location-${localLegacyId}` : undefined}
        data-new-world-npc={localLegacyId && p.kind === "npc" ? "true" : undefined}
        data-world-scene-action={action}
        className="absolute pointer-events-none"
        style={{
          left: p.xPct * camera.sceneWidth, top: p.yPct * camera.sceneHeight, width: size, height,
          transform: `translate(-50%,-50%)${worldSceneRotationCss(p.rotation)}`,
          zIndex: p.kind === "effect" ? 12_000_000 : p.kind === "terrain" ? 1 : decorDrawDepth(p, parkDepthIndex({
            kind: p.kind === "building" ? "building" : "item", yPct: p.yPct,
            worldHeight: camera.worldHeight, size: p.size, contact: .9,
          }), 2),
          pointerEvents: isInteractive ? "auto" : "none",
        }}>
        <button type="button"
          data-testid={`player-new-world-object-${p.id}`}
          data-player-world-placement={p.id}
          disabled={!isInteractive}
          onClick={event => { event.stopPropagation(); activateLatest.current(p); }}
          aria-label={isGardenPlot ? "Open Garden Plot" : isWaterSource ? "Water Source" : action === "fishing-spot" ? "Open Haunted Woods fishing spot" : asset?.name ?? npc?.name ?? miniPet?.name ?? p.kind}
          className="absolute inset-0 h-full w-full border-0 bg-transparent p-0"
          style={{ pointerEvents: isInteractive ? "auto" : "none", touchAction: "none",
            clipPath: isGardenPlot ? "polygon(50% 0%,100% 50%,50% 100%,0% 50%)" : undefined }}>
        <span className="pointer-events-none absolute inset-0" style={{
          transform: p.flipped ? "scaleX(-1)" : undefined,
        }}>
          {nearby && miniPet && <MiniPetArtwork pet={miniPet} scene placementId={p.id} idleAnimation={p.idleAnimation} animated={visible} />}
          {nearby && art && <WorldSceneArtwork imageUrl={art} cssSize={size} alt=""
            loading="eager" fetchPriority={visible ? "auto" : "low"}
            data-world-collision-art={p.kind === "building" || p.kind === "decor" ? p.assetId ?? undefined : undefined}
            onLoad={event => {
              if (!avatar || (p.kind !== "building" && p.kind !== "decor") || artworkMasks.current.has(art)) return;
              // Keep masks only; never retain decoded images or read canvas in a frame.
              if (artworkMasks.current.size >= 300) artworkMasks.current.delete(artworkMasks.current.keys().next().value!);
              artworkMasks.current.set(art, parkSquareArtworkSampler(event.currentTarget));
            }}
            className={`absolute inset-0 w-full h-full object-contain ${npc ? sceneNpcIdleClass(p.idleAnimation, visible) : ""}`} draggable={false} />}
          {effectsNearby && (p.kind === "decor" || p.kind === "building") && <WorldDecorEffects effects={p.decorEffects}
            sunlightStrength={lighting.daylightStrength}
            nightStrength={lighting.nightStrength} fireflyStrength={lighting.fireflyStrength}
            lampStrength={lighting.lampStrength} reducedMotion={false} />}
          {effectsNearby && p.kind === "effect" && p.effectType && <span className="absolute inset-0" style={{
            opacity: parkOutdoorEffectOpacity(p.effectType, lighting.nightStrength, lighting.fireflyStrength, lighting.lampStrength),
          }}><ParkEffectVisual type={p.effectType as ParkEffectType} color={p.effectColor ?? undefined}
            reducedMotion={false} fireflyStrength={lighting.fireflyStrength} sceneFireflies /></span>}
          {nearby && p.kind === "terrain" && isParkTerrainDetail(p.effectType) &&
            <PetParkTerrainDetail type={p.effectType} tilled={isGardenPlot && !!savedPlot && savedPlot.phase !== "empty" && savedPlot.phase !== "picked"} />}
        </span>
      </button>
      {nearby && action === "beau-prize-wheel" && beauWheel.freeSpinAvailable && <span
        className="beau-free-spin-indicator" data-testid="haunted-spin-free-indicator"
        aria-label="Beau has a free spin available"><span aria-hidden="true">!</span></span>}
      </div>;
    });
  }, [renderPlacements, assetsById, npcsById, miniPetsById, sceneActions, legacyMounts, savedPlots,
    cullX, cullY, viewport.width, viewport.height, camera.sceneWidth, camera.sceneHeight,
    camera.worldHeight, camera.scale, !!avatar, lighting.daylightStrength, lighting.nightStrength,
    lighting.fireflyStrength, lighting.lampStrength, beauWheel.freeSpinAvailable]);

  useEffect(() => {
    if (!avatar || !viewportRef.current) return;
    // Images may have loaded before the account's wardrobe query returned.
    for (const image of viewportRef.current.querySelectorAll<HTMLImageElement>("img[data-world-collision-art]")) {
      const url = assetsById.get(image.dataset.worldCollisionArt ?? "")?.imageUrl;
      if (url && image.complete && image.naturalWidth && !artworkMasks.current.has(url)) {
        if (artworkMasks.current.size >= 300) artworkMasks.current.delete(artworkMasks.current.keys().next().value!);
        artworkMasks.current.set(url, parkSquareArtworkSampler(image));
      }
    }
  }, [avatar, assetsById]);

  const cropArtwork = useMemo(() => (garden.data?.plots ?? []).map(plot => {
    if (!["planted", "seedling", "partial", "grown", "picked"].includes(plot.phase)) return null;
    const crop = gardenCrops.get(plot.cropId ?? "");
    const phase = plot.phase as "planted" | "seedling" | "partial" | "grown" | "picked";
    const image = crop?.images[phase];
    const placement = plotPlacements.get(plot.plotItemId);
    if (!image || !placement) return null;
    const size = placement.size * camera.scale;
    if (!playerWorldArtworkVisibility(cullX + PLAYER_WORLD_CULL_CELL + placement.xPct * camera.sceneWidth,
      cullY + PLAYER_WORLD_CULL_CELL + placement.yPct * camera.sceneHeight, size * 2, size * 2, sceneWindow).nearby) return null;
    return <PetParkCropArtwork key={plot.plotItemId + ":" + plot.phase}
      image={image} xPct={placement.xPct} yPct={placement.yPct} size={placement.size} scale={camera.scale}
      zIndex={parkDepthIndex({ yPct: placement.yPct, worldHeight: camera.worldHeight, size: placement.size, kind: "item" })}
      placement={crop?.stagePlacements?.[phase]} progress={gardenCropProgress(plot, crop)}
      showWaterProgress={wateringGardenPlotId === plot.plotItemId} />;
  }), [garden.data?.plots, gardenCrops, plotPlacements, cullX, cullY, sceneWindow, camera.sceneWidth, camera.sceneHeight, camera.scale, camera.worldHeight, wateringGardenPlotId]);

  if (scene.isError && !scene.data) return <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#101b17] text-[#f5d78f] px-6 text-center"
    data-testid="player-new-world-error" role="alert">
    <p>{scene.error instanceof Error ? scene.error.message : "Could not load this world."}</p>
    <button onClick={() => navigate("/map")} className="border border-amber-600 rounded-lg px-4 py-2">Back to Map</button>
  </div>;

  return <div data-testid="player-new-world" data-world-water-style={worldWaterStyle(worldId)} data-has-haunted-spin={hasHauntedSpin ? "true" : undefined} className="relative w-full h-full overflow-hidden bg-[#08140d]"
    onPointerDownCapture={() => { touchTapPending.current = false; }}
    onKeyDownCapture={() => { touchTapPending.current = false; }}
    onMouseDownCapture={event => {
      // The original tap may have opened a room beneath the same screen
      // coordinate. Don't deliver its compatibility mouse event to that room.
      if (touchTapPending.current) { event.preventDefault(); event.stopPropagation(); }
    }}
    onClickCapture={event => {
      if (touchTapPending.current && event.detail !== 0) {
        touchTapPending.current = false;
        event.preventDefault(); event.stopPropagation();
      }
    }}>
    <SceneCharacterMotionStyles />
    <div ref={viewportRef} data-testid="player-new-world-viewport" data-quest-guide-pan-surface
      className="absolute inset-0 z-0 isolate overflow-hidden touch-none"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd}
      onPointerCancel={onEnd} onLostPointerCapture={onEnd} onClick={onTerrainClick}
      onWheel={event => {
        if (inside || walk.isJoystickActive) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        changeZoom(latestCamera.current.zoom + (event.deltaY < 0 ? PLAYER_WORLD_ZOOM_STEP : -PLAYER_WORLD_ZOOM_STEP),
          { x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}>
      {sceneContent && viewportReady && !activeBuilding && <>
        <PetParkTerrain cacheRasterTiles
          groundTheme={worldGroundRenderTheme(groundTheme)}
          groundPalette={worldGroundPalette(groundTheme)}
          waterStyle={worldWaterStyle(worldId)}
          viewportWidth={viewport.width} viewportHeight={viewport.height}
          worldWidth={camera.worldWidth} worldHeight={camera.worldHeight}
          scale={camera.scale} panX={actualPan.x} panY={actualPan.y}
          dirtPatches={terrain.dirt} stonePatches={terrain.stone} waterPatches={terrain.water} />
        <div data-testid="player-new-world-art" className="pointer-events-none absolute left-0 top-0 z-0"
          style={{ width: camera.sceneWidth, height: camera.sceneHeight, transform: `translate3d(${actualPan.x}px,${actualPan.y}px,0)` }}>
        <WorldSwimFish areas={sceneContent?.swimAreas} fish={sceneContent?.swimFish} buildingId={null} groundLevel={groundLevel}
          width={camera.sceneWidth} height={camera.sceneHeight} scale={camera.scale} panX={actualPan.x} panY={actualPan.y}
          viewportWidth={viewport.width} viewportHeight={viewport.height} />
        {placementArtwork}
        {avatar?.base && <div data-testid="player-world-avatar" className="absolute pointer-events-none"
          style={{ left: 0, top: 0,
            width: WORLD_AVATAR_SIZE * camera.scale, height: WORLD_AVATAR_SIZE * camera.scale,
            transform: `translate3d(${walk.petPos.x * camera.sceneWidth}px,${walk.petPos.y * camera.sceneHeight}px,0) translate(-50%, -94%)`, zIndex: parkDepthIndex({
              yPct: walk.petPos.y, worldHeight: camera.worldHeight, kind: "pet", size: 0,
            }) }}>
          <div className="relative w-full h-full" style={{ transform: `scaleX(${walk.facingLeft ? -1 : 1})` }}>
            <WalkingCharacter parts={avatar.base.parts} clothingLayers={equippedLayers}
              skinTone={avatar.skinTone} topTucked={avatar.topTucked}
              motion={walk.isMoving ? "walk" : "idle"} ariaLabel="Your player character" />
          </div>
        </div>}
        {cropArtwork}
        </div>
        <div className="absolute inset-0 z-[14] pointer-events-none" data-testid="player-new-world-atmosphere">
          <HomeOutdoorAtmosphereLayer parkLampFalloff darkness={parkSceneDarkness(lighting.nightStrength)}
            nightStrength={lighting.nightStrength} lampStrength={lighting.lampStrength}
            effects={lights} fireflies={fireflies}
            sceneWindow={sceneWindow}
            fireflyStrength={lighting.fireflyStrength}
            panX={actualPan.x} panY={actualPan.y}
            imgWidth={camera.sceneWidth} sceneHeight={camera.sceneHeight}
            transitionMs={lighting.transitionMs} zIndex={2} />
        </div>
        {walkEnabled && walk.isJoystickActive && Math.hypot(walk.joystickOffset.x, walk.joystickOffset.y) > 2 &&
          <div className="absolute inset-0 z-20 pointer-events-none"><FloatingWalkJoystick
            worldId={worldId} center={joystickCenter} offset={walk.joystickOffset} /></div>}
      </>}
    </div>
    <div className="absolute z-30 flex gap-2 items-center" style={{ left: "max(12px, env(safe-area-inset-left))", top: "max(16px, calc(env(safe-area-inset-top) + 8px))" }}>
      <button data-testid="player-new-world-back" type="button"
        onClick={() => navigate("/map")}
        className="touch-manipulation min-h-11 px-3 py-2 rounded-full border border-[#b99952] bg-[#081911e8] text-[#f5dc9e] text-sm">← Map</button>
    </div>
    {activeBuilding && <div className="absolute inset-0 z-40 flex flex-col bg-[#0b1714] text-[#f1d899]"
      data-testid="player-new-world-building">
      <div className="absolute inset-x-0 top-0 z-40 flex justify-between items-center gap-3 bg-[#122a20]/95 px-4 pb-2"
        style={{ paddingTop: "max(12px, calc(env(safe-area-inset-top) + 8px))",
          paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
        <span>{activeAsset?.name ?? linkedPage?.name ?? "Building"}</span>
        <button type="button" aria-label="Close building"
          onPointerDown={event => event.stopPropagation()}
          onPointerUp={event => {
            if (!event.isPrimary || event.button !== 0) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
                event.clientY < bounds.top || event.clientY > bounds.bottom) return;
            // Match the Power Up close control: touch release is reliable
            // even when the browser suppresses a synthetic click after a swipe.
            event.preventDefault();
            event.stopPropagation();
            setInside(null);
          }}
          onClick={event => { if (event.detail === 0) setInside(null); }}
          className="touch-manipulation flex h-11 w-11 shrink-0 items-center justify-center border border-[#b99952] rounded-full text-2xl">×</button>
      </div>
      <div className="absolute inset-0">
        {interiorUrl ? <PlayerRoom key={activeBuilding.id + ":" + interiorUrl}
          imageUrl={interiorUrl}
          nightImageUrl={activeAsset?.interiorImageUrl ? activeAsset.nightInteriorImageUrl : null}
          worldId={worldId} building={activeBuilding}
          items={(sceneContent?.interiorItems ?? []).filter(item => item.buildingId === activeBuilding.id)}
          assets={assetsById} lighting={lighting} swimAreas={sceneContent?.swimAreas} swimFish={sceneContent?.swimFish} />
          : <div className="flex items-center justify-center h-full">This room has no interior artwork yet.</div>}
      </div>
      {linkedPage && <button data-testid="player-new-world-enter-linked-page"
        type="button" className="touch-manipulation absolute inset-x-4 z-40 py-3 rounded-full bg-[#204d34] border border-[#b99952]" style={{ bottom: "max(16px, calc(env(safe-area-inset-bottom) + 8px))" }}
        onClick={() => navigate(`/world/${encodeURIComponent(linkedPage.worldId)}?legacyLocationId=${encodeURIComponent(linkedPage.id)}&returnWorld=${encodeURIComponent(worldId)}`)}>
        Enter {linkedPage.name}
      </button>}
    </div>}
    {selectedGardenPlotId && !activeBuilding && (chosenPlot && gardenAnchor ? <PetParkGardenMenu
      key={chosenPlot.plotItemId} plot={chosenPlot} anchor={gardenAnchor}
      crops={garden.data?.crops ?? []} inventory={inventoryItems} inventoryLoading={inventory.isFetching}
      actionUrlPrefix={gardenPrefix} onClose={() => setSelectedGardenPlotId(null)}
      onChanged={invalidateGarden} onWateringState={setWateringGardenPlotId} /> :
      <ViewportModalPortal blocking={false}><div role="status" className="pointer-events-none absolute inset-x-3 top-[28%] z-[76] flex justify-center">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[#c9a65e] bg-[#143925] p-2 text-xs text-[#f4dda6]">
          {garden.isLoading ? "Checking Garden Plot…" : "Garden Plot unavailable."}
          <button type="button" onClick={() => setSelectedGardenPlotId(null)} aria-label="Close garden">×</button>
        </div>
      </div></ViewportModalPortal>)}
    {selectedWaterSourceId && !activeBuilding && <ViewportModalPortal>
      <PetParkWaterRefillPopup key={selectedWaterSourceId} sourceId={selectedWaterSourceId}
        pails={pails} eligiblePails={pails.filter(gardenItemNeedsRefill)}
        inventoryLoading={inventory.isFetching} reduceMotion={false}
        refillPathPrefix={`/api/worlds/${encodeURIComponent(worldId)}/water-sources`}
        onClose={() => setSelectedWaterSourceId(null)}
        onRefilled={() => void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] })} />
    </ViewportModalPortal>}
    {selectedNpc && <div className="absolute inset-x-6 bottom-7 z-30 rounded-xl border border-[#b99952] bg-[#122a20] p-4 text-[#f6da97]"
      role="dialog" aria-label={selectedNpc.name}>
      <div className="flex justify-between items-center">
        <span>{selectedNpc.name}</span>
        <button type="button" onClick={() => setSelectedNpc(null)} aria-label="Close NPC"
          className="px-3 py-1 border border-[#b99952] rounded-full">×</button>
      </div>
      <p className="text-sm mt-2">{selectedNpc.message}</p>
    </div>}
    {beauWheel.notice && <div role="status" className="pointer-events-none absolute inset-x-5 bottom-6 z-50 rounded-xl border border-[#b99952] bg-[#122a20]/95 p-3 text-center text-sm text-[#f6da97]">
      {beauWheel.notice}
    </div>}
    {beauWheel.state && <BeauPrizeWheelDialog state={beauWheel.state} onClose={beauWheel.close} onStateChange={beauWheel.onStateChange} />}
    {fishingAction && <Suspense fallback={<div role="status" className="absolute inset-0 z-50 grid place-items-center bg-black/75 text-amber-100">Opening fishing…</div>}>
      <WorldSceneFishingDialog action={fishingAction} onClose={() => setFishingAction(null)} />
    </Suspense>}
    {(scene.isLoading || !viewportReady) && <div className="absolute inset-0 z-50 bg-[#0a1811] flex items-center justify-center text-[#f5dc9e]">
      Loading world…
    </div>}
  </div>;
}


/** Match the authored room's natural aspect ratio and editor-relative 850px
 * size basis. A separate viewport keeps the room and UI above outdoor depth. */
function PlayerRoom({ worldId, imageUrl, nightImageUrl, building, items, assets, lighting, swimAreas, swimFish }: Partial<WorldSwimScene> & {
  worldId: string; imageUrl: string; nightImageUrl: string | null; building: WorldScenePlacement;
  items: WorldSceneInteriorItem[]; assets: Map<string, WorldSceneAsset>;
  lighting: ReturnType<typeof useHomeOutdoorLighting>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [ratio, setRatio] = useState<number | null>(null);
  const [center, setCenter] = useState({ x: .5, y: .5 });
  const [artError, setArtError] = useState(false);
  const roomDrag = useRef<{ id: number; x: number; y: number; pan: Point } | null>(null);
  const roomMoved = useRef(false);
  const [soulStoneId, setSoulStoneId] = useState<string | null>(null);
  const soulStoneRef = useRef<HTMLButtonElement>(null);
  const soulStone = items.find(item => item.id === soulStoneId &&
    resolveWorldSceneInteriorAction(worldId, item.kind, assets.get(item.assetId ?? "")) === "soul-exchange");
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const { width, height, pan } = playerWorldRoomCamera(viewport, ratio ?? 4 / 3, center);
  const ready = ratio !== null && viewport.width > 0 && viewport.height > 0;
  useEffect(() => { roomDrag.current = null; }, [viewport.width, viewport.height, ratio]);
  const endRoomDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.type === "lostpointercapture" && event.target !== event.currentTarget) return;
    if (roomDrag.current?.id === event.pointerId) roomDrag.current = null;
  };
  const lights = worldInteriorLights(items, width, height);
  return <div ref={ref} className="absolute inset-0 overflow-hidden touch-none"
    onPointerDown={event => {
      if (!ready || soulStone || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      roomMoved.current = false;
      roomDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan };
    }}
    onPointerMove={event => {
      const drag = roomDrag.current;
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!roomMoved.current && Math.hypot(dx, dy) < 6) return;
      roomMoved.current = true;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      const next = playerWorldRoomCamera(viewport, ratio ?? 4 / 3, {
        x: (viewport.width / 2 - drag.pan.x - dx) / width,
        y: (viewport.height / 2 - drag.pan.y - dy) / height,
      });
      roomDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: next.pan };
      setCenter({ x: (viewport.width / 2 - next.pan.x) / width,
        y: (viewport.height / 2 - next.pan.y) / height });
    }}
    onPointerUp={endRoomDrag} onPointerCancel={endRoomDrag} onLostPointerCapture={endRoomDrag}
    onClickCapture={event => {
      if (roomMoved.current) { roomMoved.current = false; event.stopPropagation(); }
    }}>
    <div data-testid="player-new-world-interior" className="absolute left-0 top-0 overflow-hidden isolate"
      style={{ width, height, transform: `translate3d(${pan.x}px,${pan.y}px,0)`, visibility: ready ? "visible" : "hidden" }}>
      {viewport.width > 0 && viewport.height > 0 && <WorldSceneArtwork imageUrl={imageUrl} cssSize={Math.max(viewport.width, viewport.height)} alt="Building interior" draggable={false}
        className="absolute inset-0 w-full h-full object-fill"
        onArtworkError={() => setArtError(true)}
        onLoad={event => {
          setArtError(false);
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) setRatio(image.naturalWidth / image.naturalHeight);
        }} />}
      {ready && nightImageUrl && lighting.nightInteriorArtworkActive && <WorldSceneArtwork imageUrl={nightImageUrl} cssSize={Math.max(viewport.width, viewport.height)} alt="" aria-hidden="true"
        data-testid="player-new-world-interior-night" className="absolute inset-0 h-full w-full object-fill" />}
      {ready && <WorldSwimFish areas={swimAreas} fish={swimFish} buildingId={building.id} groundLevel={1}
        width={width} height={height} scale={width / 850} panX={pan.x} panY={pan.y}
        viewportWidth={viewport.width} viewportHeight={viewport.height} />}
      {ready && <HomeInteriorDarknessLayer darkness={building.interiorDarkness ?? 35}
        effects={lights} panX={0} imgWidth={width} sceneHeight={height}
        sunlightStrength={lighting.daylightStrength} keepMaskMounted transitionMs={0} zIndex={2} />}
      {ready && (["decor", "effect"] as const).map(kind => <div key={kind}
        className="absolute inset-0 pointer-events-none" style={{ zIndex: kind === "decor" ? 1 : 3 }}>
        {items.filter(item => item.kind === kind).map(item => {
          const asset = item.assetId ? assets.get(item.assetId) : null;
          const size = item.size * width / 850;
          const isSoulStone = resolveWorldSceneInteriorAction(worldId, item.kind, asset) === "soul-exchange";
          return <div key={item.id} data-testid={`player-new-world-interior-item-${item.id}`}
            className="absolute pointer-events-none" style={{
              left: item.xPct * width, top: item.yPct * height, width: size, height: size,
              transform: `translate(-50%,-50%)${worldSceneRotationCss(item.rotation)}${item.flipped ? " scaleX(-1)" : ""}`,
              zIndex: Math.round(item.yPct * 10000),
            }}>
            {size > 0 && asset && (isSoulStone ? <button type="button"
              ref={soulStoneId === item.id ? soulStoneRef : undefined}
              data-testid="world-soul-exchange-stone" aria-label="The Soul Exchange Stone"
              className="pointer-events-auto absolute inset-0 h-full w-full touch-manipulation rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
              onClick={() => { if (!soulStone) setSoulStoneId(item.id); }}>
              <WorldSceneArtwork imageUrl={asset.imageUrl} cssSize={size} alt="" draggable={false} className="h-full w-full object-contain" />
            </button> : <WorldSceneArtwork imageUrl={asset.imageUrl} cssSize={size} alt="" draggable={false} className="h-full w-full object-contain" />)}
            {item.kind === "effect" && item.effectType && <span className="absolute inset-0"
              style={{ opacity: item.effectType === "warm_glow" ? lighting.daylightStrength : 1 }}>
              <ParkEffectVisual type={item.effectType as ParkEffectType} color={item.effectColor ?? undefined} reducedMotion={false} interior />
            </span>}
          </div>;
        })}
      </div>)}
    </div>
    {!ready && <div role={artError ? "alert" : "status"} className="absolute inset-0 grid place-items-center p-6 text-center text-[#f1d899]">
      {artError ? "Room artwork could not be loaded. Close and reopen the room." : "Loading room artwork…"}
    </div>}
    {soulStone && <Suspense fallback={<div role="status" className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-[#b99952] bg-[#122a20]/95 p-3 text-center text-amber-100">Opening Soul Exchange…</div>}>
      <WorldSceneSoulExchange key={soulStone.id} stoneRef={soulStoneRef}
        geometryKey={`${width}:${height}:${pan.x}:${pan.y}:${soulStone.xPct}:${soulStone.yPct}:${soulStone.size}:${soulStone.rotation ?? 0}`}
        onClose={() => setSoulStoneId(null)} />
    </Suspense>}
  </div>;
}
