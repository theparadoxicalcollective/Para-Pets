import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, RefreshCw, Sparkles } from "lucide-react";
import { PLAYER_CLOTHING_CATEGORIES, PLAYER_CLOTHING_CATEGORY_LABELS, clothingSegmentsForBody, playerClothingCanRecolor, type PlayerClothingCategory } from "@shared/playerCharacterClothing";
import PlayerCharacterRenderer from "@/components/PlayerCharacterRenderer";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import { PLAYER_SKIN_TONE_SWATCHES } from "@shared/playerSkinTone";
import { requiredAvatarCreationCategoriesForBody, type AvatarCreationOutfit,
  type AvatarCharacterOutfit } from "@shared/playerAvatarEquipment";
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

type OutfitPreview = Partial<Record<PlayerClothingCategory, string | null>>;

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
  // One compact swatch opens the color choices for the currently selected
  // garment; changing category/item never leaves a stale palette behind.
  const [clothingPickerOpen, setClothingPickerOpen] = useState(false);
  // Show the finished character celebration only for the account whose save
  // was confirmed by the server; never show it on a failed/stale mutation.
  const [savedCelebration, setSavedCelebration] = useState<{ accountId: string } | null>(null);
  const celebratingSave = savedCelebration?.accountId === userId;
  useEffect(() => {
    if (!celebratingSave) return;
    // Players can tap Continue immediately; otherwise return automatically.
    // Cleanup also prevents a late redirect after logout/account switch.
    const timeout = window.setTimeout(() => navigate(fromHome ? "/" : "/bag"), 2800);
    return () => window.clearTimeout(timeout);
  }, [celebratingSave, fromHome, navigate]);
  // Each tap remounts one short, CSS-only burst. No timers, audio or costly
  // particle loop; the animation disappears completely for reduced motion.
  const [sparkle, setSparkle] = useState({ token: 0, kind: "choice" as "choice" | "save" });
  const showSparkle = (kind: "choice" | "save" = "choice") =>
    setSparkle(current => ({ token: current.token + 1, kind }));
  // Draft clothing never crosses authentication boundaries. Null means the
  // player removed a garment locally; undefined means use the saved garment.
  const [previewState, setPreviewState] = useState<{
    accountId: string; selections: OutfitPreview;
  }>({ accountId: userId, selections: {} });
  const previewSelections = previewState.accountId === userId ? previewState.selections : {};
  const setPreviewSelections = (
    updater: OutfitPreview | ((current: OutfitPreview) => OutfitPreview),
  ) => setPreviewState(current => ({
    accountId: userId,
    selections: typeof updater === "function"
      ? updater(current.accountId === userId ? current.selections : {})
      : updater,
  }));
  // Unsaved color previews belong only to the current authenticated account.
  const [colorPreview, setColorPreview] = useState<{
    accountId: string; values: Record<string, string | null>;
  } | null>(null);
  const colorOverrides: Record<string, string | null> = colorPreview?.accountId === userId ? colorPreview.values : {};
  const setPreviewTint = (inventoryId: string, tint: string | null) =>
    setColorPreview(current => ({
      accountId: userId,
      values: { ...(current?.accountId === userId ? current.values : {}), [inventoryId]: tint },
    }));
  // Body/skin/reset draft changes are also account-scoped: if the signed-in
  // user changes, no prior account's unsaved look can flash or be saved.
  const [resetDraft, setResetDraft] = useState({ accountId: userId, pending: false });
  const resetPending = resetDraft.accountId === userId && resetDraft.pending;
  const setResetPending = (pending: boolean) => setResetDraft({ accountId: userId, pending });
  const [bodyDraft, setBodyDraft] = useState<{ accountId: string; id: string | null }>({
    accountId: userId, id: null,
  });
  const bodyChoiceId = bodyDraft.accountId === userId ? bodyDraft.id : null;
  const setBodyChoiceId = (id: string | null) => setBodyDraft({ accountId: userId, id });
  // undefined = untouched, null = original art, hex = skin selection.
  const [skinDraft, setSkinDraft] = useState<{
    accountId: string; color: string | null | undefined;
  }>({ accountId: userId, color: undefined });
  const skinChoice = skinDraft.accountId === userId ? skinDraft.color : undefined;
  const setSkinChoice = (color: string | null | undefined) =>
    setSkinDraft({ accountId: userId, color });
  // Account-scoped local choice makes the render order change immediately.
  // A successful save returns to the server-confirmed profile value.
  const [tuckChoice, setTuckChoice] = useState<{ accountId: string; value: boolean } | null>(null);
  const avatarQuery = useQuery<PlayerAvatarState>({
    queryKey: avatarKey,
    queryFn: ({ signal }) => fetchPlayerAvatar(signal),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const avatar = avatarQuery.data;

  const creation = useMutation({
    mutationFn: (input: { baseId: string; skinTone: string | null; topTucked: boolean;
      outfit: AvatarCreationOutfit; accountId: string }) =>
      writePlayerAvatar("POST", "/api/player-avatar/create", {
        baseId: input.baseId, skinTone: input.skinTone, topTucked: input.topTucked,
        outfit: input.outfit,
      }),
    onSuccess: (saved, input) => {
      cacheSavedAvatar(saved, input.accountId);
      if (input.accountId !== userId) return;
      setPreviewSelections({});
      setColorPreview(null);
      setResetPending(false);
      setTuckChoice(null);
      setBodyChoiceId(null);
      setSkinChoice(undefined);
      setWardrobeOpen(false);
      setSkinPickerOpen(false);
      // Let the player see their saved look celebrated before leaving.
      // No extra confirmation or wardrobe write is required.
      setSavedCelebration({ accountId: input.accountId });
    },
    onError: (error: Error, input) => {
      if (input.accountId === userId) {
        toast({ title: "Could not create character", description: error.message, variant: "destructive" });
      }
      void qc.invalidateQueries({ queryKey: playerAvatarQueryKey(input.accountId) });
    },
  });

  // No body, clothing, hair or tuck mutation runs while browsing. The entire
  // preview is validated and committed once by Save Character.
  const saveCharacter = useMutation({
    mutationFn: (input: {
      baseId: string; skinTone: string | null; topTucked: boolean;
      outfit: AvatarCharacterOutfit; expectedRevision: number; accountId: string;
    }) => writePlayerAvatar("PUT", "/api/player-avatar/character", {
      baseId: input.baseId, skinTone: input.skinTone,
      topTucked: input.topTucked, outfit: input.outfit,
      expectedRevision: input.expectedRevision,
    }),
    onSuccess: (saved, input) => {
      cacheSavedAvatar(saved, input.accountId);
      if (input.accountId !== userId) return;
      setPreviewSelections({});
      setColorPreview(null);
      setResetPending(false);
      setTuckChoice(null);
      setBodyChoiceId(null);
      setSkinChoice(undefined);
      setSkinPickerOpen(false);
      setWardrobeOpen(false);
      setSavedCelebration({ accountId: input.accountId });
    },
    onError: (error: Error, input) => {
      if (input.accountId === userId)
        toast({ title: "Character not saved", description: error.message,
          variant: "destructive" });
      void qc.invalidateQueries({ queryKey: playerAvatarQueryKey(input.accountId) });
    },
  });
  const busy = creation.isPending || saveCharacter.isPending;
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
  const topTucked = tuckChoice?.accountId === userId
    ? tuckChoice.value : avatar?.topTucked ?? false;
  const canWearOnBody = (item: OwnedAvatarClothing): boolean => {
    if (item.isListed || item.quantity <= 0 || !selectedBody) return false;
    if (item.universal) return true;
    if (!switchingBody) return item.compatible;
    return item.designBaseId === selectedBody.id &&
      new Date(item.designBasePublishedAt ?? 0).getTime() ===
        new Date(selectedBody.publishedAt).getTime();
  };
  const owned = avatar?.ownedClothing.filter(item => item.category === category) ?? [];
  // Reopening a wardrobe shows the saved item as selected. The user does not
  // need to select it a second time just to adjust its color.
  const activePreviewId = previewSelections[category] !== undefined
    ? previewSelections[category]
    : avatar?.created && !resetPending
      ? avatar.equipped.find(item => item.category === category)?.inventoryId ?? null
      : null;
  const selected: OwnedAvatarClothing | undefined = owned.find(item =>
    item.inventoryId === activePreviewId && canWearOnBody(item)
  );
  const previews = PLAYER_CLOTHING_CATEGORIES.flatMap(slot => {
    const inventoryId = previewSelections[slot];
    return inventoryId ? [{ category: slot, inventoryId }] : [];
  });
  // During initial creation every visible preview is saved together. Filter
  // stale/listed choices before enabling the first-save action.
  const firstOutfit = PLAYER_CLOTHING_CATEGORIES.reduce((choices, slot) => {
    const inventoryId = previewSelections[slot];
    const garment = avatar?.ownedClothing.find(item =>
      item.category === slot && item.inventoryId === inventoryId &&
      canWearOnBody(item));
    if (garment) choices[slot] = {
      inventoryId: garment.inventoryId,
      ...(playerClothingCanRecolor(garment.category, garment.colorPickerEnabled) &&
        Object.prototype.hasOwnProperty.call(colorOverrides, garment.inventoryId)
          ? { colorTint: colorOverrides[garment.inventoryId] } : {}),
    };
    return choices;
  }, {} as Partial<AvatarCreationOutfit>);
  const requiredFirstOutfit = requiredAvatarCreationCategoriesForBody(selectedBody?.name);
  const missingFirstOutfit = requiredFirstOutfit.filter(slot => !firstOutfit[slot]);
  // Full draft for one atomic edit save. Existing selections survive body
  // changes only when they still fit that body; nothing is committed yet.
  const draftOutfit = PLAYER_CLOTHING_CATEGORIES.reduce((choices, slot) => {
    const pending = previewSelections[slot];
    const saved = !resetPending ? avatar?.equipped.find(item => item.category === slot) : undefined;
    const inventoryId = pending === undefined ? saved?.inventoryId : pending;
    const item = avatar?.ownedClothing.find(owned =>
      owned.category === slot && owned.inventoryId === inventoryId && canWearOnBody(owned));
    const tint = item && playerClothingCanRecolor(slot, item.colorPickerEnabled)
      ? Object.prototype.hasOwnProperty.call(colorOverrides, item.inventoryId)
        ? colorOverrides[item.inventoryId]
        : saved?.inventoryId === item.inventoryId ? saved.colorTint ?? null : null
      : null;
    choices[slot] = item ? { inventoryId: item.inventoryId, colorTint: tint } : null;
    return choices;
  }, {} as AvatarCharacterOutfit);
  const clothingLayers = avatar
    ? wardrobeLayers(
      avatar, previews, resetPending, selectedBody?.name, canWearOnBody,
    ).filter(layer =>
      previewSelections[layer.category] !== null &&
      (avatar.ownedClothing.some(item =>
        item.inventoryId === layer.inventoryId && canWearOnBody(item)))
    ).map(layer => {
      const item = avatar.ownedClothing.find(entry => entry.inventoryId === layer.inventoryId);
      return item && playerClothingCanRecolor(item.category, item.colorPickerEnabled) &&
        Object.prototype.hasOwnProperty.call(colorOverrides, layer.inventoryId)
        ? { ...layer, colorTint: colorOverrides[layer.inventoryId] } : layer;
    })
    : [];
  const equippedItem = resetPending ? undefined : avatar?.equipped.find(item => item.category === category);
  const selectedTint = selected
    ? (Object.prototype.hasOwnProperty.call(colorOverrides, selected.inventoryId)
      ? colorOverrides[selected.inventoryId]
      : equippedItem?.inventoryId === selected.inventoryId ? equippedItem.colorTint ?? null : null)
    : null;
  const unavailableEquipped = !resetPending &&
    (avatar?.unavailableEquipmentSlots.includes(category) ?? false);
  const chooseClothing = (item: OwnedAvatarClothing) => {
    if (busy || !canWearOnBody(item)) return;
    setClothingPickerOpen(false);
    setPreviewSelections(current => {
      // Undefined means "unchanged saved garment"; tapping that garment
      // again must also unequip it. Keep the entire choice local until Save.
      const activeId = current[category] !== undefined ? current[category] :
        avatar?.created && !resetPending
          ? avatar.equipped.find(entry => entry.category === category)?.inventoryId ?? null
          : null;
      return { ...current, [category]: activeId === item.inventoryId ? null : item.inventoryId };
    });
    showSparkle();
  };
  const toggleTuck = (checked: boolean) => {
    if (busy) return;
    setTuckChoice({ accountId: userId, value: checked });
    showSparkle();
  };
  const selectCategory = (next: PlayerClothingCategory) => {
    setWardrobeOpen(open => next === category ? !open : true);
    setCategory(next);
    setSkinPickerOpen(false);
    setClothingPickerOpen(false);
    showSparkle();
  };
  const toggleSkinPicker = () => {
    setSkinPickerOpen(open => !open);
    setWardrobeOpen(false);
    setClothingPickerOpen(false);
    showSparkle();
  };
  const resetCharacter = () => {
    if (busy) return;
    setPreviewSelections(Object.fromEntries(
      PLAYER_CLOTHING_CATEGORIES.map(slot => [slot, null]),
    ) as OutfitPreview);
    setColorPreview(null);
    setSkinChoice(null);
    setTuckChoice({ accountId: userId, value: false });
    setWardrobeOpen(false);
    setSkinPickerOpen(false);
    setClothingPickerOpen(false);
    setResetPending(!!avatar?.created);
    showSparkle();
    // Preserve the chosen Fem/Masc base while resetting all appearance parts.
  };

  return (
    <main className="player-avatar-page" data-testid="player-avatar-page" data-coordinate-owner="viewport">
      <div className="player-avatar-page__backdrop" aria-hidden="true" />
      <div className={`player-avatar-page__content ${avatar ? "player-avatar-page__content--editor" : ""}`}>
        <header className="player-avatar-page__header">
          <button type="button" className="player-avatar-page__back" aria-label={fromHome ? "Back to Home" : "Back to Bag"}
            onClick={() => navigate(fromHome ? "/" : "/bag")}>
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
          <span aria-hidden="true" />
          <button type="button" className="player-avatar-page__refresh"
            aria-label="Reset character to empty base"
            title="Preview empty character, then Save Character"
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
            <div className={`player-avatar-page__editor-layout ${wardrobeOpen || skinPickerOpen || avatarQuery.isError ? "player-avatar-page__editor-layout--panel-open" : ""}`}
              data-testid="avatar-editor-layout">
            <div className="player-avatar-page__editor-stage" data-testid="avatar-editor-stage">
            <div className="player-avatar-page__showcase" aria-label="Character viewer and wardrobe categories">
              <div className="player-avatar-page__halo" aria-hidden="true" />
              {sparkle.token > 0 && (
                <div key={sparkle.token}
                  className={`player-avatar-page__sparkle-burst player-avatar-page__sparkle-burst--${sparkle.kind}`}
                  data-testid="avatar-sparkle-burst" aria-hidden="true">
                  {Array.from({ length: 7 }, (_, index) => <span key={index} />)}
                </div>
              )}
              <div className="player-avatar-page__viewer" data-testid="avatar-character-viewer">
                {selectedBody ? (
                  <PlayerCharacterRenderer
                    parts={selectedBody.parts}
                    skinTone={skinTone}
                    topTucked={topTucked}
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
                  {(avatar.created ? draftOutfit[slot] : firstOutfit[slot]) &&
                    <span className="player-avatar-page__equipped-dot" aria-hidden="true" />}
                  {!avatar.created && requiredFirstOutfit.some(required => required === slot) &&
                    !firstOutfit[slot] && <span className="player-avatar-page__required-dot" aria-hidden="true">!</span>}
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
                      onClick={() => { setBodyChoiceId(option.id); showSparkle(); }}>
                      <span aria-hidden="true" className="player-avatar-page__body-symbol">{kind === "Fem" ? "♀" : "♂"}</span>
                      <span>{kind}</span>
                    </button>
                  );
                })}
                </div>
                )}
              </div>
            )}
            <div className="player-avatar-page__body-divider" aria-hidden="true" />
            </div>
             <div className="player-avatar-page__details" data-testid="avatar-scrollable-details">
            {skinPickerOpen && (
            <section className="player-avatar-page__skin-picker" role="group"
              id="avatar-skin-tone-picker"
              aria-label="Choose skin color" data-testid="avatar-skin-tone-picker">
              <h2>Skin Color</h2>
              <div className="player-avatar-page__skin-swatches">
                {PLAYER_SKIN_TONE_SWATCHES.map(swatch => (
                  <button type="button" key={swatch.value} disabled={busy}
                    aria-label={swatch.label + " skin color"}
                    data-testid={"avatar-skin-" + swatch.label.toLowerCase()}
                    aria-pressed={skinTone === swatch.value}
                    style={{ backgroundColor: swatch.value }}
                    onClick={() => { setSkinChoice(swatch.value); showSparkle(); }} />
                ))}
                <label className="player-avatar-page__custom-skin">
                  Custom
                  <input type="color" value={skinTone ?? "#d39a71"} disabled={busy}
                    aria-label="Custom skin color" data-testid="avatar-custom-skin"
                    onChange={event => setSkinChoice(event.target.value)}
                    onPointerUp={() => showSparkle()} />
                </label>
              </div>
            </section>
            )}
            {wardrobeOpen && (
              <section className="player-avatar-page__wardrobe" id="player-avatar-clothing-panel"
                data-testid="avatar-clothing-category-panel"
                aria-label={`${PLAYER_CLOTHING_CATEGORY_LABELS[category]} clothing`}>
                <div className="player-avatar-page__wardrobe-header">
                  <div className="player-avatar-page__wardrobe-tools">
                    {category === "top" && (
                      <label className="player-avatar-page__tuck-toggle">
                        <input type="checkbox" checked={topTucked}
                          data-testid="avatar-top-tuck"
                          disabled={busy} onChange={event => toggleTuck(event.target.checked)} />
                        <span className="player-avatar-page__tuck-check" aria-hidden="true">
                          {topTucked && <Check size={15} strokeWidth={3.2} />}
                        </span>
                        <span>Tuck</span>
                      </label>
                    )}
                    {selected && playerClothingCanRecolor(selected.category, selected.colorPickerEnabled) && (
                      <button type="button" className="player-avatar-page__clothing-color-toggle"
                        data-testid="avatar-clothing-color-toggle"
                        aria-label={`Choose color for ${selected.name}`}
                        aria-expanded={clothingPickerOpen}
                        aria-controls="avatar-clothing-color-popup"
                        disabled={busy}
                        onClick={() => setClothingPickerOpen(open => !open)}>
                        <span aria-hidden="true" className="player-avatar-page__clothing-color-square"
                          style={selectedTint ? { backgroundColor: selectedTint } : undefined} />
                      </button>
                    )}
                  </div>
                  <h2>{PLAYER_CLOTHING_CATEGORY_LABELS[category]}</h2>
                  <button type="button" className="player-avatar-page__wardrobe-close"
                    aria-label={`Close ${PLAYER_CLOTHING_CATEGORY_LABELS[category]} clothing`}
                    data-testid="avatar-close-clothing-category"
                    onClick={() => { setWardrobeOpen(false); setClothingPickerOpen(false); }}>×</button>
                  {clothingPickerOpen && selected &&
                    playerClothingCanRecolor(selected.category, selected.colorPickerEnabled) && (
                    <div className="player-avatar-page__clothing-color-popup" role="group"
                      id="avatar-clothing-color-popup"
                      data-testid="avatar-clothing-color-controls"
                      aria-label={`Change color of ${selected.name}`}
                      onKeyDown={event => {
                        if (event.key === "Escape") setClothingPickerOpen(false);
                      }}>
                      <label htmlFor="avatar-clothing-color" className="player-avatar-page__color-popup-choice">
                        <span className="sr-only">
                          {selected.category === "hair" ? "Hair Color" : "Clothing Color"}
                        </span>
                        <input id="avatar-clothing-color" type="color"
                          aria-label={selected.category === "hair" ? "Hair Color" : "Clothing Color"}
                          data-testid="avatar-clothing-custom-color"
                          value={selectedTint ?? "#d39a71"} disabled={busy}
                          onChange={event => setPreviewTint(selected.inventoryId, event.target.value)}
                          onPointerUp={() => showSparkle()} />
                      </label>
                      <button type="button" disabled={busy || selectedTint === null}
                        data-testid="avatar-clothing-reset-color"
                        onClick={() => { setPreviewTint(selected.inventoryId, null); showSparkle(); }}>
                        Original Color
                      </button>
                    </div>
                  )}
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
                      const eligible = canWearOnBody(item);
                      const bodyArtwork = clothingSegmentsForBody(
                        item.segments, item.bodyVariants, selectedBody?.name);
                      // Prefer the item's main catalog artwork, including older saved items.
                      // Part artwork is only a fallback for legacy items without a main image.
                      const wardrobeThumbnail = item.imageUrl || bodyArtwork[0]?.imageUrl;
                      const worn = (avatar.created ? draftOutfit[category] : firstOutfit[category])
                        ?.inventoryId === item.inventoryId;
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
                          onClick={() => chooseClothing(item)}
                        >
                          <span className="player-avatar-page__item-art">
                            {wardrobeThumbnail ? <img src={wardrobeThumbnail} alt="" draggable={false} loading="lazy" /> :
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
                 {avatar.created && (
                  <div className="player-avatar-page__actions">
                    <button type="button" data-testid="avatar-unequip-button"
                      className="player-avatar-page__remove"
                      disabled={busy || (!draftOutfit[category] && !unavailableEquipped)}
                      onClick={() => {
                        setPreviewSelections(current => ({
                          ...current, [category]: null,
                        }));
                        showSparkle();
                      }}>
                      Remove
                    </button>
                  </div>
                 )}
              </section>
            )}
            {avatarQuery.isError && <p className="player-avatar-page__warning" role="alert">
              Could not refresh your wardrobe. The last confirmed character is still shown.
            </p>}
            </div>
            </div>
            <footer className="player-avatar-page__save-footer"
              data-testid={avatar.created ? "avatar-edit-footer" : "avatar-first-save"}>
              {!avatar.created && (
                <p className="player-avatar-page__required-hint" role="status"
                  data-testid="avatar-required-clothing-status">
                  {missingFirstOutfit.length
                    ? `Choose ${missingFirstOutfit.map(slot => PLAYER_CLOTHING_CATEGORY_LABELS[slot]).join(", ")} before saving.`
                    : `${requiredFirstOutfit.map(slot => PLAYER_CLOTHING_CATEGORY_LABELS[slot]).join(", ")} selected. All other clothing is optional.`}
                </p>
              )}
              <button type="button"
                data-testid={avatar.created ? "avatar-save-character-button" : "avatar-create-button"}
                disabled={!selectedBody || busy || (!avatar.created && missingFirstOutfit.length > 0)}
                onClick={() => {
                  if (!selectedBody) return;
                  if (avatar.created && avatar.revision !== null) {
                    saveCharacter.mutate({
                      baseId: selectedBody.id, skinTone, topTucked,
                      expectedRevision: avatar.revision, outfit: draftOutfit,
                      accountId: userId,
                    });
                  } else if (missingFirstOutfit.length === 0) {
                    creation.mutate({
                      baseId: selectedBody.id, skinTone, topTucked,
                      outfit: firstOutfit as AvatarCreationOutfit, accountId: userId,
                    });
                  }
                }}>
                {busy ? "Saving Character…" : "Save Character"}
              </button>
            </footer>
          </>
        ) : null}
      </div>
      {celebratingSave && (
        <ViewportModalPortal>
          <div className="player-avatar-page__saved-overlay"
            data-testid="avatar-save-celebration-overlay">
            <section className="player-avatar-page__saved-celebration"
              role="dialog" aria-modal="true"
              aria-labelledby="avatar-saved-title"
              aria-describedby="avatar-saved-description"
              data-testid="avatar-save-celebration">
              <span className="player-avatar-page__saved-star player-avatar-page__saved-star--left" aria-hidden="true">✦</span>
              <span className="player-avatar-page__saved-star player-avatar-page__saved-star--right" aria-hidden="true">✦</span>
              <div className="player-avatar-page__saved-emblem" aria-hidden="true">
                <Sparkles size={23} className="player-avatar-page__saved-emblem-sparkle" />
                <Check size={42} strokeWidth={2.5} />
              </div>
              <h2 id="avatar-saved-title">Character Saved!</h2>
              <p id="avatar-saved-description">Your new look is ready for the realm.</p>
              <button type="button" autoFocus
                data-testid="avatar-save-celebration-continue"
                onClick={() => navigate(fromHome ? "/" : "/bag")}>Continue</button>
              <div className="player-avatar-page__saved-timer" aria-hidden="true"><span /></div>
            </section>
          </div>
        </ViewportModalPortal>
      )}
    </main>
  );
}
