import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, RefreshCw, Sparkles } from "lucide-react";
import { PLAYER_CLOTHING_CATEGORIES, PLAYER_CLOTHING_CATEGORY_LABELS, type PlayerClothingCategory } from "@shared/playerCharacterClothing";
import PlayerCharacterRenderer from "@/components/PlayerCharacterRenderer";
import { PLAYER_SKIN_TONE_SWATCHES } from "@shared/playerSkinTone";
import { useToast } from "@/hooks/use-toast";
import {
  playerAvatarQueryKey, fetchPlayerAvatar, wardrobeLayers, writePlayerAvatar,
  type OwnedAvatarClothing, type PlayerAvatarState,
} from "@/lib/playerAvatarWardrobe";
import accessoriesIcon from "@assets/uploads/ClothingAccesoryIcon.png";
import headAccessoriesIcon from "@assets/uploads/HeadAccessoriesIcon.png";
import hairIcon from "@assets/uploads/HairIcon.png";
import faceIcon from "@assets/uploads/FaceIcon.png";
import topIcon from "@assets/uploads/TopIcon.png";
import bottomsIcon from "@assets/uploads/BottomsIcon.png";
import shoesIcon from "@assets/uploads/ShoeIcon.png";
import backAccessoriesIcon from "@assets/uploads/BackAccessoryIcon.png";
import "./PlayerAvatarPage.css";

/** Art supplied for the eight existing wardrobe categories. Keep the stable
 * category keys and descriptive button labels for accessibility/navigation. */
const categoryIcons: Record<PlayerClothingCategory, string> = {
  accessories: accessoriesIcon,
  head: headAccessoriesIcon,
  hair: hairIcon,
  face: faceIcon,
  top: topIcon,
  bottom: bottomsIcon,
  shoes: shoesIcon,
  back: backAccessoriesIcon,
};

