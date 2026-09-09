import { useState } from "react";
import { Package } from "lucide-react";
import { getNextZ } from "@/lib/layerManager";

export interface ItemDetailCardItem {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
}

export default function ItemDetailCard({
  item,
  onClose,
}: {
  item: ItemDetailCardItem;
  onClose: () => void;
}) {
  const [zIndex] = useState(() => getNextZ());
  const description = item.description?.trim() || "No description has been added yet.";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-detail-card-title"
      data-testid="modal-item-description-card"
      onClick={onClose}
    >
      <article
        className="relative w-full max-w-sm overflow-hidden rounded-2xl p-6 text-center"
        style={{
          background: "linear-gradient(155deg, rgba(44,24,8,0.99), rgba(13,8,3,0.99))",
          border: "2px solid rgba(240,192,64,0.62)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.75), 0 0 26px rgba(240,192,64,0.14)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full font-bold text-amber-200"
          style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(240,192,64,0.38)" }}
          aria-label="Close item details"
          data-testid="button-close-item-description-card"
        >
          ✕
        </button>

        <div
          className="mx-auto mb-4 flex h-36 w-36 items-center justify-center rounded-2xl"
          style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(240,192,64,0.18)" }}
        >
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain p-2" />
          ) : (
            <Package className="h-16 w-16 text-amber-300/50" aria-hidden="true" />
          )}
        </div>

        <h2 id="item-detail-card-title" className="font-fantasy text-xl tracking-wider text-[#f0c040]">
          {item.name}
        </h2>
        <p
          className="mt-3 rounded-xl px-4 py-3 font-fantasy text-sm leading-relaxed tracking-wide text-[#d8c7a5]"
          style={{ background: "rgba(0,0,0,0.24)", border: "1px solid rgba(240,192,64,0.12)", whiteSpace: "pre-wrap" }}
          data-testid="text-item-description-card"
        >
          {description}
        </p>
      </article>
    </div>
  );
}
