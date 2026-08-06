import { queryClient } from "@/lib/queryClient";
import {
  classifyPetCareItemGesture,
  PET_CARE_DROP_PADDING_PX,
  pointInsideExpandedPetDropZone,
} from "@/lib/petCareInteractions";
import {
  buildPetCareInventoryStacks,
  orderPetCareItemsByEffect,
} from "@/lib/petCareInventory";
import { parsePetCareInventory } from "@/lib/petCareData";

type ActivePetCareDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  item: HTMLElement;
  artwork: HTMLElement;
  originalArtworkStyle: string | null;
  ghost: HTMLElement | null;
  ghostWidth: number;
  ghostHeight: number;
  frame: number | null;
  started: boolean;
};

type ActivePetStroke = {
  pointerId: number;
  target: HTMLElement;
  lastX: number;
  lastY: number;
  pathDistance: number;
  startedAt: number;
  assisted: boolean;
  pointerType: string;
};

type PetCarePointerEvent = PointerEvent & {
  __paraPettingAssist?: boolean;
};

type PetCareDisplayStack = {
  quantity?: number | null;
};

declare global {
  interface Window {
    __paraPetCareDragPolishInstalled?: boolean;
  }
}

const PET_STROKE_ASSIST_DISTANCE_PX = 46;
const PET_STROKE_ASSIST_MIN_DURATION_MS = 80;
const PET_STROKE_ASSIST_RADIUS_RATIO = 0.17;
const PET_STROKE_ASSIST_STEP_RADIANS = Math.PI * 0.17;
const PET_STROKE_ASSIST_STEPS = 6;
const DROP_SPARKLE_COUNT = 14;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function createDropSparkles(x: number, y: number): void {
  const burst = document.createElement("div");
  burst.className = "pet-care-drop-sparkle-burst";
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = `${Math.round(x)}px`;
  burst.style.top = `${Math.round(y)}px`;

  const core = document.createElement("span");
  core.className = "pet-care-drop-sparkle-core";
  burst.appendChild(core);

  for (let index = 0; index < DROP_SPARKLE_COUNT; index += 1) {
    const sparkle = document.createElement("span");
    sparkle.className = "pet-care-drop-sparkle";
    const angle = (index / DROP_SPARKLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.42;
    const distance = 44 + Math.random() * 48;
    sparkle.style.setProperty("--pet-care-sparkle-x", `${Math.cos(angle) * distance}px`);
    sparkle.style.setProperty("--pet-care-sparkle-y", `${Math.sin(angle) * distance - 16}px`);
    sparkle.style.setProperty("--pet-care-sparkle-delay", `${Math.random() * 110}ms`);
    sparkle.style.setProperty("--pet-care-sparkle-size", `${9 + Math.random() * 9}px`);
    burst.appendChild(sparkle);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 1150);
}

function copyRenderedArtwork(artwork: HTMLElement): HTMLElement | null {
  const rendered = artwork.querySelector<HTMLElement>(".pet-care-item-shelf__normalized-image");
  if (!rendered) return null;

  if (rendered instanceof HTMLCanvasElement && rendered.width > 0 && rendered.height > 0) {
    const copy = document.createElement("canvas");
    copy.width = rendered.width;
    copy.height = rendered.height;
    const context = copy.getContext("2d");
    if (!context) return null;
    try {
      context.drawImage(rendered, 0, 0);
    } catch {
      return null;
    }
    copy.className = "pet-care-polished-drag-ghost__image";
    return copy;
  }

  if (rendered instanceof HTMLImageElement) {
    const copy = rendered.cloneNode(true) as HTMLImageElement;
    copy.className = "pet-care-polished-drag-ghost__image";
    copy.removeAttribute("id");
    copy.draggable = false;
    return copy;
  }

  return null;
}

function createRenderedDragGhost(artwork: HTMLElement): {
  element: HTMLElement;
  width: number;
  height: number;
} | null {
  const visual = copyRenderedArtwork(artwork);
  if (!visual) return null;

  const rect = artwork.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const ghost = document.createElement("div");
  ghost.className = "pet-care-polished-drag-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.appendChild(visual);
  document.body.appendChild(ghost);

  return { element: ghost, width: rect.width, height: rect.height };
}

function dispatchPettingAssist(stroke: ActivePetStroke): void {
  if (stroke.assisted || !stroke.target.isConnected || typeof PointerEvent === "undefined") return;
  stroke.assisted = true;

  const rect = stroke.target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = Math.max(22, Math.min(rect.width, rect.height) * PET_STROKE_ASSIST_RADIUS_RATIO);
  const startAngle = Math.atan2(stroke.lastY - centerY, stroke.lastX - centerX);

  // Feed a short, smooth arc through the component's existing React handler.
  // This preserves its normal mutation, mood, coin, heart, and cleanup paths;
  // it only makes ordinary back-and-forth petting qualify like a small circle.
  for (let step = 1; step <= PET_STROKE_ASSIST_STEPS; step += 1) {
    const angle = startAngle + step * PET_STROKE_ASSIST_STEP_RADIANS;
    const synthetic = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: stroke.pointerId,
      pointerType: stroke.pointerType || "touch",
      isPrimary: true,
      buttons: 1,
      clientX: centerX + Math.cos(angle) * radius,
      clientY: centerY + Math.sin(angle) * radius,
    }) as PetCarePointerEvent;
    synthetic.__paraPettingAssist = true;
    stroke.target.dispatchEvent(synthetic);
  }
}

