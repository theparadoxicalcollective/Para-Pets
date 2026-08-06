import {
  classifyPetCareItemGesture,
  PET_CARE_DROP_PADDING_PX,
  pointInsideExpandedPetDropZone,
} from "@/lib/petCareInteractions";

type ActivePetCareDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  item: HTMLElement;
  shelf: HTMLElement;
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
const DROP_SPARKLE_COUNT = 9;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function createDropSparkles(x: number, y: number): void {
  const burst = document.createElement("div");
  burst.className = "pet-care-drop-sparkle-burst";
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = `${Math.round(x)}px`;
  burst.style.top = `${Math.round(y)}px`;

  for (let index = 0; index < DROP_SPARKLE_COUNT; index += 1) {
    const sparkle = document.createElement("span");
    sparkle.className = "pet-care-drop-sparkle";
    const angle = (index / DROP_SPARKLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
    const distance = 34 + Math.random() * 42;
    sparkle.style.setProperty("--pet-care-sparkle-x", `${Math.cos(angle) * distance}px`);
    sparkle.style.setProperty("--pet-care-sparkle-y", `${Math.sin(angle) * distance - 12}px`);
    sparkle.style.setProperty("--pet-care-sparkle-delay", `${Math.random() * 90}ms`);
    sparkle.style.setProperty("--pet-care-sparkle-size", `${7 + Math.random() * 8}px`);
    burst.appendChild(sparkle);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 950);
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

/**
 * Keeps Pet Care's React gesture state, drop validation, mutations, and reward
 * logic as the source of truth. This layer only improves mobile presentation:
 * the source shelf slot empties while React's ghost follows the finger, normal
 * tap-to-use remains available, successful-looking drops get immediate sparkle
 * feedback, and ordinary petting strokes are assisted into the existing circle
 * recognizer instead of introducing a second reward path.
 */
export function installPetCareDragPolish(): void {
  if (typeof window === "undefined" || window.__paraPetCareDragPolishInstalled) return;
  window.__paraPetCareDragPolishInstalled = true;

  let activeDrag: ActivePetCareDrag | null = null;
  let activeStroke: ActivePetStroke | null = null;

  const restoreDrag = () => {
    const drag = activeDrag;
    activeDrag = null;
    if (!drag) return;

    document.body.classList.remove("pet-care-native-item-dragging");
    drag.item.classList.remove("pet-care-native-source-item");
    drag.shelf.classList.remove("pet-care-item-shelf--native-dragging");
  };

  const clearInteractions = () => {
    restoreDrag();
    activeStroke = null;
  };

  const beginVisualDrag = (drag: ActivePetCareDrag) => {
    if (drag.started) return;
    drag.started = true;
    drag.item.classList.add("pet-care-native-source-item");
    drag.shelf.classList.add("pet-care-item-shelf--native-dragging");
    document.body.classList.add("pet-care-native-item-dragging");
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest<HTMLElement>(".pet-care-overlay .pet-care-item-shelf__item");
    const shelf = item?.closest<HTMLElement>(".pet-care-item-shelf");

    // A new press is also a hard safety reset for any drag class left behind by
    // an interrupted WebKit pointer sequence.
    restoreDrag();

    if (item && shelf) {
      activeStroke = null;
      activeDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        item,
        shelf,
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
      if (!drag.started) {
        const intent = classifyPetCareItemGesture(
          event.clientX - drag.startX,
          event.clientY - drag.startY,
        );
        if (intent === "horizontal-scroll") {
          activeDrag = null;
        } else if (intent === "vertical-item-drag") {
          beginVisualDrag(drag);
        }
      }
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
        const sparkleX = Math.min(Math.max(event.clientX, rect.left), rect.right);
        const sparkleY = Math.min(Math.max(event.clientY, rect.top), rect.bottom);
        createDropSparkles(sparkleX, sparkleY);
      }
    }

    restoreDrag();
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

  window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);
  window.addEventListener("lostpointercapture", onPointerCancel, true);
  window.addEventListener("blur", clearInteractions, true);
  window.addEventListener("pagehide", clearInteractions, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") clearInteractions();
  });
}
