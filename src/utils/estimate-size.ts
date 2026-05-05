import type { TemplateOutput } from "@/types";

/**
 * Byte-size estimator for encoded images. This is a deliberately-rough
 * heuristic for the UI hint next to the quality slider — actual files
 * can vary by ±40 % depending on content complexity.
 *
 * The model:
 *
 *   size ≈ overhead + pixels × bpp × (quality / 80) ^ 1.1
 *
 * Three things changed from the original version after a real-world
 * undershoot (estimate reported 3 KB, actual exported 33 KB):
 *
 * 1. Added per-format fixed overhead. Small outputs are dominated by
 *    file-format headers (JFIF + Huffman/quantization tables for
 *    JPEG, container + frame headers for WebP, AV1 sequence header +
 *    box structure for AVIF). Without this the estimate collapses to
 *    near-zero at low resolution, which isn't how real encoders
 *    behave.
 * 2. Softened the quality curve from quadratic to ^1.1. Real encoders
 *    have a compression floor — the quadratic was dropping quality-10
 *    estimates to 1-2 % of quality-80, which doesn't match reality.
 *    1.1 roughly matches measured JPEG/WebP scaling between q10 and
 *    q100.
 * 3. Raised PNG bpp from 1.0 to 3.0. 1.0 was calibrated for simple
 *    graphics; typical 24-bit photo PNGs are 2.5-4 bpp.
 *
 * The bpp numbers reflect what `canvas.toBlob()` actually produces —
 * a bit higher than what reference encoders (libjpeg-turbo, cwebp,
 * libavif) output because the browser's built-in encoders are less
 * aggressively tuned. Ordering still holds: AVIF < WebP < JPEG < PNG
 * at the same dimensions + quality.
 */

const BPP_AT_Q80: Record<TemplateOutput["outputFormat"], number> = {
  jpeg: 0.18,
  webp: 0.13,
  avif: 0.08,
  png: 3.0,
};

const OVERHEAD_BYTES: Record<TemplateOutput["outputFormat"], number> = {
  jpeg: 5000,
  webp: 2000,
  avif: 3000,
  png: 1500,
};

const QUALITY_EXPONENT = 1.1;

export function estimateFileSize(
  width: number,
  height: number,
  format: TemplateOutput["outputFormat"],
  quality: number
): number {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  if (width <= 0 || height <= 0) return 0;

  const bpp = BPP_AT_Q80[format];
  const overhead = OVERHEAD_BYTES[format];
  const pixels = width * height;

  if (format === "png") {
    // PNG is lossless — quality slider has no effect.
    return Math.round(overhead + pixels * bpp);
  }

  // Clamp to [10, 100] so extreme slider values don't produce
  // nonsensical estimates (real encoders also clamp).
  const qClamped = Math.max(10, Math.min(100, quality));
  const qNorm = qClamped / 80;
  const factor = Math.pow(qNorm, QUALITY_EXPONENT);
  return Math.round(overhead + pixels * bpp * factor);
}

/**
 * Human-readable byte count: "120 B", "2.7 KB", "340 KB", "1.4 MB".
 * Uses one decimal under 10 KB so tiny files don't show "0 KB" or
 * round away meaningful distinctions (2.3 → "2 KB" vs "2.3 KB"); uses
 * integer KB up to 1 MB; one decimal up to 10 MB; integer MB beyond.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 10_000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  const mb = bytes / 1_000_000;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
