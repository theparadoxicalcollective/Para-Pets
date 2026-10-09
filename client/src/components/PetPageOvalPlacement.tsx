import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { usePetPagePlacement } from "@/lib/petPresentation";
import type { PetPageKey, PetPagePlacement } from "@shared/petPagePlacement";

/** Admin oval: the pet and its placement marker share one page-relative coordinate system. */
export default function PetPageOvalPlacement({ page, admin, children }: { page: PetPageKey; admin: boolean; children: ReactNode }) {
  const query = usePetPagePlacement(page);
  const [draft, setDraft] = useState<PetPagePlacement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: PetPagePlacement; latest: PetPagePlacement } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const placement = draft ?? query.placement;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId || !stage.current) return;
    event.stopPropagation();
    const rect = stage.current.getBoundingClientRect();
    const width = rect.width / Math.max(.2, placement.scale);
    if (!width) return;
    const next = { ...d.start, x: Math.max(-100, Math.min(100, +(d.start.x + (event.clientX - d.x) * 100 / width).toFixed(2))), y: Math.max(-100, Math.min(100, +(d.start.y + (event.clientY - d.y) * 100 / width).toFixed(2))) };
    d.latest = next;
    setDraft(next);
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    if (cancelled) { setDraft(null); return; }
    if (d.latest.x !== d.start.x || d.latest.y !== d.start.y) {
      query.save.mutate(d.latest, { onSuccess: () => setDraft(null) });
    }
  };
  return <div ref={stage} data-testid={`pet-page-oval-${page}`} style={{ position: "relative", width: "100%", height: "100%", transform: `translate(${placement.x}%, ${placement.y}%) scale(${placement.scale})`, transformOrigin: "center bottom" }}>
    <div style={{ width: "100%", height: "100%" }}>{children}</div>
    {admin && <div role="button" tabIndex={0} aria-label={`Drag ${page} pet placement oval`} title="Drag oval to move pet" onPointerDown={event => {
      event.stopPropagation();
      if (query.isPending || query.isError || query.save.isPending) return;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: placement, latest: placement };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} style={{ position: "absolute", left: "50%", bottom: 0, width: "64%", height: 25, borderRadius: "50%", transform: "translate(-50%, 50%)", border: "2px dashed #ffe29a", background: "rgba(240,192,64,.16)", boxShadow: "0 0 9px #000", cursor: "grab", touchAction: "none", pointerEvents: "auto", zIndex: 5 }} />}
  </div>;
}
