import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { DESIGN_H, getDesignW, getStageScale } from "@/lib/stage";
import {
  calculateWorldFitScale,
  clampWorldMapOffset,
} from "@/lib/worldViewport";

export const WORLD_MAP_PAN_THRESHOLD_PX = 4;
export const WORLD_MAP_POST_PAN_CLICK_MS = 80;

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    navigatorWithStandalone.standalone === true
    || window.matchMedia("(display-mode: standalone)").matches
  );
}

export function shouldFitFullWorldComposition(): boolean {
  if (typeof window === "undefined") return false;
  const viewport = window.visualViewport;
  return (
    (viewport?.width ?? window.innerWidth) < 768
    && !isStandaloneDisplay()
    && (viewport?.height ?? window.innerHeight) < DESIGN_H
  );
}

interface UseWorldViewportControllerOptions {
  worldId: string;
  mapWidth: number;
  defaultMapHeight: number;
  isLocationDragActive: () => boolean;
  clearStaleLocationDrag: () => void;
  isObjectDragActive: () => boolean;
}

export function useWorldViewportController({
  worldId,
  mapWidth,
  defaultMapHeight,
  isLocationDragActive,
  clearStaleLocationDrag,
  isObjectDragActive,
}: UseWorldViewportControllerOptions) {
  const vpRef = useRef<HTMLDivElement>(null);

  const initialFrameWidth = getDesignW();
  const initialFrameHeight = DESIGN_H;
  const frameWRef = useRef(initialFrameWidth);
  const frameHRef = useRef(initialFrameHeight);
  const [frameW, setFrameW] = useState(initialFrameWidth);
  const [frameH, setFrameH] = useState(initialFrameHeight);
  const [fitFullComposition, setFitFullComposition] = useState(
    () => typeof window !== "undefined" && shouldFitFullWorldComposition(),
  );

  const mapTransformRef = useRef({ x: 0, y: 0, scale: 1 });
  const [mapX, setMapX] = useState(0);
  const [mapY, setMapY] = useState(0);
  const [mapScale, setMapScale] = useState(1);
  const [mapH, setMapH] = useState(defaultMapHeight);
  const mapHRef = useRef(defaultMapHeight);

  const mapPanPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const mapPanStartRef = useRef<{
    x: number;
    y: number;
    mapX: number;
    mapY: number;
  } | null>(null);
  const mapPinchRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    mapX: number;
    mapY: number;
    scale: number;
  } | null>(null);
  const mapPanningRef = useRef(false);
  const mapJustPannedRef = useRef(false);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth || getDesignW();
      const height = el.clientHeight || DESIGN_H;
      setFitFullComposition(shouldFitFullWorldComposition());
      frameWRef.current = width;
      frameHRef.current = height;
      setFrameW((previous) => (previous !== width ? width : previous));
      setFrameH((previous) => (previous !== height ? height : previous));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("orientationchange", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  useEffect(() => {
    mapHRef.current = defaultMapHeight;
    setMapH(defaultMapHeight);
  }, [defaultMapHeight, worldId]);

  const setAuthoredMapHeight = useCallback((height: number) => {
    mapHRef.current = height;
    setMapH(height);
  }, []);

  const clampTransform = useCallback((x: number, y: number, scale: number) => {
    return clampWorldMapOffset(
      x,
      y,
      scale,
      frameWRef.current,
      frameHRef.current,
      mapHRef.current,
      mapWidth,
    );
  }, [mapWidth]);

  const applyMapTransform = useCallback((x: number, y: number, _scale: number) => {
    const fitScale = calculateWorldFitScale(
      frameWRef.current,
      frameHRef.current,
      mapHRef.current,
      fitFullComposition,
      mapWidth,
    );
    const { x: clampedX, y: clampedY } = clampTransform(x, y, fitScale);
    mapTransformRef.current = { x: clampedX, y: clampedY, scale: fitScale };
    setMapX(clampedX);
    setMapY(clampedY);
    setMapScale(fitScale);
  }, [clampTransform, fitFullComposition, mapWidth]);

  useEffect(() => {
    const fitScale = calculateWorldFitScale(
      frameWRef.current,
      frameHRef.current,
      mapHRef.current,
      fitFullComposition,
      mapWidth,
    );
    const initialX = (frameWRef.current - mapWidth * fitScale) / 2;
    const initialY = (frameHRef.current - mapHRef.current * fitScale) / 2;
    mapTransformRef.current = { x: initialX, y: initialY, scale: fitScale };
    setMapX(initialX);
    setMapY(initialY);
    setMapScale(fitScale);
  }, [fitFullComposition, frameH, frameW, mapH, mapWidth, worldId]);

  const handleVpPointerDown = useCallback((event: ReactPointerEvent) => {
    // Preserve the stale-drag recovery used by the shared admin location
    // controller before beginning a world pan.
    if (isLocationDragActive() && !mapPanPointersRef.current.size) {
      clearStaleLocationDrag();
    }
    if (isLocationDragActive() || isObjectDragActive()) return;

    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {}

    mapPanPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const pointers = Array.from(mapPanPointersRef.current.values());
    if (pointers.length === 1) {
      mapPanStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        mapX: mapTransformRef.current.x,
        mapY: mapTransformRef.current.y,
      };
      mapPinchRef.current = null;
      mapPanningRef.current = false;
    }
  }, [clearStaleLocationDrag, isLocationDragActive, isObjectDragActive]);

  const handleVpPointerMove = useCallback((event: ReactPointerEvent) => {
    if (isLocationDragActive() || isObjectDragActive()) return;
    if (!mapPanPointersRef.current.has(event.pointerId)) return;

    mapPanPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const pointers = Array.from(mapPanPointersRef.current.values());
    if (pointers.length === 1 && mapPanStartRef.current) {
      const stageScale = getStageScale();
      const dx = (event.clientX - mapPanStartRef.current.x) / stageScale;
      const dy = (event.clientY - mapPanStartRef.current.y) / stageScale;

      if (
        !mapPanningRef.current
        && (
          Math.abs(dx) > WORLD_MAP_PAN_THRESHOLD_PX
          || Math.abs(dy) > WORLD_MAP_PAN_THRESHOLD_PX
        )
      ) {
        mapPanningRef.current = true;
      }

      if (mapPanningRef.current) {
        applyMapTransform(
          mapPanStartRef.current.mapX + dx,
          mapPanStartRef.current.mapY + dy,
          mapTransformRef.current.scale,
        );
      }
    }
  }, [applyMapTransform, isLocationDragActive, isObjectDragActive]);

  const handleVpPointerUp = useCallback((event: ReactPointerEvent) => {
    mapPanPointersRef.current.delete(event.pointerId);
    const remaining = mapPanPointersRef.current.size;

    if (remaining === 0) {
      if (mapPanningRef.current) {
        mapJustPannedRef.current = true;
        setTimeout(() => {
          mapJustPannedRef.current = false;
        }, WORLD_MAP_POST_PAN_CLICK_MS);
      }
      mapPanStartRef.current = null;
      mapPanningRef.current = false;
      mapPinchRef.current = null;
      return;
    }

    if (remaining === 1) {
      mapPinchRef.current = null;
      const [pointer] = Array.from(mapPanPointersRef.current.values());
      mapPanStartRef.current = {
        x: pointer.x,
        y: pointer.y,
        mapX: mapTransformRef.current.x,
        mapY: mapTransformRef.current.y,
      };
      mapPanningRef.current = false;
    }
  }, []);

  const handleVpWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;

    el.addEventListener("wheel", handleVpWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleVpWheel);
  }, [handleVpWheel]);

  return {
    vpRef,
    frameW,
    frameH,
    mapH,
    mapX,
    mapY,
    mapScale,
    mapTransformRef,
    mapJustPannedRef,
    applyMapTransform,
    setAuthoredMapHeight,
    handleVpPointerDown,
    handleVpPointerMove,
    handleVpPointerUp,
  };
}
