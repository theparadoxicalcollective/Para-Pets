import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface NpcRow {
  id: string;
  name: string;
  imageUrl: string | null;
  type: string;
  worldId: string;
}

const NPC_WORLD_ID = "__npc_catalog__";

const fileData = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function NpcAdminPanel() {
  const [npcs, setNpcs] = useState<NpcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NpcRow | null>(null);
  const [name, setName] = useState("");
  const [imageData, setImageData] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest("GET", "/api/admin/shop-items-all");
      const rows = await response.json() as NpcRow[];
      setNpcs(rows.filter(row => row.type === "npc" && row.worldId === NPC_WORLD_ID));
      setMessage(null);
    } catch (error: any) {
      setMessage(error?.message || "Could not load NPCs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setName("");
    setImageData("");
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setImageData("");
    setMessage(null);
    setFormOpen(true);
  };

  const openEdit = (npc: NpcRow) => {
    setEditing(npc);
    setName(npc.name);
    setImageData("");
    setMessage(null);
    setFormOpen(true);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || (!editing && !imageData)) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        name: trimmedName,
        price: 0,
        type: "npc",
        worldId: NPC_WORLD_ID,
      };
      if (imageData) payload.imageData = imageData;

      if (editing) {
        await apiRequest("PATCH", `/api/admin/shop/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/admin/shop", payload);
      }
      closeForm();
      await load();
      setMessage(editing ? "NPC updated." : "NPC added.");
    } catch (error: any) {
      setMessage(error?.message || "Could not save NPC.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (npc: NpcRow) => {
    if (!window.confirm(`Delete ${npc.name}?`)) return;
    setMessage(null);
    try {
      await apiRequest("DELETE", `/api/admin/shop/${npc.id}`);
      await load();
      setMessage("NPC deleted.");
    } catch (error: any) {
      setMessage(error?.message || "Could not delete NPC.");
    }
  };

  return (
    <div data-testid="npc-admin-panel" className="space-y-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-fantasy text-xs tracking-wider text-orange-200">NPC DATABASE</p>
          <p className="mt-1 text-[10px] text-stone-400">Upload NPC artwork and names. Parts are reserved for a later update.</p>
        </div>
        <button
          type="button"
          data-testid="button-add-npc"
          onClick={openCreate}
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-fantasy text-[10px] tracking-wider"
          style={{ color: "#fdba74", border: "1px solid rgba(251,146,60,.5)", background: "rgba(100,35,5,.45)" }}
        >
          <Plus size={14} /> ADD NPC
        </button>
      </div>

      {message && (
        <p className="rounded-lg border border-orange-300/20 bg-black/25 px-3 py-2 text-[10px] text-orange-100" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p className="rounded-xl border border-dashed border-orange-300/20 p-8 text-center text-xs text-stone-400">Loading NPCs…</p>
      ) : npcs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-orange-300/20 p-8 text-center text-xs text-stone-400">No NPCs have been added yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {npcs.map(npc => (
            <article key={npc.id} className="rounded-xl p-3" style={{ background: "rgba(0,0,0,.36)", border: "1px solid rgba(251,146,60,.25)" }}>
              <div className="flex items-center gap-3">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/25">
                  {npc.imageUrl ? <img src={npc.imageUrl} alt={npc.name} className="h-full w-full object-contain" /> : <Upload size={18} className="text-stone-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-fantasy text-sm text-orange-200">{npc.name}</p>
                  <p className="mt-1 text-[10px] text-stone-500">NPC character</p>
                </div>
                <div className="flex flex-col">
                  <button type="button" data-testid={`button-edit-npc-${npc.id}`} aria-label={`Edit ${npc.name}`} onClick={() => openEdit(npc)} className="p-2 text-amber-200"><Pencil size={15} /></button>
                  <button type="button" data-testid={`button-delete-npc-${npc.id}`} aria-label={`Delete ${npc.name}`} onClick={() => void remove(npc)} className="p-2 text-red-300"><Trash2 size={15} /></button>
                </div>
              </div>
              <button
                type="button"
                data-testid={`button-npc-parts-${npc.id}`}
                disabled
                title="NPC parts will be enabled in a future update"
                className="mt-3 w-full cursor-not-allowed rounded-lg py-2 font-fantasy text-[10px] tracking-wider opacity-55"
                style={{ color: "#a7f3d0", border: "1px solid rgba(52,211,153,.24)", background: "rgba(5,70,48,.22)" }}
              >
                PARTS — COMING LATER
              </button>
            </article>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[1200] grid place-items-center overflow-y-auto bg-black/80 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl p-5" style={{ background: "#17100c", border: "1px solid rgba(251,146,60,.4)" }}>
            <div className="flex items-center justify-between">
              <h2 className="font-fantasy text-sm text-orange-300">{editing ? "EDIT NPC" : "ADD NPC"}</h2>
              <button type="button" onClick={closeForm} className="text-stone-300"><X size={18} /></button>
            </div>

            <label className="block text-xs text-stone-300">
              Name
              <input
                data-testid="input-npc-name"
                value={name}
                maxLength={80}
                onChange={event => setName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-white outline-none"
                placeholder="NPC name"
              />
            </label>

            <label className="block text-xs text-stone-300">
              NPC image {editing ? "— optional when editing" : ""}
              <input
                data-testid="input-npc-image"
                type="file"
                accept="image/png,image/webp,image/jpeg"
                className="mt-1 block w-full text-xs"
                onChange={async event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try { setImageData(await fileData(file)); }
                  catch { setMessage("Could not read that image. Please choose it again."); }
                }}
              />
            </label>

            {(imageData || editing?.imageUrl) && (
              <img src={imageData || editing?.imageUrl || ""} alt="NPC preview" className="mx-auto h-40 w-40 object-contain" />
            )}

            <button
              type="button"
              disabled={!name.trim() || (!editing && !imageData) || saving}
              onClick={() => void save()}
              data-testid="button-save-npc"
              className="w-full rounded-xl py-3 font-fantasy text-xs tracking-wider disabled:opacity-40"
              style={{ color: "#241207", background: "linear-gradient(135deg,#fdba74,#f59e0b)" }}
            >
              {saving ? "SAVING…" : editing ? "SAVE NPC" : "ADD NPC"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
