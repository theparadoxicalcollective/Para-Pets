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
  2: 0,
  3: 5,
  4: 9,
  5: 14,
};

const RARITY_SPARKLE_STYLE: Record<CardRarity, { opacity: number; duration: string; glow: string }> = {
  1: { opacity: 0, duration: "0s", glow: "none" },
  2: { opacity: 0, duration: "0s", glow: "none" },
  3: { opacity: 0.58, duration: "3.4s", glow: "drop-shadow(0 0 3px rgba(255,225,120,.55))" },
  4: { opacity: 0.78, duration: "2.8s", glow: "drop-shadow(0 0 5px rgba(255,225,120,.72))" },
  5: { opacity: 1, duration: "2.15s", glow: "drop-shadow(0 0 7px rgba(255,235,150,.9))" },
};

const CARD_SPARKLE_POINTS = [
  { left: 14, top: 18, size: 2.2, delay: 0.0 },
  { left: 83, top: 20, size: 1.8, delay: 0.5 },
  { left: 18, top: 47, size: 1.6, delay: 1.0 },
  { left: 80, top: 44, size: 2.4, delay: 1.4 },
  { left: 30, top: 31, size: 1.5, delay: 0.8 },
  { left: 69, top: 32, size: 1.9, delay: 1.8 },
  { left: 15, top: 68, size: 2.0, delay: 1.2 },
  { left: 84, top: 70, size: 1.5, delay: 0.3 },
  { left: 29, top: 82, size: 2.2, delay: 1.6 },
  { left: 70, top: 81, size: 1.8, delay: 0.9 },
  { left: 48, top: 24, size: 1.4, delay: 2.0 },
  { left: 53, top: 57, size: 1.6, delay: 0.2 },
  { left: 26, top: 60, size: 1.3, delay: 2.2 },
  { left: 74, top: 58, size: 1.4, delay: 1.1 },
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
  selectedField = "name",
  onSelectField,
  onLayoutChange,
}: CardPreviewProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const sparkleBackground = RARITY_SPARKLE_COUNT[rarity] > 0
    ? CARD_SPARKLE_POINTS.slice(0, RARITY_SPARKLE_COUNT[rarity])
        .map((sparkle) => `radial-gradient(circle ${Math.max(sparkle.size * 2.6, 4.2)}cqw at ${sparkle.left}% ${sparkle.top}%, rgba(255,255,245,1) 0 5%, rgba(255,246,188,.98) 10%, rgba(255,210,82,.9) 24%, rgba(255,178,28,.55) 42%, rgba(255,190,52,0) 68%)`)
        .join(", ")
    : undefined;

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
      {/* Tuck the artwork edges beneath the frame and its name/description plates. */}
      <div
        data-testid="card-artwork-window"
        style={{
          position: "absolute",
          inset: "12% 10%",
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
            boxShadow: "inset 0 0 12px rgba(0,0,0,.48)",
          }}
        />
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
      <style>{`
        @keyframes cardRaritySparkleShimmer {
          0%, 100% { opacity: .65; }
          38% { opacity: 1; }
          62% { opacity: .8; }
        }
        .card-rarity-sparkle-shimmer {
          animation: cardRaritySparkleShimmer 3s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .card-rarity-sparkle-shimmer { animation: none !important; }
        }
      `}</style>
      {sparkleBackground && (
        <div
          data-testid="card-rarity-sparkles"
          aria-hidden="true"
          className="absolute"
          style={{
            inset: 0,
            zIndex: 5,
            pointerEvents: "none",
            opacity: RARITY_SPARKLE_STYLE[rarity].opacity,
            filter: RARITY_SPARKLE_STYLE[rarity].glow,
            transform: depth3d ? "translateZ(38px)" : undefined,
            backfaceVisibility: "hidden",
          }}
        >
          <div
            className="absolute inset-0 card-rarity-sparkle-shimmer"
            style={{
              backgroundImage: sparkleBackground,
              animationDuration: RARITY_SPARKLE_STYLE[rarity].duration,
            }}
          >
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
              {CARD_SPARKLE_POINTS.slice(0, RARITY_SPARKLE_COUNT[rarity]).map((sparkle, index) => {
                const x = sparkle.left;
                const y = sparkle.top * 1.5;
                const ray = sparkle.size * 0.55;
                return (
                  <g key={index}>
                    <circle cx={x} cy={y} r={ray * 2.1} fill="rgba(255,197,65,.35)" />
                    <path
                      d={`M ${x} ${y - ray} L ${x + ray * .18} ${y - ray * .18} L ${x + ray} ${y} L ${x + ray * .18} ${y + ray * .18} L ${x} ${y + ray} L ${x - ray * .18} ${y + ray * .18} L ${x - ray} ${y} L ${x - ray * .18} ${y - ray * .18} Z`}
                      fill="#fffbea"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
