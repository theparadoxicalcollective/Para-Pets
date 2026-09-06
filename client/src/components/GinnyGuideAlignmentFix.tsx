import { useEffect } from "react";
import {
  calculateGinnyGuidePlacement,
  type GinnyGuidePreferredSide,
  type GinnyGuideRect,
} from "@/lib/ginnyGuidePosition";

const COPY_SELECTOR = '[data-testid="ginny-guide-copy"]';
const HIGHLIGHT_SELECTOR = '[data-testid="ginny-guide-highlight"]';

function rectOf(element: Element | null): GinnyGuideRect | null {
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 2 || rect.height <= 2) return null;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") <= 0.08) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function unionRects(rects: GinnyGuideRect[]): GinnyGuideRect | null {
  if (!rects.length) return null;
  const left = Math.min(...rects.map(rect => rect.left));
  const top = Math.min(...rects.map(rect => rect.top));
  const right = Math.max(...rects.map(rect => rect.left + rect.width));
  const bottom = Math.max(...rects.map(rect => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

function getActivePetVisualRect(): GinnyGuideRect | null {
  const tapZone = document.querySelector<HTMLElement>('[data-testid="button-open-pet-actions"]');
  if (!tapZone) return null;

  // The tap wrapper is intentionally full-width and transformed for the active
  // pet's floating animation. Using that wrapper as a coachmark target makes
  // the guide appear detached from the pet. Prefer the visible head/body art so
  // the highlight follows the character the player is actually being asked to tap.
  const centralParts = Array.from(
    tapZone.querySelectorAll<HTMLElement>('img[alt="head"], img[alt="body"], img[alt="body_2"]'),
  )
    .map(rectOf)
    .filter((rect): rect is GinnyGuideRect => rect !== null);
  const centralArt = unionRects(centralParts);
  if (centralArt) return centralArt;

  return rectOf(tapZone.querySelector('[data-testid="pet-animator-with-costumes"]')) ?? rectOf(tapZone);
}

function getTargetForLabel(label: string, highlight: HTMLElement): {
  rect: GinnyGuideRect | null;
  rewriteHighlight: boolean;
  preferredSide: GinnyGuidePreferredSide;
} {
  if (label === "Tap your active pet") {
    return { rect: getActivePetVisualRect(), rewriteHighlight: true, preferredSide: "below" };
  }
  if (label === "Open Mini Pets") {
    return {
      rect: rectOf(document.querySelector('[data-testid="button-open-mini-pets"]')),
      rewriteHighlight: true,
      preferredSide: "above",
    };
  }
  if (label === "Tap Main") {
    return {
      rect: rectOf(document.querySelector('[data-testid="nav-item-home"]')),
      rewriteHighlight: true,
      preferredSide: "auto",
    };
  }
  if (label === "Open the menu") {
    return {
      rect: rectOf(document.querySelector('[data-testid="button-floating-nav"]')),
      rewriteHighlight: true,
      preferredSide: "auto",
    };
  }

  // For the chosen Mini Pet option the original guide already has the exact
  // dynamic inventory id. Reuse its highlight bounds as the anchor and only
  // correct the callout/arrow alignment.
  return { rect: rectOf(highlight), rewriteHighlight: false, preferredSide: "auto" };
}

function restoreClosetStep(copy: HTMLElement, arrow: HTMLElement | null) {
  // The user-confirmed Closet step is already positioned correctly. Explicitly
  // clear only the extra properties this fix owns so that step remains exactly
  // under GinnyQuestOverlay's original layout rules.
  copy.style.boxSizing = "";
  if (!arrow) return;
  arrow.style.position = "";
  arrow.style.left = "";
  arrow.style.top = "";
  arrow.style.bottom = "";
  arrow.style.transform = "";
  arrow.style.animation = "";
  arrow.textContent = "↓";
}

function applyAlignment() {
  const copy = document.querySelector<HTMLElement>(COPY_SELECTOR);
  const highlight = document.querySelector<HTMLElement>(HIGHLIGHT_SELECTOR);
  if (!copy || !highlight) return;

  const label = copy.querySelector("strong")?.textContent?.trim() ?? "";
  const arrow = copy.querySelector<HTMLElement>(".ginny-guide-arrow");
  if (label === "Open The Closet") {
    restoreClosetStep(copy, arrow);
    return;
  }

  const target = getTargetForLabel(label, highlight);
  if (!target.rect) return;

  const copyHeight = Math.max(72, copy.getBoundingClientRect().height || 84);
  const placement = calculateGinnyGuidePlacement(
    target.rect,
    window.innerWidth,
    window.innerHeight,
    copyHeight,
    target.preferredSide,
  );

  if (target.rewriteHighlight) {
    highlight.style.left = `${placement.highlightLeft}px`;
    highlight.style.top = `${placement.highlightTop}px`;
    highlight.style.width = `${placement.highlightWidth}px`;
    highlight.style.height = `${placement.highlightHeight}px`;
    highlight.style.borderRadius = `${Math.min(28, Math.max(14, placement.highlightHeight * 0.28))}px`;
  }

  copy.style.left = `${placement.tooltipLeft}px`;
  copy.style.top = `${placement.tooltipTop}px`;
  copy.style.width = `${placement.tooltipWidth}px`;
  copy.style.boxSizing = "border-box";
  copy.style.padding = placement.tooltipAbove ? "9px 12px 27px" : "27px 12px 9px";

  if (arrow) {
    arrow.textContent = placement.tooltipAbove ? "↓" : "↑";
    arrow.style.position = "absolute";
    arrow.style.left = `${placement.arrowX}px`;
    arrow.style.top = placement.tooltipAbove ? "auto" : "5px";
    arrow.style.bottom = placement.tooltipAbove ? "5px" : "auto";
    arrow.style.transform = "translateX(-50%)";
    // The original bob keyframes animate `transform`, which would erase the
    // horizontal centering transform above. Keep corrected arrows stationary so
    // they remain precisely aimed at the highlighted control.
    arrow.style.animation = "none";
    arrow.style.marginTop = "0";
  }
}

export default function GinnyGuideAlignmentFix() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyAlignment);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(schedule, 300);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, []);

  return null;
}
