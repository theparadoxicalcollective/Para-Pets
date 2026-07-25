import { useEffect, type PointerEvent as ReactPointerEvent } from "react";
import {
  Copy,
  FlipHorizontal,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Trash2,
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

function thumbUrl(
  url: string | null | undefined,
  width: number,
): string | null {
  if (!url) return null;
  if (url.startsWith("/world-assets/"))
    return url.split("?")[0] + `?w=${width}`;
  return url;
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

  useEffect(() => {
    locations.forEach((location) => {
      if (location.iconUrl) {
        const image = new Image();
        image.src = thumbUrl(location.iconUrl, 600)!;
      }
    });
  }, [locations]);

  return (
    <div className="absolute inset-0">
      {[...locations]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((loc, i) => {
          const pos =
            dragPos?.id === loc.id
              ? { x: dragPos.x, y: dragPos.y }
              : { x: loc.posX, y: loc.posY };
          const isDragging = draggingLocationId === loc.id;
          const glow = loc.glowColor || accent;
          return (
            <div
              key={loc.id}
              data-testid={`location-${loc.id}`}
              className="absolute loc-node flex flex-col items-center"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${loc.iconSize || 300}px`,
                cursor: isAdmin ? "grab" : "pointer",
                zIndex: isDragging
                  ? 200
                  : selectedLocId === loc.id
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
                {/* Pulsing glow orb behind icon — all location types except haunted_woods */}
                {(loc.iconUrl || (loc.type === "fishing" && !loc.isShop)) &&
                  worldId !== "haunted_woods" && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          worldId === "swamp"
                            ? `radial-gradient(circle, ${glow}22 0%, ${glow}0d 40%, transparent 62%)`
                            : `radial-gradient(circle, ${glow}45 0%, ${glow}18 45%, transparent 70%)`,
                        animation:
                          worldId === "swamp"
                            ? `swampGlowPulse ${3.2 + ((i * 0.38) % 1.4)}s ease-in-out infinite`
                            : `locGlowPulse ${2.6 + ((i * 0.31) % 1.2)}s ease-in-out infinite`,
                        animationDelay: `${(i * 0.45) % 2.5}s`,
                        borderRadius: "50%",
                        zIndex: 0,
                      }}
                    />
                  )}
                {loc.iconUrl ||
                (loc.type === "fishing" &&
                  !loc.isShop &&
                  worldId === "volcanic") ? (
                  <div
                    className="w-full h-full"
                    style={
                      loc.type === "fishing" &&
                      !loc.isShop &&
                      worldId !== "haunted_woods"
                        ? { animation: "breathe 3s ease-in-out infinite" }
                        : undefined
                    }
                  >
                    <img
                      src={
                        loc.type === "fishing" &&
                        !loc.isShop &&
                        worldId === "volcanic"
                          ? "/world-assets/icon_fishing_volcanic.png?w=600"
                          : thumbUrl(loc.iconUrl, 600)!
                      }
                      alt={loc.name}
                      className="w-full h-full object-contain relative z-10"
                      draggable={false}
                      style={{
                        filter:
                          loc.type === "fishing" && !loc.isShop
                            ? worldId === "volcanic"
                              ? // Tight rim glow: 1–2 px shadow hugs the icon silhouette so
                                // it reads as a shiny outline rather than a large square bloom.
                                // Gold inner rim → orange mid → no far spread.
                                "drop-shadow(0 2px 5px rgba(0,0,0,0.65)) drop-shadow(0 0 1.5px rgba(251,191,36,1)) drop-shadow(0 0 5px rgba(251,146,60,0.65))"
                              : worldId === "swamp"
                                ? "drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 1.5px rgba(167,243,208,0.9)) drop-shadow(0 0 5px rgba(45,212,191,0.5))"
                                : worldId === "haunted_woods"
                                  ? "drop-shadow(0 2px 5px rgba(0,0,0,0.65))"
                                  : "drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 1.5px rgba(186,230,253,0.9)) drop-shadow(0 0 5px rgba(56,189,248,0.5))"
                            : // Non-fishing location icons (shops, NPCs, etc.) get a subtle
                              // rim using the location's own glow colour so each icon has
                              // a hint of its own identity without a large bloom. Bayou
                              // (swamp) world uses a unified deep-forest-teal rim so the
                              // icons feel of-a-piece with the swamp atmosphere instead
                              // of each shouting its own colour.
                              worldId === "haunted_woods"
                              ? "drop-shadow(0 2px 5px rgba(0,0,0,0.55))"
                              : worldId === "swamp"
                                ? "drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 1px rgba(45,138,120,0.85)) drop-shadow(0 0 4px rgba(20,83,75,0.55))"
                                : `drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 1px ${glow}cc) drop-shadow(0 0 4px ${glow}55)`,
                        transform: loc.flipped ? "scaleX(-1)" : undefined,
                        transition: "filter 0.15s ease, transform 0.15s ease",
                      }}
                    />
                    {/* Glow layer — same img with intense drop-shadow, opacity pulses.
                              drop-shadow follows PNG transparency so only the icon outline glows.
                              Haunted Woods skips this layer (top-crown gradient handles its glow). */}
                    {worldId !== "haunted_woods" && (
                      <img
                        src={
                          loc.type === "fishing" &&
                          !loc.isShop &&
                          worldId === "volcanic"
                            ? "/world-assets/icon_fishing_volcanic.png?w=600"
                            : thumbUrl(loc.iconUrl, 600)!
                        }
                        aria-hidden
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        draggable={false}
                        style={{
                          filter:
                            worldId === "swamp"
                              ? `drop-shadow(0 0 3px ${glow}55) drop-shadow(0 0 6px ${glow}22)`
                              : `drop-shadow(0 0 5px ${glow}) drop-shadow(0 0 12px ${glow}bb) drop-shadow(0 0 20px ${glow}66)`,
                          opacity: worldId === "swamp" ? 0.1 : 0.15,
                          animation:
                            worldId === "swamp"
                              ? `swampGlowRimPulse ${3.5 + ((i * 0.5) % 1.5)}s ease-in-out infinite`
                              : `locGlowRimPulse ${3.0 + ((i * 0.41) % 1.6)}s ease-in-out infinite`,
                          animationDelay: `${(i * 0.57) % 2.8}s`,
                          zIndex: 11,
                          transform: loc.flipped ? "scaleX(-1)" : undefined,
                        }}
                      />
                    )}
                    {/* Floating bubbles — fishing spots only (not shop buildings), not in haunted_woods */}
                    {loc.type === "fishing" &&
                      !loc.isShop &&
                      worldId !== "haunted_woods" && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 50,
                            pointerEvents: "none",
                            overflow: "visible",
                          }}
                        >
                          {[
                            {
                              left: "22%",
                              bottom: "26%",
                              size: 5,
                              dur: "5.5s",
                              delay: "0.0s",
                            },
                            {
                              left: "50%",
                              bottom: "20%",
                              size: 6,
                              dur: "5.2s",
                              delay: "2.8s",
                            },
                            {
                              left: "78%",
                              bottom: "30%",
                              size: 4,
                              dur: "6.4s",
                              delay: "1.2s",
                            },
                          ].map((b, bi) => (
                            <div
                              key={bi}
                              style={{
                                position: "absolute",
                                bottom: b.bottom,
                                left: b.left,
                                width: b.size,
                                height: b.size,
                                borderRadius: "50%",
                                background: `radial-gradient(circle at 35% 30%, ${glow}88, ${glow}30)`,
                                border: `0.5px solid ${glow}55`,
                                animation: `fishBubbleRise ${b.dur} ease-in-out ${b.delay} infinite`,
                                willChange: "transform, opacity",
                                pointerEvents: "none",
                              }}
                            />
                          ))}
                        </div>
                      )}
                  </div>
                ) : (
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center relative z-10"
                    style={{
                      background: `radial-gradient(circle at 40% 35%, ${glow}40, ${glow}15)`,
                      border: `1.5px solid ${glow}70`,
                      boxShadow: `0 0 4px ${glow}55, 0 0 8px ${glow}25`,
                    }}
                  >
                    <MapPin
                      className="w-7 h-7"
                      style={{
                        color: glow,
                        filter: `drop-shadow(0 0 3px ${glow}66)`,
                      }}
                    />
                  </div>
                )}
                {/* Tight circular hit-zone — only the visible centre of the icon fires clicks */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onLocationClick(loc);
                  }}
                  style={{
                    position: "absolute",
                    top: "20%",
                    left: "20%",
                    right: "20%",
                    bottom: "20%",
                    borderRadius: "50%",
                    pointerEvents: "auto",
                    cursor: isAdmin ? "grab" : "pointer",
                    zIndex: 20,
                  }}
                />

                {isAdmin && selectedLocId === loc.id && (
                  <div style={{ pointerEvents: "auto" }}>
                    <button
                      data-testid={`button-edit-location-${loc.id}`}
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
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = Math.max(64, (loc.iconSize || 300) - 10);
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
                        {loc.iconSize || 300}px
                      </span>
                    </div>
                    <button
                      data-testid={`button-size-up-location-${loc.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = Math.min(500, (loc.iconSize || 300) + 10);
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
    </div>
  );
}