/** Player character and wardrobe only. Home HUD/pet cutover are separate stages. */
export default function PlayerAvatarPage({ userId }: { userId: string }) {
  const [, navigate] = useLocation();
  const fromHome = new URLSearchParams(useSearch()).get("from") === "home";
  const qc = useQueryClient();
  const { toast } = useToast();
  // This page receives the authenticated identity from AppRouter. Home and
  // Clearing use the same key; a first-save/equip response can never update
  // another account's outfit or an unscoped shared cache entry.
  const avatarKey = playerAvatarQueryKey(userId);
  const cacheSavedAvatar = (saved: PlayerAvatarState, accountId: string) => {
    // A mutation can finish after the component has switched to another
    // account; use the identity captured at the time Save was requested.
    qc.setQueryData(playerAvatarQueryKey(accountId), saved);
  };
  const [category, setCategory] = useState<PlayerClothingCategory>("head");
  // No wardrobe is expanded until a player taps its category icon.
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [skinPickerOpen, setSkinPickerOpen] = useState(false);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const [previewSelections, setPreviewSelections] = useState<Partial<Record<PlayerClothingCategory, string>>>({});
  const [resetPending, setResetPending] = useState(false);
  const [bodyChoiceId, setBodyChoiceId] = useState<string | null>(null);
  // undefined = untouched, null = restore original art, hex = selected tint.
  const [skinChoice, setSkinChoice] = useState<string | null | undefined>(undefined);
  const avatarQuery = useQuery<PlayerAvatarState>({
    queryKey: avatarKey,
    queryFn: ({ signal }) => fetchPlayerAvatar(signal),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const avatar = avatarQuery.data;

  const creation = useMutation({
    mutationFn: (input: { baseId: string; skinTone: string | null; accountId: string }) =>
      writePlayerAvatar("POST", "/api/player-avatar/create", {
        baseId: input.baseId, skinTone: input.skinTone,
      }),
    onSuccess: (saved, input) => {
      cacheSavedAvatar(saved, input.accountId);
      if (input.accountId !== userId) return;
      setPreviewSelections({});
      setResetPending(false);
      setBodyChoiceId(null);
      setSkinChoice(undefined);
      setWardrobeOpen(false);
      setSkinPickerOpen(false);
      setSaveConfirmationOpen(true);
    },
    onError: (error: Error, input) => {
      if (input.accountId === userId) {
        toast({ title: "Could not create character", description: error.message, variant: "destructive" });
      }
      void qc.invalidateQueries({ queryKey: playerAvatarQueryKey(input.accountId) });
    },
  });

  const equipment = useMutation({
    mutationFn: (input: {
      category: PlayerClothingCategory;
      inventoryId: string | null;
      expectedRevision: number;
      accountId: string;
    }) => writePlayerAvatar(
      "PUT",
      `/api/player-avatar/equipment/${input.category}`,
      { inventoryId: input.inventoryId, expectedRevision: input.expectedRevision },
    ),
    onSuccess: (saved, input) => {
      cacheSavedAvatar(saved, input.accountId);
      if (input.accountId !== userId) return;
      setPreviewSelections(current => {
        const next = { ...current };
        delete next[input.category];
        return next;
      });
      toast({ title: "Wardrobe saved", description: "Your character's clothing has been updated." });
    },
    onError: (error: Error & { status?: number }, input) => {
      if (input.accountId === userId) {
        toast({ title: "Wardrobe not saved", description: error.message, variant: "destructive" });
      }
      if (error.status === 409 || error.status === 404 || error.status === 422) {
        // Trust the server over a stale item, base publication or second device.
        if (input.accountId === userId) setPreviewSelections(current => {
          const next = { ...current };
          delete next[input.category];
          return next;
        });
        void qc.invalidateQueries({ queryKey: playerAvatarQueryKey(input.accountId) });
      }
    },
  });

  const changeBody = useMutation({
    mutationFn: (input: {
      baseId: string; skinTone: string | null; keepSnapshot: boolean;
      clearClothing: boolean; expectedRevision: number; accountId: string;
    }) =>
      writePlayerAvatar("PATCH", "/api/player-avatar/base", {
        baseId: input.baseId, skinTone: input.skinTone, keepSnapshot: input.keepSnapshot,
        clearClothing: input.clearClothing,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: (saved, input) => {
      cacheSavedAvatar(saved, input.accountId);
      if (input.accountId !== userId) return;
      setBodyChoiceId(null);
      setSkinChoice(undefined);
      setResetPending(false);
      // Keep preview selections for other categories after changing body.
      setWardrobeOpen(false);
      setSkinPickerOpen(false);
      setSaveConfirmationOpen(true);
    },
    onError: (error: Error & { status?: number }, input) => {
      if (input.accountId === userId) {
        toast({ title: "Could not change body", description: error.message, variant: "destructive" });
      }
      if (error.status === 409 || error.status === 404 || error.status === 422) {
        void qc.invalidateQueries({ queryKey: playerAvatarQueryKey(input.accountId) });
      }
    },
  });
  const busy = creation.isPending || equipment.isPending || changeBody.isPending;
  const availableBodies = avatar?.availableBases ?? [];
  const selectedBody = availableBodies.find(base => base.id === bodyChoiceId)
    ?? (avatar?.created ? avatar.base :
      availableBodies.find(base => base.id === avatar?.base?.id)
      ?? availableBodies[0] ?? avatar?.base);
  const switchingBody = !!avatar?.created && !!selectedBody && (
    selectedBody.id !== avatar.base?.id ||
    new Date(selectedBody.publishedAt).getTime() !== new Date(avatar.base?.publishedAt ?? 0).getTime()
  );
  const skinTone = skinChoice === undefined ? avatar?.skinTone ?? null : skinChoice;
  const toneChanged = !!avatar?.created && skinTone !== (avatar.skinTone ?? null);
  const appearanceChanged = switchingBody || toneChanged || resetPending;
  const owned = avatar?.ownedClothing.filter(item => item.category === category) ?? [];
  const activePreviewId = previewSelections[category] ?? null;
  const selected: OwnedAvatarClothing | undefined = owned.find(item =>
    item.inventoryId === activePreviewId && item.compatible && !item.isListed && item.quantity > 0
  );
  const previews = PLAYER_CLOTHING_CATEGORIES.flatMap(slot => previewSelections[slot]
    ? [{ category: slot, inventoryId: previewSelections[slot]! }] : []);
  const clothingLayers = avatar
    ? wardrobeLayers(avatar, previews, resetPending, selectedBody?.name).filter(layer =>
        !switchingBody || avatar.ownedClothing.some(item =>
          item.inventoryId === layer.inventoryId && item.universal))
    : [];
  const equippedItem = resetPending ? undefined : avatar?.equipped.find(item => item.category === category);
  const unavailableEquipped = !resetPending &&
    (avatar?.unavailableEquipmentSlots.includes(category) ?? false);

  const saveEquipment = (inventoryId: string | null) => {
    if (!avatar?.created || avatar.revision == null || busy) return;
    equipment.mutate({ category, inventoryId, expectedRevision: avatar.revision, accountId: userId });
  };

  const selectCategory = (next: PlayerClothingCategory) => {
    setWardrobeOpen(open => next === category ? !open : true);
    setCategory(next);
    setSkinPickerOpen(false);
  };
  const toggleSkinPicker = () => {
    setSkinPickerOpen(open => !open);
    setWardrobeOpen(false);
  };
  const resetCharacter = () => {
    if (busy) return;
    setPreviewSelections({});
    setSkinChoice(null);
    setWardrobeOpen(false);
    setSkinPickerOpen(false);
    setResetPending(!!avatar?.created);
    // Preserve the chosen Fem/Masc base while resetting all appearance parts.
  };

  return (
    <main className="player-avatar-page" data-testid="player-avatar-page" data-coordinate-owner="viewport">
      <div className="player-avatar-page__backdrop" aria-hidden="true" />
      <div className="player-avatar-page__content">
        <header className="player-avatar-page__header">
          <button type="button" className="player-avatar-page__back" aria-label={fromHome ? "Back to Home" : "Back to Bag"}
            onClick={() => navigate(fromHome ? "/" : "/bag")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
          <span aria-hidden="true" />
          <button type="button" className="player-avatar-page__refresh"
            aria-label="Reset character to empty base"
            title="Reset to empty base, then save appearance"
            data-testid="avatar-reset-character"
            disabled={busy} onClick={resetCharacter}>
            <RefreshCw size={19} aria-hidden="true" />
          </button>
        </header>

        {avatarQuery.isLoading && !avatar ? (
          <section className="player-avatar-page__message" role="status" data-testid="avatar-loading">
            Preparing your character…
          </section>
        ) : avatarQuery.isError && !avatar ? (
          <section className="player-avatar-page__message" role="alert" data-testid="avatar-error">
            <p>We couldn't load your character. Your saved appearance and clothing are safe.</p>
            <button type="button" onClick={() => void avatarQuery.refetch()}>Try Again</button>
          </section>
        ) : avatar ? (
          <>
            <div className="player-avatar-page__showcase" aria-label="Character viewer and wardrobe categories">
              <div className="player-avatar-page__halo" aria-hidden="true" />
              <div className="player-avatar-page__viewer" data-testid="avatar-character-viewer">
                {selectedBody ? (
                  <PlayerCharacterRenderer
                    parts={selectedBody.parts}
                    skinTone={skinTone}
                    clothingLayers={clothingLayers}
                    motion="idle"
                    ariaLabel={avatar.created ? "Your saved player character" : "Preview of your character before saving"}
                  />
                ) : (
                  <div className="player-avatar-page__no-base" role="status">
                    Save all eight parts of a Masc or Fem body in Admin to make it available.
                  </div>
                )}
              </div>
              {PLAYER_CLOTHING_CATEGORIES.map(slot => (
                <button
                  key={slot}
                  type="button"
                  className={`player-avatar-page__category player-avatar-page__category--${slot}`}
                  data-testid={`avatar-category-${slot}`}
                  aria-label={PLAYER_CLOTHING_CATEGORY_LABELS[slot]}
                  aria-pressed={wardrobeOpen && category === slot}
                  aria-expanded={wardrobeOpen && category === slot}
                  aria-controls="player-avatar-clothing-panel"
                  onClick={() => selectCategory(slot)}
                >
                  <img
                    src={categoryIcons[slot]}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    className="player-avatar-page__category-icon"
                  />
                  <span className="sr-only">{PLAYER_CLOTHING_CATEGORY_LABELS[slot]}</span>
                  {avatar.equipped.some(item => item.category === slot) &&
                    <span className="player-avatar-page__equipped-dot" aria-hidden="true" />}
                </button>
              ))}
            </div>

            {selectedBody && (
              <div className="player-avatar-page__body-controls">
                <button type="button" className="player-avatar-page__skin-toggle"
                  aria-label="Choose skin color" aria-expanded={skinPickerOpen}
                  aria-controls="avatar-skin-tone-picker"
                  data-testid="avatar-skin-picker-toggle"
                  disabled={busy} onClick={toggleSkinPicker}>
                  <span aria-hidden="true" className="player-avatar-page__skin-toggle-color"
                    style={{ backgroundColor: skinTone ?? "#e0b492" }} />
                </button>
                {availableBodies.length > 0 && (
                <div className="player-avatar-page__body-selector" role="group" aria-label="Choose character body"
                  data-testid="avatar-body-selector">
                {(["Fem", "Masc"] as const).map(kind => {
                  const option = availableBodies.find(base => base.name.trim().toLowerCase() === kind.toLowerCase());
                  if (!option) return null;
                  const selected = selectedBody?.id === option.id;
                  return (
                    <button type="button" key={kind} aria-label={`Choose ${kind} body`}
                      data-testid={`avatar-choose-${kind.toLowerCase()}`}
                      aria-pressed={selected} disabled={busy}
                      onClick={() => setBodyChoiceId(option.id)}>
                      <span aria-hidden="true" className="player-avatar-page__body-symbol">{kind === "Fem" ? "♀" : "♂"}</span>
                      <span>{kind}</span>
                    </button>
                  );
                })}
                </div>
                )}
              </div>
            )}
            <div className="player-avatar-page__details" data-testid="avatar-scrollable-details">
            {skinPickerOpen && (
            <section className="player-avatar-page__skin-picker" role="group"
              id="avatar-skin-tone-picker"
              aria-label="Choose skin color" data-testid="avatar-skin-tone-picker">
              <h2>Skin Color</h2>
              <div className="player-avatar-page__skin-swatches">
                <button type="button" disabled={busy} aria-label="Original body color"
                  aria-pressed={skinTone === null} className="player-avatar-page__skin-original"
                  onClick={() => setSkinChoice(null)}>Original</button>
                {PLAYER_SKIN_TONE_SWATCHES.map(swatch => (
                  <button type="button" key={swatch.value} disabled={busy}
                    aria-label={swatch.label + " skin color"}
                    data-testid={"avatar-skin-" + swatch.label.toLowerCase()}
                    aria-pressed={skinTone === swatch.value}
                    style={{ backgroundColor: swatch.value }}
                    onClick={() => setSkinChoice(swatch.value)} />
                ))}
                <label className="player-avatar-page__custom-skin">
                  Custom
                  <input type="color" value={skinTone ?? "#d39a71"} disabled={busy}
                    aria-label="Custom skin color" data-testid="avatar-custom-skin"
                    onChange={event => setSkinChoice(event.target.value)} />
                </label>
              </div>
            </section>
            )}
            {appearanceChanged && avatar.revision !== null && (
              <section className="player-avatar-page__change-body" data-testid="avatar-body-change">
                <button type="button" data-testid="avatar-save-body-choice" disabled={busy}
                  onClick={() => selectedBody && changeBody.mutate({
                    baseId: selectedBody.id, skinTone, keepSnapshot: !switchingBody,
                    clearClothing: resetPending,
                    expectedRevision: avatar.revision!, accountId: userId,
                  })}>
                  {changeBody.isPending ? "Saving Appearance…" : "Save Appearance"}
                </button>
              </section>
            )}
            {wardrobeOpen && (
              <section className="player-avatar-page__wardrobe" id="player-avatar-clothing-panel"
                data-testid="avatar-clothing-category-panel"
                aria-label={`${PLAYER_CLOTHING_CATEGORY_LABELS[category]} clothing`}>
                <div className="player-avatar-page__wardrobe-header">
                  <h2>{PLAYER_CLOTHING_CATEGORY_LABELS[category]}</h2>
                  <button type="button" className="player-avatar-page__wardrobe-close"
                    aria-label={`Close ${PLAYER_CLOTHING_CATEGORY_LABELS[category]} clothing`}
                    data-testid="avatar-close-clothing-category"
                    onClick={() => setWardrobeOpen(false)}>×</button>
                </div>

                {unavailableEquipped && (
                  <p className="player-avatar-page__warning" role="status">
                    Your previously equipped item is no longer available. Choose another or remove it.
                  </p>
                )}

                {owned.length ? (
                  <div className="player-avatar-page__inventory" data-testid="avatar-owned-inventory"
                    role="group" aria-label={`Scroll through ${PLAYER_CLOTHING_CATEGORY_LABELS[category]} clothing`}>
                    {owned.map(item => {
                      const eligible = item.compatible && !item.isListed && item.quantity > 0;
                      const worn = avatar.equipped.some(entry =>
                        entry.category === category && entry.inventoryId === item.inventoryId
                      );
                      return (
                        <button
                          key={item.inventoryId}
                          type="button"
                          className="player-avatar-page__item"
                          data-testid={`avatar-clothing-${item.inventoryId}`}
                          aria-pressed={activePreviewId === item.inventoryId}
                          aria-label={`${item.name}${worn ? ", equipped" : ""}${item.free ? ", free" : ""}${!eligible ? ", unavailable" : ""}`}
                          title={item.name}
                          disabled={busy || !eligible}
                          onClick={() => setPreviewSelections(current => ({
                            ...current, [category]: item.inventoryId,
                          }))}
                        >
                          <span className="player-avatar-page__item-art">
                            {item.imageUrl ? <img src={item.imageUrl} alt="" draggable={false} loading="lazy" /> :
                              <span aria-hidden="true">✦</span>}
                            {worn && <span className="player-avatar-page__item-worn"><Check size={13} aria-hidden="true" /></span>}
                          </span>
                          <span className="sr-only">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="player-avatar-page__empty" data-testid="avatar-wardrobe-empty">
                    No {PLAYER_CLOTHING_CATEGORY_LABELS[category].toLowerCase()} clothing is available yet.
                  </div>
                )}

                 {avatar.created && !appearanceChanged ? (
                <div className="player-avatar-page__actions">
                  <button type="button" data-testid="avatar-equip-button" disabled={!selected || busy || selected.inventoryId === equippedItem?.inventoryId}
                    onClick={() => selected && saveEquipment(selected.inventoryId)}>
                    {equipment.isPending ? "Saving…" : selected?.inventoryId === equippedItem?.inventoryId ? "Already Equipped" : "Equip Clothing"}
                  </button>
                  <button type="button" data-testid="avatar-unequip-button" className="player-avatar-page__remove"
                    disabled={busy || (!equippedItem && !unavailableEquipped)}
                    onClick={() => saveEquipment(null)}>
                    Remove
                  </button>
                  {selected && <button type="button" className="player-avatar-page__cancel-preview"
                    onClick={() => setPreviewSelections(current => {
                      const next = { ...current };
                      delete next[category];
                      return next;
                    })} disabled={busy}>Cancel Preview</button>}
                </div>
                ) : null}
              </section>
            )}
            {!avatar.created ? (
              <section className="player-avatar-page__create" data-testid="avatar-first-save">
                <button type="button" disabled={!selectedBody || busy}
                  data-testid="avatar-create-button"
                  onClick={() => selectedBody && creation.mutate({ baseId: selectedBody.id, skinTone, accountId: userId })}>
                  {creation.isPending ? "Saving Character…" : "Create My Character"}
                </button>
              </section>
            ) : null}
            {avatarQuery.isError && <p className="player-avatar-page__warning" role="alert">
              Could not refresh your wardrobe. The last confirmed character is still shown.
            </p>}
            </div>
          </>
        ) : null}
      </div>
      {saveConfirmationOpen && (
        <div className="player-avatar-page__saved-overlay"
          data-testid="avatar-save-confirmation-overlay">
          <section role="dialog" aria-modal="true"
            aria-labelledby="avatar-save-confirmation-title"
            data-testid="avatar-save-confirmation"
            className="player-avatar-page__saved-dialog">
            <Sparkles size={35} aria-hidden="true" className="player-avatar-page__saved-sparkle" />
            <h2 id="avatar-save-confirmation-title">Character Saved</h2>
            <p>Your character's appearance has been saved. Tap your character on Home whenever you want to customize it again.</p>
            <button type="button" autoFocus
              data-testid="avatar-save-confirmation-close"
              onClick={() => setSaveConfirmationOpen(false)}>Continue</button>
          </section>
        </div>
      )}
    </main>
  );
}
