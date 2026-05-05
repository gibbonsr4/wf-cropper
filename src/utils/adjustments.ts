import type { AdjustmentState } from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";

/** Canvas-agnostic alias so this file works in both the main thread and
 *  Web Workers (which have OffscreenCanvas but not document). */
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Create a scratch canvas of the same flavor as `original`, so worker
 *  code gets OffscreenCanvas and main-thread code gets HTMLCanvasElement. */
function createScratchCanvas(original: AnyCanvas, w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined" && original instanceof OffscreenCanvas) {
    return new OffscreenCanvas(w, h);
  }
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  // Worker fallback if the input wasn't an OffscreenCanvas somehow
  return new OffscreenCanvas(w, h);
}

/**
 * Apply pixel-based tone/color adjustments (warmth, shadows, highlights, vibrance)
 * to a canvas. CSS-filter adjustments (brightness, contrast, saturation) are handled
 * separately via ctx.filter in the export pipeline.
 *
 * NOTE: Sharpness is intentionally NOT applied here. Sharpening should happen at
 * output resolution (after resize) so detail isn't blurred away by downsampling.
 * Callers that want sharpening should invoke applySharpness() on the final canvas.
 */
export function applyPixelAdjustments<C extends AnyCanvas>(
  canvas: C,
  adjustments: AdjustmentState
): C {
  const hasPixelAdjustments =
    adjustments.warmth !== 100 ||
    adjustments.shadows !== 100 ||
    adjustments.highlights !== 100 ||
    adjustments.whites !== 100 ||
    adjustments.blacks !== 100 ||
    adjustments.vibrance !== 100;

  if (!hasPixelAdjustments) return canvas;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  {
    // Warmth: approximate color temperature shift using Planckian locus
    // Slider 100 = neutral (~6500K), 0 = cool (~10000K), 200 = warm (~3500K)
    const warmthAmount = (adjustments.warmth - 100) / 100; // -1 to +1
    const warmthR =
      warmthAmount > 0
        ? warmthAmount * 0.15 // warm: boost red gently
        : warmthAmount * 0.08; // cool: reduce red gently
    const warmthG = warmthAmount * 0.02; // tiny green shift
    const warmthB =
      warmthAmount > 0
        ? -warmthAmount * 0.12 // warm: reduce blue
        : -warmthAmount * 0.18; // cool: boost blue more

    const shadowsAmount = (adjustments.shadows - 100) / 100;
    const highlightsAmount = (adjustments.highlights - 100) / 100;
    const whitesAmount = (adjustments.whites - 100) / 100;
    const blacksAmount = (adjustments.blacks - 100) / 100;
    const vibranceAmount = (adjustments.vibrance - 100) / 100;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Warmth: per-channel gain based on color temperature curve
      if (warmthAmount !== 0) {
        r = clamp(r * (1 + warmthR));
        g = clamp(g * (1 + warmthG));
        b = clamp(b * (1 + warmthB));
      }

      // Shadows: lift dark tones using a smooth S-curve in luminance space
      if (shadowsAmount !== 0) {
        const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        // Smooth cubic rolloff — strongest at pure black, fades by lum 0.5
        const shadowWeight = lum < 0.5 ? 2 * (0.5 - lum) * (0.5 - lum) : 0;
        // Additive lift in linear space, proportional to each channel
        // to preserve color ratios
        if (shadowWeight > 0) {
          const lift = shadowsAmount * shadowWeight * 80;
          const maxC = Math.max(r, g, b, 1);
          r = clamp(r + lift * (r / maxC));
          g = clamp(g + lift * (g / maxC));
          b = clamp(b + lift * (b / maxC));
        }
      }

      // Blacks: endpoint control on the darkest tones — linear ramp from
      // 1.0 at pure black to 0 at lum 0.25, so the whole near-black range
      // gets meaningful effect (the previous squared curve died off too
      // quickly). Positive lifts blacks toward grey; negative crushes
      // them deeper.
      if (blacksAmount !== 0) {
        const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        const blackWeight = Math.max(0, 0.25 - lum) * 4;
        if (blackWeight > 0) {
          const lift = blacksAmount * blackWeight * 140;
          const maxC = Math.max(r, g, b, 1);
          r = clamp(r + lift * (r / maxC));
          g = clamp(g + lift * (g / maxC));
          b = clamp(b + lift * (b / maxC));
        }
      }

      // Whites: endpoint control on the brightest tones — symmetric to
      // Blacks. Linear ramp from 0 at lum 0.75 to 1.0 at pure white.
      // Positive pushes whites toward clipping; negative recovers them.
      // Stronger and more localized than Highlights, which targets the
      // broader upper-mid range.
      if (whitesAmount !== 0) {
        const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        const whiteWeight = Math.max(0, lum - 0.75) * 4;
        if (whiteWeight > 0) {
          const push = whitesAmount * whiteWeight * 140;
          const maxC = Math.max(r, g, b, 1);
          r = clamp(r + push * (r / maxC));
          g = clamp(g + push * (g / maxC));
          b = clamp(b + push * (b / maxC));
        }
      }

      // Highlights: compress or expand bright tones
      if (highlightsAmount !== 0) {
        const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        // Smooth cubic rolloff — strongest at pure white, fades by lum 0.5
        const highlightWeight = lum > 0.5 ? 2 * (lum - 0.5) * (lum - 0.5) : 0;
        if (highlightWeight > 0) {
          // Positive = brighten highlights, negative = recover (pull down).
          // Matches Lightroom convention and the adjacent shadows slider
          // (shadowsAmount > 0 → lift). The unary minus that used to
          // be here had the direction inverted — `highlights = 40` (below
          // default) was brightening bright pixels instead of recovering
          // them.
          const pull = highlightsAmount * highlightWeight * 60;
          const maxC = Math.max(r, g, b, 1);
          r = clamp(r + pull * (r / maxC));
          g = clamp(g + pull * (g / maxC));
          b = clamp(b + pull * (b / maxC));
        }
      }

      // Vibrance: smart saturation that protects already-saturated colors
      if (vibranceAmount !== 0) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        // Less effect on already-saturated colors
        const factor = vibranceAmount * (1 - saturation) * 0.5;
        const avg = (r + g + b) / 3;
        r = clamp(r + (r - avg) * factor);
        g = clamp(g + (g - avg) * factor);
        b = clamp(b + (b - avg) * factor);
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

/**
 * Apply sharpening (unsharp mask) to a canvas. Call this AFTER any resize so
 * the sharpening radius is tuned to output resolution, not source resolution.
 */
export function applySharpness<C extends AnyCanvas>(
  canvas: C,
  sharpness: number
): C {
  if (sharpness === 100) return canvas;
  applyUnsharpMask(canvas, (sharpness - 100) / 100);
  return canvas;
}

/**
 * Apply clarity (mid-tone local contrast) — a wide-radius unsharp mask
 * weighted toward mid-tones so it adds "punch" to structure without
 * crushing shadows or blowing highlights. Distinct from Sharpness:
 * sharpness uses a small radius and targets edges; clarity uses a large
 * radius and operates on broader luminance regions.
 */
export function applyClarity<C extends AnyCanvas>(
  canvas: C,
  clarity: number
): C {
  if (clarity === 100) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  // Larger blur than sharpness — clarity operates on structure scale.
  // 80 chosen to land around 12–35 px on typical export dimensions.
  const diagPx = Math.sqrt(w * w + h * h);
  const radius = Math.max(8, Math.min(40, diagPx / 80));

  const blurCanvas = createScratchCanvas(canvas, w, h);
  const blurCtx = blurCanvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  blurCtx.filter = `blur(${radius}px)`;
  blurCtx.drawImage(canvas as CanvasImageSource, 0, 0);

  const original = ctx.getImageData(0, 0, w, h);
  const blurred = blurCtx.getImageData(0, 0, w, h);
  const oData = original.data;
  const bData = blurred.data;

  const amount = (clarity - 100) / 100;
  const strength = amount * 0.9;

  for (let i = 0; i < oData.length; i += 4) {
    // Mid-tone weight: parabolic peak at lum 0.5, fades to 0 at extremes
    const lum =
      (oData[i] * 0.2126 + oData[i + 1] * 0.7152 + oData[i + 2] * 0.0722) /
      255;
    const midWeight = Math.max(0, 1 - 4 * (lum - 0.5) * (lum - 0.5));
    if (midWeight <= 0) continue;
    const factor = strength * midWeight;
    for (let c = 0; c < 3; c++) {
      const diff = oData[i + c] - bData[i + c];
      oData[i + c] = clamp(oData[i + c] + diff * factor);
    }
  }

  ctx.putImageData(original, 0, 0);
  return canvas;
}

/**
 * Unsharp mask with adaptive radius and luminance threshold.
 * Avoids sharpening noise in smooth areas and haloing on strong edges.
 */
function applyUnsharpMask(canvas: AnyCanvas, amount: number) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  // Scale blur radius with image size for consistent perceptual effect
  const diagPx = Math.sqrt(w * w + h * h);
  const radius = Math.max(0.8, Math.min(3, diagPx / 1200));

  // Create blurred copy (OffscreenCanvas in worker, HTMLCanvasElement in main)
  const blurCanvas = createScratchCanvas(canvas, w, h);
  const blurCtx = blurCanvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  blurCtx.filter = `blur(${radius}px)`;
  // HTMLImageElement/HTMLCanvasElement/OffscreenCanvas are all drawImage-able
  blurCtx.drawImage(canvas as CanvasImageSource, 0, 0);

  const original = ctx.getImageData(0, 0, w, h);
  const blurred = blurCtx.getImageData(0, 0, w, h);
  const oData = original.data;
  const bData = blurred.data;

  const strength = amount * 1.2;
  // Threshold: ignore differences below this to avoid sharpening noise
  const threshold = 4;

  for (let i = 0; i < oData.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = oData[i + c] - bData[i + c];
      // Skip sub-threshold differences (noise)
      if (Math.abs(diff) < threshold) continue;
      oData[i + c] = clamp(oData[i + c] + diff * strength);
    }
  }

  ctx.putImageData(original, 0, 0);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// --- Auto Correction ---

interface HistogramData {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  lum: Uint32Array;
}

function computeHistogram(imageData: ImageData): HistogramData {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const lum = new Uint32Array(256);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    r[data[i]]++;
    g[data[i + 1]]++;
    b[data[i + 2]]++;
    const l = Math.round(
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    );
    lum[l]++;
  }

  return { r, g, b, lum };
}

