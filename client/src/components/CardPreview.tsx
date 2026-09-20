import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import CardFittedText from "./CardFittedText";
import starImg from "@assets/Photoroom_20260331_20947_PM_1774984267132.png";
import {
  CARD_BORDER_ASSETS,
  type CardBorderLayout,
  type CardLayoutField,
  type CardRarity,
} from "@/lib/cardCatalog";

interface CardPreviewProps {
  rarity: CardRarity;
  artworkUrl?: string | null;
  name: string;
  description: string;
  layout: CardBorderLayout;
  editable?: boolean;
  textSize?: "scaled" | "inventory" | "detail";
  onDescriptionClick?: () => void;
  depth3d?: boolean;
  showSparkles?: boolean;
  selectedField?: CardLayoutField;
  onSelectField?: (field: CardLayoutField) => void;
  onLayoutChange?: (layout: CardBorderLayout) => void;
}

interface DragState {
  field: CardLayoutField;
  offsetX: number;
  offsetY: number;
}

const RARITY_TEXT_STYLES: Record<CardRarity, { name: string; description: string }> = {
  1: { name: "#4a4032", description: "#5b5143" },
  2: { name: "#244d32", description: "#355f42" },
  3: { name: "#234f73", description: "#356681" },
  4: { name: "#573b72", description: "#6b4c81" },
  5: { name: "#7a3d18", description: "#7f5528" },
};

const RARITY_SPARKLE_COUNT: Record<CardRarity, number> = {
  1: 0,
  2: 18,
  3: 32,
  4: 48,
  5: 64,
};

const RARITY_GLINT_COUNT: Record<CardRarity, number> = {
  1: 0,
  2: 0,
  3: 4,
  4: 8,
  5: 12,
};

const RARITY_SPARKLE_STYLE: Record<CardRarity, { opacity: number; glow: string }> = {
  1: { opacity: 0, glow: "none" },
  2: { opacity: 0.52, glow: "drop-shadow(0 0 1px rgba(255,238,174,.42))" },
  3: { opacity: 0.7, glow: "drop-shadow(0 0 1.5px rgba(255,232,155,.55))" },
  4: { opacity: 0.86, glow: "drop-shadow(0 0 2px rgba(255,226,138,.68))" },
  5: { opacity: 1, glow: "drop-shadow(0 0 2.5px rgba(255,236,178,.82))" },
};

// Deterministic points keep the glitter stable between renders and avoid a
// JavaScript particle loop. Only three SVG groups animate regardless of count.
const CARD_GLITTER_POINTS = Array.from({ length: 64 }, (_, index) => ({
  x: 4 + ((index * 37 + 11) % 92),
  y: 7 + ((index * 53 + 17) % 136),
  radius: 0.18 + ((index * 17) % 6) * 0.055,
  group: index % 3,
}));

const CARD_GLINT_POINTS = [
  { x: 18, y: 118, size: 1.15, delay: 0.2 },
  { x: 77, y: 108, size: 0.95, delay: 1.1 },
  { x: 34, y: 92, size: 0.9, delay: 1.8 },
  { x: 66, y: 82, size: 1.05, delay: 0.6 },
  { x: 24, y: 70, size: 0.82, delay: 1.4 },
  { x: 82, y: 61, size: 0.9, delay: 2.2 },
  { x: 45, y: 54, size: 0.78, delay: 0.9 },
  { x: 61, y: 43, size: 0.88, delay: 1.7 },
  { x: 31, y: 34, size: 0.72, delay: 2.5 },
  { x: 73, y: 27, size: 0.78, delay: 0.4 },
  { x: 50, y: 22, size: 0.72, delay: 1.3 },
  { x: 87, y: 126, size: 0.82, delay: 2.0 },
] as const;

