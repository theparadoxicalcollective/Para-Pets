import { useEffect, useRef, useState, type PointerEventHandler, type ReactNode } from "react";
import { HomeInteriorEffectsLayer } from "@/components/HomeInteriorEffect";
import { observeHomeViewport } from "@/lib/homeCrossDevice";
import type { HouseInteriorEffect } from "@shared/housing";

type EffectPointerHandler = (event: React.PointerEvent<HTMLDivElement>, effect: HouseInteriorEffect) => void;

/** One actual-image coordinate surface for park visitors and administrators. */
export default function PetParkInteriorRoom({
  imageUrl, name, effects, children, selectedEffectId, editEffects = false,
  onEffectPointerDown, onEffectPointerMove, onEffectPointerUp, onEffectPointerCancel,
  onPointerMove, onPointerUp, onPointerCancel,
}: {
  imageUrl: string;
  name: string;
  effects: HouseInteriorEffect[];
  children?: ReactNode;
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

  return <div ref={canvasRef} className="relative mx-auto w-full max-w-3xl touch-none"
    data-testid="pet-park-interior-room" style={{ aspectRatio: aspect }}
    onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
    <img src={imageUrl} alt={`${name} interior`} draggable={false}
      className="absolute inset-0 h-full w-full select-none pointer-events-none"
      onLoad={event => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) setAspect(naturalWidth / naturalHeight);
      }} />
    <HomeInteriorEffectsLayer effects={effects} panX={0}
      imgWidth={dimensions.width} sceneHeight={dimensions.height}
      selectedId={selectedEffectId} interactive={editEffects}
      onEffectPointerDown={onEffectPointerDown} onEffectPointerMove={onEffectPointerMove}
      onEffectPointerUp={onEffectPointerUp} onEffectPointerCancel={onEffectPointerCancel} />
    {children}
  </div>;
}
