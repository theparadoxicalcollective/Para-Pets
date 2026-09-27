import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { calculateMiniGameScale, DESIGN_H, DESIGN_W } from "@/lib/stage";
import volcanicWorld from "@assets/bg_volcanic_map_v4.webp";
import hauntedWorld from "@assets/bg_haunted_woods_v2.webp";
import swampWorld from "@assets/bg_bayous_heart.webp";

const worldBackgrounds: Record<string, string> = {
  volcanic: volcanicWorld,
  haunted_woods: hauntedWorld,
  swamp: swampWorld,
};

/** Keep a mini game at the admin's iPhone 12 coordinates, including on short phones. */
export default function MiniGameFrame({ children, worldId, backgroundUrl }: {
  children: ReactNode;
  worldId: string;
  backgroundUrl?: string | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => setScale(calculateMiniGameScale(frame.clientWidth, frame.clientHeight));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const artwork = backgroundUrl || worldBackgrounds[worldId];
  return (
    <div
      ref={frameRef}
      data-testid="mini-game-frame"
      className="absolute inset-0 overflow-hidden"
      style={{ backgroundImage: artwork ? `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.6)),url(${artwork})` : "linear-gradient(#15101e,#080510)", backgroundSize: "cover", backgroundPosition: "center", overscrollBehavior: "none" }}
    >
      <div
        data-testid="mini-game-locked-page"
        className="absolute overflow-hidden"
        style={{ width: DESIGN_W, height: DESIGN_H, left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center", background: "#09050d" }}
      >
        {children}
      </div>
    </div>
  );
}
