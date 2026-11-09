import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PlayerCharacterRenderer, { type PlayerCharacterMotion } from "./PlayerCharacterRenderer";
import {
  PLAYER_CHARACTER_PART_LABELS, PLAYER_CHARACTER_PART_TYPES,
  completePlayerCharacterParts, resolvePlayerCharacterParts,
  type PlayerCharacterPart, type PlayerCharacterPartType,
  type PlayerCharacterTransform, type StoredPlayerCharacterPart,
} from "@shared/playerCharacter";
import {
  PLAYER_CLOTHING_CATEGORIES, PLAYER_CLOTHING_CATEGORY_LABELS,
  PLAYER_CLOTHING_DEFAULT_ATTACHMENTS, PLAYER_CLOTHING_RENDER_PLANES,
  type PlayerClothingCategory, type PlayerClothingSegment,
} from "@shared/playerCharacterClothing";
import { validClothingPublication } from "@shared/playerClothingAdmin";
import { clampClothingFitCoordinate, pointerToCharacterPartLocal } from "@/lib/characterClothingFit";

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
type Motion = PlayerCharacterMotion;
const BASE_KEY = ["/api/admin/player-character/bases"];
const CLOTHING_KEY = ["/api/admin/player-character/clothing"];
const buttonClass = "min-h-[44px] rounded-lg border border-[#b99b56]/65 bg-[#20412b] px-3 py-2 font-fantasy text-xs text-[#f3dca0] disabled:opacity-40";
const inputClass = "min-h-[42px] w-full rounded-lg border border-[#a18a50]/65 bg-[#0c2117] px-3 py-2 text-sm text-[#f7e8c0] focus:outline-none focus:ring-2 focus:ring-[#d2b76e]";

const defaultFit: PlayerCharacterTransform = {
  xPct: 50, yPct: 50, widthPct: 100, pivotXPct: 50,
  pivotYPct: 50, rotationDeg: 0, zIndex: 1,
};
const fields: ReadonlyArray<{ key: keyof PlayerCharacterTransform; label: string; min: number; max: number }> = [
  { key: "xPct", label: "Horizontal fit (%)", min: 0, max: 100 },
  { key: "yPct", label: "Vertical fit (%)", min: 0, max: 100 },
  { key: "widthPct", label: "Size (%)", min: 2, max: 150 },
  { key: "pivotXPct", label: "Horizontal pivot (%)", min: 0, max: 100 },
  { key: "pivotYPct", label: "Vertical pivot (%)", min: 0, max: 100 },
  { key: "rotationDeg", label: "Rotation (°)", min: -180, max: 180 },
];

const readImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string"
    ? resolve(reader.result) : reject(new Error("Could not read the clothing artwork"));
  reader.onerror = () => reject(new Error("Could not read the clothing artwork"));
  reader.readAsDataURL(file);
});

async function requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await apiRequest(method, url, body);
  return response.json() as Promise<T>;
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startFit: PlayerCharacterTransform;
  moved: boolean;
};