/**
 * Find the value at a given percentile in a histogram channel.
 */
function percentile(channel: Uint32Array, pct: number, total: number): number {
  const target = total * pct;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += channel[i];
    if (sum >= target) return i;
  }
  return 255;
}

/**
 * Auto Brightness/Contrast: Analyze luminance histogram and compute
 * optimal brightness/contrast slider values.
 */
export function autoBrightnessContrast(
  canvas: HTMLCanvasElement
): Pick<AdjustmentState, "brightness" | "contrast"> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hist = computeHistogram(imageData);
  const totalPixels = imageData.data.length / 4;

  // Find 1st and 99th percentile of luminance
  const low = percentile(hist.lum, 0.01, totalPixels);
  const high = percentile(hist.lum, 0.99, totalPixels);

  // Current midpoint and range
  const midpoint = (low + high) / 2;
  const range = high - low;

  // Target: midpoint at 128, range spanning ~230
  const targetMid = 128;
  const targetRange = 230;

  // Map to slider values (100 = no change)
  const brightness = 100 + ((targetMid - midpoint) / 128) * 50;
  const contrast = range > 0 ? 100 * (targetRange / range) : 100;

  return {
    brightness: Math.round(Math.max(50, Math.min(150, brightness))),
    contrast: Math.round(Math.max(50, Math.min(150, contrast))),
  };
}

