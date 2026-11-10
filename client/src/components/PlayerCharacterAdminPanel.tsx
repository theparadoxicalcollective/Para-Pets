import { Suspense, useMemo, useState } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PlayerCharacterPartsPreview from "./PlayerCharacterPartsPreview";
import {
  DEFAULT_PLAYER_CHARACTER_TRANSFORMS,
  PLAYER_CHARACTER_PART_LABELS,
  PLAYER_CHARACTER_PART_TYPES,
  completePlayerCharacterParts,
  resolvePlayerCharacterParts,
  type PlayerCharacterPart,
  type StoredPlayerCharacterPart,
  type PlayerCharacterPartType,
} from "@shared/playerCharacter";

const PlayerClothingAdminPanel = lazyWithRetry(() => import("./PlayerClothingAdminPanel"));

interface CharacterBase {
  id: string;
  name: string;
  draftParts: StoredPlayerCharacterPart[];
  publishedParts: StoredPlayerCharacterPart[] | null;
  isDefault: boolean;
  revision: number;
}
type BodyKind = "Masc" | "Fem";
type PendingImages = Partial<Record<PlayerCharacterPartType, string>>;

// Upload order is for the artist. Rendering depth remains owned by the
// shared artwork-relative transforms: legs/feet, torso, arms, HEAD foremost.
const UPLOAD_PART_ORDER: readonly PlayerCharacterPartType[] = [
  "head", "top", "left_arm", "right_arm",
  "left_leg", "right_leg", "left_foot", "right_foot",
];
const LIST_KEY = ["/api/admin/player-character/bases"];
const buttonClass = "min-h-[44px] rounded-lg border border-[#b79b55]/70 bg-[#20412b] px-3 py-2 text-sm font-bold text-[#f2da99] disabled:opacity-45";
const cardClass = "rounded-xl border border-[#9c854b]/60 bg-[#10291d]/90 p-3";

const dataFromFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string"
    ? resolve(reader.result) : reject(new Error("Image could not be read"));
  reader.onerror = () => reject(new Error("Image could not be read"));
  reader.readAsDataURL(file);
});

async function requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  return (await apiRequest(method, url, body)).json();
}

