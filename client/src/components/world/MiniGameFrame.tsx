import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { calculateMiniGamePage, DESIGN_H, DESIGN_W } from "@/lib/stage";
import volcanicWorld from "@assets/bg_volcanic_map_v4.webp";
import hauntedWorld from "@assets/bg_haunted_woods_v2.webp";
import swampWorld from "@assets/bg_bayous_heart.webp";

const worldBackgrounds: Record<string, string> = {
  volcanic: volcanicWorld,
  haunted_woods: hauntedWorld,
  swamp: swampWorld,
};

/** Keep iPhone 12 native; fit the same page into other screen sizes. */
export default function MiniGameFrame({ children, worldId, backgroundUrl }: {
  children: ReactNode;
  worldId: string;
  backgroundUrl?: string | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: DESIGN_W, height: DESIGN_H });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => setSize({ width: frame.clientWidth, height: frame.clientHeight });
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const artwork = backgroundUrl || worldBackgrounds[worldId];
  const page = calculateMiniGamePage(size.width, size.height);
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
        style={page.native
          ? { inset: 0, width: "100%", height: "100%", background: "#09050d" }
          : { width: page.width, height: page.height, left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${page.scale})`, transformOrigin: "center", background: "#09050d" }}
      >
        {children}
      </div>
    </div>
  );
}