export default function PlayerClothingAdminPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<PlayerClothingCategory>("top");
  const [newBaseId, setNewBaseId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState<PlayerClothingCategory>("top");
  const [activePart, setActivePart] = useState<PlayerCharacterPartType>("top");
  const [fit, setFit] = useState<PlayerCharacterTransform>({ ...defaultFit });
  const [renderPlane, setRenderPlane] = useState<PlayerClothingSegment["renderPlane"]>("with_part");
  const [imageData, setImageData] = useState<string | null>(null);
  const [partDirty, setPartDirty] = useState(false);
  const [metaDirty, setMetaDirty] = useState(false);
  const [motion, setMotion] = useState<Motion>("static");

  const basesQuery = useQuery<Base[]>({
    queryKey: BASE_KEY,
    queryFn: () => requestJson<Base[]>("GET", "/api/admin/player-character/bases"),
  });
  const draftsQuery = useQuery<ClothingDraft[]>({
    queryKey: CLOTHING_KEY,
    queryFn: () => requestJson<ClothingDraft[]>("GET", "/api/admin/player-character/clothing"),
  });
  const bases = (basesQuery.data ?? []).filter(base =>
    base.publishedParts && completePlayerCharacterParts(base.publishedParts));
  const drafts = draftsQuery.data ?? [];
  const selected = drafts.find(draft => draft.id === selectedId)
    ?? (selectedId === null ? drafts[0] : undefined);
  const base = bases.find(item => item.id === selected?.baseId);
  const baseUnchanged = !!base?.publishedAt && !!selected &&
    new Date(base.publishedAt).getTime() === new Date(selected.basePublishedAt).getTime();
  const bodyParts = useMemo(
    () => base?.publishedParts ? resolvePlayerCharacterParts(base.publishedParts) : [],
    [base?.publishedParts],
  );
  const chosenPart = bodyParts.find(part => part.partType === activePart);
  const savedSegment = selected?.draftSegments.find(segment => segment.partType === activePart);
  const anyDirty = partDirty || metaDirty;

  useEffect(() => {
    if (bases.length > 0 && !bases.some(base => base.id === newBaseId)) setNewBaseId(bases[0].id);
  }, [basesQuery.data, newBaseId]);

  useEffect(() => {
    setDraftName(selected?.name ?? "");
    setDraftCategory(selected?.category ?? "top");
    setMetaDirty(false);
  }, [selected?.id, selected?.revision]);

  useEffect(() => {
    setFit(savedSegment ? { ...savedSegment.fit } : { ...defaultFit });
    setRenderPlane(savedSegment?.renderPlane ?? "with_part");
    setImageData(null);
    setPartDirty(false);
    dragRef.current = null;
  }, [selected?.id, selected?.revision, activePart]);

  useEffect(() => {
    if (selected) setActivePart(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS[selected.category][0]);
  }, [selected?.id]);

  const updateDraft = (row: ClothingDraft) => qc.setQueryData<ClothingDraft[]>(CLOTHING_KEY, old =>
    (old ?? []).some(item => item.id === row.id)
      ? (old ?? []).map(item => item.id === row.id ? row : item) : [...(old ?? []), row]
  );
  const errorMessage = (error: unknown) => toast({
    title: "Avatar clothing not saved",
    description: error instanceof Error ? error.message : "Try again.",
    variant: "destructive",
  });
  const create = useMutation({
    mutationFn: () => requestJson<ClothingDraft>("POST", "/api/admin/player-character/clothing", {
      baseId: newBaseId, name: newName.trim(), category: newCategory,
    }),
    onSuccess: row => {
      updateDraft(row); setSelectedId(row.id);
      toast({ title: "Clothing draft created", description: "Upload and fit the images, then Save Clothing." });
    },
    onError: errorMessage,
  });
  const savePart = useMutation({
    mutationFn: () => requestJson<ClothingDraft>(
      "PUT", `/api/admin/player-character/clothing/${selected!.id}/segments/${activePart}`,
      { expectedRevision: selected!.revision, fit, renderPlane, ...(imageData ? { imageData } : {}) },
    ),
    onSuccess: row => {
      updateDraft(row);
      toast({ title: "Clothing piece saved", description: "The fitted piece is in the private draft." });
    },
    onError: errorMessage,
  });
  const removePart = useMutation({
    mutationFn: () => requestJson<ClothingDraft>(
      "DELETE", `/api/admin/player-character/clothing/${selected!.id}/segments/${activePart}`,
      { expectedRevision: selected!.revision },
    ),
    onSuccess: row => updateDraft(row),
    onError: errorMessage,
  });
  const saveDetails = useMutation({
    mutationFn: () => requestJson<ClothingDraft>(
      "PATCH", `/api/admin/player-character/clothing/${selected!.id}`,
      { name: draftName.trim(), category: draftCategory, expectedRevision: selected!.revision },
    ),
    onSuccess: row => updateDraft(row),
    onError: errorMessage,
  });
  const saveClothing = useMutation({
    mutationFn: () => requestJson<ClothingDraft>(
      "POST", `/api/admin/player-character/clothing/${selected!.id}/save`,
      { expectedRevision: selected!.revision },
    ),
    onSuccess: row => {
      updateDraft(row);
      void qc.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: "Clothing item saved", description: "All saved pieces now belong to one unreleased avatar clothing item." });
    },
    onError: errorMessage,
  });
  const busy = [create, savePart, removePart, saveDetails, saveClothing].some(m => m.isPending);

  const onImageSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type) || file.size > 5_000_000) {
      toast({ title: "Unsupported artwork", description: "Choose a PNG or WebP under 5 MB.", variant: "destructive" });
      return;
    }
    try {
      const image = await readImage(file);
      setImageData(image);
      setPartDirty(true);
      setMotion("static");
    } catch (error) { errorMessage(error); }
  };
  const updateFit = (key: keyof PlayerCharacterTransform, value: number) => {
    if (!Number.isFinite(value)) return;
    const field = fields.find(field => field.key === key);
    if (!field) return;
    const bounded = Math.max(field.min, Math.min(field.max, value));
    setFit(old => ({ ...old, [key]: bounded }));
    setPartDirty(true);
  };
  const discardChanges = () => {
    setImageData(null); setPartDirty(false); setMetaDirty(false);
    setFit(savedSegment ? { ...savedSegment.fit } : { ...defaultFit });
    setRenderPlane(savedSegment?.renderPlane ?? "with_part");
    setDraftName(selected?.name ?? ""); setDraftCategory(selected?.category ?? "top");
  };

  const pointerLocal = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !chosenPart) return null;
    const rect = canvas.getBoundingClientRect();
    const image = canvas.querySelector<HTMLImageElement>(
      `[data-character-part="${chosenPart.partType}"] .player-character-renderer__image`
    );
    if (!image?.naturalWidth || !image.naturalHeight) return null;
    return pointerToCharacterPartLocal(event.clientX, event.clientY, {
      left: rect.left, top: rect.top,
      renderedWidth: rect.width, renderedHeight: rect.height,
      logicalWidth: canvas.clientWidth, logicalHeight: canvas.clientHeight,
    }, chosenPart, image.naturalHeight / image.naturalWidth);
  };
  const moveFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointerLocal(event);
    if (!point) return;
    const dx = point.xPct - drag.startX;
    const dy = point.yPct - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    if (!drag.moved) return;
    setFit(old => ({
      ...old,
      xPct: clampClothingFitCoordinate(drag.startFit.xPct + dx),
      yPct: clampClothingFitCoordinate(drag.startFit.yPct + dy),
    }));
    setPartDirty(true);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointerLocal(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId, startX: point.xPct, startY: point.yPct,
      startFit: { ...fit }, moved: false,
    };
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      const point = pointerLocal(event);
      if (point) {
        setFit(old => ({
          ...old, xPct: clampClothingFitCoordinate(point.xPct),
          yPct: clampClothingFitCoordinate(point.yPct),
        }));
        setPartDirty(true);
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  const previewSegments = useMemo<PlayerClothingSegment[]>(() => {
    if (!selected) return [];
    const url = imageData ?? savedSegment?.imageUrl;
    if (!url) return selected.draftSegments;
    return [
      ...selected.draftSegments.filter(item => item.partType !== activePart),
      { partType: activePart, imageUrl: url, fit, renderPlane },
    ];
  }, [selected, activePart, savedSegment?.imageUrl, imageData, fit, renderPlane]);

  const canSaveClothing = !!selected && baseUnchanged && !anyDirty && !busy &&
    validClothingPublication(selected.name, selected.category, selected.draftSegments);
  const recommended = selected ? PLAYER_CLOTHING_DEFAULT_ATTACHMENTS[selected.category] : [];
  const orderedParts = [...recommended, ...PLAYER_CHARACTER_PART_TYPES.filter(type => !recommended.includes(type))];

  return (
    <section data-testid="player-clothing-admin-panel" className="space-y-4 text-[#f3dfad]">
      <div className="rounded-xl border border-[#9c854b]/60 bg-[#10271b] p-3">
        <h2 className="font-fantasy text-lg font-bold text-[#f4d88f]">Create Avatar Clothing</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#d9caa2]">
          One named item can contain multiple fitted images. Pants can use both legs;
          shirts can use the torso and both arms. Each piece follows its body part during animation.
          Clothing stays private to Admin until the player wardrobe is implemented.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-[#977f48]/50 bg-black/25 p-3">
        <h3 className="font-fantasy text-sm font-bold">New Clothing Draft</h3>
        <label className="block text-xs">Clothing name
          <input className={inputClass} maxLength={80} value={newName}
            placeholder="Forest Wanderer Pants" onChange={event => setNewName(event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">Clothing inventory category
            <select className={inputClass} value={newCategory}
              onChange={event => setNewCategory(event.target.value as PlayerClothingCategory)}>
              {PLAYER_CLOTHING_CATEGORIES.map(category =>
                <option key={category} value={category}>{PLAYER_CLOTHING_CATEGORY_LABELS[category]}</option>)}
            </select>
          </label>
          <label className="block text-xs">Published avatar base
            <select className={inputClass} value={newBaseId}
              onChange={event => setNewBaseId(event.target.value)}>
              {bases.map(base => <option key={base.id} value={base.id}>{base.name}</option>)}
            </select>
          </label>
        </div>
        {bases.length === 0 && (
          <p role="alert" className="text-xs text-[#f1d695]">
            First publish a complete eight-part avatar base in the Base Editor.
          </p>
        )}
        <button className={buttonClass} type="button"
          data-testid="avatar-create-clothing"
          disabled={busy || anyDirty || !newName.trim() || !newBaseId}
          onClick={() => create.mutate()}>
          Create Clothing Draft
        </button>
        {draftsQuery.isError && (
          <button type="button" className={buttonClass} onClick={() => void draftsQuery.refetch()}>
            Retry loading clothing
          </button>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Saved clothing drafts">
          {drafts.map(item => (
            <button key={item.id} type="button" className={buttonClass}
              aria-pressed={item.id === selected?.id}
              disabled={busy || anyDirty}
              onClick={() => setSelectedId(item.id)}
              style={{ borderColor: item.id === selected?.id ? "#f4cf77" : "#876c38" }}>
              {item.name}{item.shopItemId ? " · Saved item" : " · Draft"}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="space-y-4">
          {!baseUnchanged && (
            <p role="alert" className="rounded-lg border border-[#bf9750] bg-[#3b2b18] p-3 text-xs">
              This avatar base changed since the clothing draft was created.
              Create a new design for the republished base before saving fitted pieces.
            </p>
          )}
          <div className="space-y-2 rounded-xl border border-[#967e4c]/50 bg-[#142b1e] p-3">
            <h3 className="font-fantasy text-sm">Clothing Details</h3>
            <input className={inputClass} maxLength={80} value={draftName}
              aria-label="Edit clothing name" disabled={busy}
              onChange={event => { setDraftName(event.target.value); setMetaDirty(true); }} />
            <select className={inputClass} value={draftCategory} aria-label="Edit clothing category"
              disabled={busy} onChange={event => {
                setDraftCategory(event.target.value as PlayerClothingCategory); setMetaDirty(true);
              }}>
              {PLAYER_CLOTHING_CATEGORIES.map(category =>
                <option key={category} value={category}>{PLAYER_CLOTHING_CATEGORY_LABELS[category]}</option>)}
            </select>
            <button type="button" className={buttonClass} disabled={busy || partDirty || !metaDirty || !draftName.trim()}
              onClick={() => saveDetails.mutate()}>Save Clothing Details</button>
            <p className="text-[11px] text-[#d5c69e]">
              {selected.draftSegments.length} fitted piece(s) · Revision {selected.revision}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Clothing piece upload boxes">
                {orderedParts.map(type => {
                  const image = selected.draftSegments.find(item => item.partType === type)?.imageUrl;
                  return (
                    <button key={type} type="button" disabled={busy || anyDirty || !baseUnchanged}
                      data-testid={`clothing-part-${type}`} aria-pressed={activePart === type}
                      onClick={() => { setActivePart(type); setMotion("static"); }}
                      className={`${buttonClass} flex min-h-[70px] flex-col items-center gap-1`}
                      style={{ borderColor: activePart === type ? "#f4d58e" : "#927a48" }}>
                      {image
                        ? <img src={image} alt="" draggable={false} className="h-8 w-8 object-contain" />
                        : <span className="text-lg text-[#a79162]">+</span>}
                      {PLAYER_CHARACTER_PART_LABELS[type]}
                    </button>
                  );
                })}
              </div>
              <div role="group" aria-label="Clothing preview animation" className="grid grid-cols-3 gap-2">
                {([
                  { value: "static", label: "Fit" },
                  { value: "idle", label: "Idle" },
                  { value: "walk", label: "Walk" },
                ] as const).map(option => (
                  <button key={option.value} type="button" className={buttonClass}
                    aria-pressed={motion === option.value}
                    onClick={() => setMotion(option.value)}>{option.label}</button>
                ))}
              </div>
              <div ref={canvasRef} className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-xl border border-[#ba9956]/55"
                data-testid="avatar-clothing-fit-canvas"
                style={{ background: "radial-gradient(circle, #345d40, #0a1b11)", touchAction: "auto" }}>
                <PlayerCharacterRenderer parts={bodyParts} clothingSegments={previewSegments}
                  motion={motion} ariaLabel="Avatar clothing fit preview" />
                {motion === "static" && !!chosenPart && !!(imageData || savedSegment) && baseUnchanged && (
                  <div className="absolute inset-0 z-[200] cursor-move"
                    data-testid="avatar-clothing-drag-surface"
                    aria-label="Drag to fit the selected clothing piece"
                    style={{ touchAction: "none" }}
                    onPointerDown={onPointerDown}
                    onPointerMove={moveFromPointer}
                    onPointerUp={onPointerEnd}
                    onPointerCancel={event => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId))
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      dragRef.current = null;
                    }}
                  />
                )}
                {bodyParts.length === 0 && (
                  <p className="absolute inset-0 grid place-items-center px-5 text-center text-xs">
                    Select a clothing draft fitted to a published avatar base.
                  </p>
                )}
              </div>
              <p className="text-xs text-[#d1c19b]">
                In Fit mode, drag to adjust the selected piece, or tap to place it.
                This moves the garment image only. Idle and Walk preview its attachment.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-[#99814b]/45 bg-[#10261b] p-3">
              <h3 className="font-fantasy text-sm font-bold text-[#f4d48a]">
                {PLAYER_CHARACTER_PART_LABELS[activePart]} · Clothing Image
              </h3>
              <label className="block text-xs">Upload transparent PNG/WebP
                <input type="file" accept="image/png,image/webp" disabled={busy || !baseUnchanged}
                  data-testid="avatar-clothing-upload" className="mt-2 block w-full text-xs"
                  onChange={event => {
                    void onImageSelected(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {fields.map(field => (
                  <label className="text-[11px]" key={field.key}>{field.label}
                    <input type="number" className={inputClass} disabled={busy || !baseUnchanged}
                      min={field.min} max={field.max} step="0.1" value={fit[field.key]}
                      onChange={event => updateFit(field.key, Number(event.target.value))} />
                  </label>
                ))}
              </div>
              <label className="block text-xs">Clothing depth
                <select className={inputClass} value={renderPlane}
                  disabled={busy || !baseUnchanged}
                  onChange={event => {
                    setRenderPlane(event.target.value as PlayerClothingSegment["renderPlane"]);
                    setPartDirty(true);
                  }}>
                  {PLAYER_CLOTHING_RENDER_PLANES.map(plane =>
                    <option key={plane} value={plane}>{plane.replace(/_/g, " ")}</option>)}
                </select>
              </label>
              <button type="button" className={`${buttonClass} w-full`}
                data-testid="avatar-save-clothing-piece"
                disabled={busy || metaDirty || !partDirty || (!imageData && !savedSegment) || !baseUnchanged}
                onClick={() => savePart.mutate()}>
                {savePart.isPending ? "Saving piece…" : "Save This Fitted Piece"}
              </button>
              {savedSegment && (
                <button type="button" className={`${buttonClass} w-full`}
                  disabled={busy || anyDirty || !baseUnchanged}
                  onClick={() => removePart.mutate()}>Remove Piece From Draft</button>
              )}
              {anyDirty && (
                <button type="button" className={`${buttonClass} w-full`}
                  disabled={busy} onClick={discardChanges}>Discard Unsaved Changes</button>
              )}
              <p className="text-[11px] text-[#e6d5ab]">
                {partDirty ? "Save or discard this piece before changing attachment boxes." :
                  "Saved pieces stay attached to their own rig parts during animation."}
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-[#b99b56]/65 bg-[#132c1f] p-3">
            <h3 className="font-fantasy text-base text-[#f4d890]">Save Clothing Item</h3>
            <p className="text-xs leading-relaxed text-[#d8c8a0]">
              Save the complete outfit as one avatar clothing catalog item.
              Published pieces remain unchanged while you edit this private draft.
              Player ownership and equipping will be added in Avatar 08B.
            </p>
            <button type="button" data-testid="avatar-publish-clothing"
              className={`${buttonClass} w-full`} disabled={!canSaveClothing}
              onClick={() => saveClothing.mutate()}>
              {saveClothing.isPending ? "Saving Clothing…" :
                selected.shopItemId ? "Update Saved Clothing" : "Save Clothing"}
            </button>
            {!validClothingPublication(selected.name, selected.category, selected.draftSegments) && (
              <p className="text-xs text-[#e6d3a2]">At least one fitted image must be saved before you can save the item.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
