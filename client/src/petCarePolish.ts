type ActivePetCareDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  artwork: HTMLElement;
  originalParent: HTMLElement;
  marker: Comment;
  originalStyle: string | null;
  width: number;
  height: number;
  started: boolean;
  frame: number | null;
};

declare global {
  interface Window {
    __paraPetCareDragPolishInstalled?: boolean;
  }
}

const START_DISTANCE_PX = 9;
const VERTICAL_INTENT_RATIO = 1.12;

/**
 * Keeps Pet Care's existing React gesture and mutation logic intact, but moves
 * the original shelf artwork into a top-level compositor layer while dragging.
 * The React drag ghost remains mounted as a fallback and is hidden only after
 * this enhancement has successfully promoted the real artwork.
 */
export function installPetCareDragPolish(): void {
  if (typeof window === "undefined" || window.__paraPetCareDragPolishInstalled) return;
  window.__paraPetCareDragPolishInstalled = true;

  let active: ActivePetCareDrag | null = null;

  const renderPosition = (drag: ActivePetCareDrag) => {
    drag.frame = null;
    if (!drag.started || !drag.artwork.isConnected) return;

    const left = Math.round(drag.x - drag.width / 2);
    // Keep the item slightly above the fingertip so the drop target remains visible.
    const top = Math.round(drag.y - drag.height * 0.72);
    drag.artwork.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  };

  const requestPosition = (drag: ActivePetCareDrag) => {
    if (drag.frame != null) return;
    drag.frame = window.requestAnimationFrame(() => renderPosition(drag));
  };

  const restore = () => {
    const drag = active;
    active = null;
    if (!drag) return;

    if (drag.frame != null) window.cancelAnimationFrame(drag.frame);
    document.body.classList.remove("pet-care-native-item-dragging");

    if (drag.started) {
      drag.artwork.classList.remove("pet-care-native-drag-artwork");
      if (drag.originalStyle == null) drag.artwork.removeAttribute("style");
      else drag.artwork.setAttribute("style", drag.originalStyle);

      if (drag.marker.parentNode) {
        drag.marker.parentNode.insertBefore(drag.artwork, drag.marker);
        drag.marker.remove();
      } else if (drag.originalParent.isConnected) {
        drag.originalParent.appendChild(drag.artwork);
      } else {
        drag.artwork.remove();
      }
    } else {
      drag.marker.remove();
    }
  };

  const beginVisualDrag = (drag: ActivePetCareDrag) => {
    if (drag.started) return;
    drag.started = true;

    const rect = drag.artwork.getBoundingClientRect();
    drag.width = Math.max(1, rect.width);
    drag.height = Math.max(1, rect.height);
    drag.originalStyle = drag.artwork.getAttribute("style");

    drag.originalParent.insertBefore(drag.marker, drag.artwork);
    document.body.appendChild(drag.artwork);
    drag.artwork.classList.add("pet-care-native-drag-artwork");
    drag.artwork.style.left = "0";
    drag.artwork.style.top = "0";
    drag.artwork.style.width = `${drag.width}px`;
    drag.artwork.style.height = `${drag.height}px`;
    drag.artwork.style.transform = "translate3d(-9999px, -9999px, 0)";

    document.body.classList.add("pet-care-native-item-dragging");
    requestPosition(drag);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest<HTMLElement>(".pet-care-overlay .pet-care-item-shelf__item");
    const artwork = item?.querySelector<HTMLElement>(".pet-care-item-shelf__visible-artwork");
    if (!item || !artwork) return;

    restore();
    active = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      artwork,
      originalParent: artwork.parentElement as HTMLElement,
      marker: document.createComment("pet-care-drag-origin"),
      originalStyle: null,
      width: 1,
      height: 1,
      started: false,
      frame: null,
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    const drag = active;
    if (!drag || drag.pointerId !== event.pointerId) return;

    drag.x = event.clientX;
    drag.y = event.clientY;

    if (!drag.started) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // Horizontal movement belongs to the shelf's native scroller. Only an
      // intentional upward gesture promotes the item into the drag layer.
      if (absX >= START_DISTANCE_PX && absX > absY) {
        active = null;
        drag.marker.remove();
        return;
      }

      const upwardDrag = dy <= -START_DISTANCE_PX && absY > absX * VERTICAL_INTENT_RATIO;
      if (!upwardDrag) return;
      beginVisualDrag(drag);
    }

    requestPosition(drag);
  };

  const finishMatchingPointer = (event: PointerEvent) => {
    if (active?.pointerId === event.pointerId) restore();
  };

  window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  window.addEventListener("pointerup", finishMatchingPointer, true);
  window.addEventListener("pointercancel", finishMatchingPointer, true);
  window.addEventListener("lostpointercapture", finishMatchingPointer, true);
  window.addEventListener("blur", restore, true);
  window.addEventListener("pagehide", restore, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") restore();
  });
}
