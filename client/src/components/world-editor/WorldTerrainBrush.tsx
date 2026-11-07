import { useRef, useState, type PointerEvent } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";
import { PARK_TERRAIN_DETAIL_OPTIONS, isParkConnectedPath, parkTerrainHeightRatio, type ParkTerrainDetailType } from "@shared/petParkTerrainDetails";
import { PET_PARK_GROUND_THEMES, type ParkGroundTheme } from "@shared/petParkGround";
import { parkBrushWorldPoint, parkExtendBrushStroke, parkExtendPathStroke, PARK_BRUSH_MAX_STAMPS, type ParkBrushPoint } from "@/lib/petParkTerrainBrush";

type Props = {
  viewportWidth: number; viewportHeight: number;
  sceneWidth: number; sceneHeight: number;
  worldWidth: number; worldHeight: number;
  panX: number; panY: number; scale: number;
  raised: boolean; onSaved: () => void; onExit: () => void;
  groundTheme: ParkGroundTheme;
  worldId: string;
  onGroundTheme: (theme: ParkGroundTheme) => Promise<void>;
};

/** The only painting surface is an overlay on the EXISTING World Editor camera.
 * A separate world-specific endpoint persists each brush stroke. */
export default function WorldTerrainBrush(props: Props) {
  const { toast } = useToast();
  const surface = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const draftRef = useRef<ParkBrushPoint[]>([]);
  const savingRef = useRef(false);
  const [type, setType] = useState<ParkTerrainDetailType>("dirt_path");
  const [size, setSize] = useState(150);
  const [erasing, setErasing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [draft, setDraft] = useState<ParkBrushPoint[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [changingGround, setChangingGround] = useState(false);

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
      await apiRequest("POST", `/api/admin/world-editor/${props.worldId}/${erasing ? "terrain-erase" : "terrain-strokes"}`, { type, size, points });
      props.onSaved();
      draftRef.current = [];
      setDraft([]);
    } catch (error) {
      setSaveFailed(true);
      setShowOptions(true); // Keep retry and clear available after a failed write.
      toast({ title: erasing ? "Could not erase terrain" : "Could not save terrain stroke", description: String(error), variant: "destructive" });
      // Keep the completed stroke visible so the admin can retry or clear it.
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const extendStroke = isParkConnectedPath(type) || type === "garden_plot" ? parkExtendPathStroke : parkExtendBrushStroke;
  const selectGround = async (groundTheme: ParkGroundTheme) => {
    if (changingGround || savingRef.current || draftRef.current.length || groundTheme === props.groundTheme) return;
    setChangingGround(true);
    try {
      await props.onGroundTheme(groundTheme);
      props.onSaved();
    } catch (error) {
      toast({ title: "Could not change ground", description: String(error), variant: "destructive" });
    } finally {
      setChangingGround(false);
    }
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!event.isPrimary || savingRef.current || draftRef.current.length || activePointer.current !== null) return;
    activePointer.current = event.pointerId;
    const first = extendStroke([], pointAt(event), { width: props.worldWidth, height: props.worldHeight }, size);
    draftRef.current = first;
    setDraft(first);
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activePointer.current !== event.pointerId) return;
    const next = extendStroke(draftRef.current, pointAt(event),
      { width: props.worldWidth, height: props.worldHeight }, size);
    draftRef.current = next;
    setDraft(next);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    const completed = extendStroke(draftRef.current, pointAt(event),
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

  return <div className="pointer-events-none absolute inset-0 z-10" data-testid="world-editor-brush-mode">
    <div ref={surface} aria-label="Paint World Editor ground" data-testid="world-editor-terrain-brush-surface"
      className="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
      onPointerDown={start} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={cancel} onLostPointerCapture={cancel} />
    {draft.map((point, i) => <div key={i} className="pointer-events-none absolute opacity-80"
      style={{
        left: point.xPct * props.sceneWidth + props.panX,
        top: point.yPct * props.sceneHeight + props.panY,
        width: size * props.scale, height: size * props.scale * parkTerrainHeightRatio(type),
        transform: "translate(-50%, -50%)",
        filter: erasing ? "hue-rotate(155deg) saturate(2)" : undefined,
      }}><PetParkTerrainDetail type={type} /></div>)}
    {/* Keep the painting canvas visible: a small edge toolbar stays compact
        until the admin explicitly opens tool/ground settings. This does not
        change the full-screen brush's world-coordinate hit surface. */}
    <div aria-label="World Editor terrain brush controls" data-testid="world-editor-terrain-brush-toolbar"
      className="pointer-events-auto absolute right-3 z-20 w-[min(260px,calc(100%-24px))] rounded-xl border border-[#b99a4c]/75 bg-[#10291d]/95 p-2 text-[#f5d77b] shadow-lg"
      style={{ top: "max(100px, calc(env(safe-area-inset-top, 0px) + 72px))" }}
      onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold" data-testid="world-editor-current-brush">
          {PARK_TERRAIN_DETAIL_OPTIONS.find(option => option.type === type)?.label ?? "Terrain"}
        </span>
        <button type="button" aria-label="Choose terrain brush" aria-expanded={showOptions}
          onClick={() => setShowOptions(value => !value)}
          className="min-h-10 shrink-0 rounded-lg border border-[#e5c66a]/70 bg-[#245037] px-2.5 text-xs font-semibold">
          {showOptions ? "Hide" : "Tools"}
        </button>
        <button type="button" disabled={saving || draft.length > 0}
          aria-pressed={erasing} aria-label="Toggle terrain eraser"
          onClick={() => setErasing(current => !current)}
          className={`min-h-10 shrink-0 rounded-lg border px-2 text-xs font-semibold disabled:opacity-40 ${erasing ? "border-red-300 bg-[#5d2a29] text-red-100" : "border-[#b99a4c]/65 bg-[#0b2016]"}`}>
          {erasing ? "Erase ON" : "Erase"}
        </button>
        <button type="button" disabled={saving || changingGround || draft.length > 0}
          onClick={props.onExit} className="min-h-10 shrink-0 rounded-lg border border-[#b99a4c]/65 bg-[#0b2016] px-2.5 text-xs disabled:opacity-40">
          Done
        </button>
      </div>
      {(saving || saveFailed || changingGround) && <p role="status" className="mt-1 text-[11px] text-amber-100/90">
        {saving ? "Saving terrain…" : saveFailed ? "Save failed — open Tools to retry." : "Updating ground…"}
      </p>}
      {showOptions && <div data-testid="world-editor-terrain-brush-palette"
        className="mt-2 max-h-[min(50dvh,360px)] space-y-3 overflow-y-auto overscroll-contain border-t border-[#b99a4c]/40 pt-2">
        <p className="text-[11px] text-amber-100/75">Choose a path or plot, then tap or drag on the world. Release to save. Enable Erase to remove only that material.</p>
        <div>
          <p className="mb-1 text-xs font-semibold">Paths, Water & Garden Plots</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PARK_TERRAIN_DETAIL_OPTIONS.map(option => <button key={option.type} type="button"
              disabled={!!draft.length || saving || changingGround} aria-pressed={type === option.type}
              onClick={() => { setType(option.type); setSize(option.size); setShowOptions(false); }}
              className={`min-h-10 rounded-lg border px-2 py-2 text-[11px] disabled:opacity-50 ${type === option.type ? "border-[#e5c66a] bg-[#245037] font-semibold" : "border-[#b99a4c]/45 bg-[#0b2016]"}`}>
              {option.label}
            </button>)}
          </div>
        </div>
        <div className="border-t border-[#b99a4c]/35 pt-2">
          <p className="mb-1 text-xs font-semibold">Ground appearance</p>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="World Editor ground style">
            {PET_PARK_GROUND_THEMES.map(option => <button key={option.type} type="button"
              disabled={changingGround || saving || draft.length > 0}
              aria-pressed={props.groundTheme === option.type}
              onClick={() => { void selectGround(option.type); setShowOptions(false); }}
              className={`flex min-h-10 items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] font-semibold disabled:opacity-50 ${props.groundTheme === option.type ? "border-[#f2d47d] bg-[#35563d]" : "border-[#b99a4c]/45 bg-[#0b2016]"}`}>
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-[#c1ad83]/70"
                style={{ background: option.swatch }} />{option.label}
            </button>)}
          </div>
        </div>
        {saveFailed && <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={() => void saveStroke(draftRef.current)}
            className="min-h-10 flex-1 rounded-lg border border-[#e5c66a]/60 bg-[#245037] px-2 text-xs">Retry save</button>
          <button type="button" disabled={saving} onClick={clearFailedStroke}
            className="min-h-10 flex-1 rounded-lg border border-[#b99a4c]/40 bg-[#0b2016] px-2 text-xs">Clear stroke</button>
        </div>}
      </div>}
    </div>
  </div>;
}
