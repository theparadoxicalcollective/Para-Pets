import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getQuestGuideSurface, guideBoundsInSurface, guideSpotlightCircle, guideTargetOnScreen } from "@/lib/questGuideViewport";
import tutorialArrow from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";

export type QuestGuideMode = "target" | "pan" | "tour";

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[data-testid^='button-']",
  "[data-testid^='location-']",
].join(",");

function visible(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 3 || rect.height <= 3) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none" || Number(style.opacity || 1) <= 0.1) return false;
  }
  return true;
}

const BLOCKING_OVERLAY_SELECTOR = '[aria-modal="true"], [data-quest-guide-blocker="true"]';

function hasBlockingOverlay(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(BLOCKING_OVERLAY_SELECTOR)).some(visible);
}

function swallow(event: Event) {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

interface Props {
  selector: string | null;
  label?: string;
  focus?: "pet" | "control" | null;
  mode?: QuestGuideMode;
  allowedSelectors?: string[];
  baseZ?: number;
  testId?: string;
  showHint?: boolean;
  blockingGuide?: boolean;
  onTourAdvance?: (point?: { x: number; y: number }) => void;
}

/**
 * Shared quest highlight.
 *
 * By default this is visual-only: it draws the circle/arrow/copy without
 * darkening the game or intercepting player input. The two onboarding flows
 * that intentionally lock the screen opt into `blockingGuide`.
 *
 * When blocking:
 * - target: only the highlighted target can be used.
 * - pan: world/map dragging stays live, but unrelated controls cannot activate.
 * - tour: the overlay itself advances and the highlighted NPC stays read-only.
 */
export default function QuestGuideSpotlight({
  selector,
  label = "",
  focus = null,
  mode = "target",
  allowedSelectors = [],
  baseZ = 2147481500,
  testId = "quest-guide-spotlight",
  showHint = true,
  blockingGuide = false,
  onTourAdvance,
}: Props) {
  const [targetRect, setTargetRect] = useState<{ selector: string; rect: DOMRect } | null>(null);
  const allowedKey = allowedSelectors.join("\n");

  useEffect(() => {
    if (!selector) { setTargetRect(null); return; }
    const update = () => {
      if (hasBlockingOverlay()) { setTargetRect(null); return; }
      const node = document.querySelector<HTMLElement>(selector);
      setTargetRect(visible(node) ? { selector, rect: node.getBoundingClientRect() } : null);
    };
    update();
    const timer = window.setInterval(update, 180);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [selector]);

  useEffect(() => {
    if (!selector || mode === "tour" || !blockingGuide) return;
    const allowed = allowedKey ? allowedKey.split("\n").filter(Boolean) : [];
    const insideAllowed = (event: Event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element) return false;
      if (element.closest(selector)) return true;
      return allowed.some(candidate => element.closest(candidate));
    };
    const targetReady = () => !hasBlockingOverlay() && visible(document.querySelector<HTMLElement>(selector));

    const onPointerBoundary = (event: PointerEvent) => {
      if (!targetReady() || insideAllowed(event)) return;
      if (mode === "pan") {
        const element = event.target instanceof Element ? event.target : null;
        if (element?.closest("[data-quest-guide-pan-surface]")) return;
        if (!element?.closest(INTERACTIVE_SELECTOR)) return;
      }
      swallow(event);
    };
    const onClick = (event: MouseEvent) => {
      if (!targetReady() || insideAllowed(event)) return;
      swallow(event);
    };

    document.addEventListener("pointerdown", onPointerBoundary, true);
    document.addEventListener("pointerup", onPointerBoundary, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerBoundary, true);
      document.removeEventListener("pointerup", onPointerBoundary, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [selector, mode, allowedKey, blockingGuide]);

  if (!selector || hasBlockingOverlay()) return null;
  const rect = targetRect?.selector === selector ? targetRect.rect : null;
  if (!rect) return null;

  const surface = getQuestGuideSurface();
  const bounds = guideBoundsInSurface(rect, surface);
  const targetOnScreen = guideTargetOnScreen(bounds, surface.width, surface.height);
  const spotlight = targetOnScreen ? guideSpotlightCircle(bounds, surface.width, surface.height, focus) : null;
  const radius = spotlight ? spotlight.size / 2 + 10 : 0;
  const overlayAlpha = mode === "pan" ? (targetOnScreen ? 0.54 : 0.46) : 0.74;
  const position = surface.inStage ? "absolute" : "fixed";
  const background = !blockingGuide
    ? "transparent"
    : spotlight
      ? `radial-gradient(circle ${radius}px at ${spotlight.x}px ${spotlight.y}px, transparent ${radius}px, rgba(0,0,0,${overlayAlpha}) ${radius + 1}px)`
      : `rgba(0,0,0,${overlayAlpha})`;
  const hint = mode === "pan" && !targetOnScreen && label ? `Swipe the world to find it · ${label}` : label;
  const edgeCue = mode === "pan" && !targetOnScreen ? {
    x: Math.min(surface.width - 40, Math.max(40, (bounds.left + bounds.right) / 2)),
    y: Math.min(surface.height - 65, Math.max(130, (bounds.top + bounds.bottom) / 2)),
  } : null;

  const worldDestination = mode === "pan" && selector.startsWith('[data-testid="location-') ? selector : null;
  const mapDestination = mode === "pan" && selector.startsWith('[data-testid="button-location-') ? selector : null;
  const panDestination = worldDestination ?? mapDestination;
  const panNodePrefix = worldDestination ? "location-" : mapDestination ? "button-location-" : null;
  const tourInteractive = blockingGuide && mode === "tour";

  return createPortal(<>
    {blockingGuide && panDestination && panNodePrefix && <style>{`[data-quest-guide-pan-surface] [data-testid^="${panNodePrefix}"]:not(${panDestination}), [data-quest-guide-pan-surface] [data-testid^="${panNodePrefix}"]:not(${panDestination}) * { pointer-events: none !important; }`}</style>}
    <div
      data-testid={testId}
      role={tourInteractive ? "button" : undefined}
      tabIndex={tourInteractive ? 0 : undefined}
      aria-label={tourInteractive ? (label || "Continue quest guide") : undefined}
      className={`${position} inset-0`}
      style={{ zIndex: baseZ, background, pointerEvents: tourInteractive ? "auto" : "none", touchAction: tourInteractive ? "none" : undefined }}
      onPointerDown={tourInteractive ? event => event.stopPropagation() : undefined}
      onClick={tourInteractive ? event => {
        event.preventDefault();
        event.stopPropagation();
        onTourAdvance?.({ x: event.clientX, y: event.clientY });
      } : undefined}
      onKeyDown={tourInteractive ? event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onTourAdvance?.();
        }
      } : undefined}
    />
    {edgeCue && <div aria-hidden="true" className={`${position} pointer-events-none rounded-full border-[3px] border-[#ffe082] bg-[#193b25]/80`} style={{
      zIndex: baseZ + 1, left: edgeCue.x, top: edgeCue.y, width: 64, height: 64,
      transform: "translate(-50%,-50%)", boxShadow: "0 0 22px #ffd66b, inset 0 0 14px #f5cb69",
    }}><span className="grid h-full w-full place-items-center text-3xl text-[#ffe082]">✦</span></div>}
    {spotlight && <span aria-hidden="true" className={`${position} pointer-events-none rounded-full border-[3px] border-[#ffe082]`} style={{
      zIndex: baseZ + 1,
      left: spotlight.x,
      top: spotlight.y,
      width: spotlight.size,
      height: spotlight.size,
      transform: "translate(-50%,-50%)",
      boxShadow: "0 0 0 5px rgba(255,209,74,.18),0 0 24px rgba(255,201,60,.86),inset 0 0 18px rgba(255,226,130,.18)",
    }} />}
    {spotlight && <img
      src={tutorialArrow}
      alt=""
      aria-hidden="true"
      className={`${position} pointer-events-none h-[70px] w-14 animate-bounce object-contain`}
      style={{
        zIndex: baseZ + 2,
        left: spotlight.x - 28,
        top: Math.max(8, spotlight.y - spotlight.size / 2 - 74),
        filter: "drop-shadow(0 0 10px rgba(212,168,67,.95)) drop-shadow(0 0 24px rgba(212,168,67,.6))",
      }}
    />}
    {showHint && hint && <div
      role="status"
      data-testid={`${testId}-hint`}
      className={`${position} left-1/2 w-[90%] max-w-[300px] -translate-x-1/2 text-center`}
      style={{ zIndex: baseZ + 3, top: "calc(env(safe-area-inset-top, 0px) + 36px)", pointerEvents: "none" }}
    >
      <div style={{
        background: "linear-gradient(135deg, rgba(8,18,8,0.97) 0%, rgba(15,30,15,0.97) 100%)",
        border: "1.5px solid rgba(212,168,67,0.55)",
        borderRadius: 18,
        padding: "10px 18px",
        boxShadow: "0 0 20px rgba(212,168,67,0.2), 0 8px 30px rgba(0,0,0,0.75)",
      }}>
        <p className="font-fantasy text-[13px] font-semibold leading-[1.45] tracking-[0.04em] text-[#f0d060]">{hint}</p>
      </div>
    </div>}
  </>, surface.target);
}
