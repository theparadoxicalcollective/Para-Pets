import { useEffect, useMemo, useState, type PointerEventHandler, type ReactNode } from "react";
import { getVisibleImageAnalysis, type AnalyzedVisibleImage } from "@/lib/visibleImageBounds";

type HomeSceneAssetImageProps = {
  src: string;
  alt: string;
  size: number;
  selected?: boolean;
  flipped?: boolean;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
  onLostPointerCapture?: PointerEventHandler<HTMLDivElement>;
  controls?: ReactNode;
};

type VisibleRect = { left: number; top: number; width: number; height: number };

function visibleRectInSquare(analysis: AnalyzedVisibleImage, size: number, flipped: boolean): VisibleRect {
  const scale = Math.min(size / analysis.sourceWidth, size / analysis.sourceHeight);
  const renderedWidth = analysis.sourceWidth * scale;
  const renderedHeight = analysis.sourceHeight * scale;
  const imageLeft = (size - renderedWidth) / 2;
  const imageTop = (size - renderedHeight) / 2;

  const visibleWidth = analysis.bounds.width * scale;
  const visibleHeight = analysis.bounds.height * scale;
  const rawLeft = imageLeft + analysis.bounds.left * scale;
  const left = flipped ? size - rawLeft - visibleWidth : rawLeft;

  return {
    left,
    top: imageTop + analysis.bounds.top * scale,
    width: visibleWidth,
    height: visibleHeight,
  };
}

/**
 * Keeps the placed Home item on its original full image canvas while making
 * the selection indicator hug only visible (non-transparent) artwork.
 */
export function HomeSceneAssetImage({
  src,
  alt,
  size,
  selected = false,
  flipped = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  controls,
}: HomeSceneAssetImageProps) {
  const [analysis, setAnalysis] = useState<AnalyzedVisibleImage | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setAnalysis(null);
    setAnalysisFailed(false);
    getVisibleImageAnalysis(src).then(
      result => { if (active) setAnalysis(result); },
      () => { if (active) setAnalysisFailed(true); },
    );
    return () => { active = false; };
  }, [src]);

  const rect = useMemo(
    () => analysis ? visibleRectInSquare(analysis, size, flipped) : null,
    [analysis, size, flipped],
  );

  return (
    <div
      className="relative"
      style={{ width: size, height: size, userSelect: "none", pointerEvents: "none" }}
      data-testid="home-scene-asset-image"
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          transform: flipped ? "scaleX(-1)" : undefined,
          filter: selected
            ? "drop-shadow(0 0 2px rgba(255,235,130,0.95)) drop-shadow(0 0 5px rgba(255,215,0,0.92)) drop-shadow(0 0 10px rgba(255,180,20,0.62)) drop-shadow(0 2px 6px rgba(0,0,0,0.45))"
            : "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
      {selected && controls && (
        <div
          data-testid="home-scene-visible-controls"
          className="absolute"
          style={{
            left: rect ? rect.left + rect.width / 2 : size / 2,
            top: rect ? Math.max(0, rect.top - 6) : 0,
            transform: "translate(-50%, -100%)",
            zIndex: 20,
            pointerEvents: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {controls}
        </div>
      )}
      {(rect || analysisFailed) && (
        <div
          aria-hidden="true"
          data-testid="home-scene-visible-hit-target"
          className="absolute"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onLostPointerCapture}
          style={{
            ...(rect ? {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            } : {
              inset: 0,
            }),
            pointerEvents: "auto",
            touchAction: "none",
            cursor: selected ? "grab" : "pointer",
            outline: "none",
            boxShadow: "none",
            borderRadius: 4,
          }}
        />
      )}
    </div>
  );
}

export { visibleRectInSquare };
