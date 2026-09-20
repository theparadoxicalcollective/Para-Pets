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
  2: 28,
  3: 48,
  4: 72,
  5: 96,
};

const RARITY_GLINT_COUNT: Record<CardRarity, number> = {
  1: 0,
  2: 2,
  3: 6,
  4: 11,
  5: 16,
};

const RARITY_SWIRL_COUNT: Record<CardRarity, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
};

const RARITY_SPARKLE_STYLE: Record<CardRarity, { opacity: number; glow: string; color: string }> = {
  1: { opacity: 0, glow: "none", color: "#fff4ca" },
  2: { opacity: .67, glow: "drop-shadow(0 0 1px rgba(252,241,180,.58))", color: "#e9f7cd" },
  3: { opacity: .79, glow: "drop-shadow(0 0 1.5px rgba(181,225,255,.66))", color: "#d8edff" },
  4: { opacity: .89, glow: "drop-shadow(0 0 2px rgba(226,183,255,.72))", color: "#efddff" },
  5: { opacity: 1, glow: "drop-shadow(0 0 2px rgba(255,215,119,.8))", color: "#fff0b6" },
};

// Dust follows a centered ribbon. Lower points are larger and more crowded;
// the top thins out without relying on a timer or an off-card particle emitter.
const CARD_GLITTER_POINTS = Array.from({ length: 96 }, (_, index) => {
  const height = (((index * 47) % 97) / 97) ** 1.7;
  const turn = height * 11 + (index % 4) * .25;
  return {
    x: 50 + Math.sin(turn) * (18 - height * 5) + ((index * 19) % 13) - 6,
    y: 138 - height * 121,
    radius: (.27 + ((index * 17) % 7) * .052) * (1.3 - height * .45),
    group: index % 4,
  };
});

const CARD_GLINT_POINTS = [
  { x: 34, y: 127, size: 1.55, delay: .12 },
  { x: 66, y: 117, size: 1.42, delay: .74 },
  { x: 48, y: 108, size: 1.36, delay: 1.18 },
  { x: 25, y: 99, size: 1.27, delay: .36 },
  { x: 70, y: 91, size: 1.22, delay: .92 },
  { x: 51, y: 83, size: 1.18, delay: 1.42 },
  { x: 31, y: 77, size: 1.13, delay: .58 },
  { x: 67, y: 68, size: 1.1, delay: 1.08 },
  { x: 46, y: 61, size: 1.08, delay: 1.62 },
  { x: 27, y: 53, size: 1.06, delay: .22 },
  { x: 63, y: 48, size: 1.02, delay: .82 },
  { x: 51, y: 41, size: .96, delay: 1.28 },
  { x: 37, y: 36, size: .92, delay: .46 },
  { x: 69, y: 30, size: .9, delay: 1.52 },
  { x: 47, y: 24, size: .86, delay: .68 },
  { x: 55, y: 18, size: .82, delay: 1.36 },
] as const;

