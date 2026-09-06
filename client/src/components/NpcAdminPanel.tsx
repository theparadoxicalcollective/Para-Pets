import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  getNpcQuestAssociations,
  parseNpcMetadata,
  serializeNpcMetadata,
  type NpcAnimationType,
} from "@/lib/npcMetadata";

interface NpcRow {
  id: string;
  name: string;
  imageUrl: string | null;
  type: string;
  worldId: string;
  specialSkill?: string | null;
}

const NPC_WORLD_ID = "__npc_catalog__";
const EMPTY_MESSAGES = ["", "", ""];

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
  const [animation, setAnimation] = useState<NpcAnimationType>("none");
  const [npcMessages, setNpcMessages] = useState<string[]>(EMPTY_MESSAGES);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const formQuests = useMemo(() => getNpcQuestAssociations(name), [name]);

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

  const resetNpcSettings = () => {
    setAnimation("none");
    setNpcMessages([...EMPTY_MESSAGES]);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setName("");
    setImageData("");
    resetNpcSettings();
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setImageData("");
    resetNpcSettings();
    setMessage(null);
    setFormOpen(true);
  };

  const openEdit = (npc: NpcRow) => {
    const metadata = parseNpcMetadata(npc.specialSkill);
    setEditing(npc);
    setName(npc.name);
    setImageData("");
    setAnimation(metadata.animation);
    setNpcMessages([
      metadata.messages[0] ?? "",
      metadata.messages[1] ?? "",
      metadata.messages[2] ?? "",
    ]);
    setMessage(null);
    setFormOpen(true);
  };

  const updateNpcMessage = (index: number, value: string) => {
    setNpcMessages(previous => previous.map((entry, entryIndex) => entryIndex === index ? value : entry));
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
        specialSkill: serializeNpcMetadata({ animation, messages: npcMessages }),
      };
      if (imageData) payload.imageData = imageData;

      if (editing) {
        await apiRequest("PATCH", `/api/admin/shop/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/admin/shop", payload);
      }
      const wasEditing = Boolean(editing);
      closeForm();
      await load();
      setMessage(wasEditing ? "NPC updated." : "NPC added.");
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
          <p className="mt-1 text-[10px] text-stone-400">Manage NPC artwork, ambient movement, dialogue, and quest links.</p>
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
          {npcs.map(npc => {
            const metadata = parseNpcMetadata(npc.specialSkill);
            const quests = getNpcQuestAssociations(npc.name);
            return (
              <article key={npc.id} className="rounded-xl p-3" style={{ background: "rgba(0,0,0,.36)", border: "1px solid rgba(251,146,60,.25)" }}>
                <div className="flex items-center gap-3">
                  <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/25">
                    {npc.imageUrl ? <img src={npc.imageUrl} alt={npc.name} className="h-full w-full object-contain" /> : <Upload size={18} className="text-stone-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-fantasy text-sm text-orange-200">{npc.name}</p>
                    <p className="mt-1 text-[10px] capitalize text-stone-400">Animation: {metadata.animation}</p>
                    <p className="mt-1 text-[10px] text-stone-500">{metadata.messages.length} NPC message{metadata.messages.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex flex-col">
                    <button type="button" data-testid={`button-edit-npc-${npc.id}`} aria-label={`Edit ${npc.name}`} onClick={() => openEdit(npc)} className="p-2 text-amber-200"><Pencil size={15} /></button>
                    <button type="button" data-testid={`button-delete-npc-${npc.id}`} aria-label={`Delete ${npc.name}`} onClick={() => void remove(npc)} className="p-2 text-red-300"><Trash2 size={15} /></button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-violet-300/15 bg-violet-950/20 px-3 py-2" data-testid={`npc-quests-${npc.id}`}>
                  <p className="font-fantasy text-[9px] tracking-wider text-violet-200">ASSOCIATED QUESTS</p>
                  {quests.length > 0 ? (
                    <div className="mt-1 space-y-1">
                      {quests.map(quest => (
                        <div key={quest.key} className="flex items-center justify-between gap-2 text-[9px] text-stone-300">
                          <span className="truncate">{quest.title}</span>
                          <span className="shrink-0 text-violet-300/70">{quest.worldId.replace(/_/g, " ")}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[9px] text-stone-500">No quests linked to this NPC.</p>
                  )}
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
            );
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[1200] grid place-items-center overflow-y-auto bg-black/80 p-4">
          <div className="my-4 w-full max-w-md space-y-4 rounded-2xl p-5" style={{ background: "#17100c", border: "1px solid rgba(251,146,60,.4)", maxHeight: "92vh", overflowY: "auto" }}>
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

            <fieldset className="rounded-xl border border-orange-300/20 bg-black/20 p-3">
              <legend className="px-1 font-fantasy text-[10px] tracking-wider text-orange-200">AMBIENT MOVEMENT</legend>
              <p className="mb-2 text-[9px] leading-relaxed text-stone-500">Choose how this NPC idles after it is placed in a world.</p>
              <div className="grid grid-cols-3 gap-2">
                {(["none", "breathe", "float"] as NpcAnimationType[]).map(option => (
                  <button
                    key={option}
                    type="button"
                    data-testid={`button-npc-animation-${option}`}
                    aria-pressed={animation === option}
                    onClick={() => setAnimation(option)}
                    className="rounded-lg px-2 py-2 font-fantasy text-[9px] uppercase tracking-wider"
                    style={{
                      color: animation === option ? "#2a1608" : "#fed7aa",
                      background: animation === option ? "#fdba74" : "rgba(88,45,12,.34)",
                      border: animation === option ? "1px solid #fdba74" : "1px solid rgba(251,146,60,.24)",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-emerald-300/15 bg-emerald-950/10 p-3">
              <legend className="px-1 font-fantasy text-[10px] tracking-wider text-emerald-200">NPC MESSAGES</legend>
              <p className="mb-3 text-[9px] leading-relaxed text-stone-500">Add up to 3 lines. When this NPC has no quest, clicking it picks one at random. Leave all three blank for no click dialogue.</p>
              <div className="space-y-2">
                {npcMessages.map((npcMessage, index) => (
                  <label key={index} className="block text-[9px] text-stone-400">
                    Message {index + 1}
                    <textarea
                      data-testid={`input-npc-message-${index + 1}`}
                      value={npcMessage}
                      maxLength={220}
                      rows={2}
                      onChange={event => updateNpcMessage(index, event.target.value)}
                      className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] leading-relaxed text-white outline-none"
                      placeholder={index === 0 ? "What should this NPC say?" : "Optional alternate message"}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="rounded-xl border border-violet-300/15 bg-violet-950/20 p-3" data-testid="npc-form-associated-quests">
              <p className="font-fantasy text-[10px] tracking-wider text-violet-200">ASSOCIATED QUESTS</p>
              {formQuests.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {formQuests.map(quest => (
                    <div key={quest.key} className="rounded-lg border border-violet-300/10 bg-black/20 px-2 py-1.5">
                      <p className="text-[10px] text-violet-100">{quest.title}</p>
                      <p className="mt-0.5 text-[8px] uppercase tracking-wider text-violet-300/60">{quest.worldId.replace(/_/g, " ")}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[9px] text-stone-500">No quests are currently linked to this NPC.</p>
              )}
            </div>

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
