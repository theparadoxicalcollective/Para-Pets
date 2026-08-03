export const VISIBLE_ALPHA_THRESHOLD = 12;
export const VISIBLE_IMAGE_ANALYSIS_MAX_DIMENSION = 512;

export type VisibleImageBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type AnalyzedVisibleImage = {
  image: HTMLImageElement;
  sourceWidth: number;
  sourceHeight: number;
  bounds: VisibleImageBounds;
};

export function findVisibleImageBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = VISIBLE_ALPHA_THRESHOLD,
): VisibleImageBounds | null {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return null;

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] < alphaThreshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;

  // right/bottom are exclusive so the complete edge pixel is retained when drawn.
  right += 1;
  bottom += 1;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export function containVisibleArtwork(
  bounds: Pick<VisibleImageBounds, "width" | "height">,
  targetWidth: number,
  targetHeight: number,
) {
  const scale = Math.min(targetWidth / bounds.width, targetHeight / bounds.height);
  return {
    width: bounds.width * scale,
    height: bounds.height * scale,
    x: (targetWidth - bounds.width * scale) / 2,
    y: (targetHeight - bounds.height * scale) / 2,
    scale,
  };
}

// A bounded cache prevents the prior unbounded retention of full decoded source
// HTMLImageElements. Pet Care safe mode bypasses this cache/canvas path entirely.
const VISIBLE_IMAGE_CACHE_LIMIT = 24;
const analysisCache = new Map<string, Promise<AnalyzedVisibleImage>>();

export function getVisibleImageAnalysis(
  url: string,
  analyze: (url: string) => Promise<AnalyzedVisibleImage> = analyzeVisibleImage,
) {
  let pending = analysisCache.get(url);
  if (!pending) {
    pending = analyze(url);
    analysisCache.set(url, pending);
    if (analysisCache.size > VISIBLE_IMAGE_CACHE_LIMIT) {
      analysisCache.delete(analysisCache.keys().next().value!);
    }
  }
  return pending;
}

export function clearVisibleImageAnalysisCacheForTests() {
  analysisCache.clear();
}

async function analyzeVisibleImage(url: string): Promise<AnalyzedVisibleImage> {
  const image = new Image();
  image.decoding = "async";
  // Same-origin URLs and data URLs need no CORS mode. Remote URLs can opt in;
  // servers without CORS safely reach the component's contain fallback.
  if (!url.startsWith("/") && !url.startsWith("data:") && new URL(url, window.location.href).origin !== window.location.origin) {
    image.crossOrigin = "anonymous";
  }

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Unable to load item artwork: ${url}`));
    image.src = url;
  });

  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("Item artwork has invalid dimensions");
  const reduction = Math.min(1, VISIBLE_IMAGE_ANALYSIS_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * reduction));
  const height = Math.max(1, Math.round(sourceHeight * reduction));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas image analysis is unsupported");
  context.drawImage(image, 0, 0, width, height);
  const sampled = findVisibleImageBounds(context.getImageData(0, 0, width, height).data, width, height);
  if (!sampled) throw new Error("Item artwork is completely transparent");
  const scaleX = sourceWidth / width;
  const scaleY = sourceHeight / height;
  const bounds = {
    left: sampled.left * scaleX,
    top: sampled.top * scaleY,
    right: sampled.right * scaleX,
    bottom: sampled.bottom * scaleY,
    width: sampled.width * scaleX,
    height: sampled.height * scaleY,
    centerX: sampled.centerX * scaleX,
    centerY: sampled.centerY * scaleY,
  };
  return { image, sourceWidth, sourceHeight, bounds };
}
