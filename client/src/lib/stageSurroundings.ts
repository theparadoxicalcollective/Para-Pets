import { useEffect, useId } from "react";

export type StageSurroundingOptions = {
  imageUrl?: string | null;
  backgroundColor?: string;
  backgroundPosition?: string;
  overlayAlpha?: number;
  enabled?: boolean;
};

function cssUrl(url: string): string {
  return `url(${JSON.stringify(url)})`;
}

/**
 * Lets the current page/environment provide the artwork used outside the
 * canonical 390×844 gameplay stage on larger devices.
 *
 * This only changes the shell backdrop. Gameplay/world coordinates, authored
 * placements, and the stage itself are untouched.
 */
export function useStageSurroundings({
  imageUrl,
  backgroundColor = "#050c08",
  backgroundPosition = "center center",
  overlayAlpha = 0.24,
  enabled = true,
}: StageSurroundingOptions): void {
  const ownerId = useId();

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const shell = document.querySelector<HTMLElement>(".game-stage-shell:not(.hub-document-shell)");
    if (!shell) return;

    shell.dataset.stageSurroundingOwner = ownerId;
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

    return () => {
      if (shell.dataset.stageSurroundingOwner !== ownerId) return;
      delete shell.dataset.stageSurroundingOwner;
      shell.style.removeProperty("--stage-surrounding-image");
      shell.style.removeProperty("--stage-surrounding-color");
      shell.style.removeProperty("--stage-surrounding-position");
      shell.style.removeProperty("--stage-surrounding-overlay-alpha");
    };
  }, [backgroundColor, backgroundPosition, enabled, imageUrl, overlayAlpha, ownerId]);
}
