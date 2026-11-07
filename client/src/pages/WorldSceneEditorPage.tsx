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
import WorldGardenPreview from "@/components/world-editor/WorldGardenPreview";
import { parkCameraGeometry, parkClampCamera, parkClampZoom, parkZoomAnchorPan } from "@/lib/petParkCamera";
import { parkDepthIndex } from "@/lib/petParkDepth";
import { parkImageHitAt } from "@/lib/petParkImageHit";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import { parkBrushWorldPoint } from "@/lib/petParkTerrainBrush";
import { isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio } from "@shared/petParkTerrainDetails";
import { PET_PARK_GROUND_THEMES, PET_PARK_MAX_GROUND_LEVEL } from "@shared/petParkGround";
import type { ParkEffectType } from "@shared/petParkEffects";
import type { ParkGroundTheme } from "@shared/petParkGround";
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
  const [previewGarden, setPreviewGarden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInteriorId, setSelectedInteriorId] = useState<string | null>(null);
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null);
  const [objectPreview, setObjectPreview] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const [interiorRatio, setInteriorRatio] = useState(4 / 3);
  const [busyPlacement, setBusyPlacement] = useState(false);

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
    setEdited(null); setPan(null); setZoom(1); setPaintMode(false); setPreviewGarden(false);
    setSelectedId(null); setSelectedInteriorId(null); setActiveBuildingId(null);
    cameraDrag.current = null; objectDrag.current = null;
    touchPoints.current.clear(); pinch.current = null;
  }, [worldId]);
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

  const camera = parkCameraGeometry(size.width, size.height, groundLevel, zoom);
  const initialPan = { x: -camera.limitX / 2, y: -camera.limitY / 2 };
  const actualPan = parkClampCamera(pan ?? initialPan, camera);
  const assetFor = (assetId: string | null) => content.assets.find(asset => asset.id === assetId);
  const activeBuilding = content.placements.find(p => p.id === activeBuildingId && p.kind === "building") ?? null;
  const selected = content.placements.find(p => p.id === selectedId) ?? null;
  const selectedInterior = content.interiorItems.find(i => i.id === selectedInteriorId && i.buildingId === activeBuildingId) ?? null;
  const interiorAsset = activeBuilding ? assetFor(activeBuilding.assetId) : null;
  const interiorW = Math.min(size.width, size.height * interiorRatio);
  const interiorH = interiorW / interiorRatio;

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
    const value = parkClampZoom(next);
    const nextGeometry = parkCameraGeometry(size.width, size.height, groundLevel, value);
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
    if ((event.button !== 0 && event.pointerType === "mouse") || busyPlacement || paintMode || previewGarden || objectDrag.current) return;
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
      const nextZoom = parkClampZoom(pinch.current.zoom *
        Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, pinch.current.distance));
      const startCamera = parkCameraGeometry(size.width, size.height, groundLevel, pinch.current.zoom);
      const nextCamera = parkCameraGeometry(size.width, size.height, groundLevel, nextZoom);
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
        <PetParkTerrain groundTheme={groundTheme}
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
                pointerEvents: previewGarden || p.kind === "terrain" ? "none" : undefined,
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
                if (previewGarden) return;
                event.stopPropagation(); setSelectedId(p.id);
              }}>
              <span className="absolute inset-0 pointer-events-none" style={{ transform: p.flipped ? "scaleX(-1)" : undefined }}>
                {asset && <img src={asset.imageUrl} alt="" draggable={false}
                  className="absolute inset-0 h-full w-full object-contain" />}
                {p.kind === "decor" && asset && <WorldDecorEffects effects={p.decorEffects}
                  sunlightStrength={1} reducedMotion={false} />}
                {p.kind === "effect" && p.effectType && <ParkEffectVisual type={p.effectType as ParkEffectType}
                  reducedMotion={false} adminPreview />}
                {garden && <PetParkTerrainDetail type="garden_plot" />}
                {p.kind === "terrain" && !connected && !garden && isParkTerrainDetail(p.effectType) &&
                  <PetParkTerrainDetail type={p.effectType} />}
              </span>
              {p.kind === "building" && p.isShop && <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-[#153421]/90 px-1 text-[9px] text-[#ffe1a1]">Shop</span>}
            </button>;
          })}
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
                <ParkEffectVisual type={item.effectType as ParkEffectType} reducedMotion={false} adminPreview />}
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
        onGroundTheme={async (theme: ParkGroundTheme) => {
          const response = await apiRequest("PUT", `/api/admin/world-editor/${worldId}/draft`,
            { groundLevel, groundTheme: theme });
          cache.setQueryData(queryKey, await response.json());
          setEdited(null);
        }} />}
    </div>
    {previewGarden && !activeBuilding && !paintMode && !scene.isError && !draft.isError &&
      <WorldGardenPreview worldId={worldId} placements={content.placements}
        viewportWidth={size.width} viewportHeight={size.height}
        sceneWidth={camera.sceneWidth} sceneHeight={camera.sceneHeight}
        worldHeight={camera.worldHeight} scale={camera.scale}
        panX={actualPan.x} panY={actualPan.y}
        onExit={() => setPreviewGarden(false)} />}

    <header className="pointer-events-none absolute top-0 inset-x-0 z-20 flex items-start gap-3 px-3 py-3"
      style={{ background: "linear-gradient(180deg, rgba(10,25,18,.97), rgba(10,25,18,0))" }}>
      <button type="button" onClick={() => navigate("/map")}
        className="pointer-events-auto rounded-lg border border-[#9b8246] bg-[#10251a] px-3 py-2 text-xs font-semibold"
        data-testid="button-world-draft-back">Back</button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold tracking-wide">{world.defaultName} — New World Edit</h1>
        <p className="text-[10px] text-[#d5c58e]">Private admin draft · Original world remains live</p>
      </div>
      <div className="pointer-events-auto flex gap-1">
        <button className="w-8 h-8 rounded border border-[#927a42] bg-[#173222] text-lg" type="button"
          aria-label="Zoom out" onClick={() => changeZoom(zoom - 0.15)}>−</button>
        <button className="w-8 h-8 rounded border border-[#927a42] bg-[#173222] text-lg" type="button"
          aria-label="Zoom in" onClick={() => changeZoom(zoom + 0.15)}>+</button>
      </div>
    </header>

    {!activeBuilding && !paintMode && !previewGarden && <section className="absolute z-20 left-3 top-[76px] w-[180px] rounded-lg border border-[#947846] bg-[#11281e]/90 p-2"
      onPointerDown={event => event.stopPropagation()}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold">Ground</span>
        <span className="text-[10px] text-[#cab784]">{draft.data?.hasSavedDraft ? "Draft" : "New"}</span>
      </div>
      <select aria-label="Ground theme" data-testid="select-world-draft-ground-theme"
        value={groundTheme} disabled={saveDraft.isPending}
        className="mb-2 w-full rounded bg-[#254536] p-1.5 text-[11px]"
        onChange={event => { setEdited({ groundLevel, groundTheme: event.target.value as ParkGroundTheme }); }}>
        {PET_PARK_GROUND_THEMES.map(theme => <option key={theme.type} value={theme.type}>{theme.label}</option>)}
      </select>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button type="button" aria-label="Shrink draft ground" disabled={groundLevel <= 1 || saveDraft.isPending}
          className="rounded border border-[#856c41] px-2 py-1 text-xs disabled:opacity-40"
          onClick={() => changeLevel(groundLevel - 1)}>−</button>
        <span className="text-[11px]">Size {groundLevel}/{PET_PARK_MAX_GROUND_LEVEL}</span>
        <button type="button" aria-label="Expand draft ground" disabled={groundLevel >= PET_PARK_MAX_GROUND_LEVEL || saveDraft.isPending}
          className="rounded border border-[#856c41] px-2 py-1 text-xs disabled:opacity-40"
          onClick={() => changeLevel(groundLevel + 1)}>+</button>
      </div>
      <button type="button" data-testid="button-save-world-draft" disabled={saveDraft.isPending || draft.isLoading || draft.isError}
        className="w-full rounded border border-[#c8a45b] bg-[#31513a] px-2 py-2 text-[11px] font-semibold disabled:opacity-40"
        onClick={() => saveDraft.mutate({ groundLevel, groundTheme })}>
        {saveDraft.isPending ? "Saving..." : "Save Ground"}
      </button>
      <button type="button" data-testid="button-world-garden-preview"
        disabled={scene.isLoading || scene.isError || saveDraft.isPending}
        className="mt-2 w-full rounded border border-[#c8a45b] bg-[#31513a] px-2 py-2 text-[11px] font-semibold disabled:opacity-40"
        onClick={() => { setSelectedId(null); setPreviewGarden(true); }}>
        Test Gardening
      </button>
    </section>}

    {(draft.isLoading || scene.isLoading || draft.isError || scene.isError) ?
      <div className="absolute z-40 inset-0 flex items-center justify-center bg-[#0d1f17]/90 p-5 text-center text-sm">
        {draft.isError || scene.isError ? "World draft could not be loaded. Return to map and retry." : "Loading private world editor…"}
      </div> : !paintMode && !previewGarden && <WorldSceneControls
        worldId={worldId} scene={content} selected={selected} selectedInterior={selectedInterior}
        activeBuilding={activeBuilding} placementPoint={createPoint}
        onChanged={() => void cache.invalidateQueries({ queryKey: sceneQueryKey })}
        onSelect={setSelectedId} onSelectInterior={setSelectedInteriorId}
        onEnter={id => { setActiveBuildingId(id); setSelectedInteriorId(null); setPan(null); }}
        onExit={() => { setActiveBuildingId(null); setSelectedInteriorId(null); }}
        onPaint={() => setPaintMode(true)} />}
  </div>;
}
