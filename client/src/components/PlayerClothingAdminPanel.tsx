import { useEffect, useMemo, useState, type SetStateAction } from "react";
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
  type PlayerClothingBodyVariants,
  type PlayerClothingBodyType,
  type PlayerClothingSlot,
  isUniversalClothingCategory,
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
  price?: number; shopImageUrl?: string | null;
  draftSegments: PlayerClothingSegment[];
  publishedSegments: PlayerClothingSegment[] | null;
  draftBodyVariants?: PlayerClothingBodyVariants | null;
  publishedBodyVariants?: PlayerClothingBodyVariants | null;
  universal?: boolean;
};
type ClothingPart = {
  slot: PlayerClothingSlot;
  previousSlot?: PlayerClothingSlot;
  partType: PlayerCharacterPartType;
  hairLayer?: "front" | "back";
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
function partsFromDraft(
  draft: ClothingDraft, segments = draft.draftSegments.length
    ? draft.draftSegments : draft.publishedSegments ?? [],
): ClothingPart[] {
  if (draft.category === "face") {
    return faceParts().map(part => {
      const old = segments.find(s => (s.slot ?? (s.partType === "head" ? "face_open_eyes" : s.partType)) === part.slot);
      return old ? { ...part, previousSlot: clothingSegmentKey(old) as PlayerClothingSlot,
        imageUrl: old.imageUrl } : part;
    });
  }
  const used = new Set<string>();
  return segments.slice(0, PLAYER_CLOTHING_FREE_SLOTS.length).map(segment => {
    const original = segment.slot ?? segment.partType;
    const slot = isFreeClothingSlot(original) && !used.has(original)
      ? original as PlayerClothingSlot
      : PLAYER_CLOTHING_FREE_SLOTS.find(value => !used.has(value))!;
    used.add(slot);
    return {
      slot, previousSlot: clothingSegmentKey(segment) as PlayerClothingSlot,
      partType: segment.partType, imageUrl: segment.imageUrl,
      hairLayer: segment.slot === "hair_back" || segment.renderPlane === "behind_character"
        ? "back" as const : "front" as const,
    };
  });
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [shopImageData, setShopImageData] = useState<string | null>(null);
  const [category, setCategory] = useState<PlayerClothingCategory>("top");
  const [partsByBody, setPartsByBody] = useState<Record<PlayerClothingBodyType, ClothingPart[]>>({
    fem: [], masc: [],
  });
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
  const activeBodyKind: PlayerClothingBodyType = chosenBody?.kind === "masc" ? "masc" : "fem";
  const universalArtwork = isUniversalClothingCategory(category);
  // Universal parts stay attached to one shared editor state even when
  // previewing the other body, so no uploads or selection are lost.
  const editedBodyKind: PlayerClothingBodyType = universalArtwork ? "fem" : activeBodyKind;
  const parts = partsByBody[editedBodyKind];
  const setParts = (update: SetStateAction<ClothingPart[]>) =>
    setPartsByBody(current => ({
      ...current,
      [editedBodyKind]: typeof update === "function"
        ? update(current[editedBodyKind]) : update,
    }));
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
        renderPlane: category === "hair" && part.hairLayer === "back"
          ? "behind_character" as const : "with_part" as const,
        ...(category === "shoes" ? { shoesLayer } : {}),
      }] : [];
    }), [parts, category, shoesLayer]);
  const bodyReady = (kind: PlayerClothingBodyType) =>
    category === "face"
      ? FACE_SLOTS.every(slot => partsByBody[kind].some(part =>
          part.slot === slot && !!(part.imageData ?? part.imageUrl)))
      : partsByBody[kind].some(part => part.imageData || part.imageUrl);
  const canSave = name.trim().length > 0 &&
    (universalArtwork ? bodyReady("fem") : bodyReady("fem") && bodyReady("masc"))
    && (universalArtwork ? savedBodies.length > 0 :
      savedBodies.some(body => body.kind === "fem") &&
      savedBodies.some(body => body.kind === "masc"))
    && readingParts === 0 && (!editingId || !!activeDraft)
    && Number.isInteger(price) && price >= 0 && price <= 1_000_000_000
    && (price === 0 || !!shopImageData || !!activeDraft?.shopImageUrl);

  const updateDraft = (row: ClothingDraft) =>
    qc.setQueryData<ClothingDraft[]>(CLOTHING_KEY, current =>
      (current ?? []).some(item => item.id === row.id)
        ? (current ?? []).map(item => item.id === row.id ? row : item)
        : [...(current ?? []), row]);
  const partUploads = (kind: PlayerClothingBodyType) => ({
    images: partsByBody[kind].filter(part => !!part.imageData).map(part => ({
      slot: part.slot, partType: part.partType, imageData: part.imageData,
      ...(category === "hair" ? {
        renderPlane: part.hairLayer === "back" ? "behind_character" : "with_part",
      } : {}),
    })),
    keep: partsByBody[kind].filter(part =>
      !part.imageData && part.imageUrl && part.previousSlot).map(part => ({
        previousSlot: part.previousSlot!, slot: part.slot, partType: part.partType,
        ...(category === "hair" ? {
          renderPlane: part.hairLayer === "back" ? "behind_character" : "with_part",
        } : {}),
      })),
  });
  const saveItem = useMutation({
    mutationFn: () => requestJson<ClothingDraft>("POST", "/api/admin/player-character/clothing/item", {
      ...(editingId ? { id: editingId, expectedRevision: activeDraft!.revision } : {}),
      name: name.trim(), category, price,
      ...(shopImageData ? { shopImageData } : {}),
      // Shared categories save just one set, not duplicated Fem/Masc uploads.
      ...(universalArtwork ? partUploads("fem") : {
        images: [], keep: [],
        bodyVariants: { fem: partUploads("fem"), masc: partUploads("masc") },
      }),
      ...(category === "shoes" ? { shoesLayer } : {}),
    }),
    onSuccess: result => {
      updateDraft(result);
      void qc.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      setChanged(false);
      setEditingId(null);
      setName("");
      setPrice(0);
      setShopImageData(null);
      setCategory("top");
      setPartsByBody({ fem: [], masc: [] });
      setScreen("view");
      toast({ title: "Clothing saved", description: "One universal clothing item was added to the clothing item list." });
    },
    onError: (error: Error) => toast({
      title: "Clothing not saved", description: error.message, variant: "destructive",
    }),
  });
  const deleteItem = useMutation({
    mutationFn: () => {
      if (!editingId || !activeDraft) throw new Error("Select saved clothing to delete");
      return requestJson<{ id: string; deleted: boolean }>(
        "DELETE", `/api/admin/player-character/clothing/item/${editingId}`,
        { expectedRevision: activeDraft.revision },
      );
    },
    onSuccess: result => {
      qc.setQueryData<ClothingDraft[]>(CLOTHING_KEY, current =>
        (current ?? []).filter(item => item.id !== result.id));
      void qc.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      void qc.invalidateQueries({ queryKey: ["/api/player-avatar"] });
      setConfirmDelete(false);
      setEditingId(null);
      setChanged(false);
      setPartsByBody({ fem: [], masc: [] });
      setName("");
      setPrice(0);
      setShopImageData(null);
      setScreen("view");
      toast({ title: "Clothing deleted", description: "Removed from wardrobes and future shop availability." });
    },
    onError: (error: Error) => {
      setConfirmDelete(false);
      void qc.invalidateQueries({ queryKey: CLOTHING_KEY });
      toast({ title: "Could not delete clothing", description: error.message, variant: "destructive" });
    },
  });
  const busy = saveItem.isPending || deleteItem.isPending || readingParts > 0;
  useEffect(() => { onDirtyChange?.(changed || busy); }, [onDirtyChange, changed, busy]);

  const startNew = () => {
    if (busy) return;
    setConfirmDelete(false);
    setEditingId(null); setName(""); setPrice(0); setShopImageData(null);
    setCategory("top"); setPartsByBody({ fem: [], masc: [] });
    setShoesLayer("under"); setClosedEyes(false); setChanged(false);
    setScreen("create");
  };
  const openExisting = (draft: ClothingDraft) => {
    if (busy) return;
    setConfirmDelete(false);
    setEditingId(draft.id); setName(draft.name); setPrice(draft.price ?? 0);
    setShopImageData(null); setCategory(draft.category);
    const variants = draft.draftBodyVariants ?? draft.publishedBodyVariants;
    const shared = draft.draftSegments.length ? draft.draftSegments : draft.publishedSegments ?? [];
    setPartsByBody({
      fem: partsFromDraft(draft, variants?.fem ?? shared),
      masc: isUniversalClothingCategory(draft.category)
        ? [] : partsFromDraft(draft, variants?.masc ?? shared),
    });
    setShoesLayer(draft.draftSegments.find(segment => segment.shoesLayer)?.shoesLayer ?? "under");
    setClosedEyes(false); setChanged(false); setScreen("create");
  };
  const selectCategory = (next: PlayerClothingCategory) => {
    if (busy || category === next) return;
    setCategory(next); setPartsByBody({
      fem: next === "face" ? faceParts() : [],
      masc: [],
    });
    setClosedEyes(false); setChanged(true);
  };
  const uploadShopImage = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type) || file.size > 5_000_000) {
      toast({ title: "Unsupported main item image", description: "Choose PNG or WebP under 5 MB.",
        variant: "destructive" });
      return;
    }
    setReadingParts(count => count + 1);
    try {
      setShopImageData(await readImage(file));
      setChanged(true);
    } catch (error) {
      toast({ title: "Could not read shop image",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive" });
    } finally { setReadingParts(count => count - 1); }
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
          ...(category === "hair" ? { hairLayer: "front" as const } : {}),
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
                {(item.shopImageUrl || item.publishedSegments?.[0]?.imageUrl)
                  ? <img src={item.shopImageUrl ?? item.publishedSegments?.[0]?.imageUrl ?? undefined}
                      alt="" className="h-11 w-11 object-contain" />
                  : <span className="text-2xl text-[#e6cc83]">+</span>}
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-[#f3d99b]">{item.name}</strong>
                  <small className="text-[#c9c09d]">{PLAYER_CLOTHING_CATEGORY_LABELS[item.category]} · {item.price ? `${item.price.toLocaleString()} coins` : "Free"} · {item.shopItemId ? "Saved item" : "Draft"}</small>
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
            <label className="block space-y-1 text-xs text-[#e6d29c]">Price (coins)
              <input type="number" min={0} max={1000000000} step={1}
                inputMode="numeric" className={inputClass} value={price}
                data-testid="avatar-clothing-price" aria-label="Clothing price in coins"
                disabled={busy} onChange={event => {
                  setPrice(event.target.value === "" ? 0 : Number(event.target.value));
                  setChanged(true);
                }} />
              <span className="block text-[11px] text-[#c9bd9b]">
                Set 0 to make this clothing available to every player automatically.
              </span>
            </label>
            <div className="space-y-2 rounded-xl border border-[#ad915b] bg-[#163928] p-3"
              data-testid="avatar-clothing-main-image-section">
              <p className="text-sm font-bold text-[#f3da9b]">Main Item Image</p>
              <p className="text-xs text-[#d2c5a2]">
                Upload one thumbnail for this clothing item, used in shops, the market,
                inventory and rewards. Available for both free and priced clothing.
                This is separate from wearable Fem/Masc or universal parts.
              </p>
              {(shopImageData || activeDraft?.shopImageUrl) && (
                <img src={shopImageData ?? activeDraft?.shopImageUrl ?? undefined}
                  className="mx-auto h-24 w-24 object-contain"
                  alt="Main clothing item image preview" data-testid="avatar-clothing-main-image-preview" />
              )}
              <label className={buttonClass + " flex cursor-pointer items-center justify-center"}>
                {shopImageData || activeDraft?.shopImageUrl
                  ? "Replace Main Item Image" : "+ Upload Main Item Image"}
                <input className="sr-only" type="file" accept="image/png,image/webp"
                  data-testid="avatar-clothing-main-image-upload"
                  aria-label="Upload clothing main item image" disabled={busy}
                  onChange={event => {
                    void uploadShopImage(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }} />
              </label>
              {price > 0 && !shopImageData && !activeDraft?.shopImageUrl && (
                <p className="text-xs text-[#f1bb83]" role="status">
                  A main item image is required for priced clothing.
                </p>
              )}
              {price === 0 && !shopImageData && !activeDraft?.shopImageUrl && (
                <p className="text-xs text-[#c9bd9b]">
                  Optional for free clothing; otherwise a wearable part is used as the thumbnail.
                </p>
              )}
            </div>
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
              <div role="group" aria-label="Choose clothing artwork body" className="flex gap-2" data-testid="avatar-clothing-body-selector">
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
              <div className="mx-auto grid max-w-[360px] grid-cols-2 gap-2" role="group" aria-label="Shoes layering with pants" data-testid="avatar-shoes-layer-control">
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
              {universalArtwork
                ? "One universal artwork set fits both bodies. Switch Fem/Masc to preview the same pieces."
                : <>Editing <strong>{activeBodyKind === "fem" ? "Fem" : "Masc"}</strong> clothing artwork.
                    Switch bodies to upload each version; they share one clothing item and price.</>}
            </p>
          </div>

          <div className={cardClass + " space-y-3"}>
            <h3 className="text-center font-fantasy text-xl text-[#f4d78e]">
              {universalArtwork ? "Universal" :
                activeBodyKind === "fem" ? "Fem" : "Masc"} Clothing Parts
            </h3>
            {universalArtwork ? (
              <div className="text-center text-xs text-[#f4d78e]"
                data-testid="avatar-clothing-universal-artwork">
                One set for Fem and Masc · {bodyReady("fem") ? "Complete" : "Needs artwork"}
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-2 text-xs" data-testid="avatar-clothing-variant-status">
                {(["fem", "masc"] as const).map(kind => (
                  <span key={kind}
                    className={"rounded-lg border px-3 py-1 " + (bodyReady(kind)
                      ? "border-[#aec47c] bg-[#244f30]" : "border-[#927a50] bg-[#302b1c]")}
                    data-testid={"avatar-clothing-variant-" + kind + "-status"}>
                    {kind === "fem" ? "Fem" : "Masc"}: {bodyReady(kind) ? "Complete" : "Needs artwork"}
                  </span>
                ))}
              </div>
            )}
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
                  PNG or WebP on a transparent 1000 × 1000 canvas.
                  {category === "face"
                    ? " Open eyes, closed eyes and mouth are required once for both bodies."
                    : universalArtwork
                      ? " Upload the pieces once; they will appear on both bodies."
                      : " Upload each version's pieces and choose their attachment points."}
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
                      {category === "hair" && (
                        <select className={inputClass + " !min-h-[38px] !py-1 !text-xs"}
                          aria-label={"Hair layering for " + part.slot}
                          data-testid={"avatar-hair-layer-" + part.slot}
                          value={part.hairLayer ?? "front"} disabled={busy}
                          onChange={event => {
                            const next = event.target.value as "front" | "back";
                            setParts(current => current.map(item => item.slot === part.slot
                              ? { ...item, hairLayer: next } : item));
                            setChanged(true);
                          }}>
                          <option value="front">In Front</option>
                          <option value="back">Behind Head</option>
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
          {editingId && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={buttonClass + " w-full"}
                disabled={busy} onClick={startNew}>Create New Item</button>
              <button type="button" className={buttonClass + " w-full !border-[#bf745d] !bg-[#563025]"}
                data-testid="avatar-delete-clothing-item" disabled={busy}
                onClick={() => setConfirmDelete(true)}>Delete Clothing</button>
            </div>
          )}
          {draftsQuery.isError && <button type="button" className={buttonClass + " w-full"}
            onClick={() => void draftsQuery.refetch()}>Retry loading clothing items</button>}
          {confirmDelete && editingId && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4"
              data-testid="avatar-delete-clothing-confirm-overlay">
              <div role="alertdialog" aria-modal="true"
                aria-labelledby="avatar-delete-clothing-heading"
                className={cardClass + " w-full max-w-[380px] space-y-3 text-center !border-[#e0bd7a]"}>
                <h3 id="avatar-delete-clothing-heading" className="font-fantasy text-xl text-[#f8d999]">
                  Delete Clothing?
                </h3>
                <p className="text-sm leading-relaxed text-[#edddb9]">
                  Remove <strong>{activeDraft?.name}</strong> from wardrobes and shops?
                  Existing player inventory history will remain intact.
                  Unsaved changes to this item will be lost.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={buttonClass}
                    data-testid="avatar-cancel-delete-clothing" disabled={deleteItem.isPending}
                    onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button type="button" className={buttonClass + " !border-[#cb826c] !bg-[#653427]"}
                    data-testid="avatar-confirm-delete-clothing" disabled={deleteItem.isPending}
                    onClick={() => deleteItem.mutate()}>
                    {deleteItem.isPending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
