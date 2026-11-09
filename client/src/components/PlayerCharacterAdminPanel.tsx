import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PlayerCharacterPartsPreview from "./PlayerCharacterPartsPreview";
import {
  DEFAULT_PLAYER_CHARACTER_TRANSFORMS,
  PLAYER_CHARACTER_PART_LABELS,
  PLAYER_CHARACTER_PART_TYPES,
  completePlayerCharacterParts,
  type PlayerCharacterPart,
  type PlayerCharacterPartType,
  type PlayerCharacterTransform,
} from "@shared/playerCharacter";

interface CharacterBase {
  id: string;
  name: string;
  draftParts: PlayerCharacterPart[];
  publishedParts: PlayerCharacterPart[] | null;
  isDefault: boolean;
  revision: number;
}

const LIST_KEY = ["/api/admin/player-character/bases"];
const inputClass = "w-full min-h-[42px] rounded-lg border border-[#88723e]/60 bg-[#0d2117] px-3 py-2 text-sm text-[#f6e7be] focus:outline-none focus:ring-2 focus:ring-[#d7b86d]";
const buttonClass = "min-h-[44px] rounded-lg border border-[#b79b55]/70 bg-[#20412b] px-3 py-2 text-xs font-bold text-[#f2da99] disabled:opacity-45";
const transformFields: ReadonlyArray<{
  key: keyof PlayerCharacterTransform;
  label: string;
  min: number; max: number; step: number;
}> = [
  { key: "xPct", label: "Horizontal position (%)", min: 0, max: 100, step: 0.1 },
  { key: "yPct", label: "Vertical position (%)", min: 0, max: 100, step: 0.1 },
  { key: "widthPct", label: "Width (% of avatar)", min: 2, max: 150, step: 0.5 },
  { key: "pivotXPct", label: "Horizontal pivot (%)", min: 0, max: 100, step: 1 },
  { key: "pivotYPct", label: "Vertical pivot (%)", min: 0, max: 100, step: 1 },
  { key: "rotationDeg", label: "Rotation (°)", min: -180, max: 180, step: 1 },
  { key: "zIndex", label: "Layer order", min: 0, max: 100, step: 1 },
];

const dataFromFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image could not be read"));
  reader.onerror = () => reject(new Error("Image could not be read"));
  reader.readAsDataURL(file);
});

async function requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  return (await apiRequest(method, url, body)).json();
}

/**
 * One small lazy-loaded editor for the new character domain, with no pet
 * inventory, evolution or NPC dependencies. Draft writes use a revision
 * check; a second editor cannot silently overwrite an earlier save.
 */
