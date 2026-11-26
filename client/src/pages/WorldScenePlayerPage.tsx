import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import PetParkTerrain from "@/components/PetParkTerrain";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";
import WorldDecorEffects from "@/components/world-editor/WorldDecorEffects";
import { HomeOutdoorAtmosphereLayer, useHomeOutdoorLighting } from "@/components/HomeOutdoorAtmosphere";
import { HomeInteriorDarknessLayer } from "@/components/HomeInteriorEffect";
import { parkOutdoorLightEffects, parkOutdoorFireflyFields } from "@shared/petParkAtmosphere";
import { parkOutdoorEffectOpacity, parkSceneDarkness } from "@/lib/parkSceneLighting";
import { worldGroundPalette, worldGroundRenderTheme } from "@/lib/worldGroundPalette";
import { worldEditorCameraGeometry, worldEditorClampCamera,
  worldEditorClampZoom, worldEditorZoomAnchorPan } from "@/lib/worldEditorCamera";
import { parkDepthIndex } from "@/lib/petParkDepth";
import { decorDrawDepth, decorRole } from "@shared/decorSurface";
import { isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio } from "@shared/petParkTerrainDetails";
import { isHouseInteriorEffectType, type HouseInteriorEffect } from "@shared/housing";
import type { ParkEffectType } from "@shared/petParkEffects";
import type { WorldScenePlacement } from "@shared/worlds/worldSceneContent";
import type { WorldScenePlayerSnapshot } from "@shared/worlds/worldScenePublication";
import { getWorldDefinition } from "@shared/worlds/worldRegistry";
import { parseNpcMetadata, chooseNpcMessage } from "@/lib/npcMetadata";

/**
 * Read-only presentation of a published snapshot; never mounts admin tools or
 * reads private drafts. Linked old locations remain the authority for quests,
 * fishing, battles and shop transactions until each system is migrated.
 */
