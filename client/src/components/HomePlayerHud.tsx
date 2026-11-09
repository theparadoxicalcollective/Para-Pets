import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { PlayerProgressionResponse } from "@shared/playerProgression";
import { usePlayerPetTeam } from "@/hooks/usePlayerPetTeam";
import { cleanPetTeam, eligiblePetIds, PLAYER_PET_TEAM_MAX } from "@/lib/playerPetTeam";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import cardStarImg from "@assets/uploads/CardStar.png";
import "./HomePlayerHud.css";

export interface HomeHudPet {
  inventoryId: string;
  name: string;
  petNickname: string | null;
  type: string;
  isHatched: boolean;
  isListed?: boolean;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
}

export async function fetchHomePlayerProgression(signal?: AbortSignal): Promise<PlayerProgressionResponse> {
  const response = await fetch("/api/player/progression", { credentials: "include", signal, cache: "no-store" });
  if (!response.ok) throw new Error("Could not load your player level");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" ||
      !("level" in data) || !Number.isSafeInteger(data.level) || Number(data.level) < 1 ||
      !("totalXp" in data) || !Number.isSafeInteger(data.totalXp) || Number(data.totalXp) < 0) {
    // Never unmount Home or its quest/menu controls on a malformed response.
    throw new Error("Player progression response was invalid");
  }
  return data as PlayerProgressionResponse;
}

/**
 * Stage 09: one compact account HUD. Stage 10 will move this under the
 * assembled Home avatar and retire the active-pet nameplate, stars and menu.
 * This component never changes pet progress or invents an XP level curve.
 */
