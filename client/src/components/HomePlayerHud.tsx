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
import { HOME_XP_DEFAULT_CURVE, HOME_XP_MIN_CURVE, HOME_XP_MAX_CURVE, homeXpArcGeometry, type HomeXpAnchor } from "@shared/homeXpAnchor";
import { homeAvatarPosition } from "@/lib/homeAvatarLayout";
import { homeTeamOffset, homeTeamSwipeStep, homeTeamVisualPosition } from "@/lib/homeTeamCarousel";
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
  const [curveControlsOpen, setCurveControlsOpen] = useState(false);
  const [anchorSaving, setAnchorSaving] = useState(false);
  const [anchorError, setAnchorError] = useState<string | null>(null);
  const [curvePreview, setCurvePreview] = useState<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  // Carousel rotation changes only presentation. Actual team slot IDs are
  // unchanged, so roster editing and PvP/Raid persistence remain intact.
  const [teamOffset, setTeamOffset] = useState(0);
  const teamSwipe = useRef<{ pointerId: number; startX: number; startY: number;
    moved: boolean } | null>(null);
  const suppressTeamClick = useRef(false);
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
    setCurveControlsOpen(false);
    setAnchorError(null);
    setCurvePreview(null);
    setTeamOffset(0);
    teamSwipe.current = null;
    suppressTeamClick.current = false;
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
  // Read the existing saved artwork-relative position as-is. Home never
  // rewrites its x/y coordinates through touch movement again.
  const effectiveAnchor = anchorQuery.data?.anchor ?? null;
  const curveDepth = curvePreview ?? effectiveAnchor?.curveDepth ?? HOME_XP_DEFAULT_CURVE;
  const xpArc = homeXpArcGeometry(curveDepth);
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
      setCurvePreview(null);
    } catch {
      setCurvePreview(null);
      setAnchorError("Curve not saved. Try again.");
    } finally {
      setAnchorSaving(false);
    }
  };
  const saveXpCurve = (depth: number) => {
    if (!isAdmin || !avatarBackdrop || !avatarArtworkSize || anchorSaving) return;
    // A first curve adjustment uses the exact on-screen bar position, then
    // saves it using the same artwork-relative model as Move XP.
    let base = effectiveAnchor;
    if (!base) {
      const rect = progressRef.current?.getBoundingClientRect();
      const point = rect ? viewportPointToCoverArtwork(avatarArtworkSize, avatarBackdrop, {
        x: rect.left + rect.width / 2, y: rect.top,
      }) : null;
      if (!point) return;
      base = {
        xPct: Math.max(0, Math.min(1, point.x / avatarArtworkSize.width)),
        yPct: Math.max(0, Math.min(1, point.y / avatarArtworkSize.height)),
      };
    }
    void saveXpAnchor({ ...base, curveDepth: depth });
  };
  const beginTeamSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avatarHome || pickerSlot !== null || !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
    teamSwipe.current = { pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, moved: false };
  };
  const moveTeamSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = teamSwipe.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && homeTeamSwipeStep(dx, dy) !== 0) {
      drag.moved = true;
      // Capture only once a deliberate horizontal swipe is recognized.
      // Normal taps keep reaching their own edit buttons.
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    }
    if (drag.moved) event.preventDefault();
  };
  const finishTeamSwipe = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = teamSwipe.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    teamSwipe.current = null;
    if (drag.moved) {
      // A synthetic click sometimes follows a touch drag on iOS; do not
      // turn that swipe into an unintended team-slot edit.
      suppressTeamClick.current = true;
      window.setTimeout(() => { suppressTeamClick.current = false; }, 0);
      if (!cancelled) {
        const step = homeTeamSwipeStep(event.clientX - drag.startX,
          event.clientY - drag.startY);
        if (step !== 0) setTeamOffset(previous => homeTeamOffset(previous + step));
      }
      event.stopPropagation();
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
      <div className="home-player-hud__progress"
        aria-label="Player level and experience" ref={progressRef}>
        {avatarHome && isAdmin && (
          <div className="home-player-hud__xp-admin-tools" data-testid="home-xp-admin-tools">
            <button type="button" data-testid="button-home-edit-xp-curve"
              aria-expanded={curveControlsOpen} disabled={anchorSaving}
              onClick={() => { setCurveControlsOpen(open => !open); setAnchorError(null); }}>
              {curveControlsOpen ? "Done" : "XP Curve"}
            </button>
            {curveControlsOpen && <label className="home-player-hud__xp-curve-control" htmlFor="home-xp-curve">
              Curve (flat to deep)
              <input id="home-xp-curve" data-testid="input-home-xp-curve" type="range"
                min={HOME_XP_MIN_CURVE} max={HOME_XP_MAX_CURVE} step={5}
                value={curveDepth} disabled={anchorSaving}
                onChange={event => setCurvePreview(Number(event.currentTarget.value))}
                onPointerUp={event => saveXpCurve(Number(event.currentTarget.value))}
                onKeyUp={event => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key))
                    saveXpCurve(Number(event.currentTarget.value));
                }} />
            </label>}
            {curveControlsOpen && (anchorSaving || anchorError) && <span role="status">{anchorSaving ? "Saving…" : anchorError}</span>}
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
              <svg className="home-player-hud__xp-arc"
                viewBox={`0 0 320 ${xpArc.viewHeight}`}
                preserveAspectRatio="xMidYMin meet" aria-hidden="true">
                <defs><path id="home-player-level-curve" d={xpArc.levelPath} /></defs>
                {/* One rounded groove shared by rim, channel and XP fill. */}
                <path className="home-player-hud__xp-arc-shadow" d={xpArc.path} />
                <path className="home-player-hud__xp-arc-rim" d={xpArc.path} />
                <path className="home-player-hud__xp-arc-track" d={xpArc.path} />
                {xpFillPct !== null && xpFillPct > 0 && (
                  <path className="home-player-hud__xp-arc-fill"
                    data-testid="home-player-xp-fill" d={xpArc.path}
                    pathLength={100} strokeDasharray="100 100"
                    strokeDashoffset={100 - xpFillPct} />
                )}
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
      <div className="home-player-hud__team" aria-label="Your five companion team slots. Swipe left or right to rotate."
        data-testid="home-player-team-slots" tabIndex={avatarHome ? 0 : undefined}
        onPointerDown={beginTeamSwipe} onPointerMove={moveTeamSwipe}
        onPointerUp={event => finishTeamSwipe(event)}
        onPointerCancel={event => finishTeamSwipe(event, true)}
        onLostPointerCapture={event => finishTeamSwipe(event, true)}
        onKeyDown={event => {
          if (!avatarHome || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          setTeamOffset(previous => homeTeamOffset(previous + (event.key === "ArrowLeft" ? -1 : 1)));
        }}>
        {Array.from({ length: PLAYER_PET_TEAM_MAX }, (_, index) => {
          const id = selectedPetIds[index];
          const visualPosition = avatarHome ? homeTeamVisualPosition(index, teamOffset) : index;
          const pet = id ? petsById.get(id) : undefined;
          const name = pet?.petNickname || pet?.name || (id ? "Unavailable companion" : `Empty slot ${index + 1}`);
          const image = pet?.hatchedImageUrl || pet?.imageUrl;
          const rarity = pet && typeof pet.rarity === "number" && Number.isFinite(pet.rarity)
            ? Math.max(0, Math.min(5, Math.trunc(pet.rarity ?? 0))) : 0;
          return (
            <button key={index} type="button"
              data-testid={`home-player-team-slot-${index + 1}`}
              className={`home-player-hud__slot ${pet ? "home-player-hud__slot--occupied" : "home-player-hud__slot--vacant"}${avatarHome ? " home-player-hud__slot--position-" + visualPosition : ""}`}
              data-visual-position={visualPosition}
              disabled={!isReady || isSaving || inventoryLoading || !inventoryReady}
              aria-label={`Team slot ${index + 1}: ${name}. Edit companion`}
              title={name}
              onClick={() => {
                if (suppressTeamClick.current) return;
                setPickerSlot(index);
              }}>
              {id && pet ? (
                <span className="home-player-hud__slot-portrait" data-testid={`home-player-team-art-${index + 1}`}>
                  <img className="home-player-hud__fallback-pet"
                    src={image || petPawIcon} alt="" draggable={false} />
                  {pet.petTemplateId && (
                    <span className="home-player-hud__pet-renderer"
                      data-testid={`home-player-team-composite-${index + 1}`}>
                      {/* Keep small Home pets in the built-in calm House idle:
                          blinking and gentle ear/tail/wing motion, without the
                          full-size body/head translation that makes a deer
                          appear to lurch. Other pages retain regular idle. */}
                      <PetAnimator petTemplateId={pet.petTemplateId}
                        petInventoryId={pet.inventoryId}
                        artworkForm={pet.isEvolved ? "evolution" : undefined}
                        mode="house" lowMemory size={58}
                        fillContainer fitVisible={avatarHome} view="front" />
                    </span>
                  )}
                  <span className="home-player-hud__mini-companion"
                    data-testid={`home-player-team-mini-${index + 1}`}>
                    <MiniPetRenderer petInventoryId={pet.inventoryId} animated />
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
