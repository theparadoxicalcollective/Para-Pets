type ActivePetCareDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  item: HTMLElement;
  shelf: HTMLElement;
  artwork: HTMLElement;
  originalStyle: string | null;
  containingLeft: number;
  containingTop: number;
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

function findFixedContainingBlock(element: HTMLElement): HTMLElement | null {
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    const style = window.getComputedStyle(ancestor);
    const hasContainingTransform =
      style.transform !== "none" ||
      style.perspective !== "none" ||
      style.filter !== "none" ||
      style.backdropFilter !== "none";
    if (hasContainingTransform) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

/**
 * Keeps Pet Care's existing React gesture, drop validation, and mutations
 * intact. During an intentional upward drag, the original shelf artwork is
 * promoted to a fixed compositor layer without removing it from React's DOM.
 */
export function installPetCareDragPolish(): void {
  if (typeof window === "undefined" || window.__paraPetCareDragPolishInstalled) return;
  window.__paraPetCareDragPolishInstalled = true;

  let active: ActivePetCareDrag | null = null;

  const renderPosition = (drag: ActivePetCareDrag) => {
    drag.frame = null;
    if (!drag.started || !drag.artwork.isConnected) return;

    const left = Math.round(drag.x - drag.width / 2 - drag.containingLeft);
    // Keep the item slightly above the fingertip so the pet remains visible.
    const top = Math.round(drag.y - drag.height * 0.72 - drag.containingTop);
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

    drag.item.classList.remove("pet-care-native-source-item");
    drag.shelf.classList.remove("pet-care-item-shelf--native-dragging");
    drag.artwork.classList.remove("pet-care-native-drag-artwork");

    if (drag.started) {
      if (drag.originalStyle == null) drag.artwork.removeAttribute("style");
      else drag.artwork.setAttribute("style", drag.originalStyle);
    }
  };

  const beginVisualDrag = (drag: ActivePetCareDrag) => {
    if (drag.started) return;
    drag.started = true;

    const rect = drag.artwork.getBoundingClientRect();
    drag.width = Math.max(1, rect.width);
    drag.height = Math.max(1, rect.height);
    drag.originalStyle = drag.artwork.getAttribute("style");

    drag.item.classList.add("pet-care-native-source-item");
    drag.shelf.classList.add("pet-care-item-shelf--native-dragging");
    drag.artwork.classList.add("pet-care-native-drag-artwork");
    document.body.classList.add("pet-care-native-item-dragging");

    // The Edibles shelf has an authored translateY, which makes it the fixed
    // containing block. Gifts normally use the viewport. Account for either
    // case so the original artwork tracks the same finger coordinates.
    const containingBlock = findFixedContainingBlock(drag.artwork);
    const containingRect = containingBlock?.getBoundingClientRect();
    drag.containingLeft = containingRect?.left ?? 0;
    drag.containingTop = containingRect?.top ?? 0;

    drag.artwork.style.left = "0";
    drag.artwork.style.top = "0";
    drag.artwork.style.width = `${drag.width}px`;
    drag.artwork.style.height = `${drag.height}px`;
    drag.artwork.style.transform = "translate3d(-9999px, -9999px, 0)";

    requestPosition(drag);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest<HTMLElement>(".pet-care-overlay .pet-care-item-shelf__item");
    const shelf = item?.closest<HTMLElement>(".pet-care-item-shelf");
    const artwork = item?.querySelector<HTMLElement>(".pet-care-item-shelf__visible-artwork");
    if (!item || !shelf || !artwork) return;

    restore();
    active = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      item,
      shelf,
      artwork,
      originalStyle: null,
      containingLeft: 0,
      containingTop: 0,
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