/** One compact body editor; the clothing editor and shared renderer stay intact. */
export default function PlayerCharacterAdminPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [bodyKind, setBodyKind] = useState<BodyKind>("Fem");
  const [pendingImages, setPendingImages] = useState<PendingImages>({});
  const [readingParts, setReadingParts] = useState(0);
  const [editorTab, setEditorTab] = useState<"base" | "clothing">("base");
  const [clothingOpened, setClothingOpened] = useState(false);
  const [clothingDirty, setClothingDirty] = useState(false);

  const query = useQuery<CharacterBase[]>({
    queryKey: LIST_KEY,
    queryFn: () => requestJson<CharacterBase[]>("GET", "/api/admin/player-character/bases"),
  });
  const bases = query.data ?? [];
  // Existing Masc and Fem drafts are reused, not silently recreated or deleted.
  const selected = bases.find(base => base.name.trim().toLowerCase() === bodyKind.toLowerCase());
  const changedTypes = UPLOAD_PART_ORDER.filter(type => !!pendingImages[type]);
  const dirty = changedTypes.length > 0;
  const previewParts = useMemo(() => {
    let draft = selected ? resolvePlayerCharacterParts(selected.draftParts) : [];
    for (const type of PLAYER_CHARACTER_PART_TYPES) {
      const upload = pendingImages[type];
      if (!upload) continue;
      const saved = draft.find(part => part.partType === type);
      const next: PlayerCharacterPart = {
        ...(saved ?? DEFAULT_PLAYER_CHARACTER_TRANSFORMS[type]),
        zIndex: DEFAULT_PLAYER_CHARACTER_TRANSFORMS[type].zIndex,
        partType: type,
        imageUrl: upload,
      };
      draft = [...draft.filter(part => part.partType !== type), next];
    }
    return draft.sort((a, b) => a.zIndex - b.zIndex);
  }, [selected, pendingImages]);

  const updateCache = (base: CharacterBase) => {
    qc.setQueryData<CharacterBase[]>(LIST_KEY, old => {
      const values = old ?? [];
      return values.some(item => item.id === base.id)
        ? values.map(item => item.id === base.id ? base : item)
        : [...values, base];
    });
  };
  const reportError = (error: unknown) => {
    toast({
      title: "Avatar body not saved",
      description: error instanceof Error ? error.message : "Please retry.",
      variant: "destructive",
    });
    void qc.invalidateQueries({ queryKey: LIST_KEY });
  };

  // Create the selected base if needed, then commit every new part in one
  // version-checked update. Failure keeps uploads visible for retry.
  const saveBody = useMutation({
    mutationFn: async (input: { kind: BodyKind; base?: CharacterBase; images: PendingImages }) => {
      const base = input.base ?? await requestJson<CharacterBase>(
        "POST", "/api/admin/player-character/bases", { name: input.kind },
      );
      // A new empty base may be created even if the later image save fails.
      // Cache its ID immediately so retry does not create a duplicate body.
      if (!input.base) updateCache(base);
      const parts = UPLOAD_PART_ORDER
        .filter(type => !!input.images[type])
        .map(type => ({ partType: type, imageData: input.images[type]! }));
      return requestJson<CharacterBase>(
        "PUT", "/api/admin/player-character/bases/" + base.id + "/body",
        { expectedRevision: base.revision, parts },
      );
    },
    onSuccess: base => {
      updateCache(base);
      setPendingImages({});
      toast({ title: bodyKind + " body saved" });
    },
    onError: reportError,
  });

  const publish = useMutation({
    mutationFn: () => requestJson<CharacterBase>(
      "POST", "/api/admin/player-character/bases/" + selected!.id + "/publish",
      { expectedRevision: selected!.revision },
    ),
    onSuccess: base => {
      updateCache(base);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      toast({ title: "Default avatar published" });
    },
    onError: reportError,
  });
  const busy = saveBody.isPending || publish.isPending || readingParts > 0;

  const openImage = async (partType: PlayerCharacterPartType, file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type) || file.size > 5_000_000) {
      toast({ title: "Unsupported image", description: "Choose a PNG or WebP under 5 MB.", variant: "destructive" });
      return;
    }
    setReadingParts(value => value + 1);
    try {
      const imageData = await dataFromFile(file);
      setPendingImages(previous => ({ ...previous, [partType]: imageData }));
    } catch (error) {
      reportError(error);
    } finally {
      setReadingParts(value => value - 1);
    }
  };

  const chooseBody = (kind: BodyKind) => {
    if (busy || dirty) return;
    setBodyKind(kind);
  };
  const canPublish = !!selected && completePlayerCharacterParts(selected.draftParts) && !dirty && !busy;

  return (
    <section data-testid="player-character-admin-panel" className="space-y-3 text-[#f3dfac]">
      <div role="tablist" aria-label="Avatar administration" className="grid grid-cols-2 gap-2">
        <button type="button" role="tab" aria-selected={editorTab === "base"}
          disabled={clothingDirty} className={buttonClass}
          onClick={() => setEditorTab("base")}
          style={{ borderColor: editorTab === "base" ? "#f1d18c" : "#816f43" }}>
          Base Body
        </button>
        <button type="button" role="tab" aria-selected={editorTab === "clothing"}
          disabled={dirty || busy} className={buttonClass}
          data-testid="avatar-open-create-clothing"
          onClick={() => { setClothingOpened(true); setEditorTab("clothing"); }}
          style={{ borderColor: editorTab === "clothing" ? "#f1d18c" : "#816f43" }}>
          Create Clothing
        </button>
      </div>

      {editorTab === "base" && (
        <div className="space-y-3">
          <div className={cardClass}>
            <div role="group" aria-label="Avatar body type" className="grid grid-cols-2 gap-2">
              {(["Masc", "Fem"] as const).map(kind => (
                <button key={kind} type="button"
                  data-testid={"avatar-body-" + kind.toLowerCase()}
                  aria-pressed={bodyKind === kind}
                  disabled={busy || (dirty && bodyKind !== kind)}
                  className={buttonClass}
                  style={{ borderColor: bodyKind === kind ? "#f7d58f" : "#816f43",
                    background: bodyKind === kind ? "#28553a" : "#102b1e" }}
                  onClick={() => chooseBody(kind)}>
                  {kind}
                </button>
              ))}
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="mb-2 text-center font-fantasy text-lg font-bold text-[#f6da92]">{bodyKind} Body</h2>
            <div className="mx-auto w-full max-w-[248px]" data-testid="avatar-body-preview-box">
              <PlayerCharacterPartsPreview parts={previewParts} />
            </div>
          </div>

          <div className={cardClass}>
            <div role="group" aria-label="Body part image uploads"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {UPLOAD_PART_ORDER.map(type => {
                const image = pendingImages[type] ?? previewParts.find(part => part.partType === type)?.imageUrl;
                return (
                  <label key={type}
                    data-testid={"avatar-body-upload-tile-" + type}
                    className="relative flex min-h-[90px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-[#b79b55]/65 bg-[#123425] px-2 py-2 text-center text-xs text-[#f4dda4] focus-within:outline focus-within:outline-2 focus-within:outline-[#f7d58f]">
                    {image
                      ? <img src={image} alt="" draggable={false} className="h-10 w-12 object-contain" />
                      : <span aria-hidden="true" className="text-2xl leading-none">+</span>}
                    <span>{PLAYER_CHARACTER_PART_LABELS[type] === "Torso / Top" ? "Torso" : PLAYER_CHARACTER_PART_LABELS[type]}</span>
                    {pendingImages[type] && <span className="text-[10px] text-[#ffe58f]">New</span>}
                    <input type="file" accept="image/png,image/webp"
                      aria-label={"Upload " + (type === "top" ? "Torso" : PLAYER_CHARACTER_PART_LABELS[type])}
                      data-testid={"avatar-upload-" + type}
                      className="sr-only"
                      disabled={busy}
                      onChange={event => {
                        void openImage(type, event.currentTarget.files?.[0]);
                        event.currentTarget.value = "";
                      }} />
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[11px] text-[#cbbb91]">
              Transparent PNG or WebP · {previewParts.length}/8 parts
            </p>
            <button type="button" data-testid="avatar-save-body"
              className={buttonClass + " mt-3 w-full"}
              disabled={busy || !dirty}
              onClick={() => saveBody.mutate({ kind: bodyKind, base: selected, images: { ...pendingImages } })}>
              {saveBody.isPending ? "Saving Body…" : "Save Body"}
            </button>
            {dirty && (
              <button type="button" className="mt-2 min-h-[44px] w-full text-xs text-[#ddc99b] underline"
                disabled={busy} onClick={() => setPendingImages({})}>
                Discard unsaved uploads
              </button>
            )}
          </div>

          {selected && completePlayerCharacterParts(selected.draftParts) && (
            <div className={cardClass}>
              <button type="button" data-testid="avatar-publish-default"
                className={buttonClass + " w-full"}
                disabled={!canPublish} onClick={() => publish.mutate()}>
                {publish.isPending ? "Publishing…" : selected.isDefault ? "Republish Default" : "Publish as Default"}
              </button>
              <p className="mt-2 text-center text-[11px] text-[#cbbb91]">
                Only one default body is published at a time.
              </p>
            </div>
          )}
          {query.isLoading && <p role="status" className="text-center text-xs">Loading bodies…</p>}
          {query.isError && (
            <button type="button" className={buttonClass} onClick={() => void query.refetch()}>
              Retry loading bodies
            </button>
          )}
        </div>
      )}

      {clothingOpened && (
        <div className={editorTab === "clothing" ? "" : "hidden"}>
          <Suspense fallback={<p className="p-3 text-sm text-[#e3cc9a]">Loading clothing editor…</p>}>
            <PlayerClothingAdminPanel onDirtyChange={setClothingDirty} />
          </Suspense>
        </div>
      )}
    </section>
  );
}
