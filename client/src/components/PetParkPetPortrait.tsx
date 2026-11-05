import { useEffect, useRef, useState } from "react";
import PetAnimator from "@/components/PetAnimator";
import MiniPetRenderer from "@/components/MiniPetRenderer";

/**
 * Player Detail companion artwork, sized for Pet Park pickers and equipped slots.
 * Only mount the relatively expensive part/costume tree when it nears view.
 */
export default function PetParkPetPortrait({
  petTemplateId, petInventoryId, hatchedImageUrl = null, size = 110, access = "owner",
  className = "",
}: {
  petTemplateId?: string | null;
  petInventoryId: string;
  hatchedImageUrl?: string | null;
  size?: number;
  access?: "owner" | "public";
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const element = holder.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={holder} className={`relative flex shrink-0 items-center justify-center ${className}`}
    data-testid="pet-park-pet-portrait" style={{ width: size, height: size }}>
    {visible && petTemplateId ? (
      <PetAnimator petTemplateId={petTemplateId} petInventoryId={petInventoryId}
        costumeAccess={access} mode="static" size={size} fillContainer fitVisible
        style={{ filter: "drop-shadow(0 3px 5px rgba(0,0,0,.4))" }} />
    ) : hatchedImageUrl ? (
      <img src={hatchedImageUrl} alt="" draggable={false} className="h-full w-full object-contain" />
    ) : (
      <span aria-hidden="true" className="text-xs text-amber-200/50">Pet</span>
    )}
    {visible && <div className="pointer-events-none absolute bottom-0 left-0 h-[34%] w-[34%]">
      <MiniPetRenderer petInventoryId={petInventoryId} access={access} animated={false} />
    </div>}
  </div>;
}
