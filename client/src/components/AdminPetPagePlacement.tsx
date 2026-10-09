import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { usePetPagePlacement } from "@/lib/petPresentation";
import type { PetPageKey, PetPagePlacement } from "@shared/petPagePlacement";

/** Isolated page offset; does not write pet-template artwork or ground anchor. */
export default function AdminPetPagePlacement({ page, admin, children }: { page: PetPageKey; admin: boolean; children: ReactNode }) {
  const query = usePetPagePlacement(page);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PetPagePlacement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: PetPagePlacement } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const value = draft ?? query.placement;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId || !stage.current) return;
    const width = stage.current.getBoundingClientRect().width;
    if (!width) return;
    const dx = (event.clientX - d.x) * 100 / width;
    const dy = (event.clientY - d.y) * 100 / width;
    setDraft({ ...d.start, x: Math.max(-100, Math.min(100, +(d.start.x + dx).toFixed(2))), y: Math.max(-100, Math.min(100, +(d.start.y + dy).toFixed(2))) });
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };
  return <div ref={stage} data-testid={`pet-page-placement-${page}`} style={{ position: "relative", width: "100%", height: "100%" }}>
    <div style={{ width: "100%", height: "100%", transform: value.x || value.y || value.scale !== 1 ? `translate(${value.x}%, ${value.y}%) scale(${value.scale})` : undefined, transformOrigin: "center center", pointerEvents: editing ? "none" : undefined }}>{children}</div>
    {admin && editing && <div data-testid="pet-page-placement-drag" style={{ position: "absolute", inset: 0, cursor: "grab", touchAction: "none", zIndex: 5 }} onPointerDown={event => { if (query.isPending || query.isError) return; drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: value }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} />}
    {admin && <div onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} style={{ position: "absolute", right: 2, bottom: 2, zIndex: 6, background: "#201a13ee", color: "#ffe29a", borderRadius: 7, padding: 5, fontSize: 12, pointerEvents: "auto" }}>
      <button type="button" onClick={() => { setEditing(!editing); setDraft(null); }}>{editing ? "Close" : "Adjust pet"}</button>
      {editing && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 180 }}>
        <button type="button" onClick={() => setDraft({ ...value, scale: Math.max(.2, +(value.scale - .05).toFixed(2)) })}>− Size</button>
        <span>{Math.round(value.scale * 100)}%</span>
        <button type="button" onClick={() => setDraft({ ...value, scale: Math.min(3, +(value.scale + .05).toFixed(2)) })}>+ Size</button>
        <button type="button" disabled={query.isPending || query.isError || query.save.isPending} onClick={() => query.save.mutate(value, { onSuccess: () => setDraft(null) })}>Save</button>
        <button type="button" onClick={() => setDraft(null)}>Discard</button>
        {(query.isError || query.save.isError) && <span role="alert">Placement unavailable</span>}
      </div>}
    </div>}
  </div>;
}
