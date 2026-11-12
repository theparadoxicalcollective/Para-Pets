import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { totalXpRequiredForPlayerLevel, type PlayerProgressionResponse } from "@shared/playerProgression";
import { usePlayerPetTeam } from "@/hooks/usePlayerPetTeam";
import { cleanPetTeam, eligiblePetIds, PLAYER_PET_TEAM_MAX } from "@/lib/playerPetTeam";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import emptyPetIcon from "@assets/generated_images/nav_icon_pets.png";
import PetAnimator from "@/components/PetAnimator";
import MiniPetRenderer from "@/components/MiniPetRenderer";
import cardStarImg from "@assets/uploads/CardStar.png";
import { coverArtworkPoint, viewportPointToCoverArtwork, type ArtworkPoint, type BackdropRect, type ArtworkSize } from "@/lib/artworkCoverGeometry";
import type { HomeXpAnchor } from "@shared/homeXpAnchor";
import { homeAvatarPosition } from "@/lib/homeAvatarLayout";
import "./HomePlayerHud.css";

export interface HomeHudPet {
  inventoryId: string;
  name: string;
  petNickname: string | null;
  type: string;
  isHatched: boolean;
  rarity?: number | null;
  isListed?: boolean;
  petTemplateId?: string | null;
  isEvolved?: boolean;
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
 * This component never changes pet progress; the server owns the player XP curve.
 */
export default function HomePlayerHud({
  userId, username, inventory, inventoryLoading, inventoryReady, inventoryError, avatarHome = false, avatarLandmark = null, avatarBackdrop, avatarArtworkSize, isAdmin = false, visible = true,
}: {
  userId: string;
  username: string;
  inventory: readonly HomeHudPet[];
  inventoryLoading: boolean;
  /** Only a successful /api/inventory read authorizes roster edits. */
  inventoryReady: boolean;
  inventoryError: boolean;
  /** The Pet Menu has moved into Bag; release its old bottom clearance. */
  avatarHome?: boolean;
  /** Same world-artwork point and backdrop as HomeAvatarStage. */
  avatarLandmark?: ArtworkPoint | null;
  avatarBackdrop?: BackdropRect;
  avatarArtworkSize?: ArtworkSize;
  isAdmin?: boolean;
  visible?: boolean;
}) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const cache = useQueryClient();
  const [movingXp, setMovingXp] = useState(false);
  const [anchorDraft, setAnchorDraft] = useState<HomeXpAnchor | null | undefined>(undefined);
  const [anchorSaving, setAnchorSaving] = useState(false);
  const [anchorError, setAnchorError] = useState<string | null>(null);
  const anchorDrag = useRef<{
    id: number; x: number; y: number; offsetX: number; offsetY: number;
    latest: HomeXpAnchor | null; moved: boolean;
  } | null>(null);
  const anchorQuery = useQuery<{ anchor: HomeXpAnchor | null }>({
    queryKey: ["/api/settings/home-xp-anchor"],
    enabled: avatarHome,
    queryFn: async () => {
      const response = await fetch("/api/settings/home-xp-anchor", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load Home XP layout");
      return response.json();
    },
    staleTime: 60_000,
  });
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
  useEffect(() => {
    setPickerSlot(null);
    setMovingXp(false);
    setAnchorDraft(undefined);
    setAnchorError(null);
    anchorDrag.current = null;
  }, [userId]);
  useEffect(() => { if (!inventoryReady) setPickerSlot(null); }, [inventoryReady]);
  useEffect(() => {
    const dismiss = () => setPickerSlot(null);
    window.addEventListener("para-pets:main-nav-open", dismiss);
    return () => window.removeEventListener("para-pets:main-nav-open", dismiss);
  }, []);

  if (!visible) return null;

  const avatarPosition = avatarHome && avatarBackdrop
    ? homeAvatarPosition(avatarLandmark, avatarBackdrop) : null;
  const effectiveAnchor = anchorDraft === undefined ? anchorQuery.data?.anchor ?? null : anchorDraft;
  // Project a saved admin position from the background's intrinsic image,
  // using the SAME cover geometry as the Home avatar's stone platform.
  const projectedAnchor = effectiveAnchor && avatarBackdrop && avatarArtworkSize
    ? coverArtworkPoint(avatarArtworkSize, avatarBackdrop, {
        x: avatarArtworkSize.width * effectiveAnchor.xPct,
        y: avatarArtworkSize.height * effectiveAnchor.yPct,
      }) : null;
  const artworkScale = avatarBackdrop && avatarArtworkSize?.width && avatarArtworkSize.height
    ? Math.max(avatarBackdrop.width / avatarArtworkSize.width,
      avatarBackdrop.height / avatarArtworkSize.height) : null;
  const avatarLayoutStyle = avatarPosition ? {
    "--home-avatar-x": avatarPosition.x !== null ? `${avatarPosition.x}px` : "50%",
    "--home-avatar-standing-y": avatarPosition.standingY !== null
      ? `${avatarPosition.standingY}px` : "min(68dvh, calc(100dvh - 228px))",
    "--home-xp-art-width": artworkScale ? `${Math.round(560 * artworkScale)}px` : "220px",
    ...(projectedAnchor && avatarBackdrop ? {
      "--home-xp-x": `${projectedAnchor.x - avatarBackdrop.left}px`,
      "--home-xp-y": `${projectedAnchor.y - avatarBackdrop.top}px`,
    } : {}),
  } as CSSProperties : undefined;

  // Admin-only direct manipulation; a tap never writes and non-admin players
  // cannot drag the bar. Releasing a real drag saves one artwork-relative anchor.
  const saveXpAnchor = async (next: HomeXpAnchor | null) => {
    if (!isAdmin || anchorSaving) return;
    setAnchorSaving(true);
    setAnchorError(null);
    try {
      const response = await apiRequest("PUT", "/api/admin/settings/home-xp-anchor", { anchor: next });
      const saved = await response.json() as { anchor: HomeXpAnchor | null };
      cache.setQueryData(["/api/settings/home-xp-anchor"], saved);
      setAnchorDraft(undefined);
    } catch {
      setAnchorDraft(undefined);
      setAnchorError("Position not saved. Try again.");
    } finally {
      setAnchorSaving(false);
    }
  };
  const startXpDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avatarHome || !isAdmin || !movingXp || anchorSaving ||
        !avatarBackdrop || !avatarArtworkSize?.width || !avatarArtworkSize.height ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    anchorDrag.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - (rect.left + rect.width / 2),
      offsetY: event.clientY - rect.top,
      latest: null, moved: false,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  };
  const moveXpDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = anchorDrag.current;
    if (!drag || drag.id !== event.pointerId || !avatarBackdrop || !avatarArtworkSize) return;
    event.preventDefault();
    event.stopPropagation();
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5 && !drag.moved) return;
    const art = viewportPointToCoverArtwork(avatarArtworkSize, avatarBackdrop, {
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    });
    if (!art || !avatarArtworkSize.width || !avatarArtworkSize.height) return;
    const next = {
      xPct: Math.max(0, Math.min(1, art.x / avatarArtworkSize.width)),
      yPct: Math.max(0, Math.min(1, art.y / avatarArtworkSize.height)),
    };
    drag.latest = next;
    drag.moved = true;
    setAnchorDraft(next);
  };
  const finishXpDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = anchorDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    anchorDrag.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    if (cancelled) {
      setAnchorDraft(undefined);
    } else if (drag.moved && drag.latest) {
      void saveXpAnchor(drag.latest);
    }
  };

  const changePet = (inventoryId: string | null) => {
    if (pickerSlot === null || !isReady || isSaving || inventoryLoading || !inventoryReady) return;
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
  const levelStartXp = player ? totalXpRequiredForPlayerLevel(player.level) : 0;
  const levelTargetXp = player?.nextLevelTotalXp ?? null;
  const xpEarnedThisLevel = player ? Math.max(0, (player.cycleXp ?? player.totalXp) - levelStartXp) : 0;
  const xpNeededThisLevel = levelTargetXp === null ? null : Math.max(1, levelTargetXp - levelStartXp);
  const xpFillPct = !player ? null : xpNeededThisLevel === null
    ? 100 : Math.min(100, (xpEarnedThisLevel / xpNeededThisLevel) * 100);
  const xpProgressLabel = !player ? "Player experience unavailable" : xpNeededThisLevel === null
    ? (player.canElevate ? "Level 100 complete; Seer Elevation coming later" : "Five-star Level 100 reached: maximum player progression")
    : `Level ${player.level}: ${xpEarnedThisLevel} of ${xpNeededThisLevel} XP toward Level ${player.level + 1}`;
  return (
    <div className={avatarHome ? "home-player-hud home-player-hud--avatar-home" : "home-player-hud"}
      style={avatarLayoutStyle} data-testid="home-player-hud" data-coordinate-owner="viewport">
      <div className="home-player-hud__stars" data-testid="home-player-empty-stars"
        aria-label={`${player?.stars ?? 1} of 5 player stars earned`} role="img">
        {Array.from({ length: 5 }, (_, i) => (
          <img key={i} src={cardStarImg} alt="" draggable={false}
            className={i < (player?.stars ?? 1) ? "home-player-hud__star--earned" : undefined}
            style={{ transform: `translateY(${-(1 - Math.pow((i - 2) / 2, 2)) * (avatarHome ? 31 : 14)}px) rotate(${(i - 2) * 9}deg)` }} />
        ))}
      </div>
      <div className={`home-player-hud__progress${movingXp ? " home-player-hud__progress--moving" : ""}`}
        aria-label="Player level and experience"
        onPointerDown={startXpDrag}
        onPointerMove={moveXpDrag}
        onPointerUp={event => finishXpDrag(event)}
        onPointerCancel={event => finishXpDrag(event, true)}>
        {avatarHome && isAdmin && (
          <div className="home-player-hud__xp-admin-tools" data-testid="home-xp-admin-tools"
            onPointerDown={event => event.stopPropagation()}>
            <button type="button" data-testid="button-home-adjust-xp"
              aria-pressed={movingXp} disabled={anchorSaving}
              onClick={() => { setMovingXp(!movingXp); setAnchorError(null); }}>
              {movingXp ? "Done" : "Move XP"}
            </button>
            {movingXp && <button type="button" data-testid="button-home-reset-xp"
              disabled={anchorSaving} onClick={() => void saveXpAnchor(null)}>Reset</button>}
            {movingXp && <span>{anchorSaving ? "Saving…" : anchorError ?? "Drag curve to move"}</span>}
          </div>
        )}
        {!avatarHome && (
          <div className="home-player-hud__progress-heading">
            <span data-testid="home-player-name" className="home-player-hud__name" title={username}>{username}</span>
            <span data-testid="home-player-level" className="home-player-hud__level">
              {player ? `LV ${player.level}` : progression.isError ? "Level unavailable" : "LV …"}
            </span>
          </div>
        )}
        <div className="home-player-hud__xp-row">
          <div data-testid="home-player-xp-track"
            className={`home-player-hud__xp-track ${player ? "home-player-hud__xp-track--ready" : ""}`}
            role="progressbar" aria-label={xpProgressLabel}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={xpFillPct === null ? undefined : Math.round(xpFillPct)}
            title={xpProgressLabel}>
            {avatarHome ? (
              <svg className="home-player-hud__xp-arc" viewBox="0 0 320 130"
                preserveAspectRatio="xMidYMin meet" aria-hidden="true">
                <defs>
                  <path id="home-player-level-curve" d="M 102 98 Q 160 118 218 98" />
                </defs>
                {/* Match the platform rim: a deep, faintly glowing groove,
                    with NO earned fill at zero XP. */}
                <path className="home-player-hud__xp-arc-shadow"
                  d="M 10 10 Q 160 154 310 10" />
                <path className="home-player-hud__xp-arc-rim"
                  d="M 10 10 Q 160 154 310 10" />
                <path className="home-player-hud__xp-arc-track"
                  d="M 10 10 Q 160 154 310 10" />
                {xpFillPct !== null && xpFillPct > 0 && (
                  <path className="home-player-hud__xp-arc-fill"
                    data-testid="home-player-xp-fill"
                    d="M 10 10 Q 160 154 310 10"
                    pathLength={100}
                    strokeDasharray="100 100"
                    strokeDashoffset={100 - xpFillPct} />
                )}
                <text data-testid="home-player-total-xp" className="home-player-hud__xp-text"
                  x="37" y="39" textAnchor="middle">
                  {player && xpNeededThisLevel !== null
                    ? `${xpEarnedThisLevel.toLocaleString()}/${xpNeededThisLevel.toLocaleString()}`
                    : player ? `${(player.cycleXp ?? player.totalXp).toLocaleString()} XP`
                    : progression.isError ? "XP unavailable" : "XP…"}
                </text>
                <text data-testid="home-player-level" className="home-player-hud__level-curved"
                  textAnchor="middle">
                  <textPath href="#home-player-level-curve" startOffset="50%">
                    {player ? `Lvl ${player.level}` : progression.isError ? "Level unavailable" : "Lvl …"}
                  </textPath>
                </text>
              </svg>
            ) : <span aria-hidden="true" style={xpFillPct === null ? undefined : { width: `${xpFillPct}%` }} />}
          </div>
          {!avatarHome && <span data-testid="home-player-total-xp" className="home-player-hud__xp-text"
            title={player ? `${player.totalXp.toLocaleString()} lifetime player XP` : undefined}>
            {player ? `${(player.cycleXp ?? player.totalXp).toLocaleString()} XP`
              : progression.isError ? "XP unavailable" : "Loading XP"}
          </span>}
        </div>
      </div>

      <div className="home-player-hud__party-panel">
      <div className="home-player-hud__team" aria-label="Your five companion team slots"
        data-testid="home-player-team-slots">
        {Array.from({ length: PLAYER_PET_TEAM_MAX }, (_, index) => {
          const id = selectedPetIds[index];
          const pet = id ? petsById.get(id) : undefined;
          const name = pet?.petNickname || pet?.name || (id ? "Unavailable companion" : `Empty slot ${index + 1}`);
          const image = pet?.hatchedImageUrl || pet?.imageUrl;
          const rarity = pet && typeof pet.rarity === "number" && Number.isFinite(pet.rarity)
            ? Math.max(0, Math.min(5, Math.trunc(pet.rarity ?? 0))) : 0;
          return (
            <button key={index} type="button"
              data-testid={`home-player-team-slot-${index + 1}`}
              className={`home-player-hud__slot ${pet ? "home-player-hud__slot--occupied" : "home-player-hud__slot--vacant"}`}
              disabled={!isReady || isSaving || inventoryLoading || !inventoryReady}
              aria-label={`Team slot ${index + 1}: ${name}. Edit companion`}
              title={name}
              onClick={() => setPickerSlot(index)}>
              {id && pet ? (
                <span className="home-player-hud__slot-portrait" data-testid={`home-player-team-art-${index + 1}`}>
                  <img className="home-player-hud__fallback-pet"
                    src={image || petPawIcon} alt="" draggable={false} />
                  {pet.petTemplateId && (
                    <span className="home-player-hud__pet-renderer"
                      data-testid={`home-player-team-composite-${index + 1}`}>
                      <PetAnimator petTemplateId={pet.petTemplateId}
                        petInventoryId={pet.inventoryId}
                        artworkForm={pet.isEvolved ? "evolution" : undefined}
                        mode="house" lowMemory size={58}
                        fillContainer view="front" />
                    </span>
                  )}
                  <span className="home-player-hud__mini-companion"
                    data-testid={`home-player-team-mini-${index + 1}`}>
                    <MiniPetRenderer petInventoryId={pet.inventoryId} animated={false} />
                  </span>
                </span>
              ) : (
                <span className="home-player-hud__slot-placeholder" aria-hidden="true">
                  <img src={emptyPetIcon} alt="" draggable={false} />
                  <span className="home-player-hud__slot-empty-label">{id ? "!" : "+"}</span>
                </span>
              )}
              {rarity > 0 && (
                <span className="home-player-hud__slot-stars"
                  aria-hidden="true" data-testid={`home-player-team-stars-${index + 1}`}>
                  {Array.from({ length: rarity }, (_, starIndex) => (
                    <img key={starIndex} src={cardStarImg} alt="" draggable={false}
                      style={{ transform: `translateY(${Math.abs(starIndex - (rarity - 1) / 2) * 3}px) rotate(${(starIndex - (rarity - 1) / 2) * 11}deg)` }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="home-player-hud__status" role="status">
        {inventoryError ? <span role="alert">Pet inventory could not load. Your saved team is safe; reopen Home to retry.</span> :
          saveError ? <span role="alert">{saveError} Choose a pet to retry.</span> :
          isSaving ? "Saving your team…" :
          isLoading || inventoryLoading || !inventoryReady ? "Loading your team…" : avatarHome ? null : "Tap a portrait to edit your team"}
      </div>
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
