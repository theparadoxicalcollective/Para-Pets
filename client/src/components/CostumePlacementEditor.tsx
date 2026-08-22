import { useMemo, useState } from "react";
import { Save, X } from "lucide-react";

export interface CostumeEditorItem {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface CostumeEditorPart {
  partType: string;
  label: string;
}

export interface CostumePlacementDraft {
  view: "front" | "side";
  anchorPart: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  depth: "front" | "back";
}

/**
 * Admin-only costume placement surface. It deliberately owns no persistence;
 * the parent pet editor supplies the costume list and saves validated drafts.
 * This keeps the editor reusable while the costume definition API remains
 * separate from ordinary pet_template_parts.
 */
export default function CostumePlacementEditor({
  items,
  parts,
  view,
  initial,
  onSave,
  onClose,
}: {
  items: CostumeEditorItem[];
  parts: CostumeEditorPart[];
  view: "front" | "side";
  initial?: Partial<CostumePlacementDraft>;
  onSave: (placement: CostumePlacementDraft) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const [placement, setPlacement] = useState<CostumePlacementDraft>({
    view,
    anchorPart: initial?.anchorPart ?? parts[0]?.partType ?? "body",
    posX: initial?.posX ?? 350,
    posY: initial?.posY ?? 300,
    width: initial?.width ?? 300,
    height: initial?.height ?? 300,
    pivotX: initial?.pivotX ?? 50,
    pivotY: initial?.pivotY ?? 50,
    depth: initial?.depth ?? "front",
  });

  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId]);

  const set = <K extends keyof CostumePlacementDraft>(key: K, value: CostumePlacementDraft[K]) =>
    setPlacement(prev => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.72)" }}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-auto rounded-xl p-4" style={{ background: "linear-gradient(145deg,#21150d,#302015)", border: "1px solid rgba(240,192,64,.4)" }}>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-fantasy text-[#f0c040] text-sm tracking-widest flex-1">Costume Placement</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,.3)", border: "1px solid rgba(240,192,64,.25)", color: "#a89878" }}><X className="w-4 h-4" /></button>
        </div>

        <label className="block font-fantasy text-[9px] uppercase tracking-widest mb-2" style={{ color: "#a89878" }}>
          Costume
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="w-full mt-1 rounded-lg px-2 py-2 text-xs" style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(106,88,64,.5)", color: "#e7d7b5" }}>
            {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        {selected?.imageUrl && (
          <div className="flex justify-center my-3 rounded-lg p-4" style={{ background: "repeating-conic-gradient(rgba(255,255,255,.03) 0% 25%,transparent 0% 50%) 0 0 / 20px 20px", border: "1px dashed rgba(240,192,64,.2)" }}>
            <img src={selected.imageUrl} alt={selected.name} className="max-h-40 max-w-full object-contain" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="font-fantasy text-[9px] uppercase tracking-widest" style={{ color: "#a89878" }}>Anchor part
            <select value={placement.anchorPart} onChange={e => set("anchorPart", e.target.value)} className="w-full mt-1 rounded px-2 py-2 text-xs" style={{ background: "rgba(0,0,0,.35)", color: "#e7d7b5", border: "1px solid rgba(106,88,64,.5)" }}>
              {parts.map(part => <option key={part.partType} value={part.partType}>{part.label}</option>)}
            </select>
          </label>
          <label className="font-fantasy text-[9px] uppercase tracking-widest" style={{ color: "#a89878" }}>Depth
            <select value={placement.depth} onChange={e => set("depth", e.target.value as "front" | "back")} className="w-full mt-1 rounded px-2 py-2 text-xs" style={{ background: "rgba(0,0,0,.35)", color: "#e7d7b5", border: "1px solid rgba(106,88,64,.5)" }}>
              <option value="front">Front of pet parts</option>
              <option value="back">Behind pet parts</option>
            </select>
          </label>
          {(["posX", "posY", "width", "height", "pivotX", "pivotY"] as const).map(key => (
            <label key={key} className="font-fantasy text-[9px] uppercase tracking-widest" style={{ color: "#a89878" }}>{key}
              <input type="number" value={placement[key]} onChange={e => set(key, Number(e.target.value))} className="w-full mt-1 rounded px-2 py-2 text-xs" style={{ background: "rgba(0,0,0,.35)", color: "#e7d7b5", border: "1px solid rgba(106,88,64,.5)" }} />
            </label>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg font-fantasy text-xs" style={{ background: "rgba(0,0,0,.3)", border: "1px solid rgba(106,88,64,.5)", color: "#a89878" }}>Cancel</button>
          <button disabled={!selectedId} onClick={() => onSave(placement)} className="flex-1 py-2 rounded-lg font-fantasy text-xs flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#2d6a4f,#1a4a2e)", border: "1px solid rgba(127,255,212,.4)", color: "#7fffd4" }}><Save className="w-4 h-4" />Save Placement</button>
        </div>
      </div>
    </div>
  );
}
