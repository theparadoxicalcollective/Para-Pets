import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PlayerCharacterRenderer from "./PlayerCharacterRenderer";
import {
  PLAYER_CHARACTER_PART_LABELS,
  PLAYER_CHARACTER_PART_TYPES,
  availablePlayerCharacterBody,
  canvasAlignedAvatarBodyTransform,
  type PlayerCharacterPartType,
  type StoredPlayerCharacterPart,
} from "@shared/playerCharacter";
import {
  PLAYER_CLOTHING_CATEGORIES,
  PLAYER_CLOTHING_CATEGORY_LABELS,
  PLAYER_CLOTHING_DEFAULT_ATTACHMENTS,
  PLAYER_CLOTHING_FREE_SLOTS,
  canvasClothingFit,
  clothingSegmentKey,
  isFreeClothingSlot,
  type PlayerClothingCategory,
  type PlayerClothingSegment,
  type PlayerClothingSlot,
  type PlayerShoesLayer,
} from "@shared/playerCharacterClothing";

type Base = {
  id: string; name: string; draftParts: StoredPlayerCharacterPart[];
  publishedParts: StoredPlayerCharacterPart[] | null;
  publishedAt: string | null; updatedAt: string;
};
type ClothingDraft = {
  id: string; revision: number; name: string;
  category: PlayerClothingCategory; shopItemId: string | null;
  draftSegments: PlayerClothingSegment[];
  publishedSegments: PlayerClothingSegment[] | null;
  universal?: boolean;
};
type ClothingPart = {
  slot: PlayerClothingSlot;
  previousSlot?: PlayerClothingSlot;
  partType: PlayerCharacterPartType;
  imageUrl?: string;
  imageData?: string;
};
const FACE_SLOTS = ["face_open_eyes", "face_closed_eyes", "face_mouth"] as const;
const FACE_LABELS: Record<typeof FACE_SLOTS[number], string> = {
  face_open_eyes: "Open Eyes", face_closed_eyes: "Closed Eyes", face_mouth: "Mouth",
};
const BASE_KEY = ["/api/admin/player-character/bases"];
const CLOTHING_KEY = ["/api/admin/player-character/clothing"];
const buttonClass = "min-h-[44px] rounded-xl border border-[#c1a566]/75 bg-[#244c33] px-3 py-2 font-fantasy text-sm text-[#ffe8ab] disabled:opacity-45 touch-manipulation";
const inputClass = "min-h-[44px] w-full rounded-xl border border-[#a68e57] bg-[#0c2117] px-3 py-2 text-sm text-[#f7e8c0] focus:outline-none focus:ring-2 focus:ring-[#dbbd72]";
const cardClass = "rounded-2xl border border-[#a7905a]/70 bg-[#112b1f]/95 p-3 sm:p-4";
function faceParts(): ClothingPart[] {
  return FACE_SLOTS.map(slot => ({ slot, partType: "head" }));
}
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result) : reject(new Error("Could not read clothing art"));
    reader.onerror = () => reject(new Error("Could not read clothing art"));
    reader.readAsDataURL(file);
  });
}
async function requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  return (await apiRequest(method, url, body)).json() as Promise<T>;
}
/** Existing art is retained by its original slot on Save, never by a
 * user-submitted media URL. Old named slots are shown in the new piece list. */
function partsFromDraft(draft: ClothingDraft): ClothingPart[] {
  const segments = draft.draftSegments.length ? draft.draftSegments : draft.publishedSegments ?? [];
  if (draft.category === "face") {
    return faceParts().map(part => {
      const old = segments.find(s => (s.slot ?? (s.partType === "head" ? "face_open_eyes" : s.partType)) === part.slot);
      return old ? { ...part, previousSlot: clothingSegmentKey(old) as PlayerClothingSlot,
        imageUrl: old.imageUrl } : part;
    });
  }
  return segments.slice(0, PLAYER_CLOTHING_FREE_SLOTS.length).map((segment, index) => ({
    slot: isFreeClothingSlot(segment.slot ?? "")
      ? segment.slot! : PLAYER_CLOTHING_FREE_SLOTS[index],
    previousSlot: clothingSegmentKey(segment) as PlayerClothingSlot,
    partType: segment.partType,
    imageUrl: segment.imageUrl,
  }));
}

/** One universal clothing item has many independent, part-attached images.
 * Preview-body buttons do not determine compatibility or split catalog SKUs. */
