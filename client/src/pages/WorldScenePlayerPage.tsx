import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import PetParkTerrain from "@/components/PetParkTerrain";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import { HomeInteriorDarknessLayer } from "@/components/HomeInteriorEffect";
import { parkDepthIndex } from "@/lib/petParkDepth";
import { decorDrawDepth } from "@shared/decorSurface";
import { isHouseInteriorEffectType, type HouseInteriorEffect } from "@shared/housing";
import type { ParkEffectType } from "@shared/petParkEffects";
import { chooseNpcMessage, getNpcQuestAssociations, parseNpcMetadata } from "@/lib/npcMetadata";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";
import WorldDecorEffects from "@/components/world-editor/WorldDecorEffects";
import { HomeOutdoorAtmosphereLayer, useHomeOutdoorLighting } from "@/components/HomeOutdoorAtmosphere";
import { parkOutdoorLightEffects, parkOutdoorFireflyFields } from "@shared/petParkAtmosphere";
import { parkOutdoorEffectOpacity, parkSceneDarkness } from "@/lib/parkSceneLighting";
import { worldGroundPalette, worldGroundRenderTheme } from "@/lib/worldGroundPalette";
import { isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio } from "@shared/petParkTerrainDetails";
import {
  worldEditorCameraGeometry, worldEditorClampCamera, worldEditorMinZoom, worldEditorZoomAnchorPan,
} from "@/lib/worldEditorCamera";
import { clampPlayerWorldZoom, PLAYER_WORLD_ZOOM_MAX, PLAYER_WORLD_ZOOM_STEP } from "@shared/worlds/worldScenePublication";
import type { WorldGroundTheme } from "@shared/worlds/worldGroundTheme";
import type { WorldSceneAsset, WorldSceneContent, WorldSceneInteriorItem, WorldScenePlacement } from "@shared/worlds/worldSceneContent";

interface PlayerScene extends WorldSceneContent {
  groundLevel: number;
  groundTheme: WorldGroundTheme;
  linkedPages: Array<{ id: string; worldId: string; name: string; type: string; bgUrl: string | null }>;
  npcs: Array<{ id: string; name: string; imageUrl: string | null; specialSkill: string | null; legacyLocationId: string | null }>;
}
type Point = { x: number; y: number };

/** An intentionally read-only player runtime, separate from admin editing.
 * All coordinates and terrain painting use the SAME ground/camera system as
 * World Editor. Legacy game locations retain their original stable IDs.
 */
