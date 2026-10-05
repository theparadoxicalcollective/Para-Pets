import { useEffect, useMemo, useState } from "react";
import { HOME_FIXED_VIEWPORT_STYLE, HOME_TOUCH_SURFACE_STYLE } from "@/lib/homeCrossDevice";
import { clientRectToStageRect, getStageSurface } from "@/lib/stage";
import tutorialArrow from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";

export type PetHomeTutorialStep =
  | "welcome"
  | "lighting"
  | "inventory"
  | "home"
  | "mailbox"
  | "building";

type TargetRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TutorialLayout = {
  targets: TargetRect[];
  viewport: ViewportRect;
  stage: ViewportRect;
};

const STEP_COPY: Record<PetHomeTutorialStep, { title: string; body: string }> = {
  welcome: {
    title: "Welcome to Your Pet Home!",
    body: "Here you can decorate your home, add your pets, visit friends' homes, and discover more as your collection grows.",
  },
  lighting: {
    title: "Day & Night",
    body: "Use the sun and moon control to choose Day, Night, or Auto. Auto follows the home's natural day and night cycle, while Day and Night let you preview the scene whenever you want.",
  },
  inventory: {
    title: "Make It Yours",
    body: "Drag and drop pets, Decor, and Objects into your home scenes. Tap lights to turn them on and off. Double-tap or double-click items to edit and move them. Keep exploring—different homes can hide secrets.",
  },
  home: {
    title: "Choose Your Home",
    body: "Use Home to decide which house bundle you would like to activate. When you switch homes, placed pets and items return safely to inventory.",
  },
  mailbox: {
    title: "Your Mailbox",
    body: "This is where you can receive messages and gifts from friends or visitors. Check it whenever something new is waiting for you.",
  },
  building: {
    title: "Explore Your Home",
    body: "Tap your home to discover and explore more. Different homes can have unique interiors, interactions, and secrets to find.",
  },
};

const STEP_ORDER: PetHomeTutorialStep[] = ["welcome", "lighting", "inventory", "home", "mailbox", "building"];

const TARGETS: Partial<Record<PetHomeTutorialStep, string[]>> = {
  lighting: ['[data-testid="button-home-day-night-toggle"]'],
  inventory: ['[data-testid="button-pets-inventory"]', '[data-testid="button-decor-inventory"]'],
  home: ['[data-testid="button-home-inventory"]'],
  mailbox: ['[data-home-building-kind="mailbox"]'],
  building: ['[data-home-tutorial-building="primary"]'],
};

function toRect(element: Element): TargetRect {
  return clientRectToStageRect(element.getBoundingClientRect());
}

function currentStageRect(): ViewportRect {
  const surface = getStageSurface();
  return {
    left: 0,
    top: 0,
    width: surface.logicalWidth,
    height: surface.logicalHeight,
  };
}

function sameLayout(a: TutorialLayout, b: TutorialLayout): boolean {
  const rounded = (value: number) => Math.round(value);
  if (
    rounded(a.viewport.left) !== rounded(b.viewport.left)
    || rounded(a.viewport.top) !== rounded(b.viewport.top)
    || rounded(a.viewport.width) !== rounded(b.viewport.width)
    || rounded(a.viewport.height) !== rounded(b.viewport.height)
    || rounded(a.stage.left) !== rounded(b.stage.left)
    || rounded(a.stage.top) !== rounded(b.stage.top)
    || rounded(a.stage.width) !== rounded(b.stage.width)
    || rounded(a.stage.height) !== rounded(b.stage.height)
    || a.targets.length !== b.targets.length
  ) return false;

  return a.targets.every((rect, index) => {
    const other = b.targets[index];
    return !!other
      && rounded(rect.left) === rounded(other.left)
      && rounded(rect.top) === rounded(other.top)
      && rounded(rect.width) === rounded(other.width)
      && rounded(rect.height) === rounded(other.height);
  });
}