export default function PlayerClothingAdminPanel({
  onDirtyChange,
}: { onDirtyChange?: (dirty: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [screen, setScreen] = useState<"create" | "view">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlayerClothingCategory>("top");
  const [parts, setParts] = useState<ClothingPart[]>([]);
  const [previewBodyId, setPreviewBodyId] = useState<string | null>(null);
  const [closedEyes, setClosedEyes] = useState(false);
  const [shoesLayer, setShoesLayer] = useState<PlayerShoesLayer>("under");
  const [readingParts, setReadingParts] = useState(0);
  const [changed, setChanged] = useState(false);

  const basesQuery = useQuery<Base[]>({
    queryKey: BASE_KEY,
    queryFn: () => requestJson<Base[]>("GET", "/api/admin/player-character/bases"),
  });
  const draftsQuery = useQuery<ClothingDraft[]>({
    queryKey: CLOTHING_KEY,
    queryFn: () => requestJson<ClothingDraft[]>("GET", "/api/admin/player-character/clothing"),
  });
  const savedBodies = (basesQuery.data ?? []).flatMap(base => {
    const kind = base.name.trim().toLowerCase();
    if (kind !== "fem" && kind !== "masc") return [];
    const snapshot = availablePlayerCharacterBody({
      ...base, publishedAt: base.publishedAt ? new Date(base.publishedAt) : null,
      updatedAt: new Date(base.updatedAt),
    });
    return snapshot ? [{ id: base.id, kind, parts: snapshot.parts }] : [];
  });
  const chosenBody = savedBodies.find(body => body.id === previewBodyId) ??
    savedBodies.find(body => body.kind === "fem") ?? savedBodies[0];
  const bodyParts = useMemo(() => (chosenBody?.parts ?? []).map(part => ({
    ...part, ...canvasAlignedAvatarBodyTransform(part.partType),
  })), [chosenBody?.parts]);
  const activeDraft = (draftsQuery.data ?? []).find(item => item.id === editingId);
  const previewSegments = useMemo<PlayerClothingSegment[]>(() =>
    parts.flatMap(part => {
      const imageUrl = part.imageData ?? part.imageUrl;
      return imageUrl ? [{
        slot: part.slot, partType: part.partType, imageUrl,
        fit: canvasClothingFit(), canvasAligned: true as const,
        renderPlane: "with_part" as const,
        ...(category === "shoes" ? { shoesLayer } : {}),
      }] : [];
    }), [parts, category, shoesLayer]);
  const faceReady = FACE_SLOTS.every(slot =>
    parts.some(part => part.slot === slot && !!(part.imageData ?? part.imageUrl)));
  const pieceCount = parts.filter(part => part.imageData || part.imageUrl).length;
  const canSave = name.trim().length > 0 && (category === "face" ? faceReady : pieceCount > 0)
    && !!chosenBody && readingParts === 0 && (!editingId || !!activeDraft);

  const updateDraft = (row: ClothingDraft) =>
    qc.setQueryData<ClothingDraft[]>(CLOTHING_KEY, current =>
      (current ?? []).some(item => item.id === row.id)
        ? (current ?? []).map(item => item.id === row.id ? row : item)
        : [...(current ?? []), row]);
  const saveItem = useMutation({
    mutationFn: () => requestJson<ClothingDraft>("POST", "/api/admin/player-character/clothing/item", {
      ...(editingId ? { id: editingId, expectedRevision: activeDraft!.revision } : {}),
      name: name.trim(), category,
      images: parts.filter(part => !!part.imageData).map(part => ({
        slot: part.slot, partType: part.partType, imageData: part.imageData,
      })),
      keep: parts.filter(part => !part.imageData && part.imageUrl && part.previousSlot).map(part => ({
        previousSlot: part.previousSlot, slot: part.slot, partType: part.partType,
      })),
      ...(category === "shoes" ? { shoesLayer } : {}),
    }),
    onSuccess: result => {
      updateDraft(result);
      void qc.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      setChanged(false);
      setEditingId(null);
      setName("");
      setCategory("top");
      setParts([]);
      setScreen("view");
      toast({ title: "Clothing saved", description: "One universal clothing item was added to the clothing item list." });
    },
    onError: (error: Error) => toast({
      title: "Clothing not saved", description: error.message, variant: "destructive",
    }),
  });
  const busy = saveItem.isPending || readingParts > 0;
  useEffect(() => { onDirtyChange?.(changed || busy); }, [onDirtyChange, changed, busy]);

  const startNew = () => {
    if (busy) return;
    setEditingId(null); setName(""); setCategory("top"); setParts([]);
    setShoesLayer("under"); setClosedEyes(false); setChanged(false);
    setScreen("create");
  };
  const openExisting = (draft: ClothingDraft) => {
    if (busy) return;
    setEditingId(draft.id); setName(draft.name); setCategory(draft.category);
    setParts(partsFromDraft(draft));
    setShoesLayer(draft.draftSegments.find(segment => segment.shoesLayer)?.shoesLayer ?? "under");
    setClosedEyes(false); setChanged(false); setScreen("create");
  };
  const selectCategory = (next: PlayerClothingCategory) => {
    if (busy || category === next) return;
    setCategory(next); setParts(next === "face" ? faceParts() : []);
    setClosedEyes(false); setChanged(true);
  };
  const upload = async (slot: PlayerClothingSlot, file?: File, replace = false) => {
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type) || file.size > 5_000_000) {
      toast({ title: "Unsupported image", description: "Use a PNG or WebP smaller than 5 MB.",
        variant: "destructive" });
      return;
    }
    setReadingParts(count => count + 1);
    try {
      const data = await readImage(file);
      const total = parts.reduce((n, part) => n + (part.imageData?.length ?? 0), 0)
        + data.length;
      if (total > 40_000_000) {
        toast({ title: "Clothing artwork is too large", description: "Use smaller images.",
          variant: "destructive" });
        return;
      }
      setParts(current => {
        if (replace) return current.map(part => part.slot === slot
          ? { ...part, imageData: data, imageUrl: undefined } : part);
        if (current.some(part => part.slot === slot)) return current;
        return [...current, {
          slot, imageData: data,
          partType: PLAYER_CLOTHING_DEFAULT_ATTACHMENTS[category][0],
        }];
      });
      setChanged(true);
    } catch (error) {
      toast({ title: "Could not upload image",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive" });
    } finally { setReadingParts(count => count - 1); }
  };
  const remove = (slot: PlayerClothingSlot) => {
    if (category === "face") {
      setParts(current => current.map(part => part.slot === slot
        ? { slot, partType: "head" } : part));
    } else {
      setParts(current => current.filter(part => part.slot !== slot));
    }
    setChanged(true);
  };
  const nextSlot = PLAYER_CLOTHING_FREE_SLOTS.find(slot => !parts.some(part => part.slot === slot));
  const itemList = draftsQuery.data ?? [];

  return (
    <section data-testid="player-clothing-admin-panel" className="space-y-3 text-[#f3dfad]">
      <div role="tablist" aria-label="Clothing editor" className="grid grid-cols-2 gap-2">
        <button type="button" role="tab" aria-selected={screen === "view"}
          className={buttonClass} disabled={busy}
          onClick={() => setScreen("view")}>View Clothes</button>
        <button type="button" role="tab" aria-selected={screen === "create"}
          className={buttonClass} disabled={busy} onClick={startNew}>Create</button>
      </div>

      {screen === "view" ? (
        <div className={cardClass + " space-y-3"} data-testid="avatar-clothing-view">
          <h2 className="font-fantasy text-xl text-[#f1d58e]">Clothing Items</h2>
          {!itemList.length && <p className="text-sm text-[#d1be92]">No clothing items saved yet.</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {itemList.map(item => (
              <button type="button" key={item.id} disabled={busy}
                onClick={() => openExisting(item)}
                className="flex min-h-[65px] items-center gap-3 rounded-xl border border-[#a18b52] bg-[#0c2419] p-3 text-left">
                {item.publishedSegments?.[0]?.imageUrl
                  ? <img src={item.publishedSegments[0].imageUrl} alt="" className="h-11 w-11 object-contain" />
                  : <span className="text-2xl text-[#e6cc83]">+</span>}
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-[#f3d99b]">{item.name}</strong>
                  <small className="text-[#c9c09d]">{PLAYER_CLOTHING_CATEGORY_LABELS[item.category]} · {item.shopItemId ? "Saved item" : "Draft"}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3" data-testid="avatar-clothing-create-screen">
          <div className={cardClass + " space-y-3"}>
            <h2 className="text-center font-fantasy text-xl font-bold text-[#f4d78e]">
              {editingId ? "Editing Clothing Item" : "Creating Clothing Item"}
            </h2>
            <input className={inputClass} value={name} maxLength={80}
              aria-label="Clothing name" data-testid="avatar-new-clothing-name"
              placeholder="Clothing name" disabled={busy}
              onChange={event => { setName(event.target.value); setChanged(true); }} />
            <label className="block space-y-1 text-xs text-[#e6d29c]">Category
              <select className={inputClass} value={category}
                aria-label="Clothing category" data-testid="avatar-new-clothing-category"
                disabled={busy}
                onChange={event => selectCategory(event.target.value as PlayerClothingCategory)}>
                {PLAYER_CLOTHING_CATEGORIES.map(value => (
                  <option key={value} value={value}>{PLAYER_CLOTHING_CATEGORY_LABELS[value]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={cardClass + " space-y-2"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-fantasy text-xl text-[#f4d78e]">Preview</h3>
              <div role="group" aria-label="Preview body" className="flex gap-2" data-testid="avatar-clothing-body-selector">
                {(["masc", "fem"] as const).map(kind => {
                  const body = savedBodies.find(item => item.kind === kind);
                  return (
                    <button type="button" key={kind} className={buttonClass + " !h-[46px] !min-h-0 !w-[49px] !rounded-full !p-0"}
                      aria-label={kind === "fem" ? "Preview Fem body" : "Preview Masc body"}
                      aria-pressed={chosenBody?.id === body?.id}
                      data-testid={"avatar-clothing-preview-" + kind}
                      disabled={!body || busy} onClick={() => setPreviewBodyId(body!.id)}
                      style={{ borderColor: chosenBody?.id === body?.id ? "#ffdc88" : "#816f43",
                        background: chosenBody?.id === body?.id ? "#45653a" : "#183326" }}>
                      <span aria-hidden="true" className="text-2xl">{kind === "fem" ? "♀" : "♂"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-xl border border-[#b49a62]/70"
              data-testid="avatar-clothing-fit-canvas"
              style={{ background: "radial-gradient(circle,#35573c,#091910)" }}>
              {chosenBody ? (
                <PlayerCharacterRenderer parts={bodyParts} clothingSegments={previewSegments}
                  previewClothingCategory={category} previewEyesClosed={closedEyes}
                  motion="static" ariaLabel="Universal clothing layered over chosen preview body" />
              ) : (
                <p className="p-5 text-center text-sm">Save a complete Fem or Masc body to preview clothing.</p>
              )}
            </div>
            {category === "face" && (
              <div className="mx-auto grid max-w-[360px] grid-cols-2 gap-2" role="group" aria-label="Face expression preview">
                <button type="button" className={buttonClass} aria-pressed={!closedEyes}
                  onClick={() => setClosedEyes(false)}>Open Eyes</button>
                <button type="button" className={buttonClass} aria-pressed={closedEyes}
                  onClick={() => setClosedEyes(true)}>Closed Eyes</button>
              </div>
            )}
            {category === "shoes" && (
              <div className="mx-auto grid max-w-[360px] grid-cols-2 gap-2" role="group" aria-label="Shoes layering with pants">
                {(["under", "over"] as const).map(layer => (
                  <button type="button" key={layer} className={buttonClass}
                    data-testid={"avatar-shoes-" + layer + "-pants"}
                    disabled={busy} aria-pressed={shoesLayer === layer}
                    onClick={() => { setShoesLayer(layer); setChanged(true); }}>
                    {layer === "under" ? "Under Pants" : "Over Pants"}
                  </button>
                ))}
              </div>
            )}
            <p className="text-center text-xs text-[#c4c3a1]">
              Clothing is saved once for both bodies; these buttons only change the preview.
            </p>
          </div>

          <div className={cardClass + " space-y-3"}>
            <h3 className="text-center font-fantasy text-xl text-[#f4d78e]">Upload Clothing Parts</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <div className="space-y-2">
                {category === "face" ? (
                  FACE_SLOTS.map(slot => {
                    const part = parts.find(item => item.slot === slot);
                    return (
                      <label key={slot} className="flex min-h-[50px] cursor-pointer items-center justify-between rounded-xl border border-[#bba365]/75 bg-[#1c4030] px-3 text-sm">
                        <span>{FACE_LABELS[slot]} <span className="text-[#c4af6c]">*</span></span>
                        <span>{part?.imageData || part?.imageUrl ? "Replace" : "+ Upload"}</span>
                        <input type="file" accept="image/png,image/webp" className="sr-only"
                          aria-label={"Upload " + FACE_LABELS[slot]}
                          data-testid={"avatar-clothing-upload-" + slot}
                          disabled={busy} onChange={event => {
                            void upload(slot, event.currentTarget.files?.[0], true);
                            event.currentTarget.value = "";
                          }} />
                      </label>
                    );
                  })
                ) : (
                  <label className={buttonClass + " flex cursor-pointer items-center justify-center gap-2 text-center"}
                    aria-label="Add clothing part">
                    <span aria-hidden="true" className="text-xl">+</span> Add Part
                    <input type="file" accept="image/png,image/webp" className="sr-only"
                      aria-label="Add clothing part image" data-testid="avatar-clothing-add-part"
                      disabled={!nextSlot || busy}
                      onChange={event => {
                        if (nextSlot) void upload(nextSlot, event.currentTarget.files?.[0]);
                        event.currentTarget.value = "";
                      }} />
                  </label>
                )}
                <p className="text-xs leading-relaxed text-[#d3c49a]">
                  PNG or WebP artwork on the same transparent 1000 × 1000 canvas.
                  {category === "face"
                    ? " All three facial images are required."
                    : " Add several pieces, then choose the body part each follows."}
                </p>
              </div>

              <div className="min-w-0 space-y-2" data-testid="avatar-clothing-uploaded-parts">
                <h4 className="text-center font-fantasy text-base text-[#e9d29a]">Uploaded Parts</h4>
                {parts.filter(part => part.imageData || part.imageUrl).length === 0 &&
                  <p className="rounded-xl border border-dashed border-[#93835a] p-3 text-center text-xs text-[#beaf8c]">
                    Your uploaded pieces will appear here.
                  </p>}
                {parts.filter(part => part.imageData || part.imageUrl).map(part => (
                  <div key={part.slot} data-testid={"clothing-part-" + part.slot}
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-[#a9945c] bg-[#0c241a] p-2">
                    <img src={part.imageData ?? part.imageUrl} alt="" draggable={false}
                      className="h-11 w-11 shrink-0 rounded-lg bg-[#234831] object-contain" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-xs font-bold text-[#f2dca5]">
                        {category === "face" && FACE_SLOTS.includes(part.slot as typeof FACE_SLOTS[number])
                          ? FACE_LABELS[part.slot as typeof FACE_SLOTS[number]]
                          : "Clothing Piece " + (parts.indexOf(part) + 1)}
                      </p>
                      {category === "face" ? (
                        <span className="text-xs text-[#bfc6a9]">Attached to Head</span>
                      ) : (
                        <select className={inputClass + " !min-h-[38px] !py-1 !text-xs"}
                          aria-label={"Attach " + part.slot + " to body part"}
                          data-testid={"avatar-clothing-attach-" + part.slot}
                          disabled={busy} value={part.partType}
                          onChange={event => {
                            const next = event.target.value as PlayerCharacterPartType;
                            setParts(current => current.map(item => item.slot === part.slot
                              ? { ...item, partType: next } : item));
                            setChanged(true);
                          }}>
                          {PLAYER_CHARACTER_PART_TYPES.map(type => (
                            <option key={type} value={type}>{PLAYER_CHARACTER_PART_LABELS[type]}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#8e7a50] text-xl text-[#f2d9a1]"
                      aria-label={"Remove " + (category === "face"
                        ? FACE_LABELS[part.slot as typeof FACE_SLOTS[number]] : "clothing piece")}
                      disabled={busy} onClick={() => remove(part.slot)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button type="button" className={buttonClass + " w-full !min-h-[48px]"}
            data-testid="avatar-save-clothing-item" disabled={!canSave || busy}
            onClick={() => saveItem.mutate()}>
            {saveItem.isPending ? "Saving Clothing…" : "Save Clothing"}
          </button>
          {editingId && <button type="button" className={buttonClass + " w-full"}
            disabled={busy} onClick={startNew}>Create New Item</button>}
          {draftsQuery.isError && <button type="button" className={buttonClass + " w-full"}
            onClick={() => void draftsQuery.refetch()}>Retry loading clothing items</button>}
        </div>
      )}
    </section>
  );
}
