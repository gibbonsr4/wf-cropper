import { useEffect, useRef, useState } from "react";
import type { AdjustmentState, CroppedArea } from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";
import { applyPixelAdjustments } from "@/utils/adjustments";
import { buildCSSFilter, loadImage } from "@/utils/image";

export interface HistogramData {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  lum: Uint32Array;
  /** Max bin count across all channels — useful for normalizing the y-axis. */
  peak: number;
}

const ANALYSIS_SIZE = 192;

/**
 * Compute a 256-bin-per-channel histogram of an image with the given
 * adjustments applied, mimicking the full export pipeline at a small
 * analysis resolution so updates feel responsive to slider drags.
 *
 * When `crop` is provided (in source-image coordinates), only that
 * rectangle is sampled — so the histogram reflects what actually gets
 * exported rather than the full original image. Pass undefined to
 * analyze the whole image.
 *
 * Debounced to 200 ms. Cancellation uses a monotonic request token
 * (not a shared cancel flag) so an in-flight computation that began
 * under a previous effect run can't escape its own cancellation and
 * overwrite state with stale data.
 */
export function useHistogram(
  imageSrc: string,
  adjustments: AdjustmentState,
  crop?: CroppedArea | null
): HistogramData | null {
  const [data, setData] = useState<HistogramData | null>(null);

  // Bumped on every effect tear-down. Each async run captures the token
  // value at start and compares against the ref before committing — any
  // value other than equality means a newer run has superseded this one.
  const requestToken = useRef(0);

  // Stable key for the crop so React doesn't re-run the effect just
  // because a caller passes a freshly-allocated { x, y, width, height }
  // object that's value-equal.
  const cropKey = crop
    ? `${crop.x}|${crop.y}|${crop.width}|${crop.height}`
    : "full";

  useEffect(() => {
    const token = ++requestToken.current;
    const isStale = () => requestToken.current !== token;

    const timer = setTimeout(async () => {
      try {
        const img = await loadImage(imageSrc);
        if (isStale()) return;

        // Source region to sample — either the crop rectangle or the
        // entire image.
        const sx = crop?.x ?? 0;
        const sy = crop?.y ?? 0;
        const sw = crop?.width ?? img.naturalWidth;
        const sh = crop?.height ?? img.naturalHeight;

        const scale = Math.min(1, ANALYSIS_SIZE / Math.max(sw, sh));
        const w = Math.max(1, Math.round(sw * scale));
        const h = Math.max(1, Math.round(sh * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        // Apply CSS-filter adjustments (brightness/contrast/saturation) on
        // the first draw so they get baked into the pixel buffer we sample.
        const cssFilter = buildCSSFilter(adjustments);
        if (cssFilter) ctx.filter = cssFilter;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        ctx.filter = "none";
        if (isStale()) return;

        // Pixel-based adjustments (warmth/shadows/highlights/vibrance).
        // Sharpness is intentionally skipped — it doesn't change the
        // tonal distribution meaningfully but costs us a blur pass.
        applyPixelAdjustments(canvas, {
          ...adjustments,
          sharpness: DEFAULT_ADJUSTMENTS.sharpness,
        });
        if (isStale()) return;

        const image = ctx.getImageData(0, 0, w, h);
        const r = new Uint32Array(256);
        const g = new Uint32Array(256);
        const b = new Uint32Array(256);
        const lum = new Uint32Array(256);
        const d = image.data;
        let peak = 0;

        for (let i = 0; i < d.length; i += 4) {
          const rv = d[i];
          const gv = d[i + 1];
          const bv = d[i + 2];
          r[rv]++;
          g[gv]++;
          b[bv]++;
          const l = Math.round(rv * 0.299 + gv * 0.587 + bv * 0.114);
          lum[l]++;
        }
        for (let i = 0; i < 256; i++) {
          if (r[i] > peak) peak = r[i];
          if (g[i] > peak) peak = g[i];
          if (b[i] > peak) peak = b[i];
          if (lum[i] > peak) peak = lum[i];
        }

        if (isStale()) return;
        setData({ r, g, b, lum, peak });
      } catch (err) {
        if (!isStale()) {
          console.error("Histogram computation failed:", err);
        }
      }
    }, 200);

    return () => {
      // Bump the token so any in-flight async work becomes stale and
      // aborts at its next checkpoint. Also clear the pending timer so
      // a rapid re-run doesn't kick off duplicate work.
      //
      // The linter warns that `requestToken.current` may have changed
      // by the time cleanup runs — which is exactly what we want here.
      // This isn't a DOM ref; it's a shared monotonic counter, and the
      // whole point of reading/mutating it in cleanup is to signal to
      // any running async code that it's been superseded. Suppressing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestToken.current++;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, adjustments, cropKey]);

  return data;
}
