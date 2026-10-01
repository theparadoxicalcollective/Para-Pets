import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export const WORLD_FISH_BARREL_DRAG_THRESHOLD_PX = 3;
export const WORLD_FISH_BARREL_MIN_PERCENT = 0;
export const WORLD_FISH_BARREL_MAX_PERCENT = 100;

export function clampWorldFishBarrelAdminPercent(value: number): number {
  return Math.max(
    WORLD_FISH_BARREL_MIN_PERCENT,
    Math.min(WORLD_FISH_BARREL_MAX_PERCENT, value),
  );
}

export interface WorldFishBarrelAdminData {
  posX: number;
  posY: number;
}

interface WorldFishBarrelPositionUpdate {
  posX: number;
  posY: number;
}

interface UseWorldFishBarrelAdminControllerOptions {
  isAdmin: boolean;
  barrel: WorldFishBarrelAdminData | null | undefined;
  areaRef: RefObject<HTMLDivElement | null>;
  onCommitPosition: (update: WorldFishBarrelPositionUpdate) => void;
}

export function useWorldFishBarrelAdminController({
  isAdmin,
  barrel,
  areaRef,
  onCommitPosition,
}: UseWorldFishBarrelAdminControllerOptions) {
  const [selected, setSelected] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origPosX: number;
    origPosY: number;
  } | null>(null);

  const didDragRef = useRef(false);

  const handlePointerDown = useCallback((event: ReactPointerEvent) => {
    if (!isAdmin || !barrel) return;

    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    didDragRef.current = false;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origPosX: barrel.posX,
      origPosY: barrel.posY,
    };
  }, [isAdmin, barrel]);

  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    if (!dragRef.current || !areaRef.current) return;

    event.preventDefault();

    const rect = areaRef.current.getBoundingClientRect();
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;

    if (
      Math.abs(dx) > WORLD_FISH_BARREL_DRAG_THRESHOLD_PX
      || Math.abs(dy) > WORLD_FISH_BARREL_DRAG_THRESHOLD_PX
    ) {
      didDragRef.current = true;
    }

    setDragPosition({
      x: clampWorldFishBarrelAdminPercent(
        dragRef.current.origPosX + (dx / rect.width) * 100,
      ),
      y: clampWorldFishBarrelAdminPercent(
        dragRef.current.origPosY + (dy / rect.height) * 100,
      ),
    });
  }, [areaRef]);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return;

    dragRef.current = null;

    if (didDragRef.current && dragPosition) {
      onCommitPosition({
        posX: dragPosition.x,
        posY: dragPosition.y,
      });
    }

    didDragRef.current = false;
    setDragPosition(null);
  }, [dragPosition, onCommitPosition]);

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    didDragRef.current = false;
    setDragPosition(null);
  }, []);

  return {
    selected,
    setSelected,
    dragPosition,
    didDragRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    cancelDrag,
  };
}
