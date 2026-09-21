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
  effectColor?: string | null;
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
  2: { name: "#4a4032", description: "#5b5143" },
  3: { name: "#4a4032", description: "#5b5143" },
  4: { name: "#573b72", description: "#6b4c81" },
  5: { name: "#7a3d18", description: "#7f5528" },
};

// Use the same title position at every card size, including the collection grid.
const TITLE_Y_NUDGE: Partial<Record<CardRarity, number>> = {
  2: .75,
  3: .9,
};

const RARITY_SPARKLE_COUNT: Record<CardRarity, number> = {
  1: 0,
  2: 44,
  3: 96,
  4: 148,
  5: 220,
};

const RARITY_GLINT_COUNT: Record<CardRarity, number> = {
  1: 0,
  2: 5,
  3: 14,
  4: 26,
  5: 44,
};

const RARITY_SWIRL_COUNT: Record<CardRarity, number> = {
  1: 0,
  2: 1,
  3: 1,
  4: 2,
  5: 3,
};

const RARITY_SPARKLE_STYLE: Record<CardRarity, { opacity: number; glow: string; color: string }> = {
  1: { opacity: 0, glow: "none", color: "#fff4ca" },
  2: { opacity: .67, glow: "drop-shadow(0 0 1px rgba(252,241,180,.58))", color: "#e9f7cd" },
  3: { opacity: .79, glow: "drop-shadow(0 0 1.5px rgba(181,225,255,.66))", color: "#d8edff" },
  4: { opacity: .89, glow: "drop-shadow(0 0 2px rgba(226,183,255,.72))", color: "#efddff" },
  5: { opacity: 1, glow: "drop-shadow(0 0 2px rgba(255,215,119,.8))", color: "#fff0b6" },
};

function normalizeEffectColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : null;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Keep the tiny glitter deterministic but distribute it across the whole artwork.
// Only five batch opacity animations are used, so even a 5-star card stays light on mobile.
const CARD_GLITTER_POINTS = Array.from({ length: 220 }, (_, index) => {
  const xSeed = ((index * 37 + 11) % 101) / 100;
  const ySeed = ((index * 61 + 23) % 151) / 150;
  const drift = Math.sin(index * 1.73) * 2.4;
  return {
    x: Math.max(4, Math.min(96, 6 + xSeed * 88 + drift)),
    y: 6 + ySeed * 138,
    radius: .11 + ((index * 17) % 6) * .025 + (index % 19 === 0 ? .06 : 0),
    group: index % 5,
  };
});

const CARD_GLINT_POINTS = Array.from({ length: 44 }, (_, index) => ({
  x: 9 + ((index * 37 + 7) % 83),
  y: 9 + ((index * 61 + 19) % 131),
  size: .38 + ((index * 11) % 5) * .075,
  delay: ((index * 17) % 29) / 10,
}));

const CARD_BORDER_GLINT_POINTS = Array.from({ length: 36 }, (_, index) => {
  const lane = index % 4;
  const offset = ((index * 29 + 13) % 89) / 89;
  if (lane === 0) return { x: 7 + offset * 86, y: 7 + (index % 3) * 2.4, size: .42 + (index % 4) * .07, delay: ((index * 13) % 31) / 10 };
  if (lane === 1) return { x: 91 + (index % 3) * 1.6, y: 14 + offset * 119, size: .42 + (index % 4) * .07, delay: ((index * 13) % 31) / 10 };
  if (lane === 2) return { x: 7 + offset * 86, y: 141 - (index % 3) * 2.4, size: .42 + (index % 4) * .07, delay: ((index * 13) % 31) / 10 };
  return { x: 9 - (index % 3) * 1.6, y: 14 + offset * 119, size: .42 + (index % 4) * .07, delay: ((index * 13) % 31) / 10 };
});

