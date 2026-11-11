import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw } from "lucide-react";
import PlayerCharacterRenderer from "@/components/PlayerCharacterRenderer";
import {
  playerAvatarQueryKey,
  fetchPlayerAvatar,
  wardrobeLayers,
  type PlayerAvatarState,
} from "@/lib/playerAvatarWardrobe";
import type { ArtworkPoint, BackdropRect } from "@/lib/artworkCoverGeometry";
import { homeAvatarPosition } from "@/lib/homeAvatarLayout";
import "./HomeAvatarStage.css";

/**
 * 10/12: the account-owned character replaces the PET scene on Home.
 * This uses the same saved eight-part rig and seven equipment layers as 08C.
 * "created:false" is the only state that displays Design Character; a
 * published admin base never auto-creates an account-owned character.
 */
export default function HomeAvatarStage({
  userId, landmark, backdrop, visible, onOpen,
}: {
  userId: string;
  landmark: ArtworkPoint | null;
  backdrop: BackdropRect;
  visible: boolean;
  onOpen: () => void;
}) {
  const avatar = useQuery<PlayerAvatarState>({
    queryKey: playerAvatarQueryKey(userId),
    queryFn: ({ signal }) => fetchPlayerAvatar(signal),
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  if (!visible) return null;

  // Project the actual forest platform landmark into the device viewport.
  // On short phones reserve space for the account HUD and bottom main nav.
  // If the artwork hasn't loaded, the CSS fallback uses the same live viewport.
  const { x, standingY } = homeAvatarPosition(landmark, backdrop);

  const created = avatar.data?.created === true;
  const base = avatar.data?.base;
  const completeSavedCharacter = created && !!base && base.parts.length === 8;
  const layers = completeSavedCharacter && avatar.data ? wardrobeLayers(avatar.data) : [];

  return (
    <section
      className="home-avatar-stage"
      data-testid="home-avatar-stage"
      data-coordinate-owner="viewport"
      aria-label="Your player character"
      style={{
        left: x !== null ? `${x}px` : "50%",
        top: standingY !== null ? `${standingY}px` : undefined,
      }}
    >
      {avatar.isPending ? (
        <div className="home-avatar-stage__loading" role="status" data-testid="home-avatar-loading">
          Loading your character…
        </div>
      ) : avatar.isError ? (
        <div className="home-avatar-stage__error" role="alert" data-testid="home-avatar-error">
          <span>Character unavailable</span>
          <button type="button" onClick={() => void avatar.refetch()}>
            <RefreshCw aria-hidden="true" size={17} /> Try again
          </button>
        </div>
      ) : !created ? (
        <button type="button" className="home-avatar-stage__create"
          aria-label="Design Character — open character designer"
          data-testid="home-design-character"
          onClick={onOpen}>
          <span className="home-avatar-stage__gold-ring" aria-hidden="true" />
          <span className="home-avatar-stage__gold-ring home-avatar-stage__gold-ring--inner" aria-hidden="true" />
          <span className="home-avatar-stage__create-center">
            <Sparkles aria-hidden="true" size={24} />
            <strong>Design</strong>
            <strong>Character</strong>
          </span>
        </button>
      ) : completeSavedCharacter && base ? (
        <button type="button"
          className="home-avatar-stage__character"
          aria-label="Customize your character's body, skin tone and clothing"
          data-testid="home-avatar-character"
          onClick={onOpen}>
          <PlayerCharacterRenderer
            parts={base.parts}
            skinTone={avatar.data?.skinTone ?? null}
            topTucked={avatar.data?.topTucked ?? false}
            clothingLayers={layers}
            motion="idle"
            ariaLabel="Your saved player character wearing equipped clothing"
          />
        </button>
      ) : (
        <div className="home-avatar-stage__error" role="alert" data-testid="home-avatar-invalid-base">
          <span>Your saved character cannot be displayed.</span>
          <button type="button" onClick={onOpen}>Open Character Designer</button>
        </div>
      )}
    </section>
  );
}
