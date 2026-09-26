import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import MiniPetPartEditor from "@/components/MiniPetPartEditor";
import { MINI_PET_PART_TYPES, type MiniPetPartType } from "@shared/miniPet";

interface MiniPetPart { id: string; partType: MiniPetPartType; imageUrl: string }
interface MiniPet {
  shopItemId: string; name: string; imageUrl: string | null; rarity: number;
  price: number;
  atkBoost: number; healthBoost: number; defBoost: number;
  animationStyle: "breath" | "float"; parts: MiniPetPart[];
}

interface PartEditorState {
  shopItemId: string;
  petName: string;
  partType: MiniPetPartType;
  source: string;
  previewParts: MiniPetPart[];
}

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const fileData = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function MiniPetAdminPanel() {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [rarity, setRarity] = useState(1);
  const [price, setPrice] = useState(0);
  const [atkBoost, setAtkBoost] = useState(0);
  const [healthBoost, setHealthBoost] = useState(0);
  const [defBoost, setDefBoost] = useState(0);
  const [animationStyle, setAnimationStyle] = useState<"breath" | "float">("breath");
  const [imageData, setImageData] = useState("");
  const [editingParts, setEditingParts] = useState<string | null>(null);
  const [editingPet, setEditingPet] = useState<MiniPet | null>(null);
  const [partEditor, setPartEditor] = useState<PartEditorState | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: pets = [], isLoading } = useQuery<MiniPet[]>({ queryKey: ["/api/admin/mini-pets"] });

  const reset = () => {
    setName(""); setRarity(1); setPrice(0); setAtkBoost(0); setHealthBoost(0); setDefBoost(0);
    setAnimationStyle("breath"); setImageData(""); setEditingPet(null); setFormOpen(false);
  };
  const openEdit = (pet: MiniPet) => {
    setEditingPet(pet); setName(pet.name); setRarity(pet.rarity); setPrice(pet.price);
    setAtkBoost(pet.atkBoost || 0); setHealthBoost(pet.healthBoost || 0); setDefBoost(pet.defBoost || 0);
    setAnimationStyle(pet.animationStyle); setImageData(""); setFormOpen(true);
  };
  const openPartEditor = (pet: MiniPet, partType: MiniPetPartType, source: string) => {
    setPartEditor({
      shopItemId: pet.shopItemId,
      petName: pet.name,
      partType,
      source,
      previewParts: pet.parts.filter(part => part.partType !== partType),
    });
  };
  const openUploadedPart = async (pet: MiniPet, partType: MiniPetPartType, file?: File) => {
    if (!file) return;
    try {
      openPartEditor(pet, partType, await fileData(file));
    } catch {
      toast({ title: "Could not read image", description: "Please choose the PNG or WebP again.", variant: "destructive" });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name, price, rarity, atkBoost, healthBoost, defBoost, animationStyle,
        ...(imageData ? { imageData } : {}),
      };
      const method = editingPet ? "PATCH" : "POST";
      const url = editingPet ? `/api/admin/mini-pets/${editingPet.shopItemId}` : "/api/admin/mini-pets";
      return (await apiRequest(method, url, payload)).json();
    },
    onSuccess: () => {
      const wasEditing = !!editingPet;
      reset();
      qc.invalidateQueries({ queryKey: ["/api/admin/mini-pets"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: wasEditing ? "Mini Pet updated" : "Mini Pet added", description: wasEditing ? "Price and details saved." : "Now add and position its animation parts. Closed Eyes is optional and pairs with Eyes for blinking." });
    },
    onError: (error: any) => toast({ title: editingPet ? "Could not update Mini Pet" : "Could not add Mini Pet", description: error.message, variant: "destructive" }),
  });
  const savePart = useMutation({
    mutationFn: async ({ shopItemId, partType, imageData: partImageData }: { shopItemId: string; partType: MiniPetPartType; imageData: string }) =>
      (await apiRequest("POST", `/api/admin/mini-pets/${shopItemId}/parts`, { partType, imageData: partImageData })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/mini-pets"] });
      setPartEditor(null);
      toast({ title: "Mini Pet part saved", description: "The positioned transparent part is ready for animation." });
    },
    onError: (error: any) => toast({ title: "Part upload failed", description: error.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (shopItemId: string) => (await apiRequest("DELETE", `/api/admin/mini-pets/${shopItemId}`)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/mini-pets"] }),
    onError: (error: any) => toast({ title: "Could not delete Mini Pet", description: error.message, variant: "destructive" }),
  });

  return (
    <div data-testid="mini-pet-admin-panel" className="space-y-4">
      <button type="button" data-testid="button-add-mini-pet" onClick={() => { reset(); setFormOpen(true); }}
        className="flex items-center gap-2 rounded-lg px-4 py-2 font-fantasy text-xs tracking-wider"
        style={{ color: "#fdba74", border: "1px solid rgba(251,146,60,.5)", background: "rgba(100,35,5,.45)" }}>
        <Plus size={15} /> ADD MINI PET
      </button>

      {isLoading ? <p className="text-xs text-stone-400">Loading Mini Pets…</p> : pets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-orange-300/20 p-8 text-center text-xs text-stone-400">No Mini Pets have been added yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pets.map(pet => (
            <article key={pet.shopItemId} className="rounded-xl p-3" style={{ background: "rgba(0,0,0,.36)", border: "1px solid rgba(251,146,60,.25)" }}>
              <div className="flex items-center gap-3">
                <img src={pet.imageUrl ?? ""} alt={pet.name} className="h-20 w-20 object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-fantasy text-sm text-orange-200">{pet.name}</p>
                  <p className="text-xs text-amber-300">{"★".repeat(pet.rarity)}{"☆".repeat(5 - pet.rarity)}</p>
                  <p className="text-[10px] text-yellow-200">{pet.price.toLocaleString()} coins</p>
                  <p className="mt-1 text-[10px] text-stone-300">+{pet.atkBoost || 0} ATK · +{pet.healthBoost || 0} HP · +{pet.defBoost || 0} DEF</p>
                  <p className="text-[10px] capitalize text-emerald-300/70">{pet.animationStyle} animation · {pet.parts.length}/9 parts</p>
                </div>
                <div className="flex flex-col">
                  <button type="button" data-testid={`button-edit-mini-pet-${pet.shopItemId}`} aria-label={`Edit ${pet.name}`} onClick={() => openEdit(pet)} className="p-2 text-amber-200"><Pencil size={15} /></button>
                  <button type="button" aria-label={`Delete ${pet.name}`} onClick={() => { if (window.confirm(`Delete ${pet.name}?`)) remove.mutate(pet.shopItemId); }} className="p-2 text-red-300"><Trash2 size={15} /></button>
                </div>
              </div>
              <button type="button" data-testid={`button-mini-pet-parts-${pet.shopItemId}`} onClick={() => setEditingParts(editingParts === pet.shopItemId ? null : pet.shopItemId)}
                className="mt-3 w-full rounded-lg py-2 font-fantasy text-[10px] tracking-wider"
                style={{ color: "#a7f3d0", border: "1px solid rgba(52,211,153,.24)", background: "rgba(5,70,48,.22)" }}>
                {editingParts === pet.shopItemId ? "HIDE PARTS" : "ADD / EDIT PET PARTS"}
              </button>
              {editingParts === pet.shopItemId && (
                <div className="mt-3 space-y-2" data-testid={`mini-pet-parts-${pet.shopItemId}`}>
                  <p className="px-1 text-[9px] leading-relaxed text-stone-500">Upload a part, then position and resize it in the layered editor before saving. Existing parts can be reopened and adjusted.</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {MINI_PET_PART_TYPES.map(partType => {
                      const part = pet.parts.find(value => value.partType === partType);
                      return (
                        <div key={partType} className="flex items-center gap-2 rounded-lg p-2 text-[9px]" style={{ border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.025)", color: part ? "#86efac" : "#d6d3d1" }}>
                          {part ? <img src={part.imageUrl} alt="" className="h-9 w-9 shrink-0 object-contain" /> : <Upload size={14} className="shrink-0" />}
                          <span className="min-w-0 flex-1 truncate">{label(partType)}</span>
                          <div className="flex shrink-0 gap-1">
                            {part && (
                              <button type="button" onClick={() => openPartEditor(pet, partType, part.imageUrl)} disabled={savePart.isPending} className="rounded-md border border-emerald-300/20 px-2 py-1 text-[8px] text-emerald-200 disabled:opacity-40" data-testid={`button-edit-mini-pet-part-${pet.shopItemId}-${partType}`}>
                                EDIT
                              </button>
                            )}
                            <label className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-[8px] text-stone-300">
                              {part ? "REPLACE" : "UPLOAD"}
                              <input type="file" accept="image/png,image/webp" className="hidden" disabled={savePart.isPending}
                                onChange={event => { const file = event.target.files?.[0]; void openUploadedPart(pet, partType, file); event.currentTarget.value = ""; }} />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[1000] grid place-items-center overflow-y-auto bg-black/80 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl p-5" style={{ background: "#0c1710", border: "1px solid rgba(251,191,36,.4)" }}>
            <div className="flex items-center justify-between"><h2 className="font-fantasy text-sm text-amber-300">{editingPet ? "EDIT MINI PET" : "ADD MINI PET"}</h2><button onClick={reset} className="text-stone-300"><X size={18} /></button></div>
            <label className="block text-xs text-stone-300">Name<input value={name} maxLength={80} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-white" /></label>
            <label className="block text-xs text-stone-300">Preview image (transparent PNG){editingPet ? " — optional when editing" : ""}
              <input type="file" accept="image/png,image/webp" className="mt-1 block w-full text-xs" onChange={async e => { const file = e.target.files?.[0]; if (file) setImageData(await fileData(file)); }} />
            </label>
            {(imageData || editingPet?.imageUrl) && <img src={imageData || editingPet?.imageUrl || ""} alt="Mini Pet preview" className="mx-auto h-28 w-28 object-contain" />}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-stone-300">Price (coins)<input data-testid="input-mini-pet-price" type="number" min={0} max={100000000} value={price} onChange={e => setPrice(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-white" /></label>
              <label className="text-xs text-stone-300">Rarity<select value={rarity} onChange={e => setRarity(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-white">{[1,2,3,4,5].map(value => <option key={value} value={value}>{value} star{value > 1 ? "s" : ""}</option>)}</select></label>
              <label className="text-xs text-stone-300">Animation<select value={animationStyle} onChange={e => setAnimationStyle(e.target.value as "breath" | "float")} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-white"><option value="breath">Subtle breath</option><option value="float">Subtle float</option></select></label>
            </div>
            <p className="text-[10px] text-stone-400">Use any combination of stat boosts. Leave a stat at 0 if it should not be boosted.</p>
            <div className="grid grid-cols-3 gap-2">
              {([["ATK", atkBoost, setAtkBoost], ["HP", healthBoost, setHealthBoost], ["DEF", defBoost, setDefBoost]] as const).map(([title, value, setter]) => (
                <label key={title} className="text-xs text-stone-300">+{title}<input type="number" min={0} max={100000} value={value} onChange={e => setter(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-white" /></label>
              ))}
            </div>
            <button type="button" disabled={!name.trim() || (!editingPet && !imageData) || save.isPending} onClick={() => save.mutate()} className="w-full rounded-xl py-3 font-fantasy text-xs tracking-wider disabled:opacity-40" style={{ color: "#111", background: "linear-gradient(135deg,#f7c65c,#d89128)" }}>{save.isPending ? "SAVING…" : editingPet ? "SAVE MINI PET" : "ADD MINI PET"}</button>
          </div>
        </div>
      )}

      {partEditor && (
        <MiniPetPartEditor
          petName={partEditor.petName}
          partType={partEditor.partType}
          source={partEditor.source}
          previewParts={partEditor.previewParts}
          saving={savePart.isPending}
          onCancel={() => { if (!savePart.isPending) setPartEditor(null); }}
          onSave={partImageData => savePart.mutate({ shopItemId: partEditor.shopItemId, partType: partEditor.partType, imageData: partImageData })}
        />
      )}
    </div>
  );
}
