import { useEffect, useRef, useState } from "react";
import { containVisibleArtwork, getVisibleImageAnalysis, type AnalyzedVisibleImage } from "@/lib/visibleImageBounds";

type VisibleAssetImageProps = {
  src: string;
  alt: string;
  className?: string;
};

const warnedUrls = new Set<string>();

function warnOnce(src: string, error: unknown) {
  if (import.meta.env.DEV && !warnedUrls.has(src)) {
    warnedUrls.add(src);
    console.warn("Visible item artwork analysis failed; using contain fallback.", { src, error });
  }
}

export function VisibleAssetImage({ src, alt, className }: VisibleAssetImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<AnalyzedVisibleImage | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let active = true;
    setAnalysis(null);
    setFallback(false);
    getVisibleImageAnalysis(src).then(
      (result) => active && setAnalysis(result),
      (error) => {
        if (!active) return;
        setFallback(true);
        warnOnce(src, error);
      },
    );
    return () => { active = false; };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return;
    const draw = () => {
      try {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(rect.height * ratio);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unsupported");
        context.scale(ratio, ratio);
        const placement = containVisibleArtwork(analysis.bounds, rect.width, rect.height);
        context.drawImage(
          analysis.image,
          analysis.bounds.left,
          analysis.bounds.top,
          analysis.bounds.width,
          analysis.bounds.height,
          placement.x,
          placement.y,
          placement.width,
          placement.height,
        );
      } catch (error) {
        setFallback(true);
        warnOnce(src, error);
      }
    };
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [analysis, src]);

  if (fallback) return <img className={className} src={src} alt={alt} draggable={false} />;
  return <canvas ref={canvasRef} className={className} role="img" aria-label={alt} data-visible-asset-state={analysis ? "normalized" : "loading"} />;
}
