import { useEffect, useRef, useState, cloneElement, type ReactElement, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { petTemplateQuery, type PetArtworkForm } from "@/lib/petTemplateQuery";
import { usePetPresentation } from "@/lib/petPresentation";
import type { PetPresentation } from "@shared/petPresentation";
export default function ActivePetPlacement({ templateId, form = "base", view, admin = false, children }: { templateId: string; form?: PetArtworkForm; view?: "front" | "back"; admin?: boolean; children: ReactElement<{ style?: CSSProperties }> }) {
  const { data: template } = useQuery(petTemplateQuery(templateId, form));
  const resolvedView = view ?? (template?.facing === "back" || (template?.parts?.length && !template.parts.some((p: { view: string }) => p.view === "front")) ? "back" : "front");
  const query = usePetPresentation(templateId, form, resolvedView, !!template || !!view);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PetPresentation | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; value: PetPresentation } | null>(null);
  useEffect(() => { setDraft(null); setEditing(false); drag.current = null; }, [templateId, form, resolvedView]);
  const value = draft ?? query.placement;
  return <>
    {cloneElement(children, { style: { ...children.props.style, ...(value.x || value.y || value.scale !== 1 ? { transform: `translate(${value.x}%, ${value.y}%) scale(${value.scale})`, transformOrigin: "50% 100%" } : {}) } })}
    {admin && <>
      <button type="button" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setEditing(!editing); }} style={{ position: "absolute", left: "50%", top: "25%", transform: "translateX(-50%)", zIndex: 30001, color: "#f0c040", background: "#201506", padding: 6 }}>Pet placement</button>
      {editing && <>
        <div data-testid="active-pet-placement-guide" style={{ position: "absolute", left: `${50 + value.x}%`, top: `${100 - 50 * value.scale + value.y}%`, width: `${35 * value.scale}%`, height: `${40 * value.scale}%`, transform: "translate(-50%, -50%)", borderRadius: "50%", border: "2px dashed #f0c040", background: "rgba(240,192,64,.06)", zIndex: 30000, touchAction: "none", cursor: "grab" }}
          onClick={event => event.stopPropagation()}
          onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, value }; }}
          onPointerMove={event => { const start = drag.current; if (!start || start.id !== event.pointerId) return; const rect = event.currentTarget.parentElement!.getBoundingClientRect(); setDraft({ ...start.value, x: Math.max(-100, Math.min(100, start.value.x + (event.clientX - start.x) / rect.width * 100)), y: Math.max(-100, Math.min(100, start.value.y + (event.clientY - start.y) / rect.height * 100)) }); }}
          onPointerUp={event => { event.stopPropagation(); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
        <div onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} style={{ position: "absolute", top: "70%", left: "50%", transform: "translateX(-50%)", width: 280, maxWidth: "95%", zIndex: 30001, background: "#201506", color: "#f0c040", padding: 8 }}>
          <span>Drag the oval to move the whole pet. </span>
          <button type="button" aria-label="Decrease whole pet size" onClick={() => setDraft({ ...value, scale: Math.max(.2, +(value.scale - .1).toFixed(2)) })}>−</button> {Math.round(value.scale * 100)}% <button type="button" aria-label="Increase whole pet size" onClick={() => setDraft({ ...value, scale: Math.min(3, +(value.scale + .1).toFixed(2)) })}>+</button>
          <button type="button" disabled={query.isPending || query.isError || query.save.isPending} onClick={() => query.save.mutate({ ...query.placement, x: value.x, y: value.y, scale: value.scale }, { onSuccess: () => setDraft(null) })}> {query.save.isPending ? "Saving…" : "Save placement"}</button>
          <button type="button" onClick={() => setDraft(null)}> Discard</button>
          {(query.isError || query.save.isError) && <p role="alert">Could not load or save placement. Try again.</p>}
        </div>
      </>}
    </>}
  </>;
}