export default function PetHomeTutorialOverlay({
  step,
  onContinue,
  completing = false,
}: {
  step: PetHomeTutorialStep;
  onContinue: () => void;
  completing?: boolean;
}) {
  const initialStage = currentStageRect();
  const [layout, setLayout] = useState<TutorialLayout>(() => ({
    targets: [],
    viewport: initialStage,
    stage: initialStage,
  }));

  useEffect(() => {
    const selectors = TARGETS[step] ?? [];
    let resizeObserver: ResizeObserver | null = null;
    const settleTimers: number[] = [];

    const update = () => {
      const stage = currentStageRect();
      const targets = selectors
        .map(selector => document.querySelector(selector))
        .filter((element): element is Element => !!element)
        .map(toRect)
        .filter(rect => rect.width > 0 && rect.height > 0);
      const next: TutorialLayout = {
        targets,
        viewport: stage,
        stage,
      };
      setLayout(current => sameLayout(current, next) ? current : next);
    };

    update();

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(update);
      const stage = document.querySelector('[data-testid="pet-home-stage"]');
      if (stage) resizeObserver.observe(stage);
      for (const selector of selectors) {
        const target = document.querySelector(selector);
        if (target) resizeObserver.observe(target);
      }
    }

    // Let delayed image/layout work settle without polling every animation frame.
    for (const delay of [50, 250, 750]) {
      settleTimers.push(window.setTimeout(update, delay));
    }

    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      for (const timer of settleTimers) window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [step]);

  const copy = STEP_COPY[step];
  const stepNumber = STEP_ORDER.indexOf(step) + 1;
  const firstTarget = layout.targets[0] ?? null;
  // The mailbox and home-building steps need the scene itself to stay readable.
  // Keep interaction blocking in place, but remove nearly all tutorial dimming
  // so players can actually see the objects the arrows are introducing.
  const revealHomeScene = step === "mailbox" || step === "building";

  const cardPosition = useMemo(() => {
    const viewport = layout.viewport;
    const stage = layout.stage;
    const centerX = stage.left + stage.width / 2;
    const viewportMiddle = viewport.top + viewport.height / 2;
    const preferredY = step === "welcome" || !firstTarget
      ? viewportMiddle
      : firstTarget.top + firstTarget.height / 2 < viewportMiddle
        ? viewport.top + viewport.height * 0.69
        : viewport.top + viewport.height * 0.27;

    const verticalMargin = Math.min(130, Math.max(82, viewport.height * 0.22));
    const minY = viewport.top + verticalMargin;
    const maxY = viewport.top + viewport.height - verticalMargin;
    const centerY = maxY <= minY
      ? viewportMiddle
      : Math.max(minY, Math.min(maxY, preferredY));

    return { centerX, centerY };
  }, [firstTarget, layout.stage, layout.viewport, step]);

  const cardWidth = Math.min(370, Math.max(250, layout.stage.width - 28));

  return (
    <div
      data-testid="pet-home-tutorial-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed"
      onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerMove={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUp={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDownCapture={event => {
        if (event.key === "Tab" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Tab") {
            event.currentTarget
              .querySelector<HTMLButtonElement>('[data-testid="button-pet-home-tutorial-continue"]')
              ?.focus();
          }
        }
      }}
      style={{
        ...HOME_TOUCH_SURFACE_STYLE,
        ...HOME_FIXED_VIEWPORT_STYLE,
        zIndex: 99000,
        left: 0,
        top: 0,
        width: layout.stage.width,
        maxWidth: layout.stage.width,
        background: revealHomeScene ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.62)",
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      {layout.targets.map((rect, index) => {
        const pad = 8;
        const arrowAbove = rect.top >= layout.viewport.top + 82;
        const arrowTop = arrowAbove ? rect.top - 68 : rect.bottom + 8;
        const minArrowLeft = layout.stage.left + 8;
        const maxArrowLeft = layout.stage.left + layout.stage.width - 56;
        const arrowLeft = Math.max(
          minArrowLeft,
          Math.min(maxArrowLeft, rect.left + rect.width / 2 - 24),
        );
        return (
          <div key={index} aria-hidden="true">
            <div
              style={{
                position: "fixed",
                left: rect.left - pad,
                top: rect.top - pad,
                width: rect.width + pad * 2,
                height: rect.height + pad * 2,
                borderRadius: 14,
                border: "2px solid rgba(255,214,89,0.96)",
                boxShadow: "0 0 10px rgba(255,214,89,0.95), 0 0 24px rgba(240,192,64,0.55), inset 0 0 10px rgba(255,230,120,0.16)",
                background: "rgba(255,230,120,0.06)",
                zIndex: 99001,
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "fixed",
                left: arrowLeft,
                top: arrowTop,
                width: 48,
                height: 60,
                transform: arrowAbove ? "none" : "rotate(180deg)",
                transformOrigin: "center",
                zIndex: 99002,
                pointerEvents: "none",
              }}
            >
              <img
                src={tutorialArrow}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  animation: "pet-home-tutorial-arrow 0.8s ease-in-out infinite",
                  filter: "drop-shadow(0 0 8px rgba(255,215,80,0.95)) drop-shadow(0 0 16px rgba(240,192,64,0.5))",
                }}
              />
            </div>
          </div>
        );
      })}

      <div
        data-testid={`pet-home-tutorial-step-${step}`}
        style={{
          position: "fixed",
          left: cardPosition.centerX,
          top: cardPosition.centerY,
          transform: "translate(-50%, -50%)",
          width: cardWidth,
          maxWidth: "calc(100vw - 28px)",
          maxHeight: "calc(var(--home-visual-height, 100dvh) - 28px)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          zIndex: 99004,
          borderRadius: 18,
          padding: "18px 18px 16px",
          background: "linear-gradient(160deg, rgba(18,29,15,0.98) 0%, rgba(8,15,8,0.99) 100%)",
          border: "1.5px solid rgba(240,192,64,0.62)",
          boxShadow: "0 12px 42px rgba(0,0,0,0.82), 0 0 24px rgba(240,192,64,0.16)",
          pointerEvents: "auto",
        }}
        onPointerDown={event => event.stopPropagation()}
        onPointerUp={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ color: "rgba(240,192,64,0.58)", fontFamily: "Lora, serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 5 }}>
          Pet Home Guide · {stepNumber} of {STEP_ORDER.length}
        </div>
        <h2 style={{ color: "#f6d676", fontFamily: "Lora, serif", fontSize: 18, fontWeight: 700, margin: 0, textShadow: "0 0 12px rgba(240,192,64,0.22)" }}>
          {copy.title}
        </h2>
        <p style={{ color: "rgba(240,237,220,0.86)", fontFamily: "Lora, serif", fontSize: 12, lineHeight: 1.55, margin: "9px 0 14px" }}>
          {copy.body}
        </p>
        <button
          type="button"
          data-testid="button-pet-home-tutorial-continue"
          autoFocus
          disabled={completing}
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onContinue();
          }}
          style={{
            width: "100%",
            minHeight: 44,
            borderRadius: 12,
            border: "1.5px solid rgba(240,192,64,0.72)",
            background: "linear-gradient(180deg, rgba(240,192,64,0.94), rgba(190,135,22,0.94))",
            color: "#1c1202",
            fontFamily: "Lora, serif",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            cursor: completing ? "default" : "pointer",
            opacity: completing ? 0.65 : 1,
            boxShadow: "0 0 14px rgba(240,192,64,0.22)",
            touchAction: "manipulation",
          }}
        >
          {completing ? "Saving…" : "Continue"}
        </button>
      </div>

      <style>{`
        @keyframes pet-home-tutorial-arrow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(7px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="pet-home-tutorial-overlay"] img { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
