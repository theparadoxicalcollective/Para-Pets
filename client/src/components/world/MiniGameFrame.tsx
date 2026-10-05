import type { ReactNode } from "react";
import volcanicWorld from "@assets/bg_volcanic_map_v4.webp";
import hauntedWorld from "@assets/bg_haunted_woods_v2.webp";
import swampWorld from "@assets/bg_bayous_heart.webp";

const worldBackgrounds: Record<string, string> = {
  volcanic: volcanicWorld,
  haunted_woods: hauntedWorld,
  swamp: swampWorld,
};

/**
 * Mini-game pages now inherit the authoritative gameplay stage.
 *
 * Before the portrait-stage work this component independently measured its own
 * frame and scaled another 390×844 page inside it. Once the outer game stage is
 * already the 390×844 logical composition, doing that again can double-scale
 * controls on portrait phones/tablets. Keep the world artwork as the fill
 * around the mini-game, but let the page itself occupy the stage exactly once.
 */
export default function MiniGameFrame({ children, worldId, backgroundUrl }: {
  children: ReactNode;
  worldId: string;
  backgroundUrl?: string | null;
}) {
  const artwork = backgroundUrl || worldBackgrounds[worldId];

  return (
    <div
      data-testid="mini-game-frame"
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundImage: artwork
          ? `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.6)),url(${artwork})`
          : "linear-gradient(#15101e,#080510)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        overscrollBehavior: "none",
      }}
    >
      <div
        data-testid="mini-game-locked-page"
        className="absolute inset-0 overflow-hidden"
        style={{
          width: "100%",
          height: "100%",
          background: "#09050d",
        }}
      >
        {children}
      </div>
    </div>
  );
}