function applyStackQuantities(
  overlay: HTMLElement,
  kind: "edibles" | "gifts",
  stacks: readonly PetCareDisplayStack[],
): void {
  const items = Array.from(
    overlay.querySelectorAll<HTMLElement>(`.pet-care-item-shelf--${kind} .pet-care-item-shelf__item`),
  );

  items.forEach((item, index) => {
    const quantity = Math.max(1, Math.floor(Number(stacks[index]?.quantity ?? 1)));
    if (quantity > 1) item.dataset.petCareStackQuantity = String(quantity);
    else delete item.dataset.petCareStackQuantity;
  });
}

function syncStackQuantityBadges(): void {
  const overlay = document.querySelector<HTMLElement>(".pet-care-overlay");
  if (!overlay) return;

  const payload = queryClient.getQueryData<unknown>(["/api/inventory"]);
  if (!Array.isArray(payload)) return;

  try {
    const inventory = parsePetCareInventory(payload) as Array<any>;
    const edibles = orderPetCareItemsByEffect(
      buildPetCareInventoryStacks(inventory.filter((item) => item.type === "edibles")),
      "edibles",
    );
    const gifts = orderPetCareItemsByEffect(
      buildPetCareInventoryStacks(inventory.filter((item) => item.type === "gift")),
      "gifts",
    );
    applyStackQuantities(overlay, "edibles", edibles);
    applyStackQuantities(overlay, "gifts", gifts);
  } catch {
    // A quantity badge is optional polish. Inventory parsing failures remain
    // owned by the Pet Care route's existing recoverable error handling.
  }
}

/**
 * Keeps Pet Care's React gesture state, drop validation, mutations, and reward
 * logic as the source of truth. This layer only improves mobile presentation:
 * the exact rendered shelf artwork is copied into an unclipped body-level drag
 * ghost, the source slot is hidden with inline state that survives React
 * rerenders, normal play stays drag-and-drop only, successful-looking drops get
 * immediate sparkle feedback, and ordinary petting strokes are assisted into
 * the existing circle recognizer instead of introducing a second reward path.
 */
