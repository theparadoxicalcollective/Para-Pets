import { getStagePortalTarget } from "@/lib/stage";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  Copy,
  FlipHorizontal,
  Minus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

export interface WorldLocationData {
  id: string;
  worldId: string;
  name: string;
  type: string;
  iconUrl: string | null;
  bgUrl: string | null;
  description: string | null;
  posX: number;
  posY: number;
  flipped: boolean;
  sortOrder: number;
  ownerImageUrl: string | null;
  isShop: boolean;
  glowColor: string | null;
  iconSize: number;
}

interface WorldLocationsProps {
  locations: WorldLocationData[];
  worldId: string;
  accent: string;
  isAdmin: boolean;
  selectedLocationId: string | null;
  draggingLocationId: string | null;
  dragPosition: { id: string; x: number; y: number } | null;
  onPointerDown: (
    event: ReactPointerEvent,
    location: WorldLocationData,
  ) => void;
  onLocationClick: (location: WorldLocationData) => void;
  onEditLocation: (location: WorldLocationData) => void;
  onFlipLocation: (locationId: string) => void;
  onDeleteLocation: (location: WorldLocationData) => void;
  onResizeLocation: (locationId: string, iconSize: number) => void;
  onDuplicateLocation: (locationId: string) => void;
}

function isScrollableHauntedCasino(
  location: WorldLocationData,
  worldId: string,
): boolean {
  return (
    worldId === "haunted_woods" &&
    /casino/i.test(location.name) &&
    Boolean(location.bgUrl) &&
    !location.isShop &&
    location.type !== "fishing" &&
    location.type !== "battle" &&
    location.type !== "explore"
  );
}

