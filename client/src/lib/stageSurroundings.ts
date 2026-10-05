import { useEffect, useId, useRef } from "react";

export type StageSurroundingOptions = {
  imageUrl?: string | null;
  backgroundColor?: string;
  backgroundPosition?: string;
  overlayAlpha?: number;
  enabled?: boolean;
  priority?: number;
};

type SurroundingEntry = {
  ownerId: string;
  sequence: number;
  options: StageSurroundingOptions;
};

const surroundingEntries = new Map<string, SurroundingEntry>();
let surroundingSequence = 0;

function cssUrl(url: string): string {
  return `url(${JSON.stringify(url)})`;
}

function getShell(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".game-stage-shell:not(.hub-document-shell)");
}

function applyStageSurroundings(): void {
  const shell = getShell();
  if (!shell) return;

  const active = [...surroundingEntries.values()]
    .filter(entry => entry.options.enabled !== false)
    .sort((a, b) => {
      const priorityDelta = (b.options.priority ?? 10) - (a.options.priority ?? 10);
      return priorityDelta !== 0 ? priorityDelta : b.sequence - a.sequence;
    })[0];

  if (!active) {
    delete shell.dataset.stageSurroundingOwner;
    shell.style.removeProperty("--stage-surrounding-image");
    shell.style.removeProperty("--stage-surrounding-color");
    shell.style.removeProperty("--stage-surrounding-position");
    shell.style.removeProperty("--stage-surrounding-overlay-alpha");
    return;
  }

  const {
    imageUrl,
    backgroundColor = "#050c08",
    backgroundPosition = "center center",
    overlayAlpha = 0.24,
  } = active.options;

  shell.dataset.stageSurroundingOwner = active.ownerId;
  shell.style.setProperty("--stage-surrounding-color", backgroundColor);
  shell.style.setProperty("--stage-surrounding-position", backgroundPosition);
  shell.style.setProperty(
    "--stage-surrounding-overlay-alpha",
    String(Math.max(0, Math.min(0.8, overlayAlpha))),
  );

  if (imageUrl) {
    shell.style.setProperty("--stage-surrounding-image", cssUrl(imageUrl));
  } else {
    shell.style.removeProperty("--stage-surrounding-image");
  }
}

/**
 * Lets the current page/environment provide the artwork used outside the
 * canonical 390×844 gameplay stage on larger devices.
 *
 * This only changes the shell backdrop. Gameplay/world coordinates, authored
 * placements, and the stage itself are untouched. Multiple mounted environments
 * are safe: higher-priority children (such as mini-games) temporarily override
 * their parent world and reveal it again automatically when they unmount.
 */
export function useStageSurroundings(options: StageSurroundingOptions): void {
  const ownerId = useId();
  const sequenceRef = useRef<number>(0);
  if (sequenceRef.current === 0) sequenceRef.current = ++surroundingSequence;

  const {
    imageUrl,
    backgroundColor = "#050c08",
    backgroundPosition = "center center",
    overlayAlpha = 0.24,
    enabled = true,
    priority = 10,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    surroundingEntries.set(ownerId, {
      ownerId,
      sequence: sequenceRef.current,
      options: {
        imageUrl,
        backgroundColor,
        backgroundPosition,
        overlayAlpha,
        enabled,
        priority,
      },
    });
    applyStageSurroundings();

    return () => {
      surroundingEntries.delete(ownerId);
      applyStageSurroundings();
    };
  }, [backgroundColor, backgroundPosition, enabled, imageUrl, overlayAlpha, ownerId, priority]);
}