const CARD_SWIRL_PATHS = [
  "M 16 133 C 10 116, 18 101, 32 101 C 47 101, 50 114, 41 121 C 31 129, 20 118, 25 108 C 31 97, 54 97, 62 82 C 70 67, 59 55, 47 59 C 35 63, 35 75, 43 80 C 51 84, 59 76, 55 68",
  "M 84 132 C 90 115, 82 101, 68 101 C 53 101, 50 114, 59 121 C 69 129, 80 118, 75 108 C 69 97, 46 97, 38 82 C 30 67, 41 55, 53 59 C 65 63, 65 75, 57 80 C 49 84, 41 76, 45 68",
  "M 31 72 C 24 57, 32 43, 46 43 C 59 43, 63 55, 55 62 C 47 69, 37 61, 41 52 C 46 42, 66 39, 72 27 C 76 19, 72 14, 65 13",
] as const;

export default function CardPreview({
  rarity,
  artworkUrl,
  effectColor,
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

  const customEffectColor = normalizeEffectColor(effectColor);
  const activeEffectColor = customEffectColor ?? RARITY_SPARKLE_STYLE[rarity].color;
  const sparkleGlow = customEffectColor
    ? `drop-shadow(0 0 ${rarity >= 4 ? 2 : rarity === 3 ? 1.5 : 1}px ${hexToRgba(activeEffectColor, .72)})`
    : RARITY_SPARKLE_STYLE[rarity].glow;
  const borderGlowBackground = customEffectColor
    ? `linear-gradient(105deg, transparent 0 31%, ${hexToRgba(activeEffectColor, .08)} 37%, ${hexToRgba(activeEffectColor, .52)} 43%, rgba(255,255,255,.95) 49%, ${hexToRgba(activeEffectColor, .72)} 55%, ${hexToRgba(activeEffectColor, .16)} 61%, transparent 68% 100%), linear-gradient(105deg, transparent 0 31%, ${hexToRgba(activeEffectColor, .08)} 37%, ${hexToRgba(activeEffectColor, .52)} 43%, rgba(255,255,255,.95) 49%, ${hexToRgba(activeEffectColor, .72)} 55%, ${hexToRgba(activeEffectColor, .16)} 61%, transparent 68% 100%)`
    : "linear-gradient(105deg, transparent 0 31%, rgba(255,188,32,.08) 37%, rgba(255,214,76,.52) 43%, rgba(255,244,177,1) 49%, rgba(255,202,49,.72) 55%, rgba(255,174,20,.16) 61%, transparent 68% 100%), linear-gradient(105deg, transparent 0 31%, rgba(255,188,32,.08) 37%, rgba(255,214,76,.52) 43%, rgba(255,244,177,1) 49%, rgba(255,202,49,.72) 55%, rgba(255,174,20,.16) 61%, transparent 68% 100%)";
  const borderGlowFilter = customEffectColor
    ? `drop-shadow(0 0 ${2.8 + rarity * .45}px ${hexToRgba(activeEffectColor, .95)}) drop-shadow(0 0 ${6.5 + rarity * .9}px ${hexToRgba(activeEffectColor, .7)}) drop-shadow(0 0 ${11 + rarity * 1.1}px ${hexToRgba(activeEffectColor, .36)})`
    : `drop-shadow(0 0 ${2.8 + rarity * .45}px rgba(255,224,116,.95)) drop-shadow(0 0 ${6.5 + rarity * .9}px rgba(255,184,34,.7)) drop-shadow(0 0 ${11 + rarity * 1.1}px rgba(255,146,18,.36))`;

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
    const highRarityTitle = isName && rarity >= 4;
    const curvedTitle = isName && (layout.nameCurve ?? 0) > 0;
    const metrics = fieldMetrics(field);
    const titleYNudge = isName && !editable && textSize !== "scaled"
      ? (TITLE_Y_NUDGE[rarity] ?? 0)
      : 0;
    const selected = editable && selectedField === field;
    const clickable = !editable && !isName && !!onDescriptionClick;
    const rarityTextStyle = RARITY_TEXT_STYLES[rarity];
    // Saved font sizes describe a 240px-wide card, rather than fixed screen pixels.
    const relativeFontSize = `${(isName ? layout.nameFontSize : layout.descriptionFontSize) / 240 * 100}cqw`;
    // Title limits scale with the card, so the grid is a smaller rendering of
    // the detail title rather than a separate pixel-sized layout.
    const fontSize = isName && (textSize === "detail" || textSize === "inventory")
      ? `clamp(5cqw, ${relativeFontSize}, 7.5cqw)`
      : textSize === "detail"
        ? `clamp(16px, ${relativeFontSize}, 22px)`
        : textSize === "inventory"
          ? `clamp(6px, ${relativeFontSize}, 9px)`
          : relativeFontSize;
    const minimumFontSize = textSize === "detail" ? (isName ? 16 : 14)
      : textSize === "inventory" ? (isName ? 7 : 6) : undefined;
    return (
      <div
        data-testid={`card-layout-box-${field}`}
        data-card-title-rarity={highRarityTitle ? rarity : undefined}
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
          top: `${metrics.y + titleYNudge}%`,
          width: `${metrics.width}%`,
          height: `${metrics.height}%`,
          zIndex: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isName ? "1% 3%" : "2% 4%",
          boxSizing: "border-box",
          overflow: curvedTitle ? "visible" : "hidden",
          textAlign: "center",
          color: isName ? rarityTextStyle.name : rarityTextStyle.description,
          fontFamily: isName ? "'Cinzel', 'Palatino Linotype', serif" : "Georgia, serif",
          fontWeight: isName ? 700 : 500,
          fontSize,
          lineHeight: isName ? 1.05 : 1.18,
          letterSpacing: isName ? ".05em" : "normal",
          textShadow: "0 1px 0 rgba(255,255,255,.58), 0 0 2px rgba(255,244,205,.28)",
          transform: depth3d ? "translateZ(22px)" : undefined,
          backfaceVisibility: "hidden",
          border: editable ? `1.5px dashed ${selected ? "#7cf5b2" : "rgba(255,224,128,.78)"}` : "none",
          background: editable ? (selected ? "rgba(22,90,58,.34)" : "rgba(8,8,5,.22)") : "transparent",
          boxShadow: editable && selected ? "0 0 10px rgba(124,245,178,.42)" : "none",
          cursor: editable ? "grab" : clickable ? "pointer" : "default",
          touchAction: editable ? "none" : "auto",
          userSelect: "none",
        }}
      >
        <CardFittedText text={isName ? (name || "CARD NAME") : (description || "Card description")} preferredFontSize={fontSize} minimumFontSize={minimumFontSize} curve={isName ? (layout.nameCurve ?? 0) : 0} />
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
              filter: sparkleGlow,
              overflow: "hidden",
            }}
          >
            {[0, 1, 2, 3, 4].map(group => (
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
            <defs>
              {CARD_SWIRL_PATHS.slice(0, RARITY_SWIRL_COUNT[rarity]).map((_, index) => (
                <linearGradient
                  key={`swirl-gradient-${index}`}
                  id={`card-swirl-gradient-${rarity}-${index}`}
                  gradientUnits="userSpaceOnUse"
                  x1={index % 2 === 0 ? 8 : 92}
                  y1="145"
                  x2={index % 2 === 0 ? 82 : 18}
                  y2="12"
                >
                  <stop offset="0%" stopColor={activeEffectColor} stopOpacity=".98" />
                  <stop offset="26%" stopColor={activeEffectColor} stopOpacity=".68" />
                  <stop offset="60%" stopColor={activeEffectColor} stopOpacity=".24" />
                  <stop offset="100%" stopColor={activeEffectColor} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {CARD_SWIRL_PATHS.slice(0, RARITY_SWIRL_COUNT[rarity]).map((path, index) => (
              <path
                key={index}
                className="card-sparkle-swirl-line"
                d={path}
                fill="none"
                stroke={`url(#card-swirl-gradient-${rarity}-${index})`}
                strokeWidth={.28 + rarity * .035}
                strokeLinecap="round"
                style={{ animationDelay: `-${index * .85}s`, animationDuration: `${3.4 + index * .45}s` }}
              />
            ))}
          </svg>
        )}
      </div>
      {showSparkles && rarity >= 3 && (
        <div
          data-testid="card-border-gold-glow"
          aria-hidden="true"
          className="card-border-gold-glow"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            pointerEvents: "none",
            transform: depth3d ? "translateZ(20px)" : undefined,
            WebkitMaskImage: `url("${CARD_BORDER_ASSETS[rarity]}")`,
            maskImage: `url("${CARD_BORDER_ASSETS[rarity]}")`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            backgroundImage: borderGlowBackground,
            backgroundSize: "190% 100%, 190% 100%",
            backgroundRepeat: "no-repeat, no-repeat",
            backgroundPosition: "0% 0, 190% 0",
            mixBlendMode: "screen",
            filter: borderGlowFilter,
            opacity: .82 + (rarity - 3) * .06,
          }}
        />
      )}
      {showSparkles && rarity === 5 && (
        <div
          data-testid="card-border-sparkles"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            pointerEvents: "none",
            transform: depth3d ? "translateZ(22px)" : undefined,
            WebkitMaskImage: `url("${CARD_BORDER_ASSETS[rarity]}")`,
            maskImage: `url("${CARD_BORDER_ASSETS[rarity]}")`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
          }}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 150" preserveAspectRatio="none">
            {CARD_BORDER_GLINT_POINTS.map((glint, index) => (
              <g
                key={index}
                className="card-border-glint"
                style={{
                  animationDelay: `-${(index / CARD_BORDER_GLINT_POINTS.length * 3.2).toFixed(2)}s`,
                  animationDuration: "3.2s",
                }}
              >
                <circle cx={glint.x} cy={glint.y} r={glint.size * 2.5} fill="rgba(255,218,112,.14)" />
                <path
                  d={`M ${glint.x} ${glint.y - glint.size * 1.45}
                    L ${glint.x + glint.size * .2} ${glint.y - glint.size * .2}
                    L ${glint.x + glint.size * 1.45} ${glint.y}
                    L ${glint.x + glint.size * .2} ${glint.y + glint.size * .2}
                    L ${glint.x} ${glint.y + glint.size * 1.45}
                    L ${glint.x - glint.size * .2} ${glint.y + glint.size * .2}
                    L ${glint.x - glint.size * 1.45} ${glint.y}
                    L ${glint.x - glint.size * .2} ${glint.y - glint.size * .2} Z`}
                  fill="rgba(255,255,241,.98)"
                  stroke="rgba(255,218,112,.95)"
                  strokeWidth=".1"
                />
              </g>
            ))}
          </svg>
        </div>
      )}
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
          zIndex: 5, display: "flex", justifyContent: "center", alignItems: "center",
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
          0%, 100% { opacity: .18; }
          28% { opacity: .95; }
          70% { opacity: .42; }
        }
        @keyframes cardBorderGlowTravel {
          from { background-position: 0% 0, 190% 0; }
          to { background-position: -190% 0, 0% 0; }
        }
        @keyframes cardBorderGlint {
          0%, 100% { opacity: .08; transform: scale(.62) rotate(0deg); }
          22% { opacity: .92; transform: scale(1.08) rotate(6deg); }
          50% { opacity: .18; transform: scale(.74) rotate(0deg); }
          72% { opacity: .8; transform: scale(1) rotate(-5deg); }
        }
        @keyframes cardTitleHologoldSweep {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .card-glitter-batch { will-change: opacity; }
        .card-glitter-batch-0 { animation: cardGlitterPulseA 2.5s ease-in-out infinite; }
        .card-glitter-batch-1 { animation: cardGlitterPulseB 3s ease-in-out infinite; }
        .card-glitter-batch-2 { animation: cardGlitterPulseC 3.6s ease-in-out infinite; }
        .card-glitter-batch-3 { animation: cardGlitterPulseD 4.2s ease-in-out infinite; }
        .card-glitter-batch-4 { animation: cardGlitterPulseB 3.35s ease-in-out -1.1s infinite; }
        .card-micro-glint {
          opacity: .28;
          transform-box: fill-box;
          transform-origin: center;
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 1px rgba(255,255,244,.95)) drop-shadow(0 0 4px rgba(255,218,120,.7));
          animation: cardMicroGlint 1.9s ease-in-out infinite;
        }
        .card-star-aura { filter: blur(.35px); }
        .card-border-glint {
          opacity: .3;
          transform-box: fill-box;
          transform-origin: center;
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 1px rgba(255,255,240,.96)) drop-shadow(0 0 4px rgba(255,193,58,.8));
          animation: cardBorderGlint 2.15s ease-in-out infinite;
        }
        [data-card-title-rarity="4"] > span,
        [data-card-title-rarity="5"] > span {
          color: transparent;
          -webkit-text-fill-color: transparent;
          background-image: linear-gradient(100deg, #8d5513 0%, #d99c31 18%, #fff3bd 34%, #c57918 47%, #fff8d8 61%, #e7b447 76%, #8e5413 100%);
          background-size: 230% 100%;
          background-clip: text;
          -webkit-background-clip: text;
          animation: cardTitleHologoldSweep 7.8s ease-in-out infinite;
        }
        [data-card-title-rarity="4"] .card-curved-title-letter,
        [data-card-title-rarity="5"] .card-curved-title-letter {
          color: transparent;
          -webkit-text-fill-color: transparent;
          background-image: linear-gradient(100deg, #8d5513 0%, #d99c31 18%, #fff3bd 34%, #c57918 47%, #fff8d8 61%, #e7b447 76%, #8e5413 100%);
          background-size: 230% 100%;
          background-clip: text;
          -webkit-background-clip: text;
          animation: cardTitleHologoldSweep 7.8s ease-in-out infinite;
        }
        .card-sparkle-swirl-line {
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 .7px rgba(255,255,240,.88)) drop-shadow(0 0 2px rgba(255,214,115,.5));
          animation: cardSparkleSwirlFlow 3.4s ease-in-out infinite;
        }
        .card-border-gold-glow {
          animation: cardBorderGlowTravel 11.5s linear infinite;
          will-change: background-position;
        }
        @media (prefers-reduced-motion: reduce) {
          .card-glitter-batch,
          .card-micro-glint,
          .card-border-glint,
          .card-sparkle-swirl-line,
          .card-border-gold-glow,
          [data-card-title-rarity="4"] > span,
          [data-card-title-rarity="5"] > span,
          [data-card-title-rarity="4"] .card-curved-title-letter,
          [data-card-title-rarity="5"] .card-curved-title-letter { animation: none !important; }
          .card-glitter-batch { opacity: .82; }
          .card-micro-glint,
          .card-border-glint { opacity: .6; }
          .card-sparkle-swirl-line { opacity: .56; }
          .card-border-gold-glow { background-position: 0% 0, 190% 0; opacity: .88; }
          [data-card-title-rarity="4"] > span,
          [data-card-title-rarity="5"] > span,
          [data-card-title-rarity="4"] .card-curved-title-letter,
          [data-card-title-rarity="5"] .card-curved-title-letter { background-position: 50% 50%; filter: drop-shadow(0 0 3px rgba(255,194,56,.48)); }
        }
      `}</style>}
    </div>
  );
}