export default function WorldScenePlayerPage({
  worldId, onContentReady,
}: { worldId: string; onContentReady?: () => void }) {
  const [, navigate] = useLocation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ pointerId: number; x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number; pan: { x: number; y: number };
    mid: { x: number; y: number } } | null>(null);
  const [size, setSize] = useState({ width: 390, height: 750 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [spokenMessages, setSpokenMessages] = useState<Record<string, string>>({});
  const lighting = useHomeOutdoorLighting("auto");

  const snapshotQuery = useQuery<WorldScenePlayerSnapshot>({
    queryKey: ["/api/world-scene", worldId, "player"],
    queryFn: async () => {
      const response = await fetch(`/api/world-scene/${encodeURIComponent(worldId)}/player`,
        { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("The new world could not be opened");
      return response.json();
    },
    retry: 1,
    staleTime: 0,
  });
  const snapshot = snapshotQuery.data;
  const content = snapshot?.content;
  const world = getWorldDefinition(worldId);
  const groundLevel = snapshot?.groundLevel ?? 1;
  const groundTheme = snapshot?.groundTheme ?? "grass";
  const camera = worldEditorCameraGeometry(size.width, size.height, groundLevel, zoom);
  const initialPan = { x: -camera.limitX / 2, y: -camera.limitY / 2 };
  const actualPan = worldEditorClampCamera(pan ?? initialPan, camera, size);
  const room = content?.placements.find(item => item.id === roomId && item.kind === "building");
  const assetById = useMemo(() =>
    new Map((content?.assets ?? []).map(asset => [asset.id, asset])), [content?.assets]);
  const npcById = useMemo(() => new Map((snapshot?.npcs ?? []).map(npc => [npc.id, npc])),
    [snapshot?.npcs]);
  const legacyById = useMemo(() => new Map((snapshot?.legacyLocations ?? []).map(page => [page.id, page])),
    [snapshot?.legacyLocations]);
  const outdoor = content?.placements ?? [];
  const worldShape = { width: camera.sceneWidth, height: camera.sceneHeight, scale: camera.scale };
  const { exteriorLights, exteriorFireflies } = useMemo(() => ({
    exteriorLights: parkOutdoorLightEffects(outdoor, worldShape, actualPan, size),
    exteriorFireflies: parkOutdoorFireflyFields(outdoor, worldShape, actualPan, size),
  }), [outdoor, camera.sceneWidth, camera.sceneHeight, camera.scale,
    actualPan.x, actualPan.y, size.width, size.height]);
  const dirtPatches = useMemo(() => outdoor.filter(p => p.kind === "terrain" && p.effectType === "dirt_path")
    .map(p => ({ xPct: p.xPct, yPct: p.yPct, size: p.size })), [outdoor]);
  const stonePatches = useMemo(() => outdoor.filter(p => p.kind === "terrain" && p.effectType === "stone_path")
    .map(p => ({ xPct: p.xPct, yPct: p.yPct, size: p.size })), [outdoor]);
  const waterPatches = useMemo(() => outdoor.filter(p => p.kind === "terrain" && p.effectType === "water_path")
    .map(p => ({ xPct: p.xPct, yPct: p.yPct, size: p.size })), [outdoor]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize(prev => prev.width === rect.width && prev.height === rect.height ? prev :
        { width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPan(null); setZoom(1); setRoomId(null);
    touches.current.clear(); drag.current = null; pinch.current = null;
  }, [worldId]);
  useEffect(() => {
    if (snapshot) onContentReady?.();
  }, [snapshot, onContentReady]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const changeZoom = (value: number, anchor = { x: size.width / 2, y: size.height / 2 }) => {
    const next = worldEditorClampZoom(value, size.width, size.height, groundLevel);
    const nextCamera = worldEditorCameraGeometry(size.width, size.height, groundLevel, next);
    setPan(worldEditorZoomAnchorPan(actualPan, camera.scale, nextCamera.scale,
      anchor, nextCamera, size));
    setZoom(next);
  };

  const coords = () => [...touches.current.values()];
  const startCamera = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary && event.pointerType !== "touch") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    const points = coords();
    if (points.length === 2) {
      const [a, b] = points;
      pinch.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom,
        pan: actualPan, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      drag.current = null;
    } else if (points.length === 1) {
      drag.current = { pointerId: event.pointerId,
        x: event.clientX, y: event.clientY, pan: actualPan };
    }
  };
  const moveCamera = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!touches.current.has(event.pointerId)) return;
    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && touches.current.size >= 2) {
      const [a, b] = coords(), current = pinch.current;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = worldEditorClampZoom(current.zoom *
        Math.hypot(a.x - b.x, a.y - b.y) / current.distance, size.width, size.height, groundLevel);
      const nextCam = worldEditorCameraGeometry(size.width, size.height, groundLevel, next);
      const rect = viewportRef.current?.getBoundingClientRect();
      const anchor = { x: current.mid.x - (rect?.left ?? 0), y: current.mid.y - (rect?.top ?? 0) };
      const shifted = worldEditorZoomAnchorPan(current.pan,
        worldEditorCameraGeometry(size.width, size.height, groundLevel, current.zoom).scale,
        nextCam.scale, anchor, nextCam, size);
      setPan(worldEditorClampCamera({
        x: shifted.x + center.x - current.mid.x,
        y: shifted.y + center.y - current.mid.y,
      }, nextCam, size));
      setZoom(next);
    } else if (drag.current?.pointerId === event.pointerId) {
      const current = drag.current;
      setPan(worldEditorClampCamera({
        x: current.pan.x + event.clientX - current.x,
        y: current.pan.y + event.clientY - current.y,
      }, camera, size));
    }
  };
  const endCamera = (event: ReactPointerEvent<HTMLDivElement>) => {
    touches.current.delete(event.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  const openLegacy = (locationId: string) => {
    const linked = legacyById.get(locationId);
    if (!linked) {
      setNotice("This original location has not been connected yet.");
      return;
    }
    // Use the ORIGINAL world feature and server-owned game state for now.
    // A linked building never duplicates or bypasses a quest/shop action.
    navigate(`/world/${encodeURIComponent(linked.worldId)}?legacy=1&openLocation=${encodeURIComponent(linked.id)}&returnWorld=${encodeURIComponent(worldId)}`);
  };
  const clickPlacement = (placement: WorldScenePlacement) => {
    if (placement.kind === "npc") {
      const npc = npcById.get(placement.npcId ?? "");
      if (npc?.legacyLocationId) { openLegacy(npc.legacyLocationId); return; }
      const messages = parseNpcMetadata(npc?.specialSkill).messages;
      if (!messages.length) {
        setNotice("This NPC's dialogue has not been connected yet.");
        return;
      }
      const chosen = chooseNpcMessage(messages, spokenMessages[placement.id]);
      if (chosen) setSpokenMessages(previous => ({ ...previous, [placement.id]: chosen }));
      return;
    }
    if (placement.kind !== "building") return;
    if (placement.legacyLocationId) { openLegacy(placement.legacyLocationId); return; }
    const asset = assetById.get(placement.assetId ?? "");
    if (asset?.interiorImageUrl) { setRoomId(placement.id); return; }
    setNotice("This building does not have an accessible interior yet.");
  };
  const activeRoomAsset = assetById.get(room?.assetId ?? "");
  const roomItems = (content?.interiorItems ?? []).filter(item => item.buildingId === roomId);
  const roomLights: HouseInteriorEffect[] = roomItems
    .filter(item => isHouseInteriorEffectType(item.effectType) || item.effectType === "colored_light")
    .map(item => ({
      id: item.id,
      type: (item.effectType === "colored_light" ? "lamp_light" : item.effectType) as HouseInteriorEffect["type"],
      x: item.xPct, y: item.yPct, size: item.size / 8.5,
    }));

  return <div data-testid="world-scene-player" className="relative h-full w-full overflow-hidden text-[#f3e3b7]"
    style={{ backgroundColor: worldGroundPalette(groundTheme).base }}>
    <div ref={viewportRef} data-testid="world-scene-player-viewport"
      className="absolute inset-0 overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={startCamera} onPointerMove={moveCamera}
      onPointerUp={endCamera} onPointerCancel={endCamera} onLostPointerCapture={endCamera}
      onWheel={event => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        changeZoom(zoom * (event.deltaY > 0 ? 0.94 : 1.06),
          { x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}>
      {snapshot && !room ? <>
        <PetParkTerrain groundTheme={worldGroundRenderTheme(groundTheme)}
          groundPalette={worldGroundPalette(groundTheme)}
          viewportWidth={size.width} viewportHeight={size.height}
          worldWidth={camera.worldWidth} worldHeight={camera.worldHeight}
          scale={camera.scale} panX={actualPan.x} panY={actualPan.y}
          dirtPatches={dirtPatches} stonePatches={stonePatches} waterPatches={waterPatches} />
        <div data-testid="world-scene-player-artwork" className="absolute left-0 top-0 pointer-events-none"
          style={{ width: camera.sceneWidth, height: camera.sceneHeight,
            transform: `translate(${actualPan.x}px, ${actualPan.y}px)` }}>
          {outdoor.map(p => {
            const x = p.xPct * camera.sceneWidth, y = p.yPct * camera.sceneHeight;
            const px = p.size * camera.scale;
            if (x + actualPan.x < -px || y + actualPan.y < -px ||
                x + actualPan.x > size.width + px || y + actualPan.y > size.height + px) return null;
            if (p.kind === "terrain" && isParkConnectedPath(p.effectType)) return null;
            const asset = assetById.get(p.assetId ?? "");
            const npc = npcById.get(p.npcId ?? "");
            const image = asset?.imageUrl ?? npc?.imageUrl;
            const interactive = p.kind === "building" || p.kind === "npc";
            const height = px * (p.kind === "terrain" ? parkTerrainHeightRatio(p.effectType) : 1);
            return <button type="button" key={p.id}
              data-testid={`world-player-placement-${p.id}`}
              aria-label={asset?.name ?? npc?.name ?? p.effectType ?? p.kind}
              className="absolute rounded-none border-none bg-transparent p-0"
              style={{
                pointerEvents: interactive ? "auto" : "none",
                touchAction: interactive ? "manipulation" : "none",
                left: x, top: y, width: px, height,
                transform: "translate(-50%, -50%)",
                zIndex: p.kind === "effect" ? 12000000 : p.kind === "terrain" ? 1 :
                  decorDrawDepth(p, parkDepthIndex({
                    kind: p.kind === "building" ? "building" : "item", yPct: p.yPct,
                    worldHeight: camera.worldHeight, size: p.size, contact: .9,
                  }), 2),
              }}
              onPointerDown={event => { if (interactive) event.stopPropagation(); }}
              onClick={event => { event.stopPropagation(); clickPlacement(p); }}>
              <span className="absolute inset-0 pointer-events-none"
                style={{ transform: p.flipped ? "scaleX(-1)" : undefined }}>
                {image && <img src={image} alt="" draggable={false}
                  className="absolute inset-0 h-full w-full object-contain" />}
                {(p.kind === "decor" || p.kind === "building") && asset && (
                  <WorldDecorEffects effects={p.decorEffects}
                    sunlightStrength={lighting.daylightStrength}
                    nightStrength={lighting.nightStrength} fireflyStrength={lighting.fireflyStrength}
                    lampStrength={lighting.lampStrength} reducedMotion={false} />
                )}
                {p.kind === "effect" && p.effectType && <span className="absolute inset-0"
                  style={{ opacity: parkOutdoorEffectOpacity(p.effectType,
                    lighting.nightStrength, lighting.fireflyStrength, lighting.lampStrength) }}>
                  <ParkEffectVisual type={p.effectType as ParkEffectType}
                    color={p.effectColor ?? undefined} reducedMotion={false}
                    fireflyStrength={lighting.fireflyStrength} sceneFireflies />
                </span>}
                {p.kind === "terrain" && !isParkConnectedPath(p.effectType) &&
                  isParkTerrainDetail(p.effectType) && (
                  <PetParkTerrainDetail type={p.effectType} />
                )}
              </span>
              {spokenMessages[p.id] && <span className="absolute bottom-full left-1/2 z-20 w-max max-w-40 -translate-x-1/2 rounded-xl border border-amber-400/50 bg-[#10271d]/95 px-3 py-2 text-xs text-amber-100">
                {spokenMessages[p.id]}
              </span>}
            </button>;
          })}
        </div>
        <div className="absolute inset-0 z-[14] pointer-events-none">
          <HomeOutdoorAtmosphereLayer parkLampFalloff
            darkness={parkSceneDarkness(lighting.nightStrength)}
            nightStrength={lighting.nightStrength} lampStrength={lighting.lampStrength}
            effects={exteriorLights} fireflies={exteriorFireflies}
            fireflyStrength={lighting.fireflyStrength}
            panX={actualPan.x} panY={actualPan.y}
            imgWidth={camera.sceneWidth} sceneHeight={camera.sceneHeight}
            transitionMs={lighting.transitionMs} zIndex={2} />
        </div>
      </> : snapshot && room && activeRoomAsset?.interiorImageUrl ? <div
        data-testid="world-player-interior" className="absolute inset-0 flex items-center justify-center">
        <div className="relative overflow-hidden" style={{
          width: "100%", maxWidth: size.height * 4 / 3, aspectRatio: "4/3",
        }}>
          <img src={activeRoomAsset.interiorImageUrl} alt="Building interior" draggable={false}
            className="absolute inset-0 h-full w-full object-fill" />
          {activeRoomAsset.nightInteriorImageUrl && lighting.nightInteriorArtworkActive &&
            <img src={activeRoomAsset.nightInteriorImageUrl} alt="" aria-hidden="true"
              className="absolute inset-0 h-full w-full object-fill" />}
          {roomItems.filter(item => item.kind === "decor").map(item => {
            const art = assetById.get(item.assetId ?? "");
            return art && <img key={item.id} alt="" src={art.imageUrl} draggable={false}
              className="absolute object-contain pointer-events-none"
              style={{ left: `${item.xPct * 100}%`, top: `${item.yPct * 100}%`,
                width: `${item.size / 8.5}%`, transform: `translate(-50%,-50%) ${item.flipped ? "scaleX(-1)" : ""}` }} />;
          })}
          <HomeInteriorDarknessLayer darkness={room.interiorDarkness}
            effects={roomLights} panX={0} imgWidth={size.width} sceneHeight={size.height}
            sunlightStrength={lighting.daylightStrength} transitionMs={0} zIndex={2}/>
        </div>
      </div> : null}
    </div>

    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] font-fantasy">
      <button type="button" data-testid="world-player-back" onClick={() => room ? setRoomId(null) : navigate("/map")}
        className="pointer-events-auto rounded-full border border-amber-500/50 bg-black/75 px-4 py-2 text-sm text-amber-200">
        ← {room ? "Outside" : "Map"}
      </button>
      <h1 className="min-w-0 truncate rounded-full bg-black/70 px-3 py-2 text-center text-sm font-semibold text-amber-200">
        {world?.defaultName ?? "World"}
      </h1>
      {!room ? <div className="pointer-events-auto flex gap-1">
        <button type="button" aria-label="Zoom out" data-testid="world-player-zoom-out"
          className="rounded-full border border-amber-500/50 bg-black/75 px-3 py-2 text-amber-200"
          onClick={() => changeZoom(zoom * .85)}>−</button>
        <button type="button" aria-label="Zoom in" data-testid="world-player-zoom-in"
          className="rounded-full border border-amber-500/50 bg-black/75 px-3 py-2 text-amber-200"
          onClick={() => changeZoom(zoom * 1.15)}>+</button>
      </div> : <span className="w-20"/>}
    </header>
    {notice && <div role="status" className="pointer-events-none absolute bottom-8 inset-x-4 z-40 rounded-xl border border-amber-400/60 bg-[#153426]/95 px-4 py-3 text-center text-sm text-amber-100">
      {notice}
    </div>}
    {(snapshotQuery.isLoading || snapshotQuery.isError) && <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#071b12] p-6 text-center text-amber-100">
      {snapshotQuery.isError ?
        <button onClick={() => navigate("/map")}>World could not load. Return to the map.</button> :
        "Entering the new world…"}
    </div>}
  </div>;
}