export default function WorldLocations({
  locations,
  worldId,
  accent,
  isAdmin,
  selectedLocationId,
  draggingLocationId,
  dragPosition,
  onPointerDown,
  onLocationClick,
  onEditLocation,
  onFlipLocation,
  onDeleteLocation,
  onResizeLocation,
  onDuplicateLocation,
}: WorldLocationsProps) {
  const selectedLocId = selectedLocationId;
  const dragPos = dragPosition;
  const [casinoScene, setCasinoScene] = useState<WorldLocationData | null>(null);
  const casinoScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!casinoScene) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCasinoScene(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [casinoScene]);

  const centerCasinoScene = () => {
    window.requestAnimationFrame(() => {
      const scroller = casinoScrollRef.current;
      if (!scroller) return;
      scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
    });
  };

  const activateLocation = (loc: WorldLocationData) => {
    if (isScrollableHauntedCasino(loc, worldId)) {
      // Admins keep the existing first-tap-select behavior so a hotspot can be
      // moved/resized safely. Once selected, the next tap opens the casino.
      if (isAdmin && selectedLocId !== loc.id) {
        onLocationClick(loc);
        return;
      }
      setCasinoScene(loc);
      return;
    }
    onLocationClick(loc);
  };

  return (
    <div className="absolute inset-0">
      <style>{`
        @keyframes worldHotspotSparklePulse {
          0%, 100% { opacity: .72; transform: translate(-50%, -50%) scale(.88); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
        }
        @keyframes worldHotspotSparkleTwinkle {
          0%, 100% { opacity: .18; transform: translate(-50%, -50%) scale(.5) rotate(0deg); }
          45% { opacity: 1; transform: translate(-50%, -50%) scale(1.25) rotate(45deg); }
        }
        @keyframes worldHotspotSparkleCore {
          0%, 100% { opacity: .78; transform: translate(-50%, -50%) scale(.82); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
        }
        @media (prefers-reduced-motion: reduce) {
          .world-hotspot-sparkle-pulse,
          .world-hotspot-sparkle-twinkle,
          .world-hotspot-sparkle-core { animation: none !important; }
        }
      `}</style>

      {[...locations]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((loc, i) => {
          const pos =
            dragPos?.id === loc.id
              ? { x: dragPos.x, y: dragPos.y }
              : { x: loc.posX, y: loc.posY };
          const isDragging = draggingLocationId === loc.id;
          const isSelected = selectedLocId === loc.id;
          const hotspotSize = loc.iconSize || 300;
          const sparkleSize = Math.max(30, Math.min(56, hotspotSize * 0.16));

          return (
            <div
              key={loc.id}
              data-testid={`location-${loc.id}`}
              className="absolute loc-node flex flex-col items-center"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${hotspotSize}px`,
                cursor: isAdmin ? "grab" : "pointer",
                zIndex: isDragging
                  ? 200
                  : isSelected
                    ? 150
                    : loc.type === "fishing" && !loc.isShop
                      ? 100 + i
                      : 10 + i,
              }}
              onPointerDown={(e) => onPointerDown(e, loc)}
            >
              <div
                className="relative w-full"
                style={{ aspectRatio: "1", pointerEvents: "none" }}
              >
                {isAdmin ? (
                  <button
                    type="button"
                    data-testid={`admin-location-hotspot-${loc.id}`}
                    aria-label={`Select ${loc.name} hotspot`}
                    onClick={(event) => {
                      event.stopPropagation();
                      activateLocation(loc);
                    }}
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl px-3 text-center select-none"
                    style={{
                      pointerEvents: "auto",
                      touchAction: "none",
                      cursor: isSelected ? "grab" : "pointer",
                      color: "#fff3bd",
                      background: isSelected
                        ? "rgba(55, 35, 4, 0.78)"
                        : "rgba(30, 22, 5, 0.58)",
                      border: isSelected
                        ? "2px solid rgba(255, 215, 105, 0.95)"
                        : "1.5px dashed rgba(255, 215, 105, 0.72)",
                      boxShadow: isSelected
                        ? `0 0 0 1px ${accent}55, 0 0 18px rgba(255, 202, 72, 0.38), inset 0 0 18px rgba(255, 202, 72, 0.12)`
                        : "0 0 10px rgba(255, 202, 72, 0.2), inset 0 0 12px rgba(255, 202, 72, 0.06)",
                      backdropFilter: "blur(1.5px)",
                      WebkitBackdropFilter: "blur(1.5px)",
                    }}
                  >
                    <span
                      className="font-fantasy font-semibold"
                      style={{
                        fontSize: `${Math.max(12, Math.min(22, hotspotSize * 0.075))}px`,
                        lineHeight: 1.05,
                        textShadow: "0 1px 3px rgba(0,0,0,.9)",
                        maxWidth: "88%",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {loc.name}
                    </span>
                    <span
                      className="mt-1 uppercase tracking-[0.16em]"
                      style={{
                        fontSize: `${Math.max(7, Math.min(10, hotspotSize * 0.032))}px`,
                        color: "rgba(255, 226, 145, .72)",
                      }}
                    >
                      hotspot
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`player-location-hotspot-${loc.id}`}
                    aria-label={`Open ${loc.name}`}
                    title={loc.name}
                    onClick={(event) => {
                      event.stopPropagation();
                      activateLocation(loc);
                    }}
                    className="absolute inset-0 z-20 rounded-full"
                    style={{
                      pointerEvents: "auto",
                      cursor: "pointer",
                      touchAction: "manipulation",
                      background: "transparent",
                      border: 0,
                      padding: 0,
                    }}
                  >
                    <span
                      data-testid={`location-sparkle-${loc.id}`}
                      aria-hidden="true"
                      className="world-hotspot-sparkle-pulse absolute left-1/2 top-1/2 block"
                      style={{
                        width: `${sparkleSize}px`,
                        height: `${sparkleSize}px`,
                        transform: "translate(-50%, -50%)",
                        animation: `worldHotspotSparklePulse ${2.4 + ((i * 0.29) % 1.1)}s ease-in-out infinite`,
                        animationDelay: `${(i * 0.37) % 1.6}s`,
                        filter: "drop-shadow(0 0 5px rgba(255,235,156,.95)) drop-shadow(0 0 12px rgba(255,190,44,.72))",
                      }}
                    >
                      <span
                        data-testid={`location-sparkle-core-${loc.id}`}
                        className="world-hotspot-sparkle-core absolute left-1/2 top-1/2 block"
                        style={{
                          width: Math.max(12, sparkleSize * 0.42),
                          height: Math.max(12, sparkleSize * 0.42),
                          transform: "translate(-50%, -50%)",
                          clipPath: "polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)",
                          background: "linear-gradient(135deg, #fffce8 8%, #ffe68a 45%, #ffb51f 100%)",
                          boxShadow: "0 0 8px rgba(255,239,166,.95)",
                          animation: `worldHotspotSparkleCore ${1.65 + ((i * 0.17) % 0.55)}s ease-in-out infinite`,
                        }}
                      />
                      {[
                        { left: "50%", top: "5%", size: 5.5, delay: 0 },
                        { left: "84%", top: "22%", size: 3.5, delay: 0.45 },
                        { left: "94%", top: "56%", size: 4.5, delay: 0.9 },
                        { left: "72%", top: "87%", size: 3.25, delay: 0.2 },
                        { left: "35%", top: "94%", size: 4, delay: 0.7 },
                        { left: "7%", top: "69%", size: 3.5, delay: 1.05 },
                        { left: "12%", top: "31%", size: 4.75, delay: 0.35 },
                        { left: "35%", top: "18%", size: 2.75, delay: 0.8 },
                      ].map((spark, sparkIndex) => (
                        <span
                          key={sparkIndex}
                          data-testid={`location-sparkle-particle-${loc.id}-${sparkIndex}`}
                          className="world-hotspot-sparkle-twinkle absolute block"
                          style={{
                            left: spark.left,
                            top: spark.top,
                            width: spark.size,
                            height: spark.size,
                            transform: "translate(-50%, -50%)",
                            clipPath: "polygon(50% 0%, 64% 36%, 100% 50%, 64% 64%, 50% 100%, 36% 64%, 0% 50%, 36% 36%)",
                            background: "#fff1a8",
                            boxShadow: "0 0 5px rgba(255, 211, 80, .9)",
                            animation: `worldHotspotSparkleTwinkle 1.9s ease-in-out ${spark.delay}s infinite`,
                          }}
                        />
                      ))}
                    </span>
                  </button>
                )}

                {isAdmin && isSelected && (
                  <div style={{ pointerEvents: "auto" }}>
                    <button
                      data-testid={`button-edit-location-${loc.id}`}
                      aria-label={`Edit ${loc.name}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditLocation(loc);
                      }}
                      className="absolute -top-5 -right-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        background: "rgba(45,106,79,0.95)",
                        border: "2px solid rgba(127,255,212,0.7)",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <Pencil className="w-5 h-5 text-white" />
                    </button>
                    <button
                      data-testid={`button-flip-location-${loc.id}`}
                      aria-label={`Flip saved art for ${loc.name}`}
                      title="Keeps the saved legacy image flip setting"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFlipLocation(loc.id);
                      }}
                      className="absolute -bottom-5 -right-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        background: "rgba(0,80,180,0.95)",
                        border: "2px solid rgba(100,180,255,0.7)",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <FlipHorizontal className="w-5 h-5 text-white" />
                    </button>
                    <button
                      data-testid={`button-delete-location-${loc.id}`}
                      aria-label={`Delete ${loc.name}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteLocation(loc);
                      }}
                      className="absolute -top-5 -left-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        background: "rgba(220,38,38,0.95)",
                        border: "2px solid rgba(255,100,100,0.7)",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <Trash2 className="w-5 h-5 text-white" />
                    </button>
                    <button
                      data-testid={`button-size-down-location-${loc.id}`}
                      aria-label={`Make ${loc.name} hotspot smaller`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = Math.max(64, hotspotSize - 10);
                        onResizeLocation(loc.id, next);
                      }}
                      className="absolute -bottom-5 -left-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        background: "rgba(80,40,0,0.95)",
                        border: "2px solid rgba(255,160,50,0.7)",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <Minus className="w-5 h-5 text-white" />
                    </button>
                    {loc.type === "fishing" && (
                      <button
                        data-testid={`button-duplicate-location-${loc.id}`}
                        aria-label={`Duplicate ${loc.name}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateLocation(loc.id);
                        }}
                        className="absolute top-1/2 -left-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                        style={{
                          transform: "translateY(-50%)",
                          background: "rgba(80,0,140,0.95)",
                          border: "2px solid rgba(180,100,255,0.8)",
                          cursor: "pointer",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                        }}
                      >
                        <Copy className="w-5 h-5 text-white" />
                      </button>
                    )}
                    <div
                      className="absolute z-30 flex items-center justify-center"
                      style={{
                        bottom: "-28px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(0,0,0,0.85)",
                        border: "1px solid rgba(255,200,50,0.5)",
                        borderRadius: "6px",
                        padding: "2px 8px",
                        pointerEvents: "none",
                      }}
                    >
                      <span className="font-fantasy text-xs text-yellow-300">
                        {hotspotSize}px
                      </span>
                    </div>
                    <button
                      data-testid={`button-size-up-location-${loc.id}`}
                      aria-label={`Make ${loc.name} hotspot larger`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = Math.min(500, hotspotSize + 10);
                        onResizeLocation(loc.id, next);
                      }}
                      className="absolute top-1/2 -right-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        transform: "translateY(-50%)",
                        background: "rgba(80,40,0,0.95)",
                        border: "2px solid rgba(255,160,50,0.7)",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <Plus className="w-5 h-5 text-white" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

      {casinoScene && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[80] bg-[#05020a]"
          data-testid="haunted-casino-scroll-view"
          role="dialog"
          aria-modal="true"
          aria-label={casinoScene.name}
        >
          <div
            ref={casinoScrollRef}
            className="absolute inset-0 overflow-x-auto overflow-y-hidden"
            style={{
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x",
              overscrollBehaviorX: "contain",
            }}
          >
            <div className="h-full min-w-full w-max">
              <img
                src={casinoScene.bgUrl || ""}
                alt=""
                draggable={false}
                onLoad={centerCasinoScene}
                className="block h-full w-auto max-w-none mx-auto select-none"
              />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/35 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/35 to-transparent" />
          <button
            type="button"
            aria-label="Close Haunted Casino"
            onClick={() => setCasinoScene(null)}
            className="absolute right-3 z-20 grid h-11 w-11 place-items-center rounded-full border border-violet-200/45 bg-black/65 text-violet-50 shadow-[0_0_18px_rgba(168,85,247,.35)] backdrop-blur-sm active:scale-95"
            style={{ top: "max(12px, env(safe-area-inset-top))" }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>,
        getStagePortalTarget(),
      )}
    </div>
  );
}
