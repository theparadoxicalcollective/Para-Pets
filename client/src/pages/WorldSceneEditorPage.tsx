import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetParkTerrain from "@/components/PetParkTerrain";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";
import WorldSceneControls from "@/components/world-editor/WorldSceneControls";
import { useWorldLegacyPages } from "@/components/world-editor/WorldLegacyPagePicker";
import { useWorldNpcCatalog } from "@/components/world-editor/WorldNpcCatalog";
import WorldTerrainBrush from "@/components/world-editor/WorldTerrainBrush";
import WorldDecorEffects from "@/components/world-editor/WorldDecorEffects";
import WorldShopShelf from "@/components/world-editor/WorldShopShelf";
import { HomeOutdoorAtmosphereLayer, useHomeOutdoorLighting } from "@/components/HomeOutdoorAtmosphere";
import { HomeInteriorDarknessLayer } from "@/components/HomeInteriorEffect";
import { parkOutdoorLightEffects, parkOutdoorFireflyFields } from "@shared/petParkAtmosphere";
import { parkOutdoorEffectOpacity, parkSceneDarkness } from "@/lib/parkSceneLighting";
import { isHouseInteriorEffectType, type HouseInteriorEffect } from "@shared/housing";
import {
  worldEditorCameraGeometry, worldEditorClampZoom, worldEditorMinZoom,
  worldEditorClampCamera, worldEditorZoomAnchorPan,
} from "@/lib/worldEditorCamera";
import { PARK_GROUND_PALETTES } from "@/lib/petParkGroundPalette";
import { parkDepthIndex } from "@/lib/petParkDepth";
import { decorDrawDepth, decorRole } from "@shared/decorSurface";
import { parkImageHitAt } from "@/lib/petParkImageHit";
import { pickParkAdminArtwork } from "@/lib/petParkAdminSelection";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import { parkBrushWorldPoint } from "@/lib/petParkTerrainBrush";
import { isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio } from "@shared/petParkTerrainDetails";
import { PET_PARK_MAX_GROUND_LEVEL } from "@shared/petParkGround";
import type { WorldGroundTheme } from "@shared/worlds/worldGroundTheme";
import { worldGroundPalette, worldGroundRenderTheme } from "@/lib/worldGroundPalette";
import type { ParkEffectType } from "@shared/petParkEffects";

import type {
  WorldSceneContent, WorldSceneInteriorItem, WorldScenePlacement,
} from "@shared/worlds/worldSceneContent";
import { getWorldDefinition } from "@shared/worlds/worldRegistry";
import {
  defaultWorldSceneDraft, isEditableWorldSceneId,
  type WorldSceneDraft, type WorldSceneDraftSettings,
} from "@shared/worlds/worldSceneDraft";

/**
 * One independent admin World Editor across all registered realms.
 * Reuses camera and painterly ground math, not the Pet Park editor or APIs.
 * All scene data is private and world-scoped until a later publishing PR.
 */
