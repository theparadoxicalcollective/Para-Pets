import { useEffect, useRef, useState } from "react";
import { usePetPresentation } from "@/lib/petPresentation";
import { defaultXEyes, type PetPresentation, type PresentationPart } from "@shared/petPresentation";
import PetXEyes from "./PetXEyes";
export default function PetXEyesEditor({ templateId, form, view, parts, toolbarOffset = 0 }: { templateId: string; form: string; view: string; parts: PresentationPart[]; toolbarOffset?: number }) {
  const query = usePetPresentation(templateId, form, view);
  const [draft, setDraft] = useState<PetPresentation | null>(null);
  const [visible, setVisible] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ id: number; key: string; dx: number; dy: number } | null>(null);
  useEffect(() => { setDraft(null); setSelected(null); drag.current = null; }, [templateId, form, view]);
  const value = draft ?? query.placement;
  const heads = parts.filter(p => /^(h[23]_)?head$/.test(p.partType));
  const selectedHead = heads.some(p => p.partType === selected) ? selected! : heads[0]?.partType;
  const current = heads.find(p => p.partType === selectedHead);
  const point = current ? value.eyes[current.partType] ?? defaultXEyes(current, parts) : null;
  const change = (key: string, eye: { x: number; y: number; size: number }) => setDraft({ ...value, eyes: { ...value.eyes, [key]: eye } });
  return <>
    {visible && heads.map(head => {
      const eye = value.eyes[head.partType] ?? defaultXEyes(head, parts);
      return <div key={head.partType} data-testid={`edit-x-eyes-${head.partType}`} style={{ position: "absolute", inset: 0, containerType: "inline-size", pointerEvents: "none", zIndex: 31000 }}>
        <PetXEyes {...eye} />
        <div style={{ position: "absolute", left: `${eye.x / 10}%`, top: `${eye.y / 10}%`, width: `${eye.size * 2.6 / 10}%`, height: `${eye.size / 10}%`, transform: "translate(-50%, -50%)", border: selected === head.partType ? "1px solid #f0c040" : "1px dashed #ff4038", pointerEvents: "auto", touchAction: "none", cursor: "grab" }}
          onClick={event => event.stopPropagation()}
          onPointerDown={event => { event.stopPropagation(); setSelected(head.partType); event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.parentElement!.getBoundingClientRect(); drag.current = { id: event.pointerId, key: head.partType, dx: (event.clientX - rect.left) / rect.width * 1000 - eye.x, dy: (event.clientY - rect.top) / rect.height * 1000 - eye.y }; }}
          onPointerMove={event => { const start = drag.current; if (!start || start.id !== event.pointerId) return; event.stopPropagation(); const rect = event.currentTarget.parentElement!.getBoundingClientRect(); change(start.key, { ...eye, x: Math.max(-1000, Math.min(2000, (event.clientX - rect.left) / rect.width * 1000 - start.dx)), y: Math.max(-1000, Math.min(2000, (event.clientY - rect.top) / rect.height * 1000 - start.dy)) }); }}
          onPointerUp={event => { event.stopPropagation(); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      </div>;
    })}
    <div onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} style={{ position: "absolute", top: `calc(100% + ${8 + toolbarOffset}px)`, left: 0, right: 0, minHeight: 60, zIndex: 32000, background: "#201506", color: "#f0c040", padding: 8, fontSize: 12 }}>
      <button type="button" onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"} red X eyes</button> · Drag each head's X eyes into position.
      {point && selectedHead && <div style={{ margin: "8px 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <label>Head <select aria-label="Head for red X eyes" value={selectedHead} onChange={event => setSelected(event.target.value)} style={{ background: "#30230d", color: "#ffe29a", padding: 6 }}>
          {heads.map(head => <option key={head.partType} value={head.partType}>{head.partType.replaceAll("_", " ")}</option>)}
        </select></label>
        <label style={{ width: "100%" }}>Red X X size: {Math.round(point.size)}
          <input aria-label="Red X X eye size" type="range" min={10} max={400} step={1} value={point.size} onChange={event => change(selectedHead, { ...point, size: Number(event.target.value) })} style={{ display: "block", width: "100%", accentColor: "#ff4038" }} />
        </label>
        <button type="button" aria-label="Smaller X eyes" onClick={() => change(selectedHead, { ...point, size: Math.max(10, point.size - 10) })} style={{ padding: 6, border: "1px solid #806328", borderRadius: 6 }}>− Smaller X X</button>
        <button type="button" aria-label="Larger X eyes" onClick={() => change(selectedHead, { ...point, size: Math.min(400, point.size + 10) })} style={{ padding: 6, border: "1px solid #806328", borderRadius: 6 }}>+ Larger X X</button>
      </div>}

      <button type="button" disabled={query.isPending || query.isError || query.save.isPending} onClick={() => query.save.mutate({ ...query.placement, eyes: value.eyes }, { onSuccess: () => setDraft(null) })}> {query.save.isPending ? "Saving…" : "Save X eyes"}</button>
      <button type="button" onClick={() => setDraft(null)}> Discard</button>
      {(query.isError || query.save.isError) && <p role="alert">Could not load or save X eyes. Try again.</p>}
    </div>
  </>;
}