export default function WorldScenePlayerPage({
  worldId, onContentReady,
}: { worldId: string; onContentReady?: () => void }) {
  const [, navigate] = useLocation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const notified = useRef(false);
  // Start unmeasured instead of flashing a legacy phone-sized scene on
  // tablets; actual viewport dimensions come from this page's ResizeObserver.
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point | null>(null);
  const points = useRef(new Map<number, Point>());
  const drag = useRef<{ id: number; x: number; y: number; pan: Point } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const moved = useRef(false);
  const [inside, setInside] = useState<string | null>(null);

  const scene = useQuery<PlayerScene>({
    queryKey: ["/api/worlds", worldId, "player-scene"],
    queryFn: async () => {
      const response = await fetch("/api/worlds/" + encodeURIComponent(worldId) + "/player-scene", {
        credentials: "include", cache: "no-cache",
      });
      if (!response.ok) throw new Error("This world is unavailable; the admin can switch it back to the old version.");
      return response.json();
    },
    // This is the same persisted scene the admin edits. Refresh periodically
    // while the player is on this page so later saved changes appear without
    // requiring a new publish or a full navigation. No admin data is exposed.
    retry: 1, staleTime: 0, refetchOnMount: true,
    refetchOnWindowFocus: true, refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    setZoom(1); setPan(null); setInside(null);
    points.current.clear(); drag.current = null; pinch.current = null; notified.current = false;
  }, [worldId]);
  useEffect(() => {
    if ((!scene.data && !scene.isError) || notified.current) return;
    notified.current = true;
    onContentReady?.();
  }, [scene.data, scene.isError, onContentReady]);
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
  const groundLevel = scene.data?.groundLevel ?? 1;
  const groundTheme = scene.data?.groundTheme ?? "grass";
  const minimum = worldEditorMinZoom(viewport.width, viewport.height, groundLevel);
  const safeZoom = clampPlayerWorldZoom(zoom, minimum);
  const camera = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, safeZoom);
  const initial = { x: -camera.limitX / 2, y: -camera.limitY / 2 };
  const actualPan = worldEditorClampCamera(pan ?? initial, camera, viewport);
  const lighting = useHomeOutdoorLighting("auto");
  const sceneContent = scene.data;
  const placements = sceneContent?.placements ?? [];
  const assetsById = useMemo(() => new Map((sceneContent?.assets ?? []).map(a => [a.id, a])),
    [sceneContent?.assets]);
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
  // Prefer the newly authored room; a legacy background is a fallback only.
  const interiorUrl = activeAsset?.interiorImageUrl ?? linkedPage?.bgUrl ?? null;

  const terrain = useMemo(() => ({
    dirt: placements.filter(p => p.kind === "terrain" && p.effectType === "dirt_path"),
    stone: placements.filter(p => p.kind === "terrain" && p.effectType === "stone_path"),
    water: placements.filter(p => p.kind === "terrain" && p.effectType === "water_path"),
  }), [placements]);
  const atmosphere = useMemo(() => {
    const shape = { width: camera.sceneWidth, height: camera.sceneHeight, scale: camera.scale };
    return {
      lights: parkOutdoorLightEffects(placements, shape, actualPan, viewport),
      fireflies: parkOutdoorFireflyFields(placements, shape, actualPan, viewport),
    };
  }, [placements, camera.sceneWidth, camera.sceneHeight, camera.scale,
    actualPan.x, actualPan.y, viewport.width, viewport.height]);

  function changeZoom(next: number, anchor: Point) {
    const newZoom = clampPlayerWorldZoom(next, minimum);
    const nextCamera = worldEditorCameraGeometry(viewport.width, viewport.height, groundLevel, newZoom);
    setPan(worldEditorZoomAnchorPan(actualPan, camera.scale, nextCamera.scale, anchor, nextCamera, viewport));
    setZoom(newZoom);
  }
  const local = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function onDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    moved.current = false;
    points.current.set(event.pointerId, local(event));
    const active = [...points.current.values()];
    if (active.length === 1) {
      drag.current = { id: event.pointerId, x: active[0].x, y: active[0].y, pan: actualPan };
      pinch.current = null;
    } else if (active.length === 2) {
      drag.current = null;
      pinch.current = { distance: Math.max(1, Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y)), zoom: safeZoom };
    }
  }
  function onMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!points.current.has(event.pointerId)) return;
    points.current.set(event.pointerId, local(event));
    const active = [...points.current.values()];
    if (active.length === 2 && pinch.current) {
      const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
      const center = { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 };
      moved.current = true;
      changeZoom(pinch.current.zoom * distance / pinch.current.distance, center);
      event.preventDefault();
    } else if (active.length === 1 && drag.current?.id === event.pointerId) {
      const dx = active[0].x - drag.current.x, dy = active[0].y - drag.current.y;
      if (Math.hypot(dx, dy) < 6 && !moved.current) return;
      moved.current = true;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      setPan(worldEditorClampCamera({
        x: drag.current.pan.x + dx, y: drag.current.pan.y + dy,
      }, camera, viewport));
      event.preventDefault();
    }
  }
  function onEnd(event: ReactPointerEvent<HTMLDivElement>) {
    points.current.delete(event.pointerId);
    pinch.current = null;
    drag.current = null;
    if (points.current.size === 1) {
      const [id, position] = [...points.current][0];
      drag.current = { id, x: position.x, y: position.y, pan: actualPan };
    }
  }
  function activate(item: WorldScenePlacement) {
    if (moved.current) { moved.current = false; return; }
    if (item.kind === "building") setInside(item.id);
    if (item.kind === "npc") {
      const npc = item.npcId ? npcsById.get(item.npcId) : null;
      if (!npc) return;
      // Linked NPCs expose their original location mount for the existing
      // quest/dialogue overlays. If a quest overlay isn't ready yet, keep the
      // original interaction reachable without guessing a quest state.
      if (npc.legacyLocationId && getNpcQuestAssociations(npc.name, worldId).length) {
        navigate(`/world/${encodeURIComponent(worldId)}?legacyView=1&returnWorld=${encodeURIComponent(worldId)}`);
        return;
      }
      const message = chooseNpcMessage(parseNpcMetadata(npc.specialSkill).messages,
        selectedNpc?.name === npc.name ? selectedNpc.message : null);
      if (message) setSelectedNpc({ name: npc.name, message });
    }
  }
  const [selectedNpc, setSelectedNpc] = useState<{ name: string; message: string } | null>(null);
  useEffect(() => setSelectedNpc(null), [worldId]);

  if (scene.isError && !scene.data) return <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#101b17] text-[#f5d78f] px-6 text-center"
    data-testid="player-new-world-error" role="alert">
    <p>{scene.error instanceof Error ? scene.error.message : "Could not load this world."}</p>
    <button onClick={() => navigate("/map")} className="border border-amber-600 rounded-lg px-4 py-2">Back to Map</button>
  </div>;

  return <div data-testid="player-new-world" className="relative w-full h-full overflow-hidden bg-[#08140d]">
    <div ref={viewportRef} data-testid="player-new-world-viewport" data-quest-guide-pan-surface
      className="absolute inset-0 z-0 isolate overflow-hidden touch-none"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd}
      onPointerCancel={onEnd} onLostPointerCapture={onEnd}
      onWheel={event => {
        if (inside) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        changeZoom(safeZoom + (event.deltaY < 0 ? PLAYER_WORLD_ZOOM_STEP : -PLAYER_WORLD_ZOOM_STEP),
          { x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}>
      {sceneContent && viewportReady && !activeBuilding && <>
        <PetParkTerrain
          groundTheme={worldGroundRenderTheme(groundTheme)}
          groundPalette={worldGroundPalette(groundTheme)}
          viewportWidth={viewport.width} viewportHeight={viewport.height}
          worldWidth={camera.worldWidth} worldHeight={camera.worldHeight}
          scale={camera.scale} panX={actualPan.x} panY={actualPan.y}
          dirtPatches={terrain.dirt} stonePatches={terrain.stone} waterPatches={terrain.water} />
        <div data-testid="player-new-world-art" className="pointer-events-none absolute inset-0 z-0">
        {placements.map(p => {
          const x = actualPan.x + p.xPct * camera.sceneWidth;
          const y = actualPan.y + p.yPct * camera.sceneHeight;
          const size = p.size * camera.scale;
          if (p.kind !== "npc" && !p.legacyLocationId &&
              (x < -size || x > viewport.width + size || y < -size || y > viewport.height + size)) return null;
          if (p.kind === "terrain" && isParkConnectedPath(p.effectType)) return null;
          const asset = p.assetId ? assetsById.get(p.assetId) : null;
          const npc = p.npcId ? npcsById.get(p.npcId) : null;
          const art = asset?.imageUrl ?? npc?.imageUrl ?? null;
          const isInteractive = p.kind === "building" || p.kind === "npc";
          const height = p.kind === "terrain" ? size * parkTerrainHeightRatio(p.effectType) : size;
          const legacyId = p.kind === "npc" ? npc?.legacyLocationId : p.legacyLocationId;
          // Portal mounts are the stable original location IDs used by Ginny,
          // Lonelle, Janson and their guide arrows. Keep only one mount per ID.
          const localLegacyId = legacyId && legacyMounts.get(legacyId) === p.id ? legacyId : null;
          return <div key={p.id}
            data-testid={localLegacyId ? `location-${localLegacyId}` : undefined}
            data-new-world-npc={localLegacyId && p.kind === "npc" ? "true" : undefined}
            className="absolute pointer-events-none"
            style={{
              left: x, top: y, width: size, height,
              transform: "translate(-50%,-50%)",
              zIndex: p.kind === "effect" ? 12_000_000 : p.kind === "terrain" ? 1 : decorDrawDepth(p, parkDepthIndex({
                kind: p.kind === "building" ? "building" : "item", yPct: p.yPct,
                worldHeight: camera.worldHeight, size: p.size, contact: .9,
              }), 2),
              pointerEvents: isInteractive ? "auto" : "none",
            }}>
            <button type="button"
              data-testid={`player-new-world-object-${p.id}`}
              disabled={!isInteractive}
              onClick={event => { event.stopPropagation(); activate(p); }}
              aria-label={asset?.name ?? npc?.name ?? p.kind}
              className="absolute inset-0 h-full w-full border-0 bg-transparent p-0"
              style={{ pointerEvents: isInteractive ? "auto" : "none", touchAction: "none" }}>
            <span className="pointer-events-none absolute inset-0" style={{
              transform: p.flipped ? "scaleX(-1)" : undefined,
            }}>
              {art && <img src={art} alt="" className="absolute inset-0 w-full h-full object-contain" draggable={false} />}
              {(p.kind === "decor" || p.kind === "building") && <WorldDecorEffects effects={p.decorEffects}
                sunlightStrength={lighting.daylightStrength}
                nightStrength={lighting.nightStrength} fireflyStrength={lighting.fireflyStrength}
                lampStrength={lighting.lampStrength} reducedMotion={false} />}
              {p.kind === "effect" && p.effectType && <span className="absolute inset-0" style={{
                opacity: parkOutdoorEffectOpacity(p.effectType, lighting.nightStrength, lighting.fireflyStrength, lighting.lampStrength),
              }}><ParkEffectVisual type={p.effectType as ParkEffectType} color={p.effectColor ?? undefined}
                reducedMotion={false} fireflyStrength={lighting.fireflyStrength} sceneFireflies /></span>}
              {p.kind === "terrain" && isParkTerrainDetail(p.effectType) &&
                <PetParkTerrainDetail type={p.effectType} />}
            </span>
          </button>
          </div>;
        })}
        </div>
        <div className="absolute inset-0 z-[14] pointer-events-none" data-testid="player-new-world-atmosphere">
          <HomeOutdoorAtmosphereLayer parkLampFalloff darkness={parkSceneDarkness(lighting.nightStrength)}
            nightStrength={lighting.nightStrength} lampStrength={lighting.lampStrength}
            effects={atmosphere.lights} fireflies={atmosphere.fireflies}
            fireflyStrength={lighting.fireflyStrength}
            panX={actualPan.x} panY={actualPan.y}
            imgWidth={camera.sceneWidth} sceneHeight={camera.sceneHeight}
            transitionMs={lighting.transitionMs} zIndex={2} />
        </div>
      </>}
    </div>
    <div className="absolute left-3 top-4 z-30 flex gap-2 items-center">
      <button data-testid="player-new-world-back" type="button"
        onClick={() => navigate("/map")}
        className="px-3 py-2 rounded-full border border-[#b99952] bg-[#081911e8] text-[#f5dc9e] text-sm">← Map</button>
      <button data-testid="player-new-world-original-locations" type="button"
        onClick={() => navigate(`/world/${encodeURIComponent(worldId)}?legacyView=1&returnWorld=${encodeURIComponent(worldId)}`)}
        className="px-3 py-2 rounded-full border border-[#b99952] bg-[#081911e8] text-[#f5dc9e] text-xs">Original locations</button>
    </div>
    <div className="absolute right-3 top-4 z-30 flex items-center gap-1">
      <button type="button" aria-label="Zoom out" data-testid="player-world-zoom-out"
        className="rounded-full border border-[#b99952] bg-[#081911e8] text-[#f5dc9e] w-9 h-9"
        disabled={!viewportReady || safeZoom <= minimum + .001}
        onClick={() => changeZoom(safeZoom - PLAYER_WORLD_ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 })}>−</button>
      <button type="button" aria-label="Zoom in" data-testid="player-world-zoom-in"
        className="rounded-full border border-[#b99952] bg-[#081911e8] text-[#f5dc9e] w-9 h-9"
        disabled={!viewportReady || safeZoom >= PLAYER_WORLD_ZOOM_MAX - .001}
        onClick={() => changeZoom(safeZoom + PLAYER_WORLD_ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 })}>+</button>
    </div>
    {activeBuilding && <div className="absolute inset-0 z-40 flex flex-col bg-[#0b1714] text-[#f1d899]"
      data-testid="player-new-world-building">
      <div className="flex justify-between items-center px-4 py-3 bg-[#122a20]">
        <span>{activeAsset?.name ?? linkedPage?.name ?? "Building"}</span>
        <button type="button" onClick={() => setInside(null)} aria-label="Close building"
          className="border border-[#b99952] rounded-full px-3 py-1">×</button>
      </div>
      <div className="relative flex-1 min-h-0">
        {interiorUrl ? <PlayerRoom key={activeBuilding.id}
          imageUrl={interiorUrl}
          nightImageUrl={activeAsset?.interiorImageUrl ? activeAsset.nightInteriorImageUrl : null}
          building={activeBuilding}
          items={(sceneContent?.interiorItems ?? []).filter(item => item.buildingId === activeBuilding.id)}
          assets={assetsById} lighting={lighting} />
          : <div className="flex items-center justify-center h-full">This room has no interior artwork yet.</div>}
      </div>
      {linkedPage && <button data-testid="player-new-world-enter-linked-page"
        type="button" className="mx-4 my-4 py-3 rounded-full bg-[#204d34] border border-[#b99952]"
        onClick={() => navigate(`/world/${encodeURIComponent(linkedPage.worldId)}?legacyLocationId=${encodeURIComponent(linkedPage.id)}&returnWorld=${encodeURIComponent(worldId)}`)}>
        Enter {linkedPage.name}
      </button>}
    </div>}
    {selectedNpc && <div className="absolute inset-x-6 bottom-7 z-30 rounded-xl border border-[#b99952] bg-[#122a20] p-4 text-[#f6da97]"
      role="dialog" aria-label={selectedNpc.name}>
      <div className="flex justify-between items-center">
        <span>{selectedNpc.name}</span>
        <button type="button" onClick={() => setSelectedNpc(null)} aria-label="Close NPC"
          className="px-3 py-1 border border-[#b99952] rounded-full">×</button>
      </div>
      <p className="text-sm mt-2">{selectedNpc.message}</p>
    </div>}
    {(scene.isLoading || !viewportReady) && <div className="absolute inset-0 z-50 bg-[#0a1811] flex items-center justify-center text-[#f5dc9e]">
      Loading world…
    </div>}
  </div>;
}