const CARD_SWIRL_PATHS = [
  "M 25 139 C 8 111, 76 126, 72 96 C 69 73, 28 91, 30 68 C 32 49, 72 58, 64 35 C 60 26, 50 23, 53 16",
  "M 72 139 C 91 112, 26 124, 25 103 C 24 82, 78 88, 74 67 C 71 49, 34 61, 38 40 C 40 29, 57 30, 49 20",
  "M 38 141 C 69 120, 80 113, 64 99 C 46 83, 23 106, 30 83 C 37 67, 73 79, 68 55 C 65 46, 45 44, 47 31",
  "M 62 137 C 29 126, 12 112, 37 98 C 56 87, 82 108, 74 78 C 68 61, 30 72, 34 49 C 37 37, 58 45, 55 27",
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
            }}
          >
            {[0, 1, 2, 3].map(group => (
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
                      fill={rarity >= 4 ? "rgba(255,252,228,1)" : "rgba(255,248,218,.98)"}
                    />
                  ))}
              </g>
            ))}
            {CARD_GLINT_POINTS.slice(0, RARITY_GLINT_COUNT[rarity]).map((glint, index) => (
              <g
                key={`glint-${index}`}
                className="card-micro-glint"
                style={{
                  animationDelay: `-${glint.delay}s`,
                  animationDuration: `${1.55 + (index % 4) * .27}s`,
                }}
              >
                <circle
                  className="card-star-aura"
                  cx={glint.x}
                  cy={glint.y}
                  r={glint.size * 2.5}
                  fill="rgba(255,231,151,.18)"
                />
                <path
                  className="card-star-shape"
                  d={`M ${glint.x} ${glint.y - glint.size * 1.55}
                    L ${glint.x + glint.size * .23} ${glint.y - glint.size * .23}
                    L ${glint.x + glint.size * 1.55} ${glint.y}
                    L ${glint.x + glint.size * .23} ${glint.y + glint.size * .23}
                    L ${glint.x} ${glint.y + glint.size * 1.55}
                    L ${glint.x - glint.size * .23} ${glint.y + glint.size * .23}
                    L ${glint.x - glint.size * 1.55} ${glint.y}
                    L ${glint.x - glint.size * .23} ${glint.y - glint.size * .23} Z`}
                  fill="rgba(255,255,248,1)"
                  stroke="rgba(255,235,172,.92)"
                  strokeWidth="0.12"
                  strokeLinejoin="round"
                />
                <circle cx={glint.x} cy={glint.y} r={glint.size * .18} fill="#fff" />
              </g>
            ))}
            {CARD_SWIRL_PATHS.slice(0, RARITY_SWIRL_COUNT[rarity]).map((path, index) => (
              <g key={index} className="card-sparkle-swirl">
                <path
                  d={path}
                  fill="none"
                  stroke={RARITY_SPARKLE_STYLE[rarity].color}
                  strokeOpacity=".24"
                  strokeWidth={.34 + rarity * .045}
                  strokeLinecap="round"
                />
                <path
                  className="card-sparkle-swirl-line"
                  d={path}
                  pathLength={100}
                  fill="none"
                  stroke={RARITY_SPARKLE_STYLE[rarity].color}
                  strokeWidth={.46 + rarity * .075}
                  strokeLinecap="round"
                  style={{ animationDelay: `-${index * 1.3}s`, animationDuration: `${5.4 + index * .7}s` }}
                />
              </g>
            ))}
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
          0%, 100% { opacity: .48; }
          38% { opacity: 1; }
          68% { opacity: .66; }
        }
        @keyframes cardGlitterPulseB {
          0%, 100% { opacity: .78; }
          32% { opacity: .46; }
          72% { opacity: 1; }
        }
        @keyframes cardGlitterPulseC {
          0%, 100% { opacity: .58; }
          48% { opacity: 1; }
          78% { opacity: .4; }
        }
        @keyframes cardGlitterPulseD {
          0%, 100% { opacity: .86; }
          40% { opacity: .5; }
          75% { opacity: 1; }
        }
        @keyframes cardMicroGlint {
          0%, 100% { opacity: .08; transform: scale(.52) rotate(0deg); }
          16% { opacity: .22; transform: scale(.7) rotate(4deg); }
          28% { opacity: 1; transform: scale(1.38) rotate(9deg); }
          39% { opacity: .3; transform: scale(.82) rotate(13deg); }
          56% { opacity: .92; transform: scale(1.16) rotate(18deg); }
          69% { opacity: .12; transform: scale(.62) rotate(22deg); }
        }
        @keyframes cardSparkleSwirlFlow {
          from { stroke-dashoffset: 100; opacity: .35; }
          45% { opacity: 1; }
          to { stroke-dashoffset: 0; opacity: .35; }
        }
        .card-glitter-batch { will-change: opacity; }
        .card-glitter-batch-0 { animation: cardGlitterPulseA 2.5s ease-in-out infinite; }
        .card-glitter-batch-1 { animation: cardGlitterPulseB 3s ease-in-out infinite; }
        .card-glitter-batch-2 { animation: cardGlitterPulseC 3.6s ease-in-out infinite; }
        .card-glitter-batch-3 { animation: cardGlitterPulseD 4.2s ease-in-out infinite; }
        .card-micro-glint {
          opacity: .28;
          transform-box: fill-box;
          transform-origin: center;
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 1px rgba(255,255,244,.95)) drop-shadow(0 0 4px rgba(255,218,120,.7));
          animation: cardMicroGlint 1.9s ease-in-out infinite;
        }
        .card-star-aura { filter: blur(.35px); }
        .card-sparkle-swirl-line {
          stroke-dasharray: 17 83;
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 1px rgba(255,255,240,.9)) drop-shadow(0 0 3px rgba(255,214,115,.6));
          animation: cardSparkleSwirlFlow 5.4s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .card-glitter-batch,
          .card-micro-glint,
          .card-sparkle-swirl-line { animation: none !important; }
          .card-glitter-batch { opacity: .82; }
          .card-micro-glint { opacity: .6; }
          .card-sparkle-swirl-line { opacity: .72; stroke-dasharray: none; }
        }
      `}</style>}
    </div>
  );
}