export default function PlayerCharacterAdminPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("Player Avatar");
  const [renameValue, setRenameValue] = useState("");
  const [partType, setPartType] = useState<PlayerCharacterPartType>("body");
  const [transform, setTransform] = useState<PlayerCharacterTransform>(DEFAULT_PLAYER_CHARACTER_TRANSFORMS.body);
  const [imageData, setImageData] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const query = useQuery<CharacterBase[]>({
    queryKey: LIST_KEY,
    queryFn: async () => requestJson<CharacterBase[]>("GET", "/api/admin/player-character/bases"),
  });
  const bases = query.data ?? [];
  const selected = bases.find(base => base.id === selectedId) ?? (selectedId === null ? bases[0] : undefined);
  const currentId = selected?.id ?? null;
  const savedPart = selected?.draftParts.find(part => part.partType === partType);

  useEffect(() => {
    setTransform(savedPart
      ? {
          xPct: savedPart.xPct, yPct: savedPart.yPct, widthPct: savedPart.widthPct,
          pivotXPct: savedPart.pivotXPct, pivotYPct: savedPart.pivotYPct,
          rotationDeg: savedPart.rotationDeg, zIndex: savedPart.zIndex,
        }
      : { ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[partType] });
    setImageData(null);
    setDirty(false);
  }, [currentId, selected?.revision, partType]);

  useEffect(() => {
    setRenameValue(selected?.name ?? "");
  }, [currentId, selected?.revision]);

  const previewParts = useMemo(() => {
    if (!selected) return [];
    const url = imageData || savedPart?.imageUrl;
    if (!url) return selected.draftParts;
    return upsertPlayerCharacterPartPreview(selected.draftParts, {
      partType, imageUrl: url, ...transform,
    });
  }, [selected, partType, savedPart?.imageUrl, imageData, transform]);

  const updateCache = (base: CharacterBase) => {
    qc.setQueryData<CharacterBase[]>(LIST_KEY, old => {
      const next = old ?? [];
      return next.some(item => item.id === base.id)
        ? next.map(item => item.id === base.id ? base : item)
        : [...next, base];
    });
  };
  const reportError = (error: unknown) => {
    toast({ title: "Avatar change not saved", description: error instanceof Error ? error.message : "Please retry." });
    void qc.invalidateQueries({ queryKey: LIST_KEY });
  };

  const create = useMutation({
    mutationFn: () => requestJson<CharacterBase>("POST", "/api/admin/player-character/bases", { name: newName.trim() }),
    onSuccess: base => {
      updateCache(base);
      setSelectedId(base.id);
      toast({ title: "Avatar draft created", description: "Upload the seven parts and publish when ready." });
    },
    onError: reportError,
  });
  const save = useMutation({
    mutationFn: () => requestJson<CharacterBase>(
      "PUT", `/api/admin/player-character/bases/${selected!.id}/parts/${partType}`,
      { expectedRevision: selected!.revision, transform, ...(imageData ? { imageData } : {}) },
    ),
    onSuccess: base => {
      updateCache(base);
      toast({ title: "Part saved", description: "The draft was updated; published artwork is unchanged." });
    },
    onError: reportError,
  });
  const remove = useMutation({
    mutationFn: () => requestJson<CharacterBase>(
      "DELETE", `/api/admin/player-character/bases/${selected!.id}/parts/${partType}`,
      { expectedRevision: selected!.revision },
    ),
    onSuccess: base => {
      updateCache(base);
      toast({ title: "Draft part removed", description: "The published avatar, if any, is unaffected." });
    },
    onError: reportError,
  });
  const rename = useMutation({
    mutationFn: () => requestJson<CharacterBase>(
      "PATCH", `/api/admin/player-character/bases/${selected!.id}/name`,
      { expectedRevision: selected!.revision, name: renameValue.trim() },
    ),
    onSuccess: base => {
      updateCache(base);
      toast({ title: "Avatar renamed" });
    },
    onError: reportError,
  });
  const publish = useMutation({
    mutationFn: () => requestJson<CharacterBase>(
      "POST", `/api/admin/player-character/bases/${selected!.id}/publish`,
      { expectedRevision: selected!.revision },
    ),
    onSuccess: base => {
      updateCache(base);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      toast({ title: "Default avatar published", description: "The saved seven-part snapshot is now the published default." });
    },
    onError: reportError,
  });

  const busy = create.isPending || save.isPending || remove.isPending || rename.isPending || publish.isPending;

  const openImage = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type) || file.size > 5_000_000) {
      toast({ title: "Unsupported image", description: "Use a transparent PNG or WebP under 5 MB." });
      return;
    }
    try {
      const image = await dataFromFile(file);
      setImageData(image);
      setDirty(true);
    } catch (error) {
      reportError(error);
    }
  };

  const updateField = (key: keyof PlayerCharacterTransform, value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.max(min, Math.min(max, key === "zIndex" ? Math.round(value) : value));
    setTransform(current => ({ ...current, [key]: next }));
    setDirty(true);
  };
  const canPublish = !!selected && completePlayerCharacterParts(selected.draftParts) && !dirty && !busy;

  return (
    <section data-testid="player-character-admin-panel" className="space-y-4 text-[#f3dfac]">
      <div className="rounded-xl border border-[#9c854b]/55 bg-[#10251a]/90 p-3">
        <h2 className="font-fantasy text-lg font-bold text-[#f3d58b]">Avatar Base Editor</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#d1c69f]">
          Build a front-facing, seven-part player avatar. Draft changes never alter the published character.
          Clothing fitting and walking animation come in later Avatar Program stages.
        </p>
      </div>

      <div className="rounded-xl border border-[#8b7747]/45 bg-black/30 p-3">
        <label htmlFor="new-avatar-base" className="mb-1 block text-xs">New avatar base name</label>
        <div className="flex flex-wrap gap-2">
          <input id="new-avatar-base" className={`${inputClass} min-w-0 flex-1`}
            value={newName} maxLength={80} onChange={event => setNewName(event.target.value)} />
          <button type="button" className={buttonClass} disabled={busy || dirty || !newName.trim()}
            onClick={() => create.mutate()}>Add Avatar Base</button>
        </div>
        {query.isLoading && <p className="mt-2 text-xs">Loading avatar definitions…</p>}
        {query.isError && (
          <button type="button" className={`${buttonClass} mt-2`} onClick={() => void query.refetch()}>
            Could not load avatars — retry
          </button>
        )}
        {bases.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Avatar bases">
            {bases.map(base => (
              <button type="button" key={base.id} disabled={busy || dirty}
                onClick={() => setSelectedId(base.id)}
                aria-pressed={base.id === currentId}
                className={buttonClass}
                style={{ borderColor: base.id === currentId ? "#f4cd75" : "#88723e" }}>
                {base.name}{base.isDefault ? " · Published default" : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#8b7747]/45 bg-black/30 p-3">
            <label htmlFor="rename-avatar" className="mb-1 block text-xs">Avatar base name</label>
            <div className="flex flex-wrap gap-2">
              <input id="rename-avatar" className={`${inputClass} min-w-0 flex-1`}
                value={renameValue} maxLength={80} onChange={event => setRenameValue(event.target.value)} />
              <button className={buttonClass} type="button" disabled={busy || dirty || !renameValue.trim() || renameValue.trim() === selected.name}
                onClick={() => rename.mutate()}>Save Name</button>
            </div>
            <p className="mt-2 text-[11px] text-[#d0c4a4]">
              Draft parts: {selected.draftParts.length}/7 · {selected.isDefault ? "Published default" :
                selected.publishedParts ? "Previously published, not default" : "Not published"} · Revision {selected.revision}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Choose avatar part">
                {PLAYER_CHARACTER_PART_TYPES.map(type => {
                  const part = selected.draftParts.find(p => p.partType === type);
                  return (
                    <button key={type} type="button" disabled={busy || (dirty && type !== partType)}
                      data-testid={`avatar-part-select-${type}`}
                      onClick={() => setPartType(type)}
                      aria-pressed={type === partType}
                      className={`${buttonClass} flex flex-col items-center justify-center gap-1`}
                      style={{ borderColor: type === partType ? "#edcb7c" : "#74643d", minHeight: 65 }}>
                      {part
                        ? <img alt="" src={part.imageUrl} className="h-7 w-7 object-contain" draggable={false} />
                        : <span className="text-lg text-[#a6915e]">+</span>}
                      <span>{PLAYER_CHARACTER_PART_LABELS[type]}</span>
                    </button>
                  );
                })}
              </div>
              <PlayerCharacterPartsPreview parts={previewParts} activePartType={partType}
                editable={Boolean(imageData || savedPart)}
                onMovePart={(xPct, yPct) => {
                  setTransform(current => ({ ...current, xPct, yPct }));
                  setDirty(true);
                }} />
              <p className="text-[11px] text-[#cfc1a0]">
                Select a body part above, then tap or drag within the preview to reposition it.
                The placement and pivot are saved relative to the avatar artwork, not the screen.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-[#8b7747]/45 bg-[#11291d]/80 p-3">
              <h3 className="text-sm font-bold text-[#f3d58b]">
                {PLAYER_CHARACTER_PART_LABELS[partType]} · Draft
              </h3>
              <label className="block text-xs">
                Upload transparent PNG/WebP
                <input type="file" accept="image/png,image/webp" disabled={busy}
                  data-testid={`avatar-upload-${partType}`}
                  className="mt-1 block w-full text-xs file:mr-2 file:rounded-lg file:border file:border-[#bca15d] file:bg-[#244532] file:px-3 file:py-2 file:text-[#f3d58b]"
                  onChange={event => {
                    void openImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {transformFields.map(field => (
                  <label key={field.key} className="block text-[11px] text-[#e7d7ad]">
                    {field.label}
                    <input type="number" className={`${inputClass} mt-1`} min={field.min} max={field.max}
                      step={field.step} disabled={busy}
                      value={transform[field.key]}
                      onChange={event => updateField(field.key, Number(event.target.value), field.min, field.max)} />
                  </label>
                ))}
              </div>
              <button type="button" className={`${buttonClass} w-full`}
                disabled={busy || !dirty || (!savedPart && !imageData)}
                data-testid="avatar-save-part" onClick={() => save.mutate()}>
                {save.isPending ? "Saving Part…" : "Save Selected Part"}
              </button>
              {savedPart && (
                <button type="button" disabled={busy || dirty} onClick={() => remove.mutate()}
                  className="min-h-[40px] w-full rounded-lg border border-[#786348] bg-[#35291c] text-xs text-[#f2cfa2]">
                  Remove from Draft
                </button>
              )}
              {dirty && (
                <button type="button" className={`${buttonClass} w-full`}
                  onClick={() => {
                    setTransform(savedPart
                      ? {
                          xPct: savedPart.xPct, yPct: savedPart.yPct, widthPct: savedPart.widthPct,
                          pivotXPct: savedPart.pivotXPct, pivotYPct: savedPart.pivotYPct,
                          rotationDeg: savedPart.rotationDeg, zIndex: savedPart.zIndex,
                        }
                      : { ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[partType] });
                    setImageData(null);
                    setDirty(false);
                  }}>
                  Discard Unsaved Changes
                </button>
              )}
              <p className="text-[11px] text-[#c7b992]">
                {dirty ? "Unsaved part placement or artwork — save or discard before switching parts or publishing." :
                  "Saved draft. Publish separately when all seven parts are ready."}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-[#b99b56]/55 bg-[#10281c] p-3">
            <h3 className="font-fantasy font-bold text-[#f3d58b]">Publish Default Player Avatar</h3>
            <p className="my-2 text-xs leading-relaxed text-[#decda7]">
              All seven parts are required. Publishing copies this draft into a separate live snapshot
              and selects it as the one default avatar. Later edits remain private until republished.
            </p>
            <button type="button" data-testid="avatar-publish-default" className={`${buttonClass} w-full`}
              disabled={!canPublish} onClick={() => publish.mutate()}>
              {publish.isPending ? "Publishing…" : selected.isDefault ? "Republish Updated Default" : "Publish as Default"}
            </button>
            {!completePlayerCharacterParts(selected.draftParts) && (
              <p className="mt-2 text-xs text-[#decda7]">Complete and save all 7 parts before publishing.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Preview may show an unsaved data URI. Persisted parts always use strict
 * processed media URLs; avoid passing the ephemeral preview to the parser.
 */
function upsertPlayerCharacterPartPreview(
  saved: readonly PlayerCharacterPart[], next: PlayerCharacterPart,
): PlayerCharacterPart[] {
  return [...saved.filter(p => p.partType !== next.partType), next]
    .sort((a, b) => a.zIndex - b.zIndex);
}