export default function CardPreview({
  rarity,
  artworkUrl,
  name,
  description,
  layout,
  editable = false,
  textSize = "scaled",
  onDescriptionClick,
  depth3d = false,
  showSparkles = false,
  selectedField = "name",
  onSelectField,
  onLayoutChange,
}: CardPreviewProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const fieldMetrics = (field: CardLayoutField) => field === "name"
    ? { x: layout.nameX, y: layout.nameY, width: layout.nameWidth, height: layout.nameHeight }
    : field === "description"
      ? { x: layout.descriptionX, y: layout.descriptionY, width: layout.descriptionWidth, height: layout.descriptionHeight }
      : { x: layout.starX, y: layout.starY, width: layout.starWidth, height: layout.starWidth / rarity * 2 / 3 };

  const updateFieldPosition = (
    field: CardLayoutField,
    pointerX: number,
    pointerY: number,
  ) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || !onLayoutChange) return;
    const bounds = canvas.getBoundingClientRect();
    const metrics = fieldMetrics(field);
    const nextX = Math.max(0, Math.min(100 - metrics.width, ((pointerX - bounds.left) / bounds.width) * 100 - drag.offsetX));
    const nextY = Math.max(0, Math.min(100 - metrics.height, ((pointerY - bounds.top) / bounds.height) * 100 - drag.offsetY));
    onLayoutChange(field === "name"
      ? { ...layout, nameX: nextX, nameY: nextY }
      : field === "description"
        ? { ...layout, descriptionX: nextX, descriptionY: nextY }
        : { ...layout, starX: nextX, starY: nextY });
  };

  const beginDrag = (field: CardLayoutField, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || !onLayoutChange) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const metrics = fieldMetrics(field);
    dragRef.current = {
      field,
      offsetX: ((event.clientX - bounds.left) / bounds.width) * 100 - metrics.x,
      offsetY: ((event.clientY - bounds.top) / bounds.height) * 100 - metrics.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectField?.(field);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    updateFieldPosition(drag.field, event.clientX, event.clientY);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const renderTextBox = (field: CardLayoutField) => {
    const isName = field === "name";
    const metrics = fieldMetrics(field);
    const selected = editable && selectedField === field;
    const clickable = !editable && !isName && !!onDescriptionClick;
    const rarityTextStyle = RARITY_TEXT_STYLES[rarity];
    // Saved font sizes describe a 240px-wide card, rather than fixed screen pixels.
    const relativeFontSize = `${(isName ? layout.nameFontSize : layout.descriptionFontSize) / 240 * 100}cqw`;
    const fontSize = textSize === "detail"
      ? `clamp(${isName ? 20 : 16}px, ${relativeFontSize}, ${isName ? 30 : 22}px)`
      : textSize === "inventory"
        ? `clamp(${isName ? 8 : 6}px, ${relativeFontSize}, ${isName ? 12 : 9}px)`
        : relativeFontSize;
    const minimumFontSize = textSize === "detail" ? (isName ? 16 : 14)
      : textSize === "inventory" ? (isName ? 7 : 6) : undefined;
    return (
      <div
        data-testid={`card-layout-box-${field}`}
        onPointerDown={(event) => beginDrag(field, event)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? `Read full description of ${name}` : undefined}
        onKeyDown={event => {
          if (clickable && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onDescriptionClick?.();
          }
        }}
        onClick={() => clickable ? onDescriptionClick?.() : onSelectField?.(field)}
        style={{
          position: "absolute",
          left: `${metrics.x}%`,
          top: `${metrics.y}%`,
          width: `${metrics.width}%`,
          height: `${metrics.height}%`,
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isName ? "1% 3%" : "2% 4%",
          boxSizing: "border-box",
          overflow: "hidden",
          textAlign: "center",
          color: isName ? rarityTextStyle.name : rarityTextStyle.description,
          fontFamily: isName ? "'Cinzel', 'Palatino Linotype', serif" : "Georgia, serif",
          fontWeight: isName ? 700 : 500,
          fontSize,
          lineHeight: isName ? 1.05 : 1.18,
          letterSpacing: isName ? ".05em" : "normal",
          textShadow: "0 1px 0 rgba(255,255,255,.58), 0 0 2px rgba(255,244,205,.28)",
          transform: depth3d ? `translateZ(${isName ? 26 : 22}px)` : undefined,
          backfaceVisibility: "hidden",
          border: editable ? `1.5px dashed ${selected ? "#7cf5b2" : "rgba(255,224,128,.78)"}` : "none",
          background: editable ? (selected ? "rgba(22,90,58,.34)" : "rgba(8,8,5,.22)") : "transparent",
          boxShadow: editable && selected ? "0 0 10px rgba(124,245,178,.42)" : "none",
          cursor: editable ? "grab" : clickable ? "pointer" : "default",
          touchAction: editable ? "none" : "auto",
          userSelect: "none",
        }}
      >
        <CardFittedText text={isName ? (name || "CARD NAME") : (description || "Card description")} preferredFontSize={fontSize} minimumFontSize={minimumFontSize} />
      </div>
    );
  };

  return (
    <div
      ref={canvasRef}
      data-testid="card-preview"
      style={{
        position: "relative",
        width: "100%",
        containerType: "inline-size",
        // Preserve the transparent silhouette around the decorative frame.
        // The detail viewer owns the shadow while the card is in 3D so the
        // individual layers remain free to separate along the Z axis.
        filter: depth3d ? "none" : "drop-shadow(0 8px 12px rgba(0,0,0,.48))",
        transformStyle: depth3d ? "preserve-3d" : undefined,
      }}
    >
      <img
        src={CARD_BORDER_ASSETS[rarity]}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ display: "block", width: "100%", height: "auto", visibility: "hidden" }}
      />
      {/* A dark backing fills the parallax gap while the artwork sits behind the raised frame. */}
      {depth3d && (
        <div
          aria-hidden="true"
          className="absolute"
          style={{
            inset: "11% 6%",
            background: "#050604",
            boxShadow: "0 0 14px 8px rgba(0,0,0,.8)",
            transform: "translateZ(-14px)",
            pointerEvents: "none",
          }}
        />
      )}
      {/* Let detail artwork bleed slightly under the frame when turned. */}
      <div
        data-testid="card-artwork-window"
        style={{
          position: "absolute",
          inset: depth3d ? "12% 7%" : "12% 10%",
          zIndex: 0,
          overflow: "hidden",
          borderRadius: "9% / 7%",
          background: "linear-gradient(145deg, #162219, #070a08)",
          pointerEvents: "none",
          transform: depth3d ? "translateZ(-10px)" : undefined,
          backfaceVisibility: "hidden",
        }}
      >
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            draggable={false}
            style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 50% 38%, rgba(78,124,86,.55), transparent 43%), linear-gradient(160deg,#17251b,#060a07)",
            }}
          />
        )}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at center, transparent 48%, rgba(0,0,0,.42) 100%)",
            boxShadow: depth3d ? "inset 0 0 24px 8px rgba(0,0,0,.75)" : "inset 0 0 12px rgba(0,0,0,.48)",
          }}
        />
        {showSparkles && RARITY_SPARKLE_COUNT[rarity] > 0 && (
          <svg
            data-testid="card-rarity-sparkles"
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 150"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{
              pointerEvents: "none",
              zIndex: 1,
              opacity: RARITY_SPARKLE_STYLE[rarity].opacity,
              filter: RARITY_SPARKLE_STYLE[rarity].glow,
              overflow: "hidden",
              clipPath: "inset(0)",
            }}
          >
            {[0, 1, 2].map(group => (
              <g key={group} className={`card-glitter-batch card-glitter-batch-${group}`}>
                {CARD_GLITTER_POINTS
                  .slice(0, RARITY_SPARKLE_COUNT[rarity])
                  .filter(point => point.group === group)
                  .map((point, index) => (
                    <circle
                      key={index}
                      cx={point.x}
                      cy={point.y}
                      r={point.radius}
                      fill={rarity >= 4 ? "rgba(255,248,218,.98)" : "rgba(255,245,210,.9)"}
                    />
                  ))}
              </g>
            ))}
            {CARD_GLINT_POINTS.slice(0, RARITY_GLINT_COUNT[rarity]).map((glint, index) => (
              <g
                key={`glint-${index}`}
                className="card-micro-glint"
                style={{ animationDelay: `-${glint.delay}s` }}
              >
                <circle cx={glint.x} cy={glint.y} r={glint.size * 1.7} fill="rgba(255,230,150,.12)" />
                <path
                  d={`M ${glint.x} ${glint.y - glint.size} L ${glint.x} ${glint.y + glint.size} M ${glint.x - glint.size} ${glint.y} L ${glint.x + glint.size} ${glint.y}`}
                  fill="none"
                  stroke="rgba(255,255,244,.96)"
                  strokeWidth="0.34"
                  strokeLinecap="round"
                />
              </g>
            ))}
            {rarity === 5 && (
              <g className="card-sparkle-swirl">
                <path
                  className="card-sparkle-swirl-line card-sparkle-swirl-line-a"
                  d="M 12 120 C 24 88, 67 101, 84 65 C 95 42, 83 23, 58 27"
                  pathLength="100"
                  fill="none"
                  stroke="rgba(255,247,207,.86)"
                  strokeWidth="0.7"
                  strokeLinecap="round"
                  strokeDasharray="0.1 3.2"
                />
                <path
                  className="card-sparkle-swirl-line card-sparkle-swirl-line-b"
                  d="M 20 132 C 39 106, 76 117, 78 83 C 79 66, 67 56, 53 58"
                  pathLength="100"
                  fill="none"
                  stroke="rgba(230,247,255,.76)"
                  strokeWidth="0.55"
                  strokeLinecap="round"
                  strokeDasharray="0.1 4"
                />
              </g>
            )}
          </svg>
        )}
      </div>
      <img
        src={CARD_BORDER_ASSETS[rarity]}
        alt={`${rarity}-star card border`}
        draggable={false}
        style={{ position: "absolute", inset: 0, zIndex: 2, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", transform: depth3d ? "translateZ(16px)" : undefined, backfaceVisibility: "hidden", filter: depth3d ? "drop-shadow(0 8px 12px rgba(0,0,0,.48))" : undefined }}
      />
      {renderTextBox("name")}
      {renderTextBox("description")}
      <div
        data-testid="card-layout-box-stars"
        onPointerDown={(event) => beginDrag("stars", event)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => onSelectField?.("stars")}
        aria-label={`${rarity} card rarity ${rarity === 1 ? "star" : "stars"}`}
        style={{ position: "absolute", left: `${layout.starX}%`, top: `${layout.starY}%`, width: `${layout.starWidth}%`, height: `${layout.starWidth / rarity * 2 / 3}%`,
          zIndex: 4, display: "flex", justifyContent: "center", alignItems: "center",
          transform: depth3d ? "translateZ(34px)" : undefined,
          backfaceVisibility: "hidden",
          border: editable ? `1.5px dashed ${selectedField === "stars" ? "#7cf5b2" : "rgba(255,224,128,.78)"}` : "none",
          background: editable && selectedField === "stars" ? "rgba(22,90,58,.34)" : "transparent",
          cursor: editable ? "grab" : "default", touchAction: editable ? "none" : "auto", userSelect: "none" }}
      >
        {Array.from({ length: rarity }, (_, index) => <img key={index} src={starImg} alt="" draggable={false}
          style={{ width: `${100 / rarity}%`, height: "100%", objectFit: "contain", pointerEvents: "none",
            filter: "brightness(1.2) saturate(1.12) drop-shadow(0 0 2px rgba(255,245,190,.95)) drop-shadow(0 0 6px rgba(255,196,54,.82)) drop-shadow(0 1px 2px rgba(0,0,0,.78))" }} />)}
      </div>
      {showSparkles && <style>{`
        @keyframes cardGlitterPulseA {
          0%, 100% { opacity: .22; }
          38% { opacity: .95; }
          68% { opacity: .4; }
        }
        @keyframes cardGlitterPulseB {
          0%, 100% { opacity: .62; }
          32% { opacity: .25; }
          72% { opacity: 1; }
        }
        @keyframes cardGlitterPulseC {
          0%, 100% { opacity: .34; }
          48% { opacity: .88; }
          78% { opacity: .2; }
        }
        @keyframes cardMicroGlint {
          0%, 72%, 100% { opacity: .08; transform: scale(.55) rotate(0deg); }
          82% { opacity: 1; transform: scale(1.12) rotate(35deg); }
          92% { opacity: .2; transform: scale(.7) rotate(58deg); }
        }
        @keyframes cardSparkleSwirl {
          0% { stroke-dashoffset: 0; opacity: .2; }
          45% { opacity: .78; }
          100% { stroke-dashoffset: -22; opacity: .28; }
        }
        .card-glitter-batch {
          will-change: opacity;
        }
        .card-glitter-batch-0 { animation: cardGlitterPulseA 2.8s ease-in-out infinite; }
        .card-glitter-batch-1 { animation: cardGlitterPulseB 3.4s ease-in-out infinite; }
        .card-glitter-batch-2 { animation: cardGlitterPulseC 4.1s ease-in-out infinite; }
        .card-micro-glint {
          opacity: .15;
          transform-box: fill-box;
          transform-origin: center;
          animation: cardMicroGlint 3.8s ease-in-out infinite;
        }
        .card-sparkle-swirl-line {
          animation: cardSparkleSwirl 6.5s linear infinite;
        }
        .card-sparkle-swirl-line-b {
          animation-duration: 8.5s;
          animation-direction: reverse;
        }
        @media (prefers-reduced-motion: reduce) {
          .card-glitter-batch,
          .card-micro-glint,
          .card-sparkle-swirl-line { animation: none !important; }
          .card-glitter-batch { opacity: .62; }
          .card-micro-glint { opacity: .36; }
          .card-sparkle-swirl-line { opacity: .35; }
        }
      `}</style>}
    </div>
  );
}
