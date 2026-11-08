import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetParkTerrain from "@/components/PetParkTerrain";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";
import WorldSceneControls from "@/components/world-editor/WorldSceneControls";
import WorldTerrainBrush from "@/components/world-editor/WorldTerrainBrush";
import WorldDecorEffects from "@/components/world-editor/WorldDecorEffects";
import WorldShopShelf from "@/components/world-editor/WorldShopShelf";
import { HomeOutdoorAtmosphereLayer, useHomeOutdoorLighting } from "@/components/HomeOutdoorAtmosphere";
import { HomeInteriorDarknessLayer } from "@/components/HomeInteriorEffect";
import { parkOutdoorLightEffects } from "@shared/petParkAtmosphere";
import { parkInteriorDarkness } from "@shared/parkInteriorDarkness";
import { parkOutdoorEffectOpacity, parkSceneDarkness } from "@/lib/parkSceneLighting";
import { isHouseInteriorEffectType, type HouseInteriorEffect } from "@shared/housing";
import { parkClampCamera, parkZoomAnchorPan } from "@/lib/petParkCamera";
import { worldEditorCameraGeometry, worldEditorClampZoom } from "@/lib/worldEditorCamera";
import { parkDepthIndex } from "@/lib/petParkDepth";
import { parkImageHitAt } from "@/lib/petParkImageHit";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import { parkBrushWorldPoint } from "@/lib/petParkTerrainBrush";
import { isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio } from "@shared/petParkTerrainDetails";
import { PET_PARK_MAX_GROUND_LEVEL } from "@shared/petParkGround";
import { WORLD_GROUND_THEMES, type WorldGroundTheme } from "@shared/worlds/worldGroundTheme";
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
  const objectDrag = useRef<{
    id: number; itemId: string; kind: "outdoor" | "interior";
    startX: number; startY: number; xPct: number; yPct: number;
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
  const [edited, setEdited] = useState<WorldSceneDraftSettings | null>(null);
  const [paintMode, setPaintMode] = useState(false);
  const [showWorldOptions, setShowWorldOptions] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInteriorId, setSelectedInteriorId] = useState<string | null>(null);
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null);
  // The slider previews locally without refetching or repainting another scene.
  type InteriorDarknessField = "interiorDarkness" | "interiorNightDarkness";
  type DarknessDraft = { buildingId: string; field: InteriorDarknessField; value: number };
  const [interiorDarknessDraft, setInteriorDarknessDraft] = useState<DarknessDraft | null>(null);
  const interiorDarknessDraftRef = useRef<DarknessDraft | null>(null);
  const [interiorPreviewClock, setInteriorPreviewClock] = useState<"live" | "day" | "night">("live");
  const darknessSaveInFlight = useRef(false);
  const [darknessSaving, setDarknessSaving] = useState(false);
  const [objectPreview, setObjectPreview] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const [interiorRatio, setInteriorRatio] = useState(4 / 3);
  const [busyPlacement, setBusyPlacement] = useState(false);
  // World drafts preview the same automatic outdoor and sunlight clock as Pet Park.
  const worldLighting = useHomeOutdoorLighting("auto");

  const known = isEditableWorldSceneId(worldId);
  const world = getWorldDefinition(worldId);
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
    setShowWorldOptions(false);
    setSelectedId(null); setSelectedInteriorId(null); setActiveBuildingId(null);
    interiorDarknessDraftRef.current = null; setInteriorDarknessDraft(null);
    cameraDrag.current = null; objectDrag.current = null;
    touchPoints.current.clear(); pinch.current = null;
  }, [worldId]);
  useEffect(() => {
    interiorDarknessDraftRef.current = null;
    setInteriorDarknessDraft(null);
    setInteriorPreviewClock("live");
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
  const initialPan = { x: -camera.limitX / 2, y: -camera.limitY / 2 };
  const actualPan = parkClampCamera(pan ?? initialPan, camera);
  const exteriorLights = useMemo(() => parkOutdoorLightEffects(
    content.placements.map(item => objectPreview?.id === item.id ? { ...item, ...objectPreview } : item),
    { width: camera.sceneWidth, height: camera.sceneHeight, scale: camera.scale }, actualPan, size),
    [content.placements, objectPreview, camera.sceneWidth, camera.sceneHeight, camera.scale, actualPan.x, actualPan.y, size.width, size.height]);
  const assetFor = (assetId: string | null) => content.assets.find(asset => asset.id === assetId);
  const activeBuilding = content.placements.find(p => p.id === activeBuildingId && p.kind === "building") ?? null;
  const interiorDarkness = activeBuilding && interiorDarknessDraft &&
    interiorDarknessDraft.buildingId === activeBuilding.id &&
    interiorDarknessDraft.field === "interiorDarkness"
    ? interiorDarknessDraft.value : activeBuilding?.interiorDarkness ?? 35;
  const interiorNightDarkness = activeBuilding && interiorDarknessDraft &&
    interiorDarknessDraft.buildingId === activeBuilding.id &&
    interiorDarknessDraft.field === "interiorNightDarkness"
    ? interiorDarknessDraft.value : activeBuilding?.interiorNightDarkness ?? null;
  const previewNightStrength = interiorPreviewClock === "night" ? 1
    : interiorPreviewClock === "day" ? 0 : worldLighting.nightStrength;
  const previewSunlightStrength = interiorPreviewClock === "night" ? 0
    : interiorPreviewClock === "day" ? 1 : worldLighting.daylightStrength;
  const changeInteriorDarkness = (value: number, field: InteriorDarknessField = "interiorDarkness") => {
    if (!activeBuilding || darknessSaveInFlight.current) return;
    const draft = { buildingId: activeBuilding.id, field, value };
    interiorDarknessDraftRef.current = draft;
    setInteriorDarknessDraft(draft);
  };
  const saveInteriorDarkness = async () => {
    const draft = interiorDarknessDraftRef.current;
    if (!activeBuilding || !draft || draft.buildingId !== activeBuilding.id ||
        darknessSaveInFlight.current) return;
    const saved = draft.field === "interiorDarkness"
      ? activeBuilding.interiorDarkness ?? 35
      : activeBuilding.interiorNightDarkness ?? interiorDarkness;
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
        { [draft.field]: draft.value });
      const updated = await response.json() as WorldScenePlacement;
      // Update just this building in cache. A full scene refetch on release
      // would briefly restore the old brightness on slow mobile connections.
      cache.setQueryData<WorldSceneContent>(sceneQueryKey, current => current ? {
        ...current, placements: current.placements.map(item =>
          item.id === draft.buildingId ? { ...item, [draft.field]: updated[draft.field] } : item),
      } : current);
      if (interiorDarknessDraftRef.current?.buildingId === draft.buildingId &&
          interiorDarknessDraftRef.current.value === draft.value &&
          interiorDarknessDraftRef.current.field === draft.field) {
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
  const interiorW = Math.min(size.width, size.height * interiorRatio);
  const interiorH = interiorW / interiorRatio;
  const interiorLights: HouseInteriorEffect[] = activeBuilding ? content.interiorItems
    .filter(item => item.buildingId === activeBuilding.id && isHouseInteriorEffectType(item.effectType))
    .map(item => ({ id: item.id, type: item.effectType as HouseInteriorEffect["type"],
      x: item.xPct, y: item.yPct, size: item.size * interiorW / 850 / interiorH * 100 })) : [];

  useEffect(() => { setInteriorRatio(4 / 3); }, [activeBuildingId, interiorAsset?.interiorImageUrl]);

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
    const nextGeometry = worldEditorCameraGeometry(size.width, size.height, groundLevel, value);
    setPan(parkZoomAnchorPan(actualPan, camera.scale, nextGeometry.scale, anchor, nextGeometry));
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
  const startObject = (event: ReactPointerEvent<HTMLButtonElement>, item: WorldScenePlacement | WorldSceneInteriorItem,
    kind: "outdoor" | "interior") => {
    if ((event.button !== 0 && event.pointerType === "mouse") || busyPlacement || paintMode || objectDrag.current) return;
    const artwork = event.currentTarget.querySelector("img");
    if (artwork && !parkImageHitAt(artwork, event.clientX, event.clientY, item.flipped)) return;
    event.stopPropagation();
    const start = kind === "outdoor" ? viewportPoint(event.clientX, event.clientY) : {
      xPct: event.clientX, yPct: event.clientY,
    };
    objectDrag.current = {
      kind, id: event.pointerId, itemId: item.id,
      startX: start.xPct, startY: start.yPct,
      xPct: item.xPct, yPct: item.yPct, latest: { xPct: item.xPct, yPct: item.yPct }, moved: false,
    };
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    if (kind === "outdoor") setSelectedId(item.id); else setSelectedInteriorId(item.id);
  };
  const moveObject = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = objectDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    const relative = drag.kind === "outdoor" ? viewportPoint(event.clientX, event.clientY) : {
      xPct: drag.startX + (event.clientX - drag.startX) / Math.max(1, interiorW),
      yPct: drag.startY + (event.clientY - drag.startY) / Math.max(1, interiorH),
    };
    const next = {
      xPct: Math.max(0, Math.min(1, drag.xPct + relative.xPct - drag.startX)),
      yPct: Math.max(0, Math.min(1, drag.yPct + relative.yPct - drag.startY)),
    };
    drag.latest = next;
    if (Math.abs(next.xPct - drag.xPct) > 0.001 || Math.abs(next.yPct - drag.yPct) > 0.001)
      drag.moved = true;
    setObjectPreview({ id: drag.itemId, ...next });
  };
  const finishObject = (event: ReactPointerEvent<HTMLButtonElement>) => {
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
    if (drag.moved) void updatePosition(drag.kind, drag.itemId, drag.latest);
    else setObjectPreview(null);
  };
  const cancelObject = () => { objectDrag.current = null; setObjectPreview(null); };

  const endTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    touchPoints.current.delete(event.pointerId);
    if (cameraDrag.current?.id === event.pointerId) cameraDrag.current = null;
    if (touchPoints.current.size < 2) {
      pinch.current = null;
      if (touchPoints.current.size === 1) {
        const [id, remaining] = [...touchPoints.current.entries()][0];
        // One finger can continue panning after a two-finger zoom ends.
        cameraDrag.current = {
          id, x: remaining.x, y: remaining.y, panX: actualPan.x, panY: actualPan.y,
        };
      }
    }
  };
  const startCamera = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (paintMode || activeBuilding || (event.button !== 0 && event.pointerType === "mouse")) return;
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
      const nextPan = parkZoomAnchorPan(pinch.current.pan, startCamera.scale, nextCamera.scale, originalMid, nextCamera);
      setPan(parkClampCamera({
        x: nextPan.x + mid.x - originalMid.x,
        y: nextPan.y + mid.y - originalMid.y,
      }, nextCamera));
      setZoom(nextZoom);
    } else if (cameraDrag.current?.id === event.pointerId) {
      const rect = viewportRef.current?.getBoundingClientRect();
      const dx = (event.clientX - cameraDrag.current.x) * size.width / Math.max(1, rect?.width ?? size.width);
      const dy = (event.clientY - cameraDrag.current.y) * size.height / Math.max(1, rect?.height ?? size.height);
      setPan(parkClampCamera({
        x: cameraDrag.current.panX + dx, y: cameraDrag.current.panY + dy,
      }, camera));
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
  return <div className="relative w-full h-full overflow-hidden bg-[#101b16] text-[#f3e5c5]"
    data-testid="world-scene-editor">
    <div ref={viewportRef} data-testid="world-scene-draft-viewport"
      className="absolute inset-0 overflow-hidden" style={{ touchAction: "none", cursor: "grab" }}
      onPointerDown={startCamera} onPointerMove={moveCamera}
      onPointerUp={endTouch} onPointerCancel={endTouch}
      onLostPointerCapture={endTouch}
      onWheel={event => {
        if (!event.ctrlKey && !event.shiftKey) return;
        const rect = event.currentTarget.getBoundingClientRect();
        changeZoom(zoom * (event.deltaY > 0 ? 0.92 : 1.08), {
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
            const connected = p.kind === "terrain" && isParkConnectedPath(p.effectType);
            // Connected paths are painted on the camera canvas. Do not create
            // thousands of transparent hit targets that block panning.
            if (connected) return null;
            const garden = p.kind === "terrain" && p.effectType === "garden_plot";
            const height = p.size * camera.scale * (p.kind === "terrain" ? parkTerrainHeightRatio(p.effectType) : 1);
            return <button key={p.id} type="button"
              data-testid={`world-scene-placement-${p.id}`}
              data-world-editor-placement={p.id}
              className="pointer-events-auto absolute touch-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
              style={{
                left: position.xPct * camera.sceneWidth, top: position.yPct * camera.sceneHeight,
                width: p.size * camera.scale, height,
                zIndex: p.kind === "terrain" ? 1 : parkDepthIndex({
                  kind: p.kind === "building" ? "building" : "item",
                  yPct: position.yPct, worldHeight: camera.worldHeight, size: p.size,
                  contact: 0.9,
                }),
                pointerEvents: p.kind === "terrain" ? "none" : undefined,
                transform: "translate(-50%, -50%)",
                outline: selectedId === p.id ? "2px solid #f6cf71" : undefined,
              }}
              aria-label={asset?.name ?? p.effectType ?? p.kind}
              onPointerDown={event => startObject(event, p, "outdoor")}
              onPointerMove={moveObject} onPointerUp={finishObject}
              onPointerCancel={cancelObject} onLostPointerCapture={cancelObject}
              onClick={event => {
                const artwork = event.currentTarget.querySelector("img");
                if (artwork && !parkImageHitAt(artwork, event.clientX, event.clientY, p.flipped)) return;
                event.stopPropagation(); setSelectedId(p.id);
              }}>
              <span className="absolute inset-0 pointer-events-none" style={{ transform: p.flipped ? "scaleX(-1)" : undefined }}>
                {asset && <img src={asset.imageUrl} alt="" draggable={false}
                  className="absolute inset-0 h-full w-full object-contain" />}
                {(p.kind === "decor" || p.kind === "building") && asset &&
                  <WorldDecorEffects effects={p.decorEffects}
                    sunlightStrength={worldLighting.daylightStrength}
                    nightStrength={worldLighting.nightStrength} fireflyStrength={worldLighting.fireflyStrength} reducedMotion={false} />}
                {p.kind === "effect" && p.effectType && <span className="absolute inset-0"
                  style={{ opacity: parkOutdoorEffectOpacity(p.effectType, worldLighting.nightStrength, worldLighting.fireflyStrength),
                    transition: "opacity 1200ms linear" }}>
                  <ParkEffectVisual type={p.effectType as ParkEffectType} color={p.effectColor ?? undefined}
                    reducedMotion={false} adminPreview fireflyStrength={worldLighting.fireflyStrength} />
                </span>}
                {garden && <PetParkTerrainDetail type="garden_plot" />}
                {p.kind === "terrain" && !connected && !garden && isParkTerrainDetail(p.effectType) &&
                  <PetParkTerrainDetail type={p.effectType} />}
              </span>
              {p.kind === "building" && p.isShop && <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-[#153421]/90 px-1 text-[9px] text-[#ffe1a1]">Shop</span>}
            </button>;
          })}
        </div>
        <div data-testid="world-editor-auto-day-night"
          className="pointer-events-none absolute inset-0 z-[14] overflow-hidden">
          <HomeOutdoorAtmosphereLayer parkLampFalloff darkness={parkSceneDarkness(worldLighting.nightStrength)}
            nightStrength={worldLighting.nightStrength} effects={exteriorLights}
            panX={actualPan.x} panY={actualPan.y}
            imgWidth={camera.sceneWidth} sceneHeight={camera.sceneHeight}
            transitionMs={worldLighting.transitionMs} zIndex={2}/>
        </div>
      </> : interiorAsset?.interiorImageUrl ? <div
        ref={interiorRef} data-testid="world-editor-interior"
        className="absolute overflow-hidden border border-[#9d8651]/60"
        style={{
          left: (size.width - interiorW) / 2, top: (size.height - interiorH) / 2,
          width: interiorW, height: interiorH,
        }}>
        <img src={interiorAsset.interiorImageUrl} alt={interiorAsset.name + " interior"}
          className="absolute inset-0 h-full w-full object-fill" draggable={false}
          onLoad={event => {
            const img = event.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0)
              setInteriorRatio(img.naturalWidth / img.naturalHeight);
          }} />
        <HomeInteriorDarknessLayer
          darkness={parkInteriorDarkness(interiorDarkness, interiorNightDarkness, previewNightStrength)}
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
              outline: item.id === selectedInteriorId ? "2px solid #efc967" : undefined,
            }}
            onPointerDown={event => startObject(event, item, "interior")}
            onPointerMove={moveObject} onPointerUp={finishObject}
            onPointerCancel={cancelObject} onLostPointerCapture={cancelObject}
            onClick={event => {
              const artwork = event.currentTarget.querySelector("img");
              if (artwork && !parkImageHitAt(artwork, event.clientX, event.clientY, item.flipped)) return;
              event.stopPropagation(); setSelectedInteriorId(item.id);
            }}>
            <span className="pointer-events-none absolute inset-0"
              style={{ transform: item.flipped ? "scaleX(-1)" : undefined }}>
              {asset && <img src={asset.imageUrl} alt="" className="h-full w-full object-contain" draggable={false} />}
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
        This building has no interior artwork yet. Edit its asset to upload a room image.
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
    {!activeBuilding && !paintMode && <div
      className="pointer-events-none absolute right-3 z-30 flex flex-col items-end gap-2"
      style={{ top: "max(68px, calc(env(safe-area-inset-top, 0px) + 58px))" }}>
      <div className="pointer-events-auto flex items-center gap-1">
        <button type="button" aria-label="Zoom out" onClick={() => changeZoom(zoom - 0.15)}
          className="h-9 w-9 rounded-full border border-amber-500/35 bg-black/75 text-base text-[#f5cf64]">−</button>
        <button type="button" aria-label="Zoom in" onClick={() => changeZoom(zoom + 0.15)}
          className="h-9 w-9 rounded-full border border-amber-500/35 bg-black/75 text-base text-[#f5cf64]">+</button>
        <button type="button" data-testid="button-world-options" aria-expanded={showWorldOptions}
          onClick={() => setShowWorldOptions(value => !value)}
          className="min-h-9 rounded-full border border-amber-500/35 bg-black/75 px-3 text-xs font-semibold text-[#f5cf64]">
          World Options
        </button>
      </div>
      {showWorldOptions && <section aria-label="World editor settings" data-testid="world-options-panel"
        className="pointer-events-auto w-[min(270px,calc(100vw-24px))] max-h-[min(46dvh,330px)] overflow-y-auto rounded-xl border border-amber-500/45 bg-[#10291d]/95 p-3 text-[#f5cf64] shadow-xl"
        onPointerDown={event => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <strong className="text-sm">World Settings</strong>
          <span className="text-[11px] opacity-80">{draft.data?.hasSavedDraft ? "Private draft" : "New draft"}</span>
        </div>
        <label htmlFor="world-ground-theme" className="mb-1 block text-xs">Ground theme</label>
        <select id="world-ground-theme" aria-label="Ground theme" data-testid="select-world-draft-ground-theme"
          value={groundTheme} disabled={saveDraft.isPending}
          className="mb-2 w-full rounded-lg border border-[#b99a4c]/50 bg-[#245037] px-2 py-2 text-xs"
          onChange={event => setEdited({ groundLevel, groundTheme: event.target.value as WorldGroundTheme })}>
          {WORLD_GROUND_THEMES.map(theme => <option key={theme.type} value={theme.type}>{theme.label}</option>)}
        </select>
        <button type="button" data-testid="button-save-world-draft"
          disabled={saveDraft.isPending || draft.isLoading || draft.isError}
          onClick={() => saveDraft.mutate({ groundLevel, groundTheme })}
          className="mb-2 w-full rounded-lg border border-[#b99a4c]/65 bg-[#245037] px-3 py-2.5 text-xs font-semibold disabled:opacity-50">
          {saveDraft.isPending ? "Saving…" : "Save Ground Theme"}
        </button>
      </section>}
    </div>}
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
        interiorNightDarkness={Math.max(interiorDarkness, interiorNightDarkness ?? interiorDarkness)}
        interiorPreviewClock={interiorPreviewClock} onInteriorPreviewClockChange={setInteriorPreviewClock}
        darknessSaving={darknessSaving}
        onInteriorDarknessChange={changeInteriorDarkness} onInteriorDarknessCommit={() => void saveInteriorDarkness()}
        onChanged={() => void cache.invalidateQueries({ queryKey: sceneQueryKey })}
        onSelect={setSelectedId} onSelectInterior={setSelectedInteriorId}
        onEnter={id => { setActiveBuildingId(id); setSelectedInteriorId(null); setPan(null); }}
        onExit={() => { setActiveBuildingId(null); setSelectedInteriorId(null); }}
        onPaint={() => setPaintMode(true)} />}
  </div>;
}
