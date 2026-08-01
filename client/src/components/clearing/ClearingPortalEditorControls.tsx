import type { ClearingPortalDraft } from "@/hooks/useClearingPortalEditor";

export default function ClearingPortalEditorControls({draft,dirty,saving,error,onEnabled,onCancel,onSave}:{draft:ClearingPortalDraft;dirty:boolean;saving:boolean;error:string|null;onEnabled:(enabled:boolean)=>void;onCancel:()=>void;onSave:()=>void}){
  return <section data-interactive data-testid="clearing-portal-editor-controls" className="pointer-events-auto fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 w-[min(21rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-amber-300/70 bg-emerald-950/95 p-3 text-emerald-50 shadow-2xl" style={{zIndex:60}} onPointerDown={event=>event.stopPropagation()}>
    <h2 className="text-sm font-black text-amber-100">Place Clearing Shop Portal</h2>
    <p className="mt-0.5 text-[11px] text-emerald-100">Drag the portal or tap the ground to place it.</p>
    <label className="mt-2 flex items-center justify-between gap-3 text-xs font-bold"><span>{draft.enabled?"Enabled":"Disabled"}</span><span className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={event=>onEnabled(event.target.checked)}/> Enable Shop</span></label>
    <p className="mt-1 text-[10px] text-emerald-200/75">X {draft.x.toFixed(3)} · Y {draft.y.toFixed(3)}</p>
    {error&&<p role="alert" className="mt-1 text-xs font-bold text-red-200">{error}</p>}
    <div className="mt-2 flex justify-end gap-2"><button type="button" className="rounded-lg border border-emerald-300/40 px-3 py-1.5 text-xs font-bold" disabled={saving} onClick={onCancel}>Cancel</button><button type="button" className="rounded-lg bg-amber-300 px-4 py-1.5 text-xs font-black text-emerald-950 disabled:opacity-50" disabled={!dirty||saving} onClick={onSave}>{saving?"Saving…":"Save"}</button></div>
  </section>;
}