/** Match the authored room's natural aspect ratio and editor-relative 850px
 * size basis. A separate viewport keeps the room and UI above outdoor depth. */
function PlayerRoom({ imageUrl, nightImageUrl, building, items, assets, lighting }: {
  imageUrl: string; nightImageUrl: string | null; building: WorldScenePlacement;
  items: WorldSceneInteriorItem[]; assets: Map<string, WorldSceneAsset>;
  lighting: ReturnType<typeof useHomeOutdoorLighting>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [ratio, setRatio] = useState(4 / 3);
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
  const width = Math.min(viewport.width, viewport.height * ratio);
  const height = width / ratio;
  const lights: HouseInteriorEffect[] = items.filter(item =>
    isHouseInteriorEffectType(item.effectType) || item.effectType === "colored_light").map(item => ({
      id: item.id, type: (item.effectType === "colored_light" ? "lamp_light" : item.effectType) as HouseInteriorEffect["type"],
      x: item.xPct, y: item.yPct, size: item.size * ratio / 8.5,
    }));
  return <div ref={ref} className="absolute inset-0 flex items-center justify-center">
    <div data-testid="player-new-world-interior" className="relative overflow-hidden isolate" style={{ width, height }}>
      <img src={imageUrl} alt="Building interior" draggable={false}
        className="absolute inset-0 w-full h-full object-fill"
        onLoad={event => {
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) setRatio(image.naturalWidth / image.naturalHeight);
        }} />
      {nightImageUrl && lighting.nightInteriorArtworkActive && <img src={nightImageUrl} alt="" aria-hidden="true"
        data-testid="player-new-world-interior-night" className="absolute inset-0 h-full w-full object-fill" />}
      {width > 0 && height > 0 && <HomeInteriorDarknessLayer darkness={building.interiorDarkness ?? 35}
        effects={lights} panX={0} imgWidth={width} sceneHeight={height}
        sunlightStrength={lighting.daylightStrength} keepMaskMounted transitionMs={0} zIndex={2} />}
      {items.map(item => {
        const asset = item.assetId ? assets.get(item.assetId) : null;
        const size = item.size * width / 850;
        return <div key={item.id} data-testid={`player-new-world-interior-item-${item.id}`}
          className="absolute pointer-events-none" style={{
            left: item.xPct * width, top: item.yPct * height, width: size, height: size,
            transform: `translate(-50%,-50%)${item.flipped ? " scaleX(-1)" : ""}`,
            zIndex: Math.round(item.yPct * 10000),
          }}>
          {asset && <img src={asset.imageUrl} alt="" draggable={false} className="h-full w-full object-contain" />}
          {item.kind === "effect" && item.effectType && <span className="absolute inset-0"
            style={{ opacity: item.effectType === "warm_glow" ? lighting.daylightStrength : 1 }}>
            <ParkEffectVisual type={item.effectType as ParkEffectType} reducedMotion={false} />
          </span>}
        </div>;
      })}
    </div>
  </div>;
}
