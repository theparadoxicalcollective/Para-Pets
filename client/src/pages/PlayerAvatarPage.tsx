import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Mars, RefreshCw, Sparkles, Venus } from "lucide-react";
import { PLAYER_CLOTHING_CATEGORIES, PLAYER_CLOTHING_CATEGORY_LABELS, type PlayerClothingCategory } from "@shared/playerCharacterClothing";
import PlayerCharacterRenderer from "@/components/PlayerCharacterRenderer";
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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [bodyChoiceId, setBodyChoiceId] = useState<string | null>(null);
  const avatarQuery = useQuery<PlayerAvatarState>({
    queryKey: avatarKey,
    queryFn: ({ signal }) => fetchPlayerAvatar(signal),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const avatar = avatarQuery.data;

  const creation = useMutation({
    mutationFn: (input: { baseId: string; accountId: string }) =>
      writePlayerAvatar("POST", "/api/player-avatar/create", { baseId: input.baseId }),
    onSuccess: (saved, input) => {
      cacheSavedAvatar(saved, input.accountId);
      if (input.accountId !== userId) return;
      setPreviewId(null);
      setBodyChoiceId(null);
      toast({ title: "Character created", description: "Your character is saved to your account." });
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
      setPreviewId(null);
      toast({ title: "Wardrobe saved", description: "Your character's clothing has been updated." });
    },
    onError: (error: Error & { status?: number }, input) => {
      if (input.accountId === userId) {
        toast({ title: "Wardrobe not saved", description: error.message, variant: "destructive" });
      }
      if (error.status === 409 || error.status === 404 || error.status === 422) {
        // Trust the server over a stale item, base publication or second device.
        if (input.accountId === userId) setPreviewId(null);
        void qc.invalidateQueries({ queryKey: playerAvatarQueryKey(input.accountId) });
      }
    },
  });

  const changeBody = useMutation({
    mutationFn: (input: { baseId: string; expectedRevision: number; accountId: string }) =>
      writePlayerAvatar("PATCH", "/api/player-avatar/base", {
        baseId: input.baseId, expectedRevision: input.expectedRevision,
      }),
    onSuccess: (saved, input) => {
      cacheSavedAvatar(saved, input.accountId);
      if (input.accountId !== userId) return;
      setBodyChoiceId(null);
      setPreviewId(null);
      toast({ title: "Character body updated", description: "Your outfit items remain in your inventory." });
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
  const switchingBody = !!avatar?.created && !!selectedBody && selectedBody.id !== avatar.base?.id;
  const owned = avatar?.ownedClothing.filter(item => item.category === category) ?? [];
  const selected: OwnedAvatarClothing | undefined = owned.find(item =>
    item.inventoryId === previewId && item.compatible && !item.isListed && item.quantity > 0
  );
  const preview = selected ? { category, inventoryId: selected.inventoryId } : null;
  const clothingLayers = avatar && !switchingBody ? wardrobeLayers(avatar, preview) : [];
  const equippedItem = avatar?.equipped.find(item => item.category === category);
  const unavailableEquipped = avatar?.unavailableEquipmentSlots.includes(category) ?? false;

  const saveEquipment = (inventoryId: string | null) => {
    if (!avatar?.created || avatar.revision == null || busy) return;
    equipment.mutate({ category, inventoryId, expectedRevision: avatar.revision, accountId: userId });
  };

  const selectCategory = (next: PlayerClothingCategory) => {
    setCategory(next);
    setPreviewId(null);
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
          <div>
            <h1>Design Your Character</h1>
            <p>Your personal look for Veridia</p>
          </div>
          <button type="button" className="player-avatar-page__refresh"
            aria-label="Refresh wardrobe" disabled={busy || avatarQuery.isFetching}
            onClick={() => void avatarQuery.refetch()}>
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
                  aria-pressed={category === slot}
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

            {availableBodies.length > 0 && (
              <div className="player-avatar-page__body-selector" role="group" aria-label="Choose character body"
                data-testid="avatar-body-selector">
                {(["Fem", "Masc"] as const).map(kind => {
                  const option = availableBodies.find(base => base.name.trim().toLowerCase() === kind.toLowerCase());
                  if (!option) return null;
                  const selected = selectedBody?.id === option.id;
                  const Symbol = kind === "Fem" ? Venus : Mars;
                  return (
                    <button type="button" key={kind} aria-label={`Choose ${kind} body`}
                      data-testid={`avatar-choose-${kind.toLowerCase()}`}
                      aria-pressed={selected} disabled={busy}
                      onClick={() => { setBodyChoiceId(option.id); setPreviewId(null); }}>
                      <Symbol size={23} aria-hidden="true" />
                      <span>{kind}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {switchingBody && avatar.revision !== null && (
              <section className="player-avatar-page__change-body" data-testid="avatar-body-change">
                <p>Changing your body will unequip your outfit. All clothing stays in your inventory.</p>
                <button type="button" data-testid="avatar-save-body-choice" disabled={busy}
                  onClick={() => selectedBody && changeBody.mutate({
                    baseId: selectedBody.id, expectedRevision: avatar.revision!, accountId: userId,
                  })}>
                  {changeBody.isPending ? "Saving Body…" : "Use This Body"}
                </button>
              </section>
            )}
            {!avatar.created ? (
              <section className="player-avatar-page__create" data-testid="avatar-first-save">
                <div className="player-avatar-page__create-title"><Sparkles size={17} aria-hidden="true" /> Start your journey</div>
                <p>Choose the Fem or Masc body you prefer, then save your character to start choosing clothing.</p>
                <button type="button" disabled={!selectedBody || busy}
                  data-testid="avatar-create-button"
                  onClick={() => selectedBody && creation.mutate({ baseId: selectedBody.id, accountId: userId })}>
                  {creation.isPending ? "Saving Character…" : "Create My Character"}
                </button>
              </section>
            ) : (
              <section className="player-avatar-page__wardrobe" aria-label={`${PLAYER_CLOTHING_CATEGORY_LABELS[category]} clothing`}>
                <div className="player-avatar-page__wardrobe-header">
                  <div>
                    <h2>{PLAYER_CLOTHING_CATEGORY_LABELS[category]}</h2>
                    <p>Tap an owned item to preview it before equipping.</p>
                  </div>
                  <span>{owned.length} owned</span>
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
                          aria-pressed={previewId === item.inventoryId}
                          disabled={busy || !eligible}
                          onClick={() => setPreviewId(item.inventoryId)}
                        >
                          <span className="player-avatar-page__item-art">
                            {item.imageUrl ? <img src={item.imageUrl} alt="" draggable={false} loading="lazy" /> :
                              <span aria-hidden="true">✦</span>}
                            {worn && <span className="player-avatar-page__item-worn"><Check size={13} aria-hidden="true" /></span>}
                          </span>
                          <span className="player-avatar-page__item-name">{item.name}</span>
                          <span className="player-avatar-page__item-status">
                            {item.isListed ? "Listed" : !eligible ? "Incompatible" : worn ? "Equipped" :
                              previewId === item.inventoryId ? "Previewing" : "Tap to preview"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="player-avatar-page__empty" data-testid="avatar-wardrobe-empty">
                    You don't own any {PLAYER_CLOTHING_CATEGORY_LABELS[category].toLowerCase()} clothing yet.
                  </div>
                )}

                {selected && <p className="player-avatar-page__preview" role="status">
                  Previewing {selected.name}. Your saved outfit hasn't changed.
                </p>}
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
                    onClick={() => setPreviewId(null)} disabled={busy}>Cancel Preview</button>}
                </div>
              </section>
            )}
            {avatarQuery.isError && <p className="player-avatar-page__warning" role="alert">
              Could not refresh your wardrobe. The last confirmed character is still shown.
            </p>}
          </>
        ) : null}
      </div>
    </main>
  );
}