/**
 * Auto Tone Recovery: Detect crushed shadows and blown highlights from
 * the luminance histogram, then return targeted shadows / highlights
 * adjustments. Conservative by design — only recovers, never crushes
 * or blows further. Brightness/contrast is set by autoBrightnessContrast;
 * shadows/highlights handle dynamic-range cases that global tone can't
 * fix on its own (e.g. bright sky over dark foreground).
 */
export function autoToneRecovery(
  canvas: HTMLCanvasElement
): Pick<AdjustmentState, "highlights" | "shadows"> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hist = computeHistogram(imageData);
  const totalPixels = imageData.data.length / 4;

  // Share of pixels stuck in the brightest 10% (lum 230-255) and
  // darkest 10% (lum 0-25) of the histogram.
  let topPx = 0;
  for (let i = 230; i < 256; i++) topPx += hist.lum[i];
  let bottomPx = 0;
  for (let i = 0; i < 26; i++) bottomPx += hist.lum[i];
  const topPct = topPx / totalPixels;
  const bottomPct = bottomPx / totalPixels;

  // Recover highlights only when noticeably clipped (>5%). Slope tuned
  // so a heavily-blown image (25% in top 10%) lands at highlights=70.
  let highlights = 100;
  if (topPct > 0.05) {
    highlights = Math.max(70, 100 - (topPct - 0.05) * 150);
  }

  // Lift shadows only when noticeably crushed. Symmetric slope —
  // 25% crushed → shadows=130.
  let shadows = 100;
  if (bottomPct > 0.05) {
    shadows = Math.min(130, 100 + (bottomPct - 0.05) * 150);
  }

  return {
    highlights: Math.round(highlights),
    shadows: Math.round(shadows),
  };
}

