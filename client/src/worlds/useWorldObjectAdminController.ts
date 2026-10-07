import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { WORLD_PLACEMENT_BOUNDS, clampWorldPlacementPercent, dragWorldPlacementPercent } from "@/worlds/worldAuthoredPlacement";

export const WORLD_OBJECT_DRAG_THRESHOLD_PX = 3;
export const WORLD_OBJECT_MIN_PERCENT = WORLD_PLACEMENT_BOUNDS.object.min;
export const WORLD_OBJECT_MAX_PERCENT = WORLD_PLACEMENT_BOUNDS.object.max;

export function clampWorldObjectAdminPercent(value: number): number {
  return clampWorldPlacementPercent(value, WORLD_PLACEMENT_BOUNDS.object);
}

export interface WorldObjectAdminData {
  id: string;
  posX: number;
  posY: number;
}

interface WorldObjectPositionUpdate {
  objectId: string;
  posX: number;
  posY: number;
}

interface UseWorldObjectAdminControllerOptions {
  isAdmin: boolean;
  locationViewRef: RefObject<HTMLDivElement | null>;
  onCommitPosition: (update: WorldObjectPositionUpdate) => void;
}

export function useWorldObjectAdminController({
  isAdmin,
  locationViewRef,
  onCommitPosition,
}: UseWorldObjectAdminControllerOptions) {
  const [dragPosition, setDragPosition] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const dragRef = useRef<{
    objId: string;
    startX: number;
    startY: number;
    origPosX: number;
    origPosY: number;
  } | null>(null);

  const didDragRef = useRef(false);

  const handlePointerDown = useCallback((
    event: ReactPointerEvent,
    object: WorldObjectAdminData,
  ) => {
    if (!isAdmin) return;

    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);

    didDragRef.current = false;
    dragRef.current = {
      objId: object.id,
      startX: event.clientX,
      startY: event.clientY,
      origPosX: object.posX,
      origPosY: object.posY,
    };
  }, [isAdmin]);

  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    if (!dragRef.current || !locationViewRef.current) return;

    event.preventDefault();

    const rect = locationViewRef.current.getBoundingClientRect();
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;

    if (
      Math.abs(dx) > WORLD_OBJECT_DRAG_THRESHOLD_PX
      || Math.abs(dy) > WORLD_OBJECT_DRAG_THRESHOLD_PX
    ) {
      didDragRef.current = true;
    }

    const next = dragWorldPlacementPercent(
      { x: dragRef.current.origPosX, y: dragRef.current.origPosY },
      dx,
      dy,
      rect.width,
      rect.height,
      WORLD_PLACEMENT_BOUNDS.object,
    );
    const newX = next.x;
    const newY = next.y;

    setDragPosition({
      id: dragRef.current.objId,
      x: newX,
      y: newY,
    });
  }, [locationViewRef]);

  const handlePointerUp = useCallback((event: ReactPointerEvent) => {
    if (!dragRef.current) return;

    event.preventDefault();

    const drag = dragRef.current;
    dragRef.current = null;

    if (didDragRef.current && dragPosition) {
      onCommitPosition({
        objectId: drag.objId,
        posX: Math.round(dragPosition.x),
        posY: Math.round(dragPosition.y),
      });
    }

    setDragPosition(null);
  }, [dragPosition, onCommitPosition]);

  const isObjectDragActive = useCallback(() => dragRef.current !== null, []);

  return {
    dragPosition,
    draggingObjectId: dragRef.current?.objId ?? null,
    didDragRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    isObjectDragActive,
  };
}
