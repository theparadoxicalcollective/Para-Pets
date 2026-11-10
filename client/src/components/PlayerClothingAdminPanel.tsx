import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PlayerCharacterRenderer from "./PlayerCharacterRenderer";
import {
  canvasAlignedAvatarBodyTransform,
  completePlayerCharacterParts,
  resolvePlayerCharacterParts,
  type StoredPlayerCharacterPart,
} from "@shared/playerCharacter";
import {
  PLAYER_CLOTHING_CATEGORIES,
  PLAYER_CLOTHING_CATEGORY_LABELS,
  PLAYER_CLOTHING_UPLOAD_SLOTS,
  canvasClothingFit,
  clothingSlotPartType,
  type PlayerClothingCategory,
  type PlayerClothingSegment,
  type PlayerClothingSlot,
} from "@shared/playerCharacterClothing";
import { validClothingPublication } from "@shared/playerClothingAdmin";

type Base = {
  id: string; name: string;
  publishedParts: StoredPlayerCharacterPart[] | null;
  publishedAt: string | null;
};
type ClothingDraft = {
  id: string; baseId: string; basePublishedAt: string;
  name: string; category: PlayerClothingCategory;
  draftSegments: PlayerClothingSegment[];
  publishedSegments: PlayerClothingSegment[] | null;
  shopItemId: string | null; revision: number;
};
type PendingImages = Partial<Record<PlayerClothingSlot,string>>;
const BASE_KEY = ["/api/admin/player-character/bases"];
const CLOTHING_KEY = ["/api/admin/player-character/clothing"];
const buttonClass = "min-h-[44px] rounded-lg border border-[#b99b56]/65 bg-[#20412b] px-3 py-2 font-fantasy text-sm text-[#f3dca0] disabled:opacity-40";
const inputClass = "min-h-[44px] w-full rounded-lg border border-[#a18a50]/65 bg-[#0c2117] px-3 py-2 text-sm text-[#f7e8c0] focus:outline-none focus:ring-2 focus:ring-[#d2b76e]";
const cardClass = "rounded-xl border border-[#9c854b]/60 bg-[#10291d]/90 p-3";
const slotLabels: Record<PlayerClothingSlot,string> = {
  head: "Head",
  top: "Torso",
  left_arm: "Left Arm",
  right_arm: "Right Arm",
  left_leg: "Left Leg",
  right_leg: "Right Leg",
  left_foot: "Left Foot",
  right_foot: "Right Foot",
  hair_front: "Front Hair",
  hair_back: "Back Hair",
  face_open_eyes: "Open Eyes",
  face_closed_eyes: "Closed Eyes",
  face_mouth: "Mouth",
};

function readImage(file: File): Promise<string> {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result) : reject(new Error("Could not read clothing artwork"));
    reader.onerror = () => reject(new Error("Could not read clothing artwork"));
    reader.readAsDataURL(file);
  });
}
async function requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  return (await apiRequest(method,url,body)).json() as Promise<T>;
}
function segmentSlot(segment: PlayerClothingSegment, category: PlayerClothingCategory): PlayerClothingSlot {
  if (segment.slot) return segment.slot;
  if (category === "hair" && segment.partType === "head") return "hair_front";
  if (category === "face" && segment.partType === "head") return "face_open_eyes";
  return segment.partType;
}
function isAligned(segment: PlayerClothingSegment, category: PlayerClothingCategory) {
  const normal = canvasClothingFit();
  return segment.canvasAligned === true && !!segment.slot &&
    segment.slot === segmentSlot(segment, category) &&
    Object.keys(normal).every(key =>
      segment.fit[key as keyof typeof normal] === normal[key as keyof typeof normal]);
}

/** One saved clothing item can upload several already-positioned square images.
 * Rendering and storage use the same full-canvas contract as Masc/Fem bodies. */
