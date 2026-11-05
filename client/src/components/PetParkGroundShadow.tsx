import { useEffect, useState } from "react";
import { getVisibleImageAnalysis, type AnalyzedVisibleImage } from "@/lib/visibleImageBounds";

/** Locate the visible feet/base inside an unchanged square object-contain box. */
export function parkArtworkShadow(art: Pick<AnalyzedVisibleImage, "sourceWidth" | "sourceHeight" | "bounds">) {
  const fit = 1 / Math.max(art.sourceWidth, art.sourceHeight);
  const width = art.bounds.width * fit;
  const height = art.bounds.height * fit;
  return {
    left: (1 - art.sourceWidth * fit) / 2 + art.bounds.centerX * fit,
    top: (1 - art.sourceHeight * fit) / 2 + art.bounds.bottom * fit - height * 0.025,
    width: width * 0.9,
    height: Math.max(0.025, height * 0.1),
  };
}

/** Contact shadow follows visible artwork without moving saved placements. */
export default function PetParkGroundShadow({ kind, imageUrl }: { kind: "pet" | "building" | "decor"; imageUrl?: string }) {
  const [analysis, setAnalysis] = useState<{ url: string; art: AnalyzedVisibleImage } | null>(null);
  useEffect(() => {
    if (!imageUrl || kind === "pet") return;
    let cancelled = false;
    void getVisibleImageAnalysis(imageUrl).then(art => {
      if (!cancelled) setAnalysis({ url: imageUrl, art });
    }).catch(() => { /* Cross-origin/unreadable images retain a safe box-based shadow. */ });
    return () => { cancelled = true; };
  }, [imageUrl, kind]);
  const isPet = kind === "pet";
  const contact = analysis && analysis.url === imageUrl ? parkArtworkShadow(analysis.art)
    : { left: 0.5, top: 0.93, width: kind === "building" ? 0.64 : 0.56, height: 0.1 };
  return <span aria-hidden="true" data-testid="pet-park-contact-shadow"
    className="pointer-events-none absolute rounded-full"
    style={{
      left: `${(isPet ? 0.5 : contact.left) * 100}%`,
      top: `${(isPet ? 0.795 : contact.top) * 100}%`,
      width: `${(isPet ? 0.58 : contact.width) * 100}%`,
      height: `${(isPet ? 0.11 : contact.height) * 100}%`,
      transform: "translate(-50%, -50%)",
      background: isPet
        ? "radial-gradient(ellipse, rgba(13,29,17,.45) 0%, rgba(15,34,19,.22) 52%, rgba(15,34,19,0) 78%)"
        : "radial-gradient(ellipse, rgba(8,19,10,.68) 0%, rgba(10,24,12,.42) 38%, rgba(14,31,16,.16) 65%, transparent 82%)",
      filter: "blur(2px)",
    }} />;
}