/**
 * Auto Color: Analyze per-channel histograms to remove color casts.
 * Returns warmth and saturation adjustments.
 */
export function autoColor(
  canvas: HTMLCanvasElement
): Pick<AdjustmentState, "warmth" | "saturation"> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hist = computeHistogram(imageData);
  const totalPixels = imageData.data.length / 4;

  // Find average of each channel
  let rSum = 0,
    gSum = 0,
    bSum = 0;
  for (let i = 0; i < 256; i++) {
    rSum += i * hist.r[i];
    gSum += i * hist.g[i];
    bSum += i * hist.b[i];
  }
  const rAvg = rSum / totalPixels;
  const gAvg = gSum / totalPixels;
  const bAvg = bSum / totalPixels;
  const overallAvg = (rAvg + gAvg + bAvg) / 3;

  // If red is higher than blue, image is warm — cool it down (and vice versa)
  const warmthDiff = (rAvg - bAvg) / overallAvg;
  const warmth = 100 - warmthDiff * 30; // Compensate

  // Check overall saturation by looking at channel spread
  const channelSpread = Math.max(rAvg, gAvg, bAvg) - Math.min(rAvg, gAvg, bAvg);
  const saturation = channelSpread < 10 ? 110 : 100; // Slight boost if desaturated

  return {
    warmth: Math.round(Math.max(70, Math.min(130, warmth))),
    saturation: Math.round(Math.max(80, Math.min(120, saturation))),
  };
}

/**
 * Auto Enhance: Combines auto brightness/contrast + auto tone recovery
 * (shadows/highlights) + auto color. Sharpness/Clarity/Whites/Blacks
 * are intentionally left at default — sharpness and clarity are
 * stylistic choices that produce the "auto enhance looks weird"
 * results when applied automatically; whites/blacks would double-
 * correct against the contrast formula in autoBrightnessContrast.
 */
export function autoEnhance(
  canvas: HTMLCanvasElement
): Partial<AdjustmentState> {
  const bc = autoBrightnessContrast(canvas);
  const tr = autoToneRecovery(canvas);
  const color = autoColor(canvas);
  return {
    ...DEFAULT_ADJUSTMENTS,
    ...bc,
    ...tr,
    ...color,
    vibrance: 110, // Slight vibrance boost
  };
}

export interface AnalysisCropRegion {
  /** Source-image x-coord of the crop region. */
  x: number;
  /** Source-image y-coord. */
  y: number;
  /** Source-image width. */
  width: number;
  /** Source-image height. */
  height: number;
}

/**
 * Create a small canvas from an image URL for histogram / auto-adjust
 * analysis. Downscales to max 512 px so the pixel loops stay fast.
 *
 * When `crop` is provided, only that sub-rectangle of the source image is
 * sampled — this matches what gets exported, so Auto Enhance / Auto
 * Levels / Auto Color optimize for the visible crop rather than
 * off-frame background that's about to be thrown away.
 */
export async function createAnalysisCanvas(
  imageSrc: string,
  crop?: AnalysisCropRegion
): Promise<HTMLCanvasElement> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageSrc;
  });

  const sx = crop?.x ?? 0;
  const sy = crop?.y ?? 0;
  const sw = crop?.width ?? img.naturalWidth;
  const sh = crop?.height ?? img.naturalHeight;

  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
}
