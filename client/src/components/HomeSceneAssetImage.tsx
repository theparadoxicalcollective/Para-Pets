import { useEffect, useMemo, useState } from "react";
import { getVisibleImageAnalysis, type AnalyzedVisibleImage } from "@/lib/visibleImageBounds";

type HomeSceneAssetImageProps = {
  src: string;
  alt: string;
  size: number;
  selected?: boolean;
  flipped?: boolean;
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
      style={{ width: size, height: size, userSelect: "none" }}
      data-testid="home-scene-asset-image"
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          transform: flipped ? "scaleX(-1)" : undefined,
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
          userSelect: "none",
          cursor: "grab",
        }}
      />
      {selected && (
        <div
          aria-hidden="true"
          data-testid="home-scene-visible-selection"
          className="absolute pointer-events-none"
          style={rect ? {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            outline: "2px solid rgba(255,215,0,0.8)",
            outlineOffset: 3,
            borderRadius: 4,
          } : {
            inset: 0,
            outline: analysisFailed ? "2px solid rgba(255,215,0,0.8)" : "1px solid rgba(255,215,0,0.35)",
            outlineOffset: 3,
            borderRadius: 4,
          }}
        />
      )}
    </div>
  );
}

export { visibleRectInSquare };
