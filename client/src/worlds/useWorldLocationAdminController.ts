import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { WorldLocationData } from "@/components/world/WorldLocations";

export const WORLD_LOCATION_DRAG_THRESHOLD_PX = 3;
export const WORLD_LOCATION_MIN_PERCENT = -10;
export const WORLD_LOCATION_MAX_PERCENT = 110;
export const WORLD_LOCATION_POST_DRAG_CLICK_MS = 350;
export const WORLD_LOCATION_ADMIN_SECOND_TAP_MS = 400;
export const WORLD_LOCATION_DRAG_RESET_MS = 300;

export function clampWorldLocationAdminPercent(value: number): number {
  return Math.max(
    WORLD_LOCATION_MIN_PERCENT,
    Math.min(WORLD_LOCATION_MAX_PERCENT, value),
  );
}

export function shouldSuppressWorldLocationClick(
  didDrag: boolean,
  lastDragEndAt: number,
  now: number,
): boolean {
  return didDrag || now - lastDragEndAt < WORLD_LOCATION_POST_DRAG_CLICK_MS;
}

interface WorldLocationPositionUpdate {
  locationId: string;
  posX: number;
  posY: number;
}

interface UseWorldLocationAdminControllerOptions {
  isAdmin: boolean;
  areaRef: RefObject<HTMLDivElement | null>;
  onCommitPosition: (update: WorldLocationPositionUpdate) => void;
}

export function useWorldLocationAdminController({
  isAdmin,
  areaRef,
  onCommitPosition,
}: UseWorldLocationAdminControllerOptions) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const selectedLocationRef = useRef<string | null>(null);

  const dragRef = useRef<{
    locId: string;
    startCanvasX: number;
    startY: number;
    origPosX: number;
    origPosY: number;
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ id: string; x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const lastDragEndTimeRef = useRef(0);

  const adminTapRef = useRef<{
    id: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    selectedLocationRef.current = selectedLocationId;
  }, [selectedLocationId]);

  useEffect(() => {
    return () => {
      if (adminTapRef.current) clearTimeout(adminTapRef.current.timer);
    };
  }, []);

  const clearPendingAdminTap = useCallback(() => {
    if (!adminTapRef.current) return;
    clearTimeout(adminTapRef.current.timer);
    adminTapRef.current = null;
  }, []);

  const clearLocationSelection = useCallback(() => {
    clearPendingAdminTap();
    setSelectedLocationId(null);
  }, [clearPendingAdminTap]);

  const handlePointerDown = useCallback((
    event: ReactPointerEvent,
    location: WorldLocationData,
  ) => {
    if (!isAdmin) return;

    // Keep location dragging separate from the underlying map-pan gesture.
    event.stopPropagation();

    // Existing admin behavior: a location must be selected first before it can
    // be dragged. The ref avoids a stale selected-id closure during touch input.
    if (selectedLocationRef.current !== location.id) return;

    // Preserve click delivery so a selected location can still be tapped again
    // to open it.
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    didDragRef.current = false;

    const rect = areaRef.current
      ? areaRef.current.getBoundingClientRect()
      : { left: 0 };

    dragRef.current = {
      locId: location.id,
      startCanvasX: event.clientX - rect.left,
      startY: event.clientY,
      origPosX: location.posX,
      origPosY: location.posY,
    };
  }, [areaRef, isAdmin]);

  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    if (!dragRef.current || !areaRef.current) return;

    event.preventDefault();

    const rect = areaRef.current.getBoundingClientRect();
    const currentCanvasX = event.clientX - rect.left;
    const dx = currentCanvasX - dragRef.current.startCanvasX;
    const dy = event.clientY - dragRef.current.startY;

    if (Math.abs(dx) > WORLD_LOCATION_DRAG_THRESHOLD_PX || Math.abs(dy) > WORLD_LOCATION_DRAG_THRESHOLD_PX) {
      didDragRef.current = true;
    }

    const pxPerPercX = rect.width / 100;
    const pxPerPercY = rect.height / 100;
    const newX = clampWorldLocationAdminPercent(
      dragRef.current.origPosX + dx / pxPerPercX,
    );
    const newY = clampWorldLocationAdminPercent(
      dragRef.current.origPosY + dy / pxPerPercY,
    );

    setDragPosition({
      id: dragRef.current.locId,
      x: newX,
      y: newY,
    });
  }, [areaRef]);

  const handlePointerUp = useCallback((event: ReactPointerEvent) => {
    if (!dragRef.current) return;

    const drag = dragRef.current;
    dragRef.current = null;

    if (didDragRef.current && dragPosition) {
      // Preserve the existing mobile/desktop click-suppression window after a
      // drag so pointer-up cannot immediately reopen the location.
      lastDragEndTimeRef.current = Date.now();
      event.preventDefault();
      clearPendingAdminTap();
      onCommitPosition({
        locationId: drag.locId,
        posX: dragPosition.x,
        posY: dragPosition.y,
      });
      setTimeout(() => {
        didDragRef.current = false;
      }, WORLD_LOCATION_DRAG_RESET_MS);
    } else {
      didDragRef.current = false;
    }

    setDragPosition(null);
  }, [clearPendingAdminTap, dragPosition, onCommitPosition]);

  const cancelLocationDrag = useCallback(() => {
    dragRef.current = null;
    didDragRef.current = false;
    setDragPosition(null);
  }, []);

  const clearStaleLocationDrag = useCallback(() => {
    dragRef.current = null;
    setDragPosition(null);
  }, []);

  const isLocationDragActive = useCallback(() => dragRef.current !== null, []);

  const shouldIgnoreLocationClick = useCallback(() => (
    shouldSuppressWorldLocationClick(
      didDragRef.current,
      lastDragEndTimeRef.current,
      Date.now(),
    )
  ), []);

  const handleAdminLocationClick = useCallback((
    locationId: string,
    onOpen: () => void,
  ): boolean => {
    if (!isAdmin) return false;

    if (adminTapRef.current?.id === locationId) {
      clearPendingAdminTap();
      setSelectedLocationId(null);
      onOpen();
      return true;
    }

    clearPendingAdminTap();
    setSelectedLocationId(locationId);
    const timer = setTimeout(() => {
      adminTapRef.current = null;
    }, WORLD_LOCATION_ADMIN_SECOND_TAP_MS);
    adminTapRef.current = { id: locationId, timer };
    return true;
  }, [clearPendingAdminTap, isAdmin]);

  return {
    selectedLocationId,
    draggingLocationId: dragRef.current?.locId ?? null,
    dragPosition,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    cancelLocationDrag,
    clearStaleLocationDrag,
    isLocationDragActive,
    shouldIgnoreLocationClick,
    handleAdminLocationClick,
    clearLocationSelection,
  };
}
