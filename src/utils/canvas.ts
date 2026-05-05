import type { CroppedArea, AdjustmentState, TemplateOutput } from "@/types";
import { applyPixelAdjustments, applyClarity, applySharpness } from "./adjustments";
import { loadImage, buildCSSFilter } from "./image";

/**
 * Renders the cropped, adjusted, and resized image to a Blob.
 */
export async function renderCroppedImage(
  imageSrc: string,
  cropArea: CroppedArea,
  adjustments: AdjustmentState,
  output: TemplateOutput
): Promise<Blob> {
  const image = await loadImage(imageSrc);

  // Step 1: Crop the region from the source image
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropArea.width;
  cropCanvas.height = cropArea.height;
  const cropCtx = cropCanvas.getContext("2d")!;
  cropCtx.imageSmoothingEnabled = true;
  cropCtx.imageSmoothingQuality = "high";

  // Apply CSS-type adjustments via canvas filter (brightness, contrast, saturation)
  const cssFilter = buildCSSFilter(adjustments);
  if (cssFilter) {
    cropCtx.filter = cssFilter;
  }

  cropCtx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    cropArea.width,
    cropArea.height
  );

  // Reset filter before pixel operations
  cropCtx.filter = "none";

  // Step 2: Apply tone/color pixel adjustments. Sharpening and clarity are
  // deferred until after resize so their radii are tuned to output
  // resolution, not source resolution.
  applyPixelAdjustments(cropCanvas, adjustments);

  // Step 3: Resize to target dimensions using multi-step downsampling
  const targetWidth = output.outputWidth;
  const targetHeight =
    output.outputHeight ??
    Math.round(
      (output.outputWidth * output.aspectRatio[1]) / output.aspectRatio[0]
    );

  const resized = multiStepResize(cropCanvas, targetWidth, targetHeight);

  // Step 4: Local-contrast and edge sharpening at output resolution.
  // Clarity (wide radius, mid-tone weighted) before Sharpness (narrow
  // radius, edge-focused) so the order matches typical photo workflows.
  applyClarity(resized, adjustments.clarity);
  applySharpness(resized, adjustments.sharpness);

  // Step 5: Encode to target format. AVIF support is inconsistent across
  // browsers as of 2026 (Safari 16.4+, Chrome 85+, Firefox 113+). We
  // feature-detect and surface a clear error rather than letting toBlob
  // silently fail with null.
  if (output.outputFormat === "avif" && !(await canEncodeAvif())) {
    throw new Error(
      "AVIF encoding isn't supported in this browser. Pick WebP or JPEG instead."
    );
  }

  const mimeType = formatToMime(output.outputFormat);
  const quality = output.quality / 100;

  return new Promise((resolve, reject) => {
    resized.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new Error(
              `Failed to encode image as ${output.outputFormat.toUpperCase()}`
            )
          );
      },
      mimeType,
      quality
    );
  });
}

/**
 * Multi-step downsampling for high-quality resize.
 * Halves dimensions until close to target, then does a final resize.
 */
function multiStepResize(
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  let currentWidth = source.width;
  let currentHeight = source.height;
  let current: HTMLCanvasElement = source;

  // Step down by halves until within 2x of target
  while (currentWidth / 2 > targetWidth && currentHeight / 2 > targetHeight) {
    const stepWidth = Math.round(currentWidth / 2);
    const stepHeight = Math.round(currentHeight / 2);
    const step = document.createElement("canvas");
    step.width = stepWidth;
    step.height = stepHeight;
    const ctx = step.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, stepWidth, stepHeight);
    current = step;
    currentWidth = stepWidth;
    currentHeight = stepHeight;
  }

  // Final resize to exact target
  if (currentWidth !== targetWidth || currentHeight !== targetHeight) {
    const final = document.createElement("canvas");
    final.width = targetWidth;
    final.height = targetHeight;
    const ctx = final.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, targetWidth, targetHeight);
    return final;
  }

  return current;
}

function formatToMime(format: string): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    default:
      return "image/webp";
  }
}

/**
 * Cached AVIF encode-capability check. Browsers that can't encode AVIF
 * will call toBlob's callback with null. We detect once and memoize so
 * the export pipeline can decide whether to fall back to WebP.
 */
let avifSupportPromise: Promise<boolean> | null = null;
export function canEncodeAvif(): Promise<boolean> {
  if (avifSupportPromise) return avifSupportPromise;
  avifSupportPromise = new Promise((resolve) => {
    try {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      c.toBlob(
        (blob) => resolve(blob !== null && blob.type === "image/avif"),
        "image/avif"
      );
    } catch {
      resolve(false);
    }
  });
  return avifSupportPromise;
}
