import { useRef, useState, type PointerEvent } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import { PARK_TERRAIN_DETAIL_OPTIONS, type ParkTerrainDetailType } from "@shared/petParkTerrainDetails";
import { parkBrushWorldPoint, parkExtendBrushStroke, PARK_BRUSH_MAX_STAMPS, type ParkBrushPoint } from "@/lib/petParkTerrainBrush";

type Props = {
  viewportWidth: number; viewportHeight: number;
  sceneWidth: number; sceneHeight: number;
  worldWidth: number; worldHeight: number;
  panX: number; panY: number; scale: number;
  raised: boolean; onSaved: () => void; onExit: () => void;
};

/** The only painting surface is an overlay on the EXISTING Pet Park camera.
 * No extra map, camera state, coordinate migration or new storage model. */
export default function PetParkTerrainBrush(props: Props) {
  const { toast } = useToast();
  const surface = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [type, setType] = useState<ParkTerrainDetailType>("dirt_path");
  const [size, setSize] = useState(200);
  const [draft, setDraft] = useState<ParkBrushPoint[]>([]);
  const [saving, setSaving] = useState(false);

  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = surface.current!.getBoundingClientRect();
    return parkBrushWorldPoint(event.clientX, event.clientY, rect,
      { width: props.viewportWidth, height: props.viewportHeight },
      { x: props.panX, y: props.panY },
      { width: props.sceneWidth, height: props.sceneHeight });
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!event.isPrimary) {
      activePointer.current = null;
      setDraft([]);
      return;
    }
    if (saving || draft.length || activePointer.current !== null) return;
    activePointer.current = event.pointerId;
    setDraft([pointAt(event)]);
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activePointer.current !== event.pointerId) return;
    const next = pointAt(event);
    setDraft(previous => parkExtendBrushStroke(previous, next,
      { width: props.worldWidth, height: props.worldHeight }, size));
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activePointer.current === event.pointerId) activePointer.current = null;
  };
  const cancel = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activePointer.current === event.pointerId) {
      activePointer.current = null;
      setDraft([]);
    }
  };
  const save = async () => {
    if (saving || !draft.length || activePointer.current !== null) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/admin/pet-park/terrain-strokes",
        { type, size, points: draft });
      props.onSaved();
      setDraft([]);
    } catch (error) {
      toast({ title: "Could not save terrain stroke", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return <div className="pointer-events-none absolute inset-0 z-10" data-testid="pet-park-brush-mode">
    <div ref={surface} aria-label="Paint Pet Park ground" data-testid="pet-park-terrain-brush-surface"
      className="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
      onPointerDown={start} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={cancel} onLostPointerCapture={cancel} />
    {draft.map((point, i) => <div key={i} className="pointer-events-none absolute opacity-80"
      style={{
        left: point.xPct * props.sceneWidth + props.panX,
        top: point.yPct * props.sceneHeight + props.panY,
        width: size * props.scale, height: size * props.scale * 0.54,
        transform: "translate(-50%, -50%)",
      }}><PetParkTerrainDetail type={type} /></div>)}
    <div aria-label="Pet Park terrain brush controls"
      className={`pointer-events-auto absolute inset-x-3 z-20 mx-auto flex max-w-sm flex-col gap-2 overflow-y-auto rounded-xl border border-amber-600 bg-[#10271e]/95 p-3 shadow-xl max-h-[34dvh] ${props.raised ? "bottom-[44%]" : "bottom-[max(12px,env(safe-area-inset-bottom))]"}`}
      onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">Paint ground · {draft.length}/{PARK_BRUSH_MAX_STAMPS} patches</strong>
        <button type="button" disabled={saving || draft.length > 0} onClick={props.onExit} className="rounded bg-slate-700 px-3 py-2 text-xs">Finish</button>
      </div>
      <p className="text-xs text-amber-100/75">Drag to preview terrain. Save or discard a stroke before drawing another.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {PARK_TERRAIN_DETAIL_OPTIONS.map(option => <button key={option.type} type="button"
          disabled={!!draft.length || saving} aria-pressed={type === option.type}
          onClick={() => { setType(option.type); setSize(option.size); }}
          className={`rounded-lg border px-2 py-2 text-xs disabled:opacity-60 ${type === option.type ? "border-amber-300 bg-amber-800/50" : "border-amber-700 bg-black/30"}`}>{option.label}</button>)}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span>Brush size</span>
        <button type="button" aria-label="Decrease terrain brush size" disabled={!!draft.length || saving}
          onClick={() => setSize(v => Math.max(60, v - 25))} className="rounded bg-amber-800 px-3 py-2">−</button>
        <span className="tabular-nums">{size}</span>
        <button type="button" aria-label="Increase terrain brush size" disabled={!!draft.length || saving}
          onClick={() => setSize(v => Math.min(400, v + 25))} className="rounded bg-amber-800 px-3 py-2">+</button>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!draft.length || saving} onClick={() => void save()}
          className="flex-1 rounded bg-amber-700 px-3 py-2 text-sm disabled:opacity-40">{saving ? "Saving…" : "Save stroke"}</button>
        <button type="button" disabled={!draft.length || saving} onClick={() => setDraft([])}
          className="flex-1 rounded bg-slate-700 px-3 py-2 text-sm disabled:opacity-40">Discard stroke</button>
      </div>
    </div>
  </div>;
}
