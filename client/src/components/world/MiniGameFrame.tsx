import type { ReactNode } from "react";
import { useStageSurroundings } from "@/lib/stageSurroundings";
import ViewportScenePortal from "@/components/ViewportScenePortal";
import volcanicWorld from "@assets/bg_volcanic_map_v4.webp";
import hauntedWorld from "@assets/bg_haunted_woods_v2.webp";
import swampWorld from "@assets/bg_bayous_heart.webp";

const worldBackgrounds: Record<string, string> = {
  volcanic: volcanicWorld,
  haunted_woods: hauntedWorld,
  swamp: swampWorld,
};

/**
 * Shared locked-page wrapper for world mini-games.
 *
 * The game content never owns a second scale transform. The root gameplay
 * renderer is viewport-owned on phones, tablets and desktop; the shared
 * ViewportScenePortal places artwork in that scene without a 390x844 stage.
 * World artwork covers the available scene without stretching coordinates.
 */
export default function MiniGameFrame({ children, worldId, backgroundUrl }: {
  children: ReactNode;
  worldId: string;
  backgroundUrl?: string | null;
}) {
  const artwork = backgroundUrl || worldBackgrounds[worldId];
  useStageSurroundings({ imageUrl: artwork, backgroundPosition: "center", overlayAlpha: 0.32, priority: 20 });

  return (
    <ViewportScenePortal>
      <div
        data-testid="mini-game-frame"
        data-camera-mode="device-viewport"
        className="absolute inset-0 overflow-hidden"
        style={{
          backgroundImage: artwork
            ? `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.6)),url(${artwork})`
            : "linear-gradient(#15101e,#080510)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          overscrollBehavior: "none",
          pointerEvents: "auto",
        }}
      >
        <div
          data-testid="mini-game-locked-page"
          className="absolute inset-0 overflow-hidden"
          style={{
            width: "100%",
            height: "100%",
            background: artwork ? "transparent" : "#09050d",
          }}
        >
          {children}
        </div>
      </div>
    </ViewportScenePortal>
  );
}
