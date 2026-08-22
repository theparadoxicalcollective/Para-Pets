import { useEffect, useState } from "react";

const PORTAL_ASSET = "/world-assets/worlds/haunted_woods/soul-exchange-portal-v4.svg";

interface SoulExchangePortalProps {
  alt?: string;
}

/**
 * Haunted Woods Soul Exchange marker.
 *
 * The artwork itself is transparent and animated. This wrapper adds a very
 * small entrance pulse so the marker reads as a magical doorway rather than
 * a static map icon. Pointer events stay disabled because WorldLocations owns
 * dragging and clicking for the location node.
 */
export default function SoulExchangePortal({ alt = "The Soul Exchange" }: SoulExchangePortalProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setReady(true);
    image.src = PORTAL_ASSET;
  }, []);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{
        opacity: ready ? 1 : 0,
        transform: ready ? "scale(1)" : "scale(.9)",
        transition: "opacity .35s ease, transform .5s cubic-bezier(.2,.8,.2,1)",
        willChange: "opacity, transform",
      }}
    >
      <img
        src={PORTAL_ASSET}
        alt={alt}
        draggable={false}
        className="w-full h-full object-contain"
        style={{
          filter:
            "drop-shadow(0 4px 7px rgba(0,0,0,.7)) drop-shadow(0 0 5px rgba(168,85,247,.7)) drop-shadow(0 0 16px rgba(124,58,237,.35))",
        }}
      />
    </div>
  );
}