export function installPetCareDragPolish(): void {
  if (typeof window === "undefined" || window.__paraPetCareDragPolishInstalled) return;
  window.__paraPetCareDragPolishInstalled = true;

  let activeDrag: ActivePetCareDrag | null = null;
  let activeStroke: ActivePetStroke | null = null;
  let quantityFrame: number | null = null;

  const scheduleQuantitySync = () => {
    if (quantityFrame != null) return;
    quantityFrame = window.requestAnimationFrame(() => {
      quantityFrame = null;
      syncStackQuantityBadges();
    });
  };

  const renderDragPosition = (drag: ActivePetCareDrag) => {
    drag.frame = null;
    if (!drag.started || !drag.ghost?.isConnected) return;
    const left = Math.round(drag.lastX - drag.ghostWidth / 2);
    const top = Math.round(drag.lastY - drag.ghostHeight * 0.78);
    drag.ghost.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  };

  const requestDragPosition = (drag: ActivePetCareDrag) => {
    if (drag.frame != null || !drag.ghost) return;
    drag.frame = window.requestAnimationFrame(() => renderDragPosition(drag));
  };

  const restoreDrag = () => {
    const drag = activeDrag;
    activeDrag = null;
    if (!drag) return;

    if (drag.frame != null) window.cancelAnimationFrame(drag.frame);
    drag.ghost?.remove();
    if (drag.originalArtworkStyle == null) drag.artwork.removeAttribute("style");
    else drag.artwork.setAttribute("style", drag.originalArtworkStyle);
    delete drag.item.dataset.petCareDragSource;
    document.body.classList.remove("pet-care-native-item-dragging");
    document.body.classList.remove("pet-care-polished-ghost-active");
  };

  const clearInteractions = () => {
    restoreDrag();
    activeStroke = null;
  };

  const beginVisualDrag = (drag: ActivePetCareDrag) => {
    if (drag.started) return;
    drag.started = true;
    drag.originalArtworkStyle = drag.artwork.getAttribute("style");

    const ghost = createRenderedDragGhost(drag.artwork);
    if (ghost) {
      drag.ghost = ghost.element;
      drag.ghostWidth = ghost.width;
      drag.ghostHeight = ghost.height;
      document.body.classList.add("pet-care-polished-ghost-active");
    }

    // Inline visibility is deliberate: React updates the item's className when
    // dragGhost state mounts, which removed the earlier helper-added source
    // class and made the shelf copy reappear beneath the moving ghost.
    drag.artwork.style.opacity = "0";
    drag.artwork.style.visibility = "hidden";
    drag.item.dataset.petCareDragSource = "true";
    document.body.classList.add("pet-care-native-item-dragging");
    requestDragPosition(drag);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest<HTMLElement>(".pet-care-overlay .pet-care-item-shelf__item");
    const overlay = item?.closest<HTMLElement>(".pet-care-overlay");
    const artwork = item?.querySelector<HTMLElement>(".pet-care-item-shelf__visible-artwork");

    // A new press is also a hard safety reset for any drag layer left behind by
    // an interrupted WebKit pointer sequence.
    restoreDrag();

    if (item && artwork && overlay?.dataset.petCareDragEnabled === "true") {
      activeStroke = null;
      activeDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        item,
        artwork,
        originalArtworkStyle: null,
        ghost: null,
        ghostWidth: 1,
        ghostHeight: 1,
        frame: null,
        started: false,
      };
      return;
    }

    const pet = target?.closest<HTMLElement>(".pet-care-overlay .pet-care-pet");
    if (!pet) {
      activeStroke = null;
      return;
    }

    activeStroke = {
      pointerId: event.pointerId,
      target: pet,
      lastX: event.clientX,
      lastY: event.clientY,
      pathDistance: 0,
      startedAt: now(),
      assisted: false,
      pointerType: event.pointerType,
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    const enhancedEvent = event as PetCarePointerEvent;
    if (enhancedEvent.__paraPettingAssist) return;

    const drag = activeDrag;
    if (drag && drag.pointerId === event.pointerId) {
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      if (!drag.started) {
        const intent = classifyPetCareItemGesture(
          event.clientX - drag.startX,
          event.clientY - drag.startY,
        );
        if (intent === "horizontal-scroll") {
          activeDrag = null;
          return;
        }
        if (intent === "vertical-item-drag") beginVisualDrag(drag);
      }
      if (drag.started) requestDragPosition(drag);
      return;
    }

    const stroke = activeStroke;
    if (!stroke || stroke.pointerId !== event.pointerId) return;

    stroke.pathDistance += Math.hypot(event.clientX - stroke.lastX, event.clientY - stroke.lastY);
    stroke.lastX = event.clientX;
    stroke.lastY = event.clientY;

    if (
      !stroke.assisted
      && stroke.pathDistance >= PET_STROKE_ASSIST_DISTANCE_PX
      && now() - stroke.startedAt >= PET_STROKE_ASSIST_MIN_DURATION_MS
    ) {
      dispatchPettingAssist(stroke);
    }
  };

  const finishDrag = (event: PointerEvent, showDropFeedback: boolean) => {
    const drag = activeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (showDropFeedback && drag.started) {
      const pet = document.querySelector<HTMLElement>(".pet-care-overlay .pet-care-pet");
      const rect = pet?.getBoundingClientRect();
      if (rect && pointInsideExpandedPetDropZone(
        { x: event.clientX, y: event.clientY },
        rect,
        PET_CARE_DROP_PADDING_PX,
      )) {
        // Center the burst over the pet rather than underneath the player's
        // fingertip so it is obvious on a small phone screen.
        createDropSparkles(rect.left + rect.width / 2, rect.top + rect.height * 0.48);
      }
    }

    restoreDrag();
    scheduleQuantitySync();
  };

  const finishStroke = (event: PointerEvent) => {
    if (activeStroke?.pointerId === event.pointerId) activeStroke = null;
  };

  const onPointerUp = (event: PointerEvent) => {
    finishDrag(event, true);
    finishStroke(event);
  };

  const onPointerCancel = (event: PointerEvent) => {
    finishDrag(event, false);
    finishStroke(event);
  };

  // Normal Pet Care remains drag-and-drop only. The existing React click
  // handlers stay available solely for the explicit no-drag emergency mode.
  const blockLegacyTapToUse = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const legacyTapTarget = target?.closest<HTMLElement>(
      ".pet-care-overlay .pet-care-item-shelf__item, .pet-care-overlay .pet-care-pet",
    );
    const overlay = legacyTapTarget?.closest<HTMLElement>(".pet-care-overlay");
    if (!legacyTapTarget || overlay?.dataset.petCareDragEnabled !== "true") return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const observer = new MutationObserver(scheduleQuantitySync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  queryClient.getQueryCache().subscribe(scheduleQuantitySync);
  scheduleQuantitySync();

  window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);
  window.addEventListener("lostpointercapture", onPointerCancel, true);
  window.addEventListener("click", blockLegacyTapToUse, true);
  window.addEventListener("blur", clearInteractions, true);
  window.addEventListener("pagehide", clearInteractions, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") clearInteractions();
  });
}
