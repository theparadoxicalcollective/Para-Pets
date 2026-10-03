import { useLayoutEffect, useRef, useState } from "react";
import ActivePetPlacement from "./ActivePetPlacement";
import PetAnimator from "./PetAnimator";
export default function PetPlacementPreview({ templateId, form, view }: { templateId: string; form: "base" | "evolution"; view: "front" | "back" }) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(300);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => setSize(node.clientWidth || 300);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <section className="mb-4 rounded-lg p-3" style={{ border: "1px solid #8b5e3c" }}>
    <h4 style={{ color: "#f0c040" }}>Active pet page placement</h4>
    <p className="text-xs" style={{ color: "#a89878" }}>Drag the oval and resize the entire pet. Save to apply on the active pet page.</p>
    <div ref={container} style={{ height: 1000 * size / 390 }}>
      <div style={{ width: 390, height: 1000, position: "relative", display: "flex", justifyContent: "center", transform: `scale(${size / 390})`, transformOrigin: "left top" }}>
      <ActivePetPlacement templateId={templateId} form={form} view={view} admin>
        <PetAnimator petTemplateId={templateId} artworkForm={form} mode="idle" view={view} size={1000} />
      </ActivePetPlacement>
      </div>
    </div>
  </section>;
}
