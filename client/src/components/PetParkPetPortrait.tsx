import { memo, useEffect, useRef, useState } from "react";
import PetAnimator from "@/components/PetAnimator";
import MiniPetRenderer from "@/components/MiniPetRenderer";

/**
 * Player Detail companion artwork, sized for Pet Park pickers and equipped slots.
 * Only mount the relatively expensive part/costume tree when it nears view.
 */
export default memo(function PetParkPetPortrait({
  petTemplateId, petInventoryId, hatchedImageUrl = null, size = 110, access = "owner",
  className = "", mode = "static", reducedMotion = false,
}: {
  petTemplateId?: string | null;
  petInventoryId: string;
  hatchedImageUrl?: string | null;
  size?: number;
  access?: "owner" | "public";
  className?: string;
  mode?: "static" | "idle" | "sleep";
  reducedMotion?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = holder.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // Track both entering AND leaving the visible room. A previous one-shot
    // observer kept every pet's part/costume layers mounted after the camera
    // panned past them, making a 20–25 pet interior increasingly expensive.
    const observer = new IntersectionObserver(entries => {
      const nearViewport = entries.some(entry => entry.isIntersecting);
      setVisible(current => current === nearViewport ? current : nearViewport);
    }, { rootMargin: "120px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={holder} className={`relative flex shrink-0 items-center justify-center ${className}`}
    data-testid="pet-park-pet-portrait" style={{ width: size, height: size }}>
    {visible && petTemplateId ? (
      <PetAnimator petTemplateId={petTemplateId} petInventoryId={petInventoryId}
        costumeAccess={access} mode={reducedMotion ? "static" : mode} size={size} fillContainer fitVisible
        style={{ filter: "drop-shadow(0 3px 5px rgba(0,0,0,.4))" }} />
    ) : hatchedImageUrl ? (
      <img src={hatchedImageUrl} alt="" draggable={false}
        className={`h-full w-full object-contain ${mode === "sleep" && !reducedMotion ? "pet-park-rest" : ""}`} />
    ) : (
      <span aria-hidden="true" className="text-xs text-amber-200/50">Pet</span>
    )}
    {visible && <div className="pointer-events-none absolute bottom-0 left-0 h-[34%] w-[34%]">
      <MiniPetRenderer petInventoryId={petInventoryId} access={access} animated={false} />
    </div>}
  </div>;
});