export default function PlayerClothingAdminPanel({
  onDirtyChange,
}: { onDirtyChange?: (dirty: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [newName,setNewName] = useState("");
  const [newCategory,setNewCategory] = useState<PlayerClothingCategory>("top");
  const [newBaseId,setNewBaseId] = useState("");
  const [draftName,setDraftName] = useState("");
  const [draftCategory,setDraftCategory] = useState<PlayerClothingCategory>("top");
  const [pendingImages,setPendingImages] = useState<PendingImages>({});
  const [removedSlots,setRemovedSlots] = useState<PlayerClothingSlot[]>([]);
  const [readingParts,setReadingParts] = useState(0);
  const [metaDirty,setMetaDirty] = useState(false);

  const basesQuery = useQuery<Base[]>({
    queryKey: BASE_KEY,
    queryFn: () => requestJson<Base[]>("GET","/api/admin/player-character/bases"),
  });
  const draftsQuery = useQuery<ClothingDraft[]>({
    queryKey: CLOTHING_KEY,
    queryFn: () => requestJson<ClothingDraft[]>("GET","/api/admin/player-character/clothing"),
  });
  const bases = (basesQuery.data ?? []).filter(base =>
    base.publishedParts && completePlayerCharacterParts(base.publishedParts));
  const drafts = draftsQuery.data ?? [];
  const selected = drafts.find(item => item.id === selectedId) ??
    (selectedId === null ? drafts[0] : undefined);
  const base = bases.find(item => item.id === selected?.baseId);
  const baseUnchanged = !!base?.publishedAt && !!selected &&
    new Date(base.publishedAt).getTime() === new Date(selected.basePublishedAt).getTime();

  const savedSegments = selected?.draftSegments ?? [];
  const needsAlignment = !!selected && savedSegments.some(segment =>
    !isAligned(segment,selected.category));
  const artworkDirty = Object.keys(pendingImages).length > 0 || removedSlots.length > 0;
  const anyDirty = artworkDirty || metaDirty;
  useEffect(() => { onDirtyChange?.(anyDirty); }, [anyDirty,onDirtyChange]);
  useEffect(() => {
    if (bases.length && !bases.some(base => base.id === newBaseId)) setNewBaseId(bases[0].id);
  }, [basesQuery.data,newBaseId]);
  useEffect(() => {
    setDraftName(selected?.name ?? "");
    setDraftCategory(selected?.category ?? "top");
    setMetaDirty(false);
  }, [selected?.id,selected?.revision]);

  const bodyParts = useMemo(() =>
    base?.publishedParts
      ? resolvePlayerCharacterParts(base.publishedParts).map(part => ({
          ...part, ...canvasAlignedAvatarBodyTransform(part.partType),
        }))
      : [], [base?.publishedParts]);

  const previewSegments = useMemo<PlayerClothingSegment[]>(() => {
    if (!selected) return [];
    const merged = new Map<PlayerClothingSlot,PlayerClothingSegment>();
    for (const segment of savedSegments) {
      const slot = segmentSlot(segment,selected.category);
      if (!removedSlots.includes(slot)) merged.set(slot,{
        ...segment, slot, canvasAligned: true,
        fit: canvasClothingFit(), renderPlane: "with_part",
      });
    }
    for (const [slot,imageUrl] of Object.entries(pendingImages)) {
      if (!imageUrl) continue;
      const part = slot as PlayerClothingSlot;
      merged.set(part,{
        slot: part, partType: clothingSlotPartType(part), imageUrl,
        canvasAligned: true, fit: canvasClothingFit(), renderPlane: "with_part",
      });
    }
    return [...merged.values()];
  },[selected?.id,selected?.category,savedSegments,pendingImages,removedSlots]);
  const slots = selected ? PLAYER_CLOTHING_UPLOAD_SLOTS[selected.category] : [];

  const updateDraft = (row: ClothingDraft) =>
    qc.setQueryData<ClothingDraft[]>(CLOTHING_KEY,old =>
      (old ?? []).some(item => item.id === row.id)
        ? (old ?? []).map(item => item.id === row.id ? row : item)
        : [...(old ?? []),row]);
  const errorMessage = (error: unknown) => toast({
    title: "Clothing not saved",
    description: error instanceof Error ? error.message : "Please retry.",
    variant: "destructive",
  });

  const create = useMutation({
    mutationFn: () => requestJson<ClothingDraft>("POST","/api/admin/player-character/clothing",{
      name: newName.trim(),category:newCategory,baseId:newBaseId,
    }),
    onSuccess: row => {
      updateDraft(row);setSelectedId(row.id);
      toast({title:"Clothing draft created"});
    },
    onError:errorMessage,
  });
  const saveArtwork = useMutation({
    mutationFn: (input: { draft:ClothingDraft;images:PendingImages;removed:PlayerClothingSlot[] }) =>
      requestJson<ClothingDraft>("PUT",
        `/api/admin/player-character/clothing/${input.draft.id}/artwork`,{
          expectedRevision:input.draft.revision,
          images:Object.entries(input.images)
            .filter((pair):pair is [string,string] => !!pair[1])
            .map(([slot,imageData])=>({slot,imageData})),
          removeSlots:input.removed,
        }),
    onSuccess: row => {
      updateDraft(row);setPendingImages({});setRemovedSlots([]);
      toast({title:"Clothing artwork saved"});
    },
    onError:errorMessage,
  });
  const saveDetails = useMutation({
    mutationFn: () => requestJson<ClothingDraft>("PATCH",
      `/api/admin/player-character/clothing/${selected!.id}`,{
        name:draftName.trim(),category:draftCategory,expectedRevision:selected!.revision,
      }),
    onSuccess: row => updateDraft(row),
    onError:errorMessage,
  });
  const saveClothing = useMutation({
    mutationFn: () => requestJson<ClothingDraft>("POST",
      `/api/admin/player-character/clothing/${selected!.id}/save`,{
        expectedRevision:selected!.revision,
      }),
    onSuccess: row => {
      updateDraft(row);
      void qc.invalidateQueries({queryKey:["/api/admin/shop-items-all"]});
      toast({title:"Clothing item saved"});
    },
    onError:errorMessage,
  });
  const busy = create.isPending || saveArtwork.isPending || saveDetails.isPending
    || saveClothing.isPending || readingParts > 0;
  const canSaveClothing = !!selected && baseUnchanged && !anyDirty &&
    !needsAlignment && !busy &&
    validClothingPublication(selected.name,selected.category,selected.draftSegments);

  const onImageSelected = async (slot:PlayerClothingSlot,file?:File) => {
    if (!file) return;
    if (!["image/png","image/webp"].includes(file.type) || file.size > 5_000_000) {
      toast({title:"Unsupported image",description:"Choose a PNG or WebP under 5 MB.",
        variant:"destructive"});
      return;
    }
    setReadingParts(n=>n+1);
    try {
      const imageData = await readImage(file);
      const byteCount = Object.entries({...pendingImages,[slot]:imageData})
        .reduce((n,[,value])=>n+(value?.length ?? 0),0);
      if (byteCount > 40_000_000) {
        toast({title:"Clothing images are too large together",
          description:"Use smaller files.",variant:"destructive"});
        return;
      }
      setPendingImages(current=>({...current,[slot]:imageData}));
      setRemovedSlots(current=>current.filter(item=>item!==slot));
    } catch(error) { errorMessage(error); }
    finally {setReadingParts(n=>n-1);}
  };
  const removeImage = (slot:PlayerClothingSlot) => {
    const next={...pendingImages};
    delete next[slot];
    setPendingImages(next);
    if (savedSegments.some(item=>segmentSlot(item,selected!.category)===slot))
      setRemovedSlots(old=>old.includes(slot)?old:[...old,slot]);
  };
  const discard = () => {
    setPendingImages({});setRemovedSlots([]);setMetaDirty(false);
    setDraftName(selected?.name ?? "");setDraftCategory(selected?.category ?? "top");
  };

  return (
    <section data-testid="player-clothing-admin-panel" className="space-y-3 text-[#f3dfad]">
      <div className={cardClass+" space-y-2"}>
        <h2 className="font-fantasy text-lg font-bold text-[#f4d88f]">Create Clothing</h2>
        <input className={inputClass} value={newName} maxLength={80}
          aria-label="New clothing name" placeholder="Clothing name"
          onChange={event=>setNewName(event.target.value)}/>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">Category
            <select className={inputClass} value={newCategory}
              onChange={event=>setNewCategory(event.target.value as PlayerClothingCategory)}>
              {PLAYER_CLOTHING_CATEGORIES.map(category=>
                <option key={category} value={category}>{PLAYER_CLOTHING_CATEGORY_LABELS[category]}</option>)}
            </select>
          </label>
          <label className="text-xs">Avatar body
            <select className={inputClass} value={newBaseId}
              onChange={event=>setNewBaseId(event.target.value)}>
              {bases.map(base=><option key={base.id} value={base.id}>{base.name}</option>)}
            </select>
          </label>
        </div>
        {!bases.length && <p role="alert" className="text-xs text-[#f4d48a]">
          Publish a completed avatar body before creating clothing.
        </p>}
        <button type="button" className={buttonClass+" w-full"}
          data-testid="avatar-create-clothing" disabled={busy||anyDirty||!newName.trim()||!newBaseId}
          onClick={()=>create.mutate()}>Add Clothing</button>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Saved clothing drafts">
          {drafts.map(item=><button key={item.id} type="button" className={buttonClass}
            aria-pressed={item.id===selected?.id} disabled={busy||anyDirty}
            onClick={()=>setSelectedId(item.id)}>{item.name}</button>)}
        </div>
        {draftsQuery.isError && <button type="button" className={buttonClass}
          onClick={()=>void draftsQuery.refetch()}>Retry loading clothing</button>}
      </div>

      {selected && <div className="space-y-3">
        {!baseUnchanged && <p role="alert" className={cardClass+" text-xs"}>
          This avatar base was republished. Create clothing for the updated body.
        </p>}
        <div className={cardClass+" space-y-2"}>
          <input className={inputClass} aria-label="Edit clothing name"
            maxLength={80} disabled={busy} value={draftName}
            onChange={event=>{setDraftName(event.target.value);setMetaDirty(true);}}/>
          <select className={inputClass} aria-label="Edit clothing category"
            disabled={busy} value={draftCategory}
            onChange={event=>{setDraftCategory(event.target.value as PlayerClothingCategory);setMetaDirty(true);}}>
            {PLAYER_CLOTHING_CATEGORIES.map(category=>
              <option key={category} value={category}>{PLAYER_CLOTHING_CATEGORY_LABELS[category]}</option>)}
          </select>
          <button type="button" className={buttonClass+" w-full"}
            disabled={busy||artworkDirty||!metaDirty||!draftName.trim()}
            onClick={()=>saveDetails.mutate()}>Save Details</button>
        </div>

        <div className={cardClass}>
          <h3 className="mb-2 text-center font-fantasy text-lg text-[#f4d88f]">
            {selected.name} · Preview
          </h3>
          <div className="mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-xl border border-[#ba9956]/55"
            data-testid="avatar-clothing-fit-canvas"
            style={{background:"radial-gradient(circle,#345d40,#0a1b11)"}}>
            <PlayerCharacterRenderer parts={bodyParts} clothingSegments={previewSegments}
              previewClothingCategory={selected.category} motion="static"
              ariaLabel="Avatar clothing layered preview"/>
          </div>
        </div>

        <div className={cardClass+" space-y-3"}>
          <div role="group" aria-label="Clothing piece upload boxes"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.map(slot=>{
              const image=previewSegments.find(segment=>segment.slot===slot)?.imageUrl;
              return (
                <div key={slot} data-testid={`clothing-part-${slot}`}
                  className="relative flex min-h-[92px] flex-col items-center justify-center rounded-lg border border-[#b99b56]/65 bg-[#123425] px-2 py-2 text-center text-xs">
                  <label className="flex w-full cursor-pointer flex-col items-center gap-1">
                    {image?<img src={image} alt="" draggable={false} className="h-10 w-12 object-contain"/>
                      :<span aria-hidden="true" className="text-2xl">+</span>}
                    <span>{slotLabels[slot]}</span>
                    {pendingImages[slot] && <span className="text-[#ffe4a1]">New</span>}
                    <input type="file" accept="image/png,image/webp"
                      className="sr-only" disabled={busy||!baseUnchanged}
                      aria-label={`Upload ${slotLabels[slot]}`}
                      data-testid={`avatar-clothing-upload-${slot}`}
                      onChange={event=>{
                        void onImageSelected(slot,event.currentTarget.files?.[0]);
                        event.currentTarget.value="";
                      }}/>
                  </label>
                  {image && <button type="button" disabled={busy}
                    className="mt-1 text-xs text-[#ffe0a0] underline"
                    aria-label={`Remove ${slotLabels[slot]}`}
                    onClick={()=>removeImage(slot)}>Remove</button>}
                </div>
              );
            })}
          </div>
          <button type="button" className={buttonClass+" w-full"}
            data-testid="avatar-save-clothing-artwork"
            disabled={busy||metaDirty||!baseUnchanged||(!artworkDirty&&!needsAlignment)}
            onClick={()=>saveArtwork.mutate({
              draft:selected,images:{...pendingImages},removed:[...removedSlots],
            })}>
            {saveArtwork.isPending?"Saving Artwork…":"Save Artwork"}
          </button>
          {anyDirty && <button type="button" className={buttonClass+" w-full"}
            disabled={busy} onClick={discard}>Discard Unsaved Changes</button>}
        </div>

        <button type="button" data-testid="avatar-publish-clothing"
          className={buttonClass+" w-full"}
          disabled={!canSaveClothing} onClick={()=>saveClothing.mutate()}>
          {saveClothing.isPending?"Saving Clothing…":"Save Clothing Item"}
        </button>
      </div>}
    </section>
  );
}