export default function WorldSceneEditorPage({ worldId }: { worldId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const cache = useQueryClient();
  const viewportRef = useRef<HTMLDivElement>(null);
  const interiorRef = useRef<HTMLDivElement>(null);
  const cameraDrag = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  // A tap selects only when the finger lifts without panning. The next
  // gesture can move the selected object if it STARTS on opaque art.
  const pendingObjectTap = useRef<{
    pointerId: number; id: string; x: number; y: number;
  } | null>(null);
  const objectDrag = useRef<{
    id: number; itemId: string; kind: "outdoor" | "interior";
    startX: number; startY: number; clientX: number; clientY: number;
    xPct: number; yPct: number;
    latest: { xPct: number; yPct: number }; moved: boolean;
  } | null>(null);
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<null | {
    distance: number; zoom: number; pan: { x: number; y: number };
    midpoint: { x: number; y: number };
  }>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  // Match Pet Park: camera pointer samples can arrive much faster than the
  // display refresh. Batch pan/pinch commits to a single scene render per
  // animation frame, especially helpful with dense phone/tablet worlds.
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
  const [edited, setEdited] = useState<WorldSceneDraftSettings | null>(null);
  const [paintMode, setPaintMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInteriorId, setSelectedInteriorId] = useState<string | null>(null);
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null);
  // The slider previews locally without refetching or repainting another scene.
  type DarknessDraft = { buildingId: string; value: number };
  const [interiorDarknessDraft, setInteriorDarknessDraft] = useState<DarknessDraft | null>(null);
  const interiorDarknessDraftRef = useRef<DarknessDraft | null>(null);
  const [interiorPreviewClock, setInteriorPreviewClock] = useState<"live" | "day" | "night">("live");
  const darknessSaveInFlight = useRef(false);
  const [darknessSaving, setDarknessSaving] = useState(false);
  const [objectPreview, setObjectPreview] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const [interiorRatio, setInteriorRatio] = useState(4 / 3);
  const [busyPlacement, setBusyPlacement] = useState(false);
  // Preview the same viewer-local visual clock as Pet Park.
  const { data: clockAccount } = useQuery<{ timeZone?: string | null }>({
    queryKey: ["/api/auth/me"], staleTime: 60_000,
  });
  const worldLighting = useHomeOutdoorLighting("auto", clockAccount?.timeZone);

  const known = isEditableWorldSceneId(worldId);
  const world = getWorldDefinition(worldId);
  const legacyPages = useWorldLegacyPages(worldId, known && !!activeBuildingId);
  const npcCatalog = useWorldNpcCatalog(known);
  const queryKey = ["/api/admin/world-editor", worldId, "draft"];
  const sceneQueryKey = ["/api/admin/world-editor", worldId, "scene"];

  const draft = useQuery<WorldSceneDraft>({
    queryKey,
    enabled: known,
    queryFn: async () => {
      const response = await fetch(`/api/admin/world-editor/${worldId}/draft`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load this private world draft");
      return response.json();
    },
    refetchOnMount: true,
  });
  const scene = useQuery<WorldSceneContent>({
    queryKey: sceneQueryKey,
    enabled: known,
    queryFn: async () => {
      const response = await fetch(`/api/admin/world-editor/${worldId}/scene`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load world scene content");
      return response.json();
    },
    refetchOnMount: true,
  });
  const emptyScene: WorldSceneContent = useMemo(() => ({
    assets: [], placements: [], interiorItems: [],
  }), []);
  const content = scene.data ?? emptyScene;
  const initial = known ? defaultWorldSceneDraft(worldId) : null;
  const settings = edited ?? draft.data ?? initial;
  const groundLevel = settings?.groundLevel ?? 1;
  const groundTheme = settings?.groundTheme ?? "grass";

  useEffect(() => {
    setEdited(null); setPan(null); setZoom(1); setPaintMode(false);
    setSelectedId(null); setSelectedInteriorId(null); setActiveBuildingId(null);
    interiorDarknessDraftRef.current = null; setInteriorDarknessDraft(null);
    cameraDrag.current = null; objectDrag.current = null;
    if (cameraFrame.current !== null) {
      window.cancelAnimationFrame(cameraFrame.current);
      cameraFrame.current = null;
      queuedCamera.current = null;
    }
    pendingObjectTap.current = null;
    touchPoints.current.clear(); pinch.current = null;
  }, [worldId]);
  useEffect(() => {
    interiorDarknessDraftRef.current = null;
    setInteriorDarknessDraft(null);
    setInteriorPreviewClock("live");
  }, [activeBuildingId]);
  useEffect(() => {
    pendingObjectTap.current = null;
    objectDrag.current = null;
    touchPoints.current.clear();
    pinch.current = null;
  }, [activeBuildingId]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setSize(old => old.width === rect.width && old.height === rect.height ? old :
        { width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [known]);

  const camera = worldEditorCameraGeometry(size.width, size.height, groundLevel, zoom);
  const initialPan = worldEditorClampCamera(
    { x: -camera.limitX / 2, y: -camera.limitY / 2 }, camera, size);
  const actualPan = worldEditorClampCamera(pan ?? initialPan, camera, size);
  const minZoom = worldEditorMinZoom(size.width, size.height, groundLevel);
  const { exteriorLights, exteriorFireflies } = useMemo(() => {
    const items = content.placements.map(item => objectPreview?.id === item.id ? { ...item, ...objectPreview } : item);
    const shape = { width: camera.sceneWidth, height: camera.sceneHeight, scale: camera.scale };
    return { exteriorLights: parkOutdoorLightEffects(items, shape, actualPan, size),
      exteriorFireflies: parkOutdoorFireflyFields(items, shape, actualPan, size) };
  }, [content.placements, objectPreview, camera.sceneWidth, camera.sceneHeight, camera.scale, actualPan.x, actualPan.y, size.width, size.height]);
  const assetFor = (assetId: string | null) => content.assets.find(asset => asset.id === assetId);
  const npcById = useMemo(() => new Map((npcCatalog.data ?? []).map(npc => [npc.id, npc])), [npcCatalog.data]);
  const activeBuilding = content.placements.find(p => p.id === activeBuildingId && p.kind === "building") ?? null;
  const interiorDarkness = activeBuilding && interiorDarknessDraft &&
    interiorDarknessDraft.buildingId === activeBuilding.id
    ? interiorDarknessDraft.value : activeBuilding?.interiorDarkness ?? 35;
  const previewNightInteriorArtworkActive = interiorPreviewClock === "night" ? true
    : interiorPreviewClock === "day" ? false : worldLighting.nightInteriorArtworkActive;
  const previewSunlightStrength = interiorPreviewClock === "night" ? 0
    : interiorPreviewClock === "day" ? 1 : worldLighting.daylightStrength;
  const changeInteriorDarkness = (value: number) => {
    if (!activeBuilding || darknessSaveInFlight.current) return;
    const draft = { buildingId: activeBuilding.id, value };
    interiorDarknessDraftRef.current = draft;
    setInteriorDarknessDraft(draft);
  };
  const saveInteriorDarkness = async () => {
    const draft = interiorDarknessDraftRef.current;
    if (!activeBuilding || !draft || draft.buildingId !== activeBuilding.id ||
        darknessSaveInFlight.current) return;
    const saved = activeBuilding.interiorDarkness ?? 35;
    if (draft.value === saved) {
      interiorDarknessDraftRef.current = null;
      setInteriorDarknessDraft(null);
      return;
    }
    darknessSaveInFlight.current = true;
    setDarknessSaving(true);
    try {
      const response = await apiRequest("PATCH",
        `/api/admin/world-editor/${worldId}/placements/${draft.buildingId}`,
        { interiorDarkness: draft.value });
      const updated = await response.json() as WorldScenePlacement;
      // Update just this building in cache. A full scene refetch on release
      // would briefly restore the old brightness on slow mobile connections.
      cache.setQueryData<WorldSceneContent>(sceneQueryKey, current => current ? {
        ...current, placements: current.placements.map(item =>
          item.id === draft.buildingId ? { ...item, interiorDarkness: updated.interiorDarkness } : item),
      } : current);
      if (interiorDarknessDraftRef.current?.buildingId === draft.buildingId &&
          interiorDarknessDraftRef.current.value === draft.value) {
        interiorDarknessDraftRef.current = null;
        setInteriorDarknessDraft(null);
      }
    } catch (error) {
      toast({ title: "Could not save room darkness", description: String(error), variant: "destructive" });
      if (interiorDarknessDraftRef.current?.buildingId === draft.buildingId) {
        interiorDarknessDraftRef.current = null;
        setInteriorDarknessDraft(null);
      }
    } finally {
      darknessSaveInFlight.current = false;
      setDarknessSaving(false);
    }
  };
  const selected = content.placements.find(p => p.id === selectedId) ?? null;
  const selectedInterior = content.interiorItems.find(i => i.id === selectedInteriorId && i.buildingId === activeBuildingId) ?? null;
  const interiorAsset = activeBuilding ? assetFor(activeBuilding.assetId) : null;
  const linkedLegacyPage = legacyPages.data?.find(page =>
    page.id === activeBuilding?.legacyLocationId);
  // A linked legacy page takes priority as this new building's interior
  // preview. The original legacy page assets are never copied or edited.
  const interiorImageUrl = linkedLegacyPage?.bgUrl ?? interiorAsset?.interiorImageUrl;
  const interiorW = Math.min(size.width, size.height * interiorRatio);
  const interiorH = interiorW / interiorRatio;
  const interiorLights: HouseInteriorEffect[] = activeBuilding ? content.interiorItems
    .filter(item => item.buildingId === activeBuilding.id &&
      (isHouseInteriorEffectType(item.effectType) || item.effectType === "colored_light"))
    // Colored Light is the customizable outdoor form of lamp_light. Even
    // when saved inside an older building, its visible orb must cut a real
    // light pool out of the room's existing darkness mask.
    .map(item => ({ id: item.id,
      type: (item.effectType === "colored_light" ? "lamp_light" : item.effectType) as HouseInteriorEffect["type"],
      x: item.xPct, y: item.yPct, size: item.size * interiorW / 850 / interiorH * 100 })) : [];

  useEffect(() => { setInteriorRatio(4 / 3); }, [activeBuildingId, interiorImageUrl]);

  const saveDraft = useMutation({
    mutationFn: async (payload: WorldSceneDraftSettings) => {
      const response = await apiRequest("PUT", `/api/admin/world-editor/${worldId}/draft`, payload);
      return response.json() as Promise<WorldSceneDraft>;
    },
    onSuccess: result => {
      cache.setQueryData(queryKey, result);
      setEdited(null);
      void cache.invalidateQueries({ queryKey: sceneQueryKey });
      toast({ title: "World draft saved", description: "Players still visit the existing world." });
    },
    onError: (error: Error) => toast({
      title: "Unable to save draft", description: error.message, variant: "destructive",
    }),
  });
  const changeLevel = (next: number) => {
    if (next < 1 || next > PET_PARK_MAX_GROUND_LEVEL || saveDraft.isPending) return;
    // The server updates saved placement coordinates atomically on expansion.
    saveDraft.mutate({ groundLevel: next, groundTheme }, {
      onSuccess: () => setPan(null),
    });
  };
  const changeZoom = (next: number, anchor = { x: size.width / 2, y: size.height / 2 }) => {
    const value = worldEditorClampZoom(next, size.width, size.height, groundLevel);
    if (value === zoom) return;
    // A queued pinch frame must not overwrite a later button/slider change.
    if (cameraFrame.current !== null) {
      window.cancelAnimationFrame(cameraFrame.current);
      cameraFrame.current = null;
      queuedCamera.current = null;
    }
    const nextGeometry = worldEditorCameraGeometry(size.width, size.height, groundLevel, value);
    setPan(worldEditorZoomAnchorPan(actualPan, camera.scale, nextGeometry.scale,
      anchor, nextGeometry, size));
    setZoom(value);
  };
  const viewportPoint = (x: number, y: number) => {
    const rect = viewportRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: size.width, height: size.height };
    return parkBrushWorldPoint(x, y, rect, size,
      { x: actualPan.x, y: actualPan.y }, { width: camera.sceneWidth, height: camera.sceneHeight });
  };
  const createPoint = {
    xPct: Math.max(0, Math.min(1, (size.width / 2 - actualPan.x) / camera.sceneWidth)),
    yPct: Math.max(0, Math.min(1, (size.height / 2 - actualPan.y) / camera.sceneHeight)),
  };

  const updatePosition = async (kind: "outdoor" | "interior", id: string, position: { xPct: number; yPct: number }) => {
    setBusyPlacement(true);
    const endpoint = kind === "interior" ? "interior-items" : "placements";
    try {
      await apiRequest("PATCH", `/api/admin/world-editor/${worldId}/${endpoint}/${id}`, position);
      await cache.invalidateQueries({ queryKey: sceneQueryKey });
    } catch (error) {
      toast({ title: "Placement not saved", description: String(error), variant: "destructive" });
      await cache.invalidateQueries({ queryKey: sceneQueryKey });
    } finally {
      setObjectPreview(null);
      setBusyPlacement(false);
    }
  };
  // Selection and movement are separate gestures. A first tap on real art
  // selects it; a subsequent drag starting on that same selected art moves it.
  // Empty/transparent pixels always go to the camera instead.
  const startObject = (event: ReactPointerEvent<HTMLElement>,
    item: WorldScenePlacement | WorldSceneInteriorItem,
    kind: "outdoor" | "interior", selectedImage?: HTMLImageElement | null): boolean => {
    if (!event.isPrimary || (event.button !== 0 && event.pointerType === "mouse") ||
        busyPlacement || paintMode || objectDrag.current) return false;
    const image = selectedImage === undefined ? event.currentTarget.querySelector("img") : selectedImage;
    if (image && !parkImageHitAt(image, event.clientX, event.clientY, item.flipped)) return false;
    if (kind === "outdoor" && selectedId !== item.id) return false;
    if (kind === "interior" && selectedInteriorId !== item.id) {
      setSelectedInteriorId(item.id);
      return false;
    }

    event.stopPropagation();
    const start = kind === "outdoor" ? viewportPoint(event.clientX, event.clientY) : {
      xPct: event.clientX, yPct: event.clientY,
    };
    objectDrag.current = {
      kind, id: event.pointerId, itemId: item.id,
      startX: start.xPct, startY: start.yPct,
      clientX: event.clientX, clientY: event.clientY,
      xPct: item.xPct, yPct: item.yPct, latest: { xPct: item.xPct, yPct: item.yPct }, moved: false,
    };
    if (kind === "outdoor") {
      // Remember the first finger so a second finger can cancel movement
      // and initiate the existing pinch-to-zoom instead of moving scenery.
      touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    return true;
  };
  const moveObject = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = objectDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    if (pinch.current) return;
    if (drag.kind === "outdoor")
      touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Tapping/slightly shifting an object must not save a new placement.
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 7) return;
    const relative = drag.kind === "outdoor" ? viewportPoint(event.clientX, event.clientY) : {
      xPct: drag.startX + (event.clientX - drag.startX) / Math.max(1, interiorW),
      yPct: drag.startY + (event.clientY - drag.startY) / Math.max(1, interiorH),
    };
    const next = {
      xPct: Math.max(0, Math.min(1, drag.xPct + relative.xPct - drag.startX)),
      yPct: Math.max(0, Math.min(1, drag.yPct + relative.yPct - drag.startY)),
    };
    drag.latest = next;
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 7)
      drag.moved = true;
    setObjectPreview({ id: drag.itemId, ...next });
  };
  const finishObject = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = objectDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    objectDrag.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Safari may implicitly release capture before pointerup arrives.
    }
    if (drag.moved) {
      void updatePosition(drag.kind, drag.itemId, drag.latest);
    } else setObjectPreview(null);
  };
  const cancelObject = () => { objectDrag.current = null; setObjectPreview(null); };

  const endTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    touchPoints.current.delete(event.pointerId);
    if (pendingObjectTap.current?.pointerId === event.pointerId)
      pendingObjectTap.current = null;
    if (cameraDrag.current?.id === event.pointerId) cameraDrag.current = null;
    if (objectDrag.current?.id === event.pointerId) cancelObject();
    if (touchPoints.current.size < 2) {
      pinch.current = null;
      if (touchPoints.current.size === 1) {
        const [id, remaining] = [...touchPoints.current.entries()][0];
        // One finger can continue panning after a two-finger zoom ends.
        cameraDrag.current = {
          id, x: remaining.x, y: remaining.y,
          panX: (queuedCamera.current?.pan ?? actualPan).x,
          panY: (queuedCamera.current?.pan ?? actualPan).y,
        };
      }
    }
  };
  const startCamera = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (paintMode || activeBuilding || (event.button !== 0 && event.pointerType === "mouse")) return;
    if (objectDrag.current && objectDrag.current.id !== event.pointerId) {
      // Starting a second finger means pinch/pan, never an object movement.
      cancelObject();
    }
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.current.size === 2) {
      const [a, b] = [...touchPoints.current.values()];
      pinch.current = { distance: Math.hypot(b.x - a.x, b.y - a.y), zoom,
        pan: actualPan, midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      cameraDrag.current = null;
    } else if (touchPoints.current.size === 1) {
      cameraDrag.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY,
        panX: actualPan.x, panY: actualPan.y,
      };
    }
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const moveCamera = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!touchPoints.current.has(event.pointerId) || paintMode || activeBuilding) return;
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && touchPoints.current.size >= 2) {
      const [a, b] = [...touchPoints.current.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nextZoom = worldEditorClampZoom(pinch.current.zoom *
        Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, pinch.current.distance),
        size.width, size.height, groundLevel);
      const startCamera = worldEditorCameraGeometry(size.width, size.height, groundLevel, pinch.current.zoom);
      const nextCamera = worldEditorCameraGeometry(size.width, size.height, groundLevel, nextZoom);
      const rect = viewportRef.current?.getBoundingClientRect();
      const ratioX = size.width / Math.max(1, rect?.width ?? size.width);
      const ratioY = size.height / Math.max(1, rect?.height ?? size.height);
      const mid = { x: (center.x - (rect?.left ?? 0)) * ratioX, y: (center.y - (rect?.top ?? 0)) * ratioY };
      const originalMid = {
        x: (pinch.current.midpoint.x - (rect?.left ?? 0)) * ratioX,
        y: (pinch.current.midpoint.y - (rect?.top ?? 0)) * ratioY,
      };
      const nextPan = worldEditorZoomAnchorPan(
        pinch.current.pan, startCamera.scale, nextCamera.scale, originalMid, nextCamera, size);
      queueCameraUpdate(worldEditorClampCamera({
        x: nextPan.x + mid.x - originalMid.x,
        y: nextPan.y + mid.y - originalMid.y,
      }, nextCamera, size), nextZoom);
    } else if (cameraDrag.current?.id === event.pointerId) {
      const rect = viewportRef.current?.getBoundingClientRect();
      const dx = (event.clientX - cameraDrag.current.x) * size.width / Math.max(1, rect?.width ?? size.width);
      const dy = (event.clientY - cameraDrag.current.y) * size.height / Math.max(1, rect?.height ?? size.height);
      queueCameraUpdate(worldEditorClampCamera({
        x: cameraDrag.current.panX + dx, y: cameraDrag.current.panY + dy,
      }, camera, size));
    }
  };

  const dirtPatches = useMemo(() => content.placements.filter(p => p.kind === "terrain" && p.effectType === "dirt_path")
    .map(p => ({ xPct: p.xPct, yPct: p.yPct, size: p.size })), [content.placements]);
  const stonePatches = useMemo(() => content.placements.filter(p => p.kind === "terrain" && p.effectType === "stone_path")
    .map(p => ({ xPct: p.xPct, yPct: p.yPct, size: p.size })), [content.placements]);
  const waterPatches = useMemo(() => content.placements.filter(p => p.kind === "terrain" && p.effectType === "water_path")
    .map(p => ({ xPct: p.xPct, yPct: p.yPct, size: p.size })), [content.placements]);

  if (!world || !initial) return (
    <div className="w-full h-full flex items-center justify-center bg-[#101b16] text-[#e8d8ac]">
      <button type="button" onClick={() => navigate("/map")}>Unknown world — return to map</button>
    </div>
  );

  const objectPosition = (item: { id: string; xPct: number; yPct: number }) =>
    objectPreview?.id === item.id ? objectPreview : item;
  const groundBackdrop = (worldGroundPalette(groundTheme) ??
    PARK_GROUND_PALETTES[worldGroundRenderTheme(groundTheme)]).base;
  return <div className="relative w-full h-full overflow-hidden text-[#f3e5c5]"
    style={{ backgroundColor: groundBackdrop }}
    data-testid="world-scene-editor">
    <div ref={viewportRef} data-testid="world-scene-draft-viewport"
      className="absolute inset-0 overflow-hidden" style={{ touchAction: "none", cursor: "grab" }}
      onPointerDownCapture={event => {
        if (paintMode || activeBuilding || !event.isPrimary ||
            (event.button !== 0 && event.pointerType === "mouse")) return;
        const art = viewportRef.current?.querySelector("[data-world-editor-artwork]");
        const hit = art && pickParkAdminArtwork(art, event.clientX, event.clientY, (_kind, id) =>
          content.placements.find(item => item.id === id) ?? null);
        const item = hit ? content.placements.find(placement => placement.id === hit.id) : null;
        if (item && startObject(event, item, "outdoor", hit?.image)) {
          pendingObjectTap.current = null;
          return;
        }
        // A tap on visible art selects. A swipe beginning there pans, without
        // accidentally editing or moving the underlying world placement.
        pendingObjectTap.current = item ? {
          pointerId: event.pointerId, id: item.id, x: event.clientX, y: event.clientY,
        } : null;
        startCamera(event);
        event.stopPropagation();
      }}
      onPointerMoveCapture={event => {
        if (paintMode || activeBuilding) return;
        const pending = pendingObjectTap.current;
        if (pending?.pointerId === event.pointerId &&
            Math.hypot(event.clientX - pending.x, event.clientY - pending.y) >= 7)
          pendingObjectTap.current = null;
        if (objectDrag.current?.id === event.pointerId) moveObject(event);
      }}
      onPointerUpCapture={event => {
        // Interior objects and the terrain brush own their pointer events.
        // Only intercept ordinary outdoor placement gestures here.
        if (paintMode || activeBuilding) return;
        if (objectDrag.current?.id === event.pointerId) {
          finishObject(event);
          endTouch(event);
          event.stopPropagation();
          return;
        }
        const tap = pendingObjectTap.current;
        if (tap?.pointerId === event.pointerId) {
          pendingObjectTap.current = null;
          if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 7)
            setSelectedId(tap.id);
        }
        endTouch(event);
        event.stopPropagation();
      }}
      onPointerCancelCapture={event => {
        if (paintMode || activeBuilding) return;
        if (pendingObjectTap.current?.pointerId === event.pointerId)
          pendingObjectTap.current = null;
        if (objectDrag.current?.id === event.pointerId) cancelObject();
        endTouch(event);
        event.stopPropagation();
      }}
      onPointerDown={startCamera} onPointerMove={moveCamera}
      onPointerUp={endTouch} onPointerCancel={endTouch}
      onLostPointerCapture={endTouch}
      onWheel={event => {
        // Match Pet Park: plain trackpad/wheel zoom and pointer-centered focus,
        // without requiring Ctrl or Shift on a desktop editing browser.
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        changeZoom(zoom * (event.deltaY > 0 ? 0.94 : 1.06), {
          x: (event.clientX - rect.left) * size.width / Math.max(1, rect.width),
          y: (event.clientY - rect.top) * size.height / Math.max(1, rect.height),
        });
      }}>
      {!activeBuilding ? <>
        <PetParkTerrain groundTheme={worldGroundRenderTheme(groundTheme)}
          groundPalette={worldGroundPalette(groundTheme)}
          viewportWidth={size.width} viewportHeight={size.height}
          worldWidth={camera.worldWidth} worldHeight={camera.worldHeight}
          scale={camera.scale} panX={actualPan.x} panY={actualPan.y}
          dirtPatches={dirtPatches} stonePatches={stonePatches} waterPatches={waterPatches} />
        <div data-world-editor-artwork className="pointer-events-none absolute left-0 top-0"
          style={{ width: camera.sceneWidth, height: camera.sceneHeight,
            transform: `translate(${actualPan.x}px, ${actualPan.y}px)` }}>
          {content.placements.map(p => {
            const position = objectPosition(p);
            // Only mount visible sprites. Large worlds may contain thousands of
            // authored items; invisible images/effects must not animate on iOS.
            const left = actualPan.x + position.xPct * camera.sceneWidth;
            const top = actualPan.y + position.yPct * camera.sceneHeight;
            const margin = p.size * camera.scale;
            if (left < -margin || left > size.width + margin ||
                top < -margin || top > size.height + margin) return null;
            const asset = assetFor(p.assetId);
            const npc = p.kind === "npc" && p.npcId ? npcById.get(p.npcId) : undefined;
            const artworkUrl = asset?.imageUrl ?? npc?.imageUrl;
            const connected = p.kind === "terrain" && isParkConnectedPath(p.effectType);
            // Connected paths are painted on the camera canvas. Do not create
            // thousands of transparent hit targets that block panning.
            if (connected) return null;
            const garden = p.kind === "terrain" && p.effectType === "garden_plot";
            const height = p.size * camera.scale * (p.kind === "terrain" ? parkTerrainHeightRatio(p.effectType) : 1);
            return <button key={p.id} type="button"
              data-testid={`world-scene-placement-${p.id}`}
              data-world-editor-placement={p.id}
              data-decor-role={p.kind === "decor" ? decorRole(p) : undefined}
              data-park-draggable data-park-object-kind={p.kind === "building" ? "building" : "item"}
              data-park-object-id={p.id}
              className="pointer-events-auto absolute touch-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
              style={{
                left: position.xPct * camera.sceneWidth, top: position.yPct * camera.sceneHeight,
                width: p.size * camera.scale, height,
                zIndex: p.kind === "effect" ? 12_000_000 : p.kind === "terrain" ? 1 : decorDrawDepth(p, parkDepthIndex({
                  kind: p.kind === "building" ? "building" : "item",
                  yPct: position.yPct, worldHeight: camera.worldHeight, size: p.size,
                  contact: 0.9,
                }), 2),
                pointerEvents: p.kind === "terrain" ? "none" : undefined,
                transform: "translate(-50%, -50%)",

              }}
              aria-label={asset?.name ?? npc?.name ?? p.effectType ?? p.kind}
              onClick={event => {
                // Pointer selection is handled at pointer-up on opaque art.
                // Ignore rectangular button clicks in transparent PNG padding.
                if (event.detail === 0) setSelectedId(p.id);
                event.stopPropagation();
              }}>
              <span className="absolute inset-0 pointer-events-none" style={{ transform: p.flipped ? "scaleX(-1)" : undefined }}>
                {artworkUrl && <img src={artworkUrl} alt="" draggable={false}
                  className="absolute inset-0 h-full w-full object-contain"
                  style={selectedId === p.id && (p.kind === "building" || p.kind === "decor" || p.kind === "npc")
                    ? { filter: "drop-shadow(1px 0 0 #efca79) drop-shadow(-1px 0 0 #efca79) drop-shadow(0 0 4px #e7ba70)" }
                    : undefined} />}
                {(p.kind === "decor" || p.kind === "building") && asset &&
                  <WorldDecorEffects effects={p.decorEffects}
                    sunlightStrength={worldLighting.daylightStrength}
                    nightStrength={worldLighting.nightStrength} fireflyStrength={worldLighting.fireflyStrength}
                     lampStrength={worldLighting.lampStrength} reducedMotion={false} />}
                {p.kind === "effect" && p.effectType && <span className="absolute inset-0"
                  style={{ opacity: parkOutdoorEffectOpacity(p.effectType, worldLighting.nightStrength, worldLighting.fireflyStrength, worldLighting.lampStrength),
                    transition: "opacity 1200ms linear" }}>
                  <ParkEffectVisual type={p.effectType as ParkEffectType} color={p.effectColor ?? undefined}
                    reducedMotion={false} adminPreview fireflyStrength={worldLighting.fireflyStrength} sceneFireflies />
                </span>}
                {garden && <PetParkTerrainDetail type="garden_plot" />}
                {p.kind === "terrain" && !connected && !garden && isParkTerrainDetail(p.effectType) &&
                  <PetParkTerrainDetail type={p.effectType} />}
              </span>
            </button>;
          })}
        </div>
        <div data-testid="world-editor-auto-day-night"
          className="pointer-events-none absolute inset-0 z-[14] overflow-hidden">
          <HomeOutdoorAtmosphereLayer parkLampFalloff darkness={parkSceneDarkness(worldLighting.nightStrength)}
            nightStrength={worldLighting.nightStrength} lampStrength={worldLighting.lampStrength} effects={exteriorLights}
            fireflies={exteriorFireflies} fireflyStrength={worldLighting.fireflyStrength}
            panX={actualPan.x} panY={actualPan.y}
            imgWidth={camera.sceneWidth} sceneHeight={camera.sceneHeight}
            transitionMs={worldLighting.transitionMs} zIndex={2}/>
        </div>
      </> : interiorImageUrl ? <div
        ref={interiorRef} data-testid="world-editor-interior"
        className="absolute overflow-hidden border border-[#9d8651]/60"
        style={{
          left: (size.width - interiorW) / 2, top: (size.height - interiorH) / 2,
          width: interiorW, height: interiorH,
        }}>
        <img src={interiorImageUrl} alt={(linkedLegacyPage?.name ?? interiorAsset?.name ?? "World building") + " interior"}
          className="absolute inset-0 h-full w-full object-fill" draggable={false}
          onLoad={event => {
            const img = event.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0)
              setInteriorRatio(img.naturalWidth / img.naturalHeight);
          }} />
        {!linkedLegacyPage && interiorAsset?.nightInteriorImageUrl && <img
          src={interiorAsset.nightInteriorImageUrl} alt="" aria-hidden="true" draggable={false}
          data-testid="world-editor-night-interior-image"
          className="absolute inset-0 h-full w-full object-fill pointer-events-none"
          style={{ display: previewNightInteriorArtworkActive ? "block" : "none" }} />}
        <HomeInteriorDarknessLayer
          darkness={interiorDarkness}
          effects={interiorLights}
          panX={0} imgWidth={interiorW} sceneHeight={interiorH}
          sunlightStrength={previewSunlightStrength} keepMaskMounted transitionMs={0} zIndex={2}/>
        {content.interiorItems.filter(item => item.buildingId === activeBuilding.id).map(item => {
          const pos = objectPosition(item);
          const asset = assetFor(item.assetId);
          const px = item.size * interiorW / 850;
          return <button key={item.id} type="button"
            data-testid={`world-interior-item-${item.id}`}
            className="absolute touch-none rounded border border-transparent focus-visible:border-[#f5ce73]"
            style={{
              left: pos.xPct * interiorW, top: pos.yPct * interiorH, width: px, height: px,
              transform: "translate(-50%, -50%)", zIndex: Math.round(pos.yPct * 10000),

            }}
            onPointerDown={event => startObject(event, item, "interior")}
            onPointerMove={moveObject} onPointerUp={finishObject}
            onPointerCancel={cancelObject} onLostPointerCapture={cancelObject}
            onClick={event => {
              if (event.detail === 0) setSelectedInteriorId(item.id);
              event.stopPropagation();
            }}>
            <span className="pointer-events-none absolute inset-0"
              style={{ transform: item.flipped ? "scaleX(-1)" : undefined }}>
              {asset && <img src={asset.imageUrl} alt="" className="h-full w-full object-contain"
                style={selectedInteriorId === item.id ? {
                  filter: "drop-shadow(1px 0 0 #efca79) drop-shadow(-1px 0 0 #efca79) drop-shadow(0 0 4px #e7ba70)",
                } : undefined} draggable={false} />}
              {item.kind === "effect" && item.effectType &&
                <span className="absolute inset-0" style={{
                  opacity: item.effectType === "warm_glow" ? worldLighting.daylightStrength : 1,
                  transition: "opacity 1200ms linear",
                }}>
                  <ParkEffectVisual type={item.effectType as ParkEffectType} reducedMotion={false} adminPreview />
                </span>}
            </span>
          </button>;
        })}
        {activeBuilding.isShop && <WorldShopShelf worldId={worldId} building={activeBuilding}
          roomWidth={interiorW} roomHeight={interiorH}
          onChanged={() => void cache.invalidateQueries({ queryKey: sceneQueryKey })} />}
      </div> : <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[#decba0]">
        This building has no interior artwork yet. Choose Add Old World Page or upload a room image.
      </div>}

      {paintMode && !activeBuilding && <WorldTerrainBrush
        worldId={worldId} raised viewportWidth={size.width} viewportHeight={size.height}
        sceneWidth={camera.sceneWidth} sceneHeight={camera.sceneHeight}
        worldWidth={camera.worldWidth} worldHeight={camera.worldHeight}
        panX={actualPan.x} panY={actualPan.y} scale={camera.scale}
        groundTheme={groundTheme} onExit={() => setPaintMode(false)}
        onSaved={() => void cache.invalidateQueries({ queryKey: sceneQueryKey })}
        onGroundTheme={async (theme: WorldGroundTheme) => {
          const response = await apiRequest("PUT", `/api/admin/world-editor/${worldId}/draft`,
            { groundLevel, groundTheme: theme });
          cache.setQueryData(queryKey, await response.json());
          setEdited(null);
        }} />}
    </div>

    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-[max(12px,env(safe-area-inset-top))] font-fantasy">
      <div className="flex items-center justify-between gap-2">
        <button type="button" data-testid="button-world-draft-back" onClick={() => navigate("/map")}
          className="pointer-events-auto shrink-0 rounded-full border border-amber-500/30 bg-black/75 px-3 py-2 text-sm text-[#f5cf64]">
          ← Back
        </button>
        <h1 className="min-w-0 truncate rounded-full bg-black/65 px-3 py-2 text-center text-sm font-semibold tracking-wider text-[#f5cf64]">
          {world.defaultName}
        </h1>
        {activeBuilding ? <button type="button"
          className="pointer-events-auto shrink-0 rounded-full border border-amber-500/30 bg-black/75 px-3 py-2 text-xs text-[#f5cf64]"
          onClick={() => { setActiveBuildingId(null); setSelectedInteriorId(null); }}>Exit Room</button> :
          <button type="button" aria-label="Expand Ground"
            disabled={paintMode || saveDraft.isPending || groundLevel >= PET_PARK_MAX_GROUND_LEVEL}
            onClick={() => changeLevel(groundLevel + 1)}
            className="pointer-events-auto shrink-0 rounded-full border border-amber-500/30 bg-black/75 px-3 py-2 text-sm text-[#f5cf64] disabled:opacity-50">
            {saveDraft.isPending ? "Expanding…" : groundLevel >= PET_PARK_MAX_GROUND_LEVEL ? "Full" : "⛶ Expand"}
          </button>}
      </div>
    </header>
    {!paintMode && !activeBuilding && <div className="pointer-events-none absolute inset-x-3 z-10 flex justify-center"
      style={{ bottom: "max(8px, env(safe-area-inset-bottom, 0px))" }}>
      <span className="rounded-lg bg-black/70 px-3 py-1.5 text-[11px] text-amber-200">
        Admin preview · Original world remains live
      </span>
    </div>}

    {(draft.isLoading || scene.isLoading || draft.isError || scene.isError) ?
      <div className="absolute z-40 inset-0 flex items-center justify-center bg-[#0d1f17]/90 p-5 text-center text-sm">
        {draft.isError || scene.isError ? "World draft could not be loaded. Return to map and retry." : "Loading private world editor…"}
      </div> : !paintMode && <WorldSceneControls
        worldId={worldId} scene={content} selected={selected} selectedInterior={selectedInterior}
        activeBuilding={activeBuilding} placementPoint={createPoint}
        interiorDarkness={interiorDarkness}
        interiorPreviewClock={interiorPreviewClock} onInteriorPreviewClockChange={setInteriorPreviewClock}
        darknessSaving={darknessSaving}
        onInteriorDarknessChange={changeInteriorDarkness} onInteriorDarknessCommit={() => void saveInteriorDarkness()}
        onChanged={() => void cache.invalidateQueries({ queryKey: sceneQueryKey })}
        onSelect={setSelectedId} onSelectInterior={setSelectedInteriorId}
        onEnter={id => { setActiveBuildingId(id); setSelectedInteriorId(null); setPan(null); }}
        onPaint={() => setPaintMode(true)}
        groundTheme={groundTheme}
        zoom={zoom} minZoom={minZoom}
        onZoom={value => changeZoom(value)}
        onResetZoom={() => changeZoom(1)}
        onSaveGroundTheme={async theme => {
          const response = await apiRequest("PUT", `/api/admin/world-editor/${worldId}/draft`,
            { groundLevel, groundTheme: theme });
          cache.setQueryData(queryKey, await response.json());
          setEdited(null);
        }} />}
  </div>;
}
