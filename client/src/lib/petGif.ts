import { toCanvas } from "html-to-image";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

interface CaptureOpts {
  element: HTMLElement;
  durationMs?: number;
  outputSize?: number;
  onProgress?: (frame: number, captureMs: number) => void;
}

export interface CaptureResult {
  blob: Blob;
  frameCount: number;
  capturedMs: number;
}

/** Capture an on-screen DOM element's CSS animations into an animated,
 *  transparent-background GIF.
 *
 *  The capture runs in real time — it grabs as many `html-to-image` snapshots
 *  as it can within `durationMs`, then encodes the snapshots as a GIF whose
 *  per-frame delays match the actual capture timestamps. That guarantees
 *  playback speed matches the live preview, even on slower devices where
 *  `toCanvas` can't hit a fixed FPS target.
 *
 *  Transparent background is preserved by `gifenc`'s one-bit-alpha quantizer
 *  and dispose-to-background frame setting (so each frame's transparent
 *  pixels stay transparent across the loop).                              */
export async function captureElementToGif({
  element,
  durationMs = 4000,
  outputSize = 400,
  onProgress,
}: CaptureOpts): Promise<CaptureResult> {
  const frames: { data: Uint8ClampedArray; w: number; h: number; ts: number }[] = [];
  const captureStartedAt = performance.now();

  // Throttle so we never spin-loop if `toCanvas` happens to be very fast on
  // a powerful machine — we cap at ~25 fps which is plenty for a pet GIF.
  const minIntervalMs = 40;
  let lastFrameAt = -Infinity;

  while (true) {
    const elapsed = performance.now() - captureStartedAt;
    if (elapsed >= durationMs) break;

    const sinceLast = performance.now() - lastFrameAt;
    if (sinceLast < minIntervalMs) {
      await new Promise(r => setTimeout(r, minIntervalMs - sinceLast));
    }

    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(element, {
        width: outputSize,
        height: outputSize,
        pixelRatio: 1,
        cacheBust: false,
      });
    } catch (err) {
      // toCanvas can fail intermittently if a resource is mid-fetch; just
      // skip this frame and try again.
      console.warn("[petGif] frame capture failed, skipping:", err);
      continue;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const ts = performance.now() - captureStartedAt;
    frames.push({ data: id.data, w: canvas.width, h: canvas.height, ts });
    lastFrameAt = performance.now();
    onProgress?.(frames.length, ts);
  }

  if (frames.length === 0) {
    throw new Error("Captured zero frames — preview element may be hidden or empty.");
  }

  const totalMs = performance.now() - captureStartedAt;
  const gif = GIFEncoder();

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const nextTs = i + 1 < frames.length ? frames[i + 1].ts : totalMs;
    // GIF delay is in centiseconds via gifenc but the API accepts ms.
    // Clamp to >= 20 ms so iOS Safari plays the loop reliably.
    const delay = Math.max(20, Math.round(nextTs - f.ts));

    const palette = quantize(f.data, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
      clearAlpha: true,
      clearAlphaThreshold: 128,
    });
    const index = applyPalette(f.data, palette, "rgba4444");
    // Find the actual transparent palette entry (alpha === 0). gifenc's
    // pnnquant2 doesn't guarantee the transparent color lands at index 0,
    // so we look it up explicitly to avoid frames with mis-colored holes.
    const transparentIndex = palette.findIndex((c) => c.length >= 4 && c[3] === 0);
    const hasTransparent = transparentIndex >= 0;
    gif.writeFrame(index, f.w, f.h, {
      palette,
      delay,
      transparent: hasTransparent,
      transparentIndex: hasTransparent ? transparentIndex : 0,
      dispose: 2, // restore-to-background → transparent stays transparent
    });

    // Yield so the encoding doesn't lock the UI thread for the whole loop.
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
  }
  gif.finish();

  return {
    blob: new Blob([gif.bytes()], { type: "image/gif" }),
    frameCount: frames.length,
    capturedMs: Math.round(totalMs),
  };
}

/** Trigger a browser download of an in-memory blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
