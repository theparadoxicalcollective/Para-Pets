import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { WORLD_PLACEMENT_BOUNDS, clampWorldPlacementPercent, clientPointToWorldPlacementPercent, dragWorldPlacementPercent, pointInWorldPlacementSurface } from "@/worlds/worldAuthoredPlacement";

export const WORLD_DECOR_DRAG_THRESHOLD_PX = 3;
export const WORLD_DECOR_MIN_PERCENT = WORLD_PLACEMENT_BOUNDS.decor.min;
export const WORLD_DECOR_MAX_PERCENT = WORLD_PLACEMENT_BOUNDS.decor.max;

export function clampWorldDecorAdminPercent(value: number): number {
  return clampWorldPlacementPercent(value, WORLD_PLACEMENT_BOUNDS.decor);
}

export interface WorldDecorAdminItem {
  id: string;
  name: string;
  imageUrl: string;
}

export interface WorldDecorAdminPlacement {
  id: string;
  posX: number;
  posY: number;
}

interface WorldDecorPlacementUpdate {
  id: string;
  posX: number;
  posY: number;
}

interface WorldDecorPlacementCreate {
  item: WorldDecorAdminItem;
  posX: number;
  posY: number;
}

interface UseWorldDecorAdminControllerOptions {
  isAdmin: boolean;
  areaRef: RefObject<HTMLDivElement | null>;
  onCommitPlacement: (update: WorldDecorPlacementUpdate) => void;
  onCreatePlacement: (create: WorldDecorPlacementCreate) => void;
}

export function useWorldDecorAdminController({
  isAdmin,
  areaRef,
  onCommitPlacement,
  onCreatePlacement,
}: UseWorldDecorAdminControllerOptions) {
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ id: string; x: number; y: number } | null>(null);
  const [panelDragGhost, setPanelDragGhost] = useState<{
    clientX: number;
    clientY: number;
    item: WorldDecorAdminItem;
  } | null>(null);

  const dragRef = useRef<{
    placementId: string;
    startX: number;
    startY: number;
    origPosX: number;
    origPosY: number;
  } | null>(null);

  const didDragRef = useRef(false);
  const panelDragRef = useRef<{ item: WorldDecorAdminItem } | null>(null);

  useEffect(() => {
    if (!panelDragGhost) return;

    const onMove = (event: PointerEvent) => {
      if (!panelDragRef.current) return;
      setPanelDragGhost(previous =>
        previous
          ? { ...previous, clientX: event.clientX, clientY: event.clientY }
          : null,
      );
    };

    const onUp = (event: PointerEvent) => {
      if (!panelDragRef.current) return;

      const item = panelDragRef.current.item;
      panelDragRef.current = null;
      setPanelDragGhost(null);

      const area = areaRef.current;
      if (!area) return;

      const rect = area.getBoundingClientRect();
      if (!pointInWorldPlacementSurface(event.clientX, event.clientY, rect)) return;
      const point = clientPointToWorldPlacementPercent(
        event.clientX,
        event.clientY,
        rect,
        WORLD_PLACEMENT_BOUNDS.decor,
      );
      if (!point) return;

      onCreatePlacement({ item, posX: point.x, posY: point.y });
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [!!panelDragGhost, areaRef, onCreatePlacement]);

  const startPanelDrag = useCallback((
    event: ReactPointerEvent,
    item: WorldDecorAdminItem,
  ) => {
    if (!isAdmin) return;
    event.preventDefault();
    panelDragRef.current = { item };
    setPanelDragGhost({
      clientX: event.clientX,
      clientY: event.clientY,
      item,
    });
  }, [isAdmin]);

  const handlePointerDown = useCallback((
    event: ReactPointerEvent,
    placement: WorldDecorAdminPlacement,
  ) => {
    if (!isAdmin) return;

    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);

    didDragRef.current = false;
    dragRef.current = {
      placementId: placement.id,
      startX: event.clientX,
      startY: event.clientY,
      origPosX: placement.posX,
      origPosY: placement.posY,
    };
  }, [isAdmin]);

  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    if (!dragRef.current || !areaRef.current) return;

    event.preventDefault();

    const rect = areaRef.current.getBoundingClientRect();
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;

    if (
      Math.abs(dx) > WORLD_DECOR_DRAG_THRESHOLD_PX
      || Math.abs(dy) > WORLD_DECOR_DRAG_THRESHOLD_PX
    ) {
      didDragRef.current = true;
    }

    const next = dragWorldPlacementPercent(
      { x: dragRef.current.origPosX, y: dragRef.current.origPosY },
      dx,
      dy,
      rect.width,
      rect.height,
      WORLD_PLACEMENT_BOUNDS.decor,
    );

    setDragPosition({ id: dragRef.current.placementId, x: next.x, y: next.y });
  }, [areaRef]);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return;

    const drag = dragRef.current;
    dragRef.current = null;

    if (didDragRef.current && dragPosition) {
      onCommitPlacement({
        id: drag.placementId,
        posX: dragPosition.x,
        posY: dragPosition.y,
      });
    } else {
      setSelectedPlacementId(previous =>
        previous === drag.placementId ? null : drag.placementId,
      );
    }

    didDragRef.current = false;
    setDragPosition(null);
  }, [dragPosition, onCommitPlacement]);

  const cancelPlacementDrag = useCallback(() => {
    dragRef.current = null;
    didDragRef.current = false;
    setDragPosition(null);
  }, []);

  return {
    selectedPlacementId,
    setSelectedPlacementId,
    dragPosition,
    panelDragGhost,
    startPanelDrag,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    cancelPlacementDrag,
  };
}
