import { useEffect, useRef, useState, type PointerEventHandler, type ReactNode } from "react";
import { HomeInteriorEffectsLayer, HomeInteriorExitSparkle } from "@/components/HomeInteriorEffect";
import { observeHomeViewport, centeredHomeCameraPanX, clampHomeCameraPanX, homeCameraPointerDeltaX, safeSetPointerCapture, HOME_TOUCH_SURFACE_STYLE } from "@/lib/homeCrossDevice";
import type { HouseInteriorEffect } from "@shared/housing";
import { isParkRoomEffect, type ParkInteriorEffect, type ParkRoomEffect } from "@shared/petParkRooms";

type EffectPointerHandler = (event: React.PointerEvent<HTMLDivElement>, effect: ParkInteriorEffect) => void;

/** One actual-image coordinate surface for park visitors and administrators. */
export default function PetParkInteriorRoom({
  imageUrl, name, effects, children, selectedEffectId, editEffects = false, expanded = false,
  onEffectPointerDown, onEffectPointerMove, onEffectPointerUp, onEffectPointerCancel,
  onPointerMove, onPointerUp, onPointerCancel, offEffectIds, onToggleEffect, onOpenRoom,
}: {
  imageUrl: string;
  name: string;
  effects: ParkInteriorEffect[];
  onOpenRoom?: (room: ParkRoomEffect) => void;
  /** Use measured image geometry for pets resting on admin-sized indoor spots. */
  children?: ReactNode | ((layout: { imageWidth: number; sceneHeight: number }) => ReactNode);
  expanded?: boolean;
  offEffectIds?: ReadonlySet<string>;
  onToggleEffect?: (effect: HouseInteriorEffect) => void;
  selectedEffectId?: string | null;
  editEffects?: boolean;
  onEffectPointerDown?: EffectPointerHandler;
  onEffectPointerMove?: EffectPointerHandler;
  onEffectPointerUp?: EffectPointerHandler;
  onEffectPointerCancel?: EffectPointerHandler;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [panX, setPanX] = useState<number | null>(null);
  const drag = useRef<{ id: number; startX: number; panX: number } | null>(null);
  const imageWidth = expanded ? dimensions.height * aspect : dimensions.width;
  const cameraX = expanded ? clampHomeCameraPanX(panX ?? centeredHomeCameraPanX(dimensions.width, imageWidth), dimensions.width, imageWidth) : 0;

  useEffect(() => { setAspect(4 / 3); }, [imageUrl]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions(previous => previous.width === rect.width && previous.height === rect.height
          ? previous : { width: rect.width, height: rect.height });
      }
    };
    return observeHomeViewport(element, measure, "artwork-scene");
  }, []);

  return <div ref={canvasRef} className={expanded ? "relative h-full w-full overflow-hidden" : "relative mx-auto w-full max-w-3xl touch-none"}
    data-testid="pet-park-interior-room" style={expanded ? HOME_TOUCH_SURFACE_STYLE : { aspectRatio: aspect }}
    onPointerDown={event => {
      if (!expanded || event.target !== event.currentTarget || !event.isPrimary) return;
      drag.current = { id: event.pointerId, startX: event.clientX, panX: cameraX };
      safeSetPointerCapture(event.currentTarget, event.pointerId);
    }}
    onPointerMove={event => {
      if (drag.current?.id !== event.pointerId) return;
      setPanX(clampHomeCameraPanX(drag.current.panX + homeCameraPointerDeltaX(event.clientX - drag.current.startX, canvasRef.current), dimensions.width, imageWidth));
    }}
    onPointerUp={event => { if (drag.current?.id === event.pointerId) drag.current = null; }}
    onPointerCancel={event => { if (drag.current?.id === event.pointerId) drag.current = null; }}>
    <div data-park-interior-artwork className={expanded ? "absolute top-0 h-full touch-none" : "absolute inset-0"}
      style={expanded ? { left: cameraX, width: imageWidth } : undefined}
      onClickCapture={event => {
        if (editEffects || !onToggleEffect) return;
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-player-toggle-effect-id]");
        const effect = effects.find(item => item.id === target?.dataset.playerToggleEffectId);
        if (!effect) return;
        event.preventDefault();
        event.stopPropagation();
        onToggleEffect(effect);
      }}
      onPointerDown={event => {
        if (!expanded || !event.isPrimary || (event.target as HTMLElement).closest("button, [data-park-pet], [data-player-toggle-effect-id]")) return;
        drag.current = { id: event.pointerId, startX: event.clientX, panX: cameraX };
        safeSetPointerCapture(event.currentTarget, event.pointerId);
      }}
      onPointerMove={event => {
        if (drag.current?.id === event.pointerId) {
          setPanX(clampHomeCameraPanX(drag.current.panX + homeCameraPointerDeltaX(event.clientX - drag.current.startX, canvasRef.current), dimensions.width, imageWidth));
        } else onPointerMove?.(event);
      }}
      onPointerUp={event => { if (drag.current?.id === event.pointerId) drag.current = null; else onPointerUp?.(event); }}
      onPointerCancel={event => { if (drag.current?.id === event.pointerId) drag.current = null; else onPointerCancel?.(event); }}>
    <img src={imageUrl} alt={`${name} interior`} draggable={false}
      className="absolute inset-0 h-full w-full select-none pointer-events-none"
      onLoad={event => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) setAspect(naturalWidth / naturalHeight);
      }} />
    <HomeInteriorEffectsLayer effects={effects.filter((effect): effect is HouseInteriorEffect => !isParkRoomEffect(effect))} panX={0}
      imgWidth={imageWidth} sceneHeight={dimensions.height}
      offEffectIds={offEffectIds} onToggleEffect={onToggleEffect}
      selectedId={selectedEffectId} interactive={editEffects}
      onEffectPointerDown={onEffectPointerDown} onEffectPointerMove={onEffectPointerMove}
      onEffectPointerUp={onEffectPointerUp} onEffectPointerCancel={onEffectPointerCancel} />
    {effects.filter(isParkRoomEffect).map(room => {
      const markerSize = Math.max(48, dimensions.height * room.size / 100);
      return <div key={room.id} data-testid={`park-room-portal-${room.id}`}
        className="absolute flex items-center justify-center"
        style={{
          left: room.x * imageWidth, top: room.y * dimensions.height,
          width: markerSize, height: markerSize, transform: "translate(-50%, -50%)",
          zIndex: 12, pointerEvents: "auto",
        }}>
        <button type="button" aria-label={editEffects ? `Edit room ${room.name}` : `Open ${room.name}`}
          data-park-room-portal={room.id} disabled={!editEffects && !room.imageUrl}
          title={room.name}
          className={`relative flex h-full w-full touch-none items-center justify-center rounded-full border border-amber-300/40 bg-[#123828]/15 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40 ${selectedEffectId === room.id ? "outline outline-2 outline-amber-300" : ""}`}
          onPointerDown={editEffects ? event => onEffectPointerDown?.(event as unknown as React.PointerEvent<HTMLDivElement>, room) : undefined}
          onPointerMove={editEffects ? event => onEffectPointerMove?.(event as unknown as React.PointerEvent<HTMLDivElement>, room) : undefined}
          onPointerUp={editEffects ? event => onEffectPointerUp?.(event as unknown as React.PointerEvent<HTMLDivElement>, room) : undefined}
          onPointerCancel={editEffects ? event => onEffectPointerCancel?.(event as unknown as React.PointerEvent<HTMLDivElement>, room) : undefined}
          onLostPointerCapture={editEffects ? event => onEffectPointerCancel?.(event as unknown as React.PointerEvent<HTMLDivElement>, room) : undefined}
          onClick={event => { event.stopPropagation(); if (!editEffects) onOpenRoom?.(room); }}>
          <HomeInteriorExitSparkle />
        </button>
        {editEffects && <span className="pointer-events-none absolute top-[90%] rounded bg-black/75 px-1 text-[10px] text-amber-100">{room.name}</span>}
      </div>;
    })}
    {typeof children === "function" ? children({ imageWidth, sceneHeight: dimensions.height }) : children}
    </div>
  </div>;
}
