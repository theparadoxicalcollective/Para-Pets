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
  const draftRef = useRef<ParkBrushPoint[]>([]);
  const savingRef = useRef(false);
  const [type, setType] = useState<ParkTerrainDetailType>("dirt_path");
  const [size, setSize] = useState(200);
  const [draft, setDraft] = useState<ParkBrushPoint[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = surface.current!.getBoundingClientRect();
    return parkBrushWorldPoint(event.clientX, event.clientY, rect,
      { width: props.viewportWidth, height: props.viewportHeight },
      { x: props.panX, y: props.panY },
      { width: props.sceneWidth, height: props.sceneHeight });
  };
  const saveStroke = async (points: ParkBrushPoint[]) => {
    if (savingRef.current || !points.length) return;
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      await apiRequest("POST", "/api/admin/pet-park/terrain-strokes", { type, size, points });
      props.onSaved();
      draftRef.current = [];
      setDraft([]);
    } catch (error) {
      setSaveFailed(true);
      toast({ title: "Could not save terrain stroke", description: String(error), variant: "destructive" });
      // Keep the completed stroke visible so the admin can retry or clear it.
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!event.isPrimary || savingRef.current || draftRef.current.length || activePointer.current !== null) return;
    activePointer.current = event.pointerId;
    const first = [pointAt(event)];
    draftRef.current = first;
    setDraft(first);
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activePointer.current !== event.pointerId) return;
    const next = parkExtendBrushStroke(draftRef.current, pointAt(event),
      { width: props.worldWidth, height: props.worldHeight }, size);
    draftRef.current = next;
    setDraft(next);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    const completed = parkExtendBrushStroke(draftRef.current, pointAt(event),
      { width: props.worldWidth, height: props.worldHeight }, size);
    draftRef.current = completed;
    setDraft(completed);
    // One atomic request per completed stroke, without an extra Save/Discard step.
    void saveStroke(completed);
  };
  const cancel = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    draftRef.current = [];
    setDraft([]);
  };
  const clearFailedStroke = () => {
    draftRef.current = [];
    setDraft([]);
    setSaveFailed(false);
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
      className={`pointer-events-auto absolute inset-x-3 z-20 mx-auto flex max-w-sm flex-col gap-2 overflow-y-auto rounded-xl border border-[#b99a4c]/70 bg-[#10291d]/95 p-3 text-[#f5d77b] shadow-xl max-h-[34dvh] ${props.raised ? "bottom-[44%]" : "bottom-[max(12px,env(safe-area-inset-bottom))]"}`}
      onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">Paint terrain</strong>
        <button type="button" disabled={saving || draft.length > 0} onClick={props.onExit} className="rounded-lg border border-[#b99a4c]/60 bg-[#245037] px-3 py-2 text-xs disabled:opacity-50">Done</button>
      </div>
      <p className="text-xs text-amber-100/80">{saving ? "Saving terrain…" : saveFailed ? "Save failed. Retry or clear this stroke." : "Choose a terrain type, then drag to paint. Each stroke saves when you release."}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {PARK_TERRAIN_DETAIL_OPTIONS.map(option => <button key={option.type} type="button"
          disabled={!!draft.length || saving} aria-pressed={type === option.type}
          onClick={() => { setType(option.type); setSize(option.size); }}
          className={`rounded-lg border px-2 py-2 text-xs disabled:opacity-60 ${type === option.type ? "border-[#e5c66a] bg-[#245037]" : "border-[#b99a4c]/45 bg-[#0b2016]"}`}>{option.label}</button>)}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span>Brush size</span>
        <button type="button" aria-label="Decrease terrain brush size" disabled={!!draft.length || saving}
          onClick={() => setSize(v => Math.max(60, v - 25))} className="rounded bg-[#245037] px-3 py-2">−</button>
        <span className="tabular-nums">{size}</span>
        <button type="button" aria-label="Increase terrain brush size" disabled={!!draft.length || saving}
          onClick={() => setSize(v => Math.min(400, v + 25))} className="rounded bg-[#245037] px-3 py-2">+</button>
      </div>
      {saveFailed && <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={() => void saveStroke(draftRef.current)}
          className="flex-1 rounded-lg border border-[#e5c66a]/60 bg-[#245037] px-3 py-2 text-sm">Retry save</button>
        <button type="button" disabled={saving} onClick={clearFailedStroke}
          className="flex-1 rounded-lg border border-[#b99a4c]/40 bg-[#0b2016] px-3 py-2 text-sm">Clear stroke</button>
      </div>}
    </div>
  </div>;
}
