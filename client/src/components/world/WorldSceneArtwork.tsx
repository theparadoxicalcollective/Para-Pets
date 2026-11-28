import type { ImgHTMLAttributes } from "react";
import { worldArtworkUrl } from "@shared/worlds/worldArtworkSize";

/** Only new player scenes use responsive copies. Editor and original gameplay
 * retain the untouched original artwork URLs. Fall back to the original if a
 * variant is temporarily unavailable (including during a rolling deployment). */
export default function WorldSceneArtwork({
  imageUrl, cssSize, ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { imageUrl: string; cssSize: number }) {
  const src = worldArtworkUrl(imageUrl, cssSize, typeof window === "undefined" ? 1 : window.devicePixelRatio);
  return <img {...props} src={src} decoding="async"
    onError={event => {
      const image = event.currentTarget;
      if (image.getAttribute("src") !== imageUrl) image.src = imageUrl;
    }} />;
}
