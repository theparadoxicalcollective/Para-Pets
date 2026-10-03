import { createPortal } from "react-dom";
import { useEffect, useRef, useState, cloneElement, type ReactElement, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { petTemplateQuery, type PetArtworkForm } from "@/lib/petTemplateQuery";
import { usePetPresentation } from "@/lib/petPresentation";
import { getAlphaBounds, getAlphaBoundsSync, FULL_BOUNDS } from "@/lib/alphaBounds";
import { getPetGroundPoint, dragPetPlacement, PET_SPOT, getPetPlacementTransform, centerPetPlacement, type GroundPart } from "@/lib/petGroundPlacement";
import { normalizePetParts } from "@/lib/petRenderSafety";
import type { PetPresentation } from "@shared/petPresentation";

type Props = { templateId: string; form?: PetArtworkForm; view?: "front" | "back"; admin?: boolean; editor?: boolean; lowMemory?: boolean; placementEditing?: boolean; controlsContainer?: HTMLElement | null; parts?: GroundPart[]; onEditingChange?: (editing: boolean) => void; children: ReactElement<{ style?: CSSProperties }> };

export default function ActivePetPlacement({ templateId, form = "base", view, admin = false, editor = false, lowMemory = !editor, placementEditing, controlsContainer, parts, onEditingChange, children }: Props) {
  const { data: template } = useQuery({ ...petTemplateQuery(templateId, form), enabled: !editor && !!templateId });
  const allParts = normalizePetParts(parts ?? template?.parts);
  const resolvedView = view ?? (template?.facing === "back" || (allParts.length && !allParts.some(p => p.view === "front")) ? "back" : "front");
  const query = usePetPresentation(templateId, form, resolvedView, editor || !!template || !!view);
  const [localEditing, setEditing] = useState(false);
  const editing = placementEditing ?? localEditing;
  const [draft, setDraft] = useState<PetPresentation | null>(null);
  const [, refreshBounds] = useState(0);
  const drag = useRef<{ id: number; x: number; y: number; value: PetPresentation; latest: PetPresentation } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const visibleParts: GroundPart[] = allParts.filter(p => p.view === resolvedView);
  const imageKey = JSON.stringify(visibleParts.map(p => p.imageUrl));
  useEffect(() => {
    // Match the animator: mobile must not decode extra full-size part images.
    if (lowMemory) return;
    let live = true;
    const urls: string[] = JSON.parse(imageKey);
    void Promise.all(urls.map(url => getAlphaBounds(url))).then(() => { if (live) refreshBounds(n => n + 1); });
    return () => { live = false; };
  }, [imageKey, lowMemory]);
  useEffect(() => { setDraft(null); setEditing(false); onEditingChange?.(false); drag.current = null; }, [templateId, form, resolvedView, onEditingChange]);
  const value = draft ?? query.placement;
  const ground = getPetGroundPoint(visibleParts, url => lowMemory ? FULL_BOUNDS : (getAlphaBoundsSync(url) ?? FULL_BOUNDS));
  const applied = !editor || editing;
  const saveHomePosition = (position: PetPresentation) => {
    query.save.mutate({ ...query.placement, x: position.x, y: position.y }, {
      onSuccess: () => setDraft(null),
    });
  };
  const finishDrag = (pointerId: number, cancel = false) => {
    const start = drag.current;
    if (!start || start.id !== pointerId) return;
    drag.current = null;
    if (cancel) { if (!editor) setDraft(null); return; }
    if (!editor && (start.latest.x !== start.value.x || start.latest.y !== start.value.y)) {
      saveHomePosition(start.latest);
    }
  };
  const toggle = () => { setEditing(!editing); onEditingChange?.(!editing); setDraft(null); };
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const buttonStyle: CSSProperties = { padding: "6px 9px", border: "1px solid #806328", borderRadius: 6, background: "#30230d", color: "#ffe29a", minHeight: 32 };
  const controls = admin && editor && (controlsContainer ? editing : true) ? <div className="pet-editor-controls" data-testid="pet-whole-controls" onClick={stop} onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} style={controlsContainer ? undefined : { position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, pointerEvents: "auto", zIndex: 33001 }}>
      {!controlsContainer && <button type="button" style={buttonStyle} onClick={toggle}>{editing ? "Back to parts" : "Whole pet placement"}</button>}
      {editing && <>
        <p>Drag the pet. The oval stays fixed as your target.</p>
        <div className="pet-editor-actions">
          <button type="button" style={buttonStyle} aria-label="Decrease whole pet size" onClick={() => setDraft({ ...value, scale: Math.max(.2, +(value.scale - .1).toFixed(2)) })}>− Smaller</button>
          <span>{Math.round(value.scale * 100)}%</span>
          <button type="button" style={buttonStyle} aria-label="Increase whole pet size" onClick={() => setDraft({ ...value, scale: Math.min(3, +(value.scale + .1).toFixed(2)) })}>+ Larger</button>
          <button type="button" style={buttonStyle} onClick={() => setDraft(centerPetPlacement(value))}>Center over oval</button>
        </div>
        <div className="pet-editor-actions">
          <button type="button" style={buttonStyle} disabled={query.isPending || query.isError || query.save.isPending} onClick={() => query.save.mutate({ ...query.placement, x: value.x, y: value.y, scale: value.scale }, { onSuccess: () => setDraft(null) })}>{query.save.isPending ? "Saving…" : "Save placement"}</button>
          <button type="button" style={buttonStyle} onClick={() => setDraft(null)}>Discard</button>
        </div>
      </>}
      {(query.isError || query.save.isError) && <p role="alert">Could not load or save placement. Try again.</p>}
    </div> : null;
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (query.isPending || query.isError || query.save.isPending) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const initial = editor && !editing ? query.placement : value;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, value: initial, latest: initial };
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const start = drag.current;
    if (!start || start.id !== event.pointerId || !stage.current) return;
    start.latest = dragPetPlacement(start.value, event.clientX - start.x, event.clientY - start.y, stage.current.getBoundingClientRect().width);
    setDraft(start.latest);
  };
  return <div data-testid={editor ? "pet-placement-in-parts-canvas" : "active-pet-placement-stage"} style={editor ? { position: "absolute", inset: 0, pointerEvents: "none" } : { position: "relative", width: "100%", paddingTop: `${PET_SPOT.y / 10}%` }}>
    <div ref={stage} style={{ position: "absolute", top: 0, left: 0, width: "100%", aspectRatio: "1", overflow: editor && editing ? "clip" : undefined, pointerEvents: editor ? "none" : undefined }}>
      {cloneElement(children, { style: { ...children.props.style, position: "absolute", inset: 0, width: "100%", height: "100%", ...(applied ? { ...getPetPlacementTransform(ground, value), pointerEvents: editing ? "none" : children.props.style?.pointerEvents } : {}) } })}
      {editor && editing && <div data-testid="pet-whole-drag-area" style={{ position: "absolute", inset: 0, pointerEvents: "auto", cursor: "grab", touchAction: "none", zIndex: 32000 }} onClick={stop} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={event => { event.stopPropagation(); finishDrag(event.pointerId); }} onPointerCancel={event => { event.stopPropagation(); finishDrag(event.pointerId, true); }} onLostPointerCapture={event => finishDrag(event.pointerId, true)} />}
      {admin && <div role={editor ? undefined : "button"} tabIndex={editor ? undefined : 0} aria-label="Move whole pet on its ground oval" data-testid="active-pet-placement-guide"
        style={{ position: "absolute", left: `${PET_SPOT.x / 10 + (editor ? 0 : value.x)}%`, top: `${PET_SPOT.y / 10 + (editor ? 0 : value.y)}%`, width: `${PET_SPOT.widthPercent}%`, aspectRatio: "7 / 1", transform: "translate(-50%, -50%)", borderRadius: "50%", border: "2px dashed #ffe29a", background: "rgba(240,192,64,.18)", boxShadow: "0 0 0 1px #201506, 0 0 12px #000", zIndex: 33000, touchAction: "none", cursor: editor ? "default" : "grab", pointerEvents: editor ? "none" : "auto" }}
        onClick={stop} onKeyDown={event => {
          const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
          if (!delta) return;
          event.preventDefault(); event.stopPropagation();
          if (query.isPending || query.isError || query.save.isPending) return;
          const next = dragPetPlacement(value, delta[0], delta[1], 100);
          if (editor) { setEditing(true); onEditingChange?.(true); }
          setDraft(next);
          if (!editor) saveHomePosition(next);
        }}
        onPointerDown={editor ? undefined : beginDrag}
        onPointerMove={editor ? undefined : moveDrag}
        onPointerUp={event => { event.stopPropagation(); finishDrag(event.pointerId); }} onPointerCancel={event => { event.stopPropagation(); finishDrag(event.pointerId, true); }} onLostPointerCapture={event => finishDrag(event.pointerId, true)} />}
    </div>
    {admin && !editor && (query.isError || query.save.isError) && <p role="alert" onClick={stop} style={{ position: "absolute", top: `calc(100% + ${value.y}% + 20px)`, left: "10%", right: "10%", zIndex: 33001, color: "#ffe29a", background: "#201506", padding: 4, fontSize: 12, textAlign: "center" }}>{query.isError ? "Placement could not be loaded. Try reloading." : "Placement could not be saved. Drag the oval to retry."}</p>}
    {controlsContainer && controls ? createPortal(controls, controlsContainer) : controls}
  </div>;
}
