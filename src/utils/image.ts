import type { AdjustmentState } from "@/types";

/**
 * Load an image from a URL and return the element once decoded.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Build a CSS filter string for the three filter-based adjustments
 * (brightness, contrast, saturation). Returns `undefined` when all
 * values are at their defaults so the caller can skip setting it.
 */
export function buildCSSFilter(
  adjustments: AdjustmentState
): string | undefined {
  const parts: string[] = [];
  if (adjustments.brightness !== 100)
    parts.push(`brightness(${adjustments.brightness}%)`);
  if (adjustments.contrast !== 100)
    parts.push(`contrast(${adjustments.contrast}%)`);
  if (adjustments.saturation !== 100)
    parts.push(`saturate(${adjustments.saturation}%)`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}
