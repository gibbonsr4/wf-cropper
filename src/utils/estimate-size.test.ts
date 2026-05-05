import { describe, it, expect } from "vitest";
import { estimateFileSize, formatBytes } from "./estimate-size";

describe("estimateFileSize", () => {
  it("returns 0 for non-finite inputs", () => {
    expect(estimateFileSize(NaN, 100, "webp", 80)).toBe(0);
    expect(estimateFileSize(100, Infinity, "webp", 80)).toBe(0);
  });

  it("returns 0 for non-positive dimensions", () => {
    expect(estimateFileSize(0, 100, "webp", 80)).toBe(0);
    expect(estimateFileSize(100, -10, "webp", 80)).toBe(0);
  });

  it("returns quality-independent size for PNG", () => {
    const a = estimateFileSize(1000, 1000, "png", 20);
    const b = estimateFileSize(1000, 1000, "png", 100);
    expect(a).toBe(b);
  });

  it("avif is smaller than webp which is smaller than jpeg at same quality", () => {
    const avif = estimateFileSize(1000, 1000, "avif", 80);
    const webp = estimateFileSize(1000, 1000, "webp", 80);
    const jpeg = estimateFileSize(1000, 1000, "jpeg", 80);
    expect(avif).toBeLessThan(webp);
    expect(webp).toBeLessThan(jpeg);
  });

  it("higher quality produces larger files for lossy formats", () => {
    const q50 = estimateFileSize(1000, 1000, "jpeg", 50);
    const q80 = estimateFileSize(1000, 1000, "jpeg", 80);
    const q100 = estimateFileSize(1000, 1000, "jpeg", 100);
    expect(q50).toBeLessThan(q80);
    expect(q80).toBeLessThan(q100);
  });

  it("doubling the pixel count roughly doubles the estimate", () => {
    const a = estimateFileSize(1000, 1000, "webp", 80);
    const b = estimateFileSize(1000, 2000, "webp", 80);
    expect(b / a).toBeCloseTo(2, 1);
  });

  it("clamps quality to [10, 100] range", () => {
    // Below-min quality should behave like q=10, not scale further down
    const clamped = estimateFileSize(1000, 1000, "jpeg", 5);
    const atMin = estimateFileSize(1000, 1000, "jpeg", 10);
    expect(clamped).toBe(atMin);
  });

  it("includes fixed format overhead (small outputs don't estimate 0)", () => {
    // A 50×50 WebP at q10 has ~2500 pixels of content; the content
    // term alone would be tiny. Overhead + content should keep the
    // estimate at least in the low-KB range, matching what real
    // encoders produce for thumbnails.
    const tiny = estimateFileSize(50, 50, "webp", 10);
    expect(tiny).toBeGreaterThan(1500); // at least the overhead
  });

  it("JPEG has larger overhead than WebP (JFIF + tables)", () => {
    // For very small outputs where content cost is negligible, the
    // overhead dominates. JPEG should clearly exceed WebP here.
    const jpegTiny = estimateFileSize(10, 10, "jpeg", 80);
    const webpTiny = estimateFileSize(10, 10, "webp", 80);
    expect(jpegTiny).toBeGreaterThan(webpTiny);
  });

  it("quality curve is soft — q=20 is not 1/16 of q=80 (it's more)", () => {
    // Guards against regressing to the old quadratic curve. With a
    // softened ^1.1 exponent, q=20 is roughly 22 % of q=80's content
    // cost, not the ~6 % the old ^2 gave.
    const q80 = estimateFileSize(1000, 1000, "webp", 80);
    const q20 = estimateFileSize(1000, 1000, "webp", 20);
    // Subtract overhead from both so we compare content scaling.
    const overhead = 2000;
    const ratio = (q20 - overhead) / (q80 - overhead);
    expect(ratio).toBeGreaterThan(0.15);
  });

  it("PNG of a photo-sized image is in MB, not KB", () => {
    // 1920×1080 24-bit PNG of a real photo lands around 6 MB. The
    // old bpp=1.0 put this at 2 MB which was a 3× under-estimate.
    const png = estimateFileSize(1920, 1080, "png", 100);
    expect(png).toBeGreaterThan(5_000_000); // > 5 MB
    expect(png).toBeLessThan(8_000_000); // but not > 8 MB
  });
});

describe("formatBytes", () => {
  it("uses B under 1000", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("shows one decimal in KB under 10 KB (so 2.7 KB doesn't round to 3)", () => {
    expect(formatBytes(1000)).toBe("1.0 KB");
    expect(formatBytes(2700)).toBe("2.7 KB");
    expect(formatBytes(9500)).toBe("9.5 KB");
  });

  it("uses integer KB between 10 KB and 1 MB", () => {
    expect(formatBytes(10_000)).toBe("10 KB");
    expect(formatBytes(128_000)).toBe("128 KB");
    expect(formatBytes(999_000)).toBe("999 KB");
  });

  it("uses MB above 1 MB with one decimal under 10 MB", () => {
    expect(formatBytes(1_400_000)).toBe("1.4 MB");
    expect(formatBytes(9_900_000)).toBe("9.9 MB");
  });

  it("uses integer MB at or above 10 MB", () => {
    expect(formatBytes(10_000_000)).toBe("10 MB");
    expect(formatBytes(24_500_000)).toBe("25 MB");
  });
});