export default function HomePlayerHud({
  userId, username, inventory, inventoryLoading, visible = true,
}: {
  userId: string;
  username: string;
  inventory: readonly HomeHudPet[];
  inventoryLoading: boolean;
  visible?: boolean;
}) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const progression = useQuery<PlayerProgressionResponse>({
    queryKey: ["/api/player/progression", userId],
    queryFn: ({ signal }) => fetchHomePlayerProgression(signal),
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const {
    selectedPetIds, isReady, isLoading, isSaving, saveError, saveTeam,
  } = usePlayerPetTeam(userId);
  const eligibleIds = useMemo(() => eligiblePetIds(inventory), [inventory]);
  const petsById = useMemo(() => new Map(inventory
    .filter(item => item.type === "pet")
    .map(item => [item.inventoryId, item])), [inventory]);
  const petsToChoose = useMemo(() => inventory
    .filter(item => eligibleIds.includes(item.inventoryId)), [inventory, eligibleIds]);

  // A profile change or a navigation opening must never leave a picker over
  // another account's Home or the main navigation.
  useEffect(() => { setPickerSlot(null); }, [userId]);
  useEffect(() => {
    const dismiss = () => setPickerSlot(null);
    window.addEventListener("para-pets:main-nav-open", dismiss);
    return () => window.removeEventListener("para-pets:main-nav-open", dismiss);
  }, []);

  if (!visible) return null;

  const changePet = (inventoryId: string | null) => {
    if (pickerSlot === null || !isReady || isSaving || inventoryLoading) return;
    if (inventoryId && !eligibleIds.includes(inventoryId)) return;
    const current = [...selectedPetIds];
    if (inventoryId && current.some((id, index) => id === inventoryId && index !== pickerSlot)) return;
    if (inventoryId === null) {
      if (pickerSlot >= current.length) return;
      current.splice(pickerSlot, 1);
    } else if (pickerSlot >= current.length) {
      current.push(inventoryId);
    } else {
      current[pickerSlot] = inventoryId;
    }
    // Purge unavailable pets only as part of an explicit player-requested edit;
    // never silently rewrite the persisted PvP/Raid roster on initial load.
    const next = cleanPetTeam(current, eligibleIds);
    if (saveTeam(next)) setPickerSlot(null);
  };

  const player = progression.data;
  return (
    <div className="home-player-hud" data-testid="home-player-hud" data-coordinate-owner="viewport">
      <div className="home-player-hud__stars" data-testid="home-player-empty-stars"
        aria-label="Five unearned player stars" role="img">
        {Array.from({ length: 5 }, (_, i) => (
          <img key={i} src={cardStarImg} alt="" draggable={false}
            style={{ transform: `translateY(${-(1 - Math.pow((i - 2) / 2, 2)) * 6}px)` }} />
        ))}
      </div>
      <div className="home-player-hud__progress" aria-label="Player level and experience">
        <div className="home-player-hud__progress-heading">
          <span data-testid="home-player-name" className="home-player-hud__name" title={username}>{username}</span>
          <span data-testid="home-player-level" className="home-player-hud__level">
            {player ? `LV ${player.level}` : progression.isError ? "Level unavailable" : "LV …"}
          </span>
        </div>
        <div className="home-player-hud__xp-row">
          <div data-testid="home-player-xp-track" className="home-player-hud__xp-track"
            aria-label="XP progress not yet available; level threshold is not defined">
            <span aria-hidden="true" />
          </div>
          <span data-testid="home-player-total-xp" className="home-player-hud__xp-text">
            {player ? `${player.totalXp.toLocaleString()} XP` : progression.isError ? "XP unavailable" : "Loading XP"}
          </span>
        </div>
      </div>

      <div className="home-player-hud__team" aria-label="Your five companion team slots"
        data-testid="home-player-team-slots">
        {Array.from({ length: PLAYER_PET_TEAM_MAX }, (_, index) => {
          const id = selectedPetIds[index];
          const pet = id ? petsById.get(id) : undefined;
          const name = pet?.petNickname || pet?.name || (id ? "Unavailable companion" : `Empty slot ${index + 1}`);
          const image = pet?.hatchedImageUrl || pet?.imageUrl;
          return (
            <button key={index} type="button"
              data-testid={`home-player-team-slot-${index + 1}`}
              className="home-player-hud__slot"
              disabled={!isReady || isSaving || inventoryLoading}
              aria-label={`Team slot ${index + 1}: ${name}. Edit companion`}
              title={name}
              onClick={() => setPickerSlot(index)}>
              {id && pet ? (
                image ? <img src={image} alt="" draggable={false} /> :
                  <img src={petPawIcon} alt="" draggable={false} />
              ) : (
                <span aria-hidden="true">{id ? "!" : "+"}</span>
              )}
              {pet && <span className="home-player-hud__slot-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="home-player-hud__status" role="status">
        {saveError ? <span role="alert">{saveError} Choose a pet to retry.</span> :
          isSaving ? "Saving your team…" :
          isLoading || inventoryLoading ? "Loading your team…" : "Tap a portrait to edit your team"}
      </div>

      {pickerSlot !== null && (
        <ViewportModalPortal>
        <div data-testid="home-player-team-picker" className="home-player-hud__picker"
          role="presentation" onClick={() => setPickerSlot(null)}>
          <section role="dialog" aria-modal="true" aria-label={`Choose companion for slot ${pickerSlot + 1}`}
            className="home-player-hud__picker-sheet" onClick={event => event.stopPropagation()}>
            <div className="home-player-hud__picker-heading">
              <div>
                <h2>Choose a Companion</h2>
                <p>Team slot {pickerSlot + 1} · Shared with PvP and Raids</p>
              </div>
              <button type="button" aria-label="Close team picker" onClick={() => setPickerSlot(null)}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="home-player-hud__picker-list">
              {petsToChoose.length === 0 && (
                <p className="home-player-hud__no-pets">
                  {inventoryLoading ? "Loading your companions…" : "No available hatched pets. Hatch a pet in your inventory first."}
                </p>
              )}
              {petsToChoose.map(pet => {
                const alreadyInOtherSlot = selectedPetIds.some((id, i) =>
                  id === pet.inventoryId && i !== pickerSlot);
                const selected = selectedPetIds[pickerSlot] === pet.inventoryId;
                return (
                  <button key={pet.inventoryId} type="button"
                    data-testid={`home-player-picker-pet-${pet.inventoryId}`}
                    className="home-player-hud__picker-pet"
                    disabled={alreadyInOtherSlot || !isReady || isSaving}
                    onClick={() => changePet(pet.inventoryId)}>
                    <img src={pet.hatchedImageUrl || pet.imageUrl || petPawIcon} alt="" draggable={false} />
                    <span>{pet.petNickname || pet.name}</span>
                    <small>{alreadyInOtherSlot ? "On team" : selected ? "Selected" : "Choose"}</small>
                  </button>
                );
              })}
            </div>
            {pickerSlot < selectedPetIds.length && (
              <button type="button" data-testid="home-player-team-remove"
                className="home-player-hud__remove" disabled={!isReady || isSaving}
                onClick={() => changePet(null)}>Remove from team</button>
            )}
          </section>
        </div>
        </ViewportModalPortal>
      )}
    </div>
  );
}
