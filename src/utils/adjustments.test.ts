import { describe, it, expect } from "vitest";
import {
  applyPixelAdjustments,
  applySharpness,
  autoBrightnessContrast,
  autoColor,
} from "./adjustments";
import { DEFAULT_ADJUSTMENTS, type AdjustmentState } from "@/types";

/** Make a small solid-color canvas for testing. */
function makeCanvas(
  width: number,
  height: number,
  color: [number, number, number] = [128, 128, 128]
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/** Sample the center pixel's RGB values. */
function samplePixel(
  canvas: HTMLCanvasElement
): [number, number, number, number] {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(
    Math.floor(canvas.width / 2),
    Math.floor(canvas.height / 2),
    1,
    1
  ).data;
  return [data[0], data[1], data[2], data[3]];
}

describe("applyPixelAdjustments", () => {
  it("returns canvas unchanged when all adjustments are default", () => {
    const canvas = makeCanvas(10, 10, [100, 100, 100]);
    applyPixelAdjustments(canvas, DEFAULT_ADJUSTMENTS);
    const [r, g, b] = samplePixel(canvas);
    expect(r).toBe(100);
    expect(g).toBe(100);
    expect(b).toBe(100);
  });

  it("warmth > 100 shifts toward warm (more red, less blue)", () => {
    const canvas = makeCanvas(10, 10, [128, 128, 128]);
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, warmth: 200 };
    applyPixelAdjustments(canvas, adj);
    const [r, _g, b] = samplePixel(canvas);
    expect(r).toBeGreaterThan(128);
    expect(b).toBeLessThan(128);
  });

  it("warmth < 100 shifts toward cool (less red, more blue)", () => {
    const canvas = makeCanvas(10, 10, [128, 128, 128]);
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, warmth: 0 };
    applyPixelAdjustments(canvas, adj);
    const [r, _g, b] = samplePixel(canvas);
    expect(r).toBeLessThan(128);
    expect(b).toBeGreaterThan(128);
  });

  it("shadows > 100 lifts dark tones", () => {
    // Use a dark pixel (below lum 0.5)
    const canvas = makeCanvas(10, 10, [30, 30, 30]);
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, shadows: 180 };
    applyPixelAdjustments(canvas, adj);
    const [r] = samplePixel(canvas);
    expect(r).toBeGreaterThan(30);
  });

  it("shadows adjustment does not significantly affect bright tones", () => {
    // A very bright pixel (above lum 0.5)
    const canvas = makeCanvas(10, 10, [240, 240, 240]);
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, shadows: 200 };
    applyPixelAdjustments(canvas, adj);
    const [r] = samplePixel(canvas);
    expect(Math.abs(r - 240)).toBeLessThan(5);
  });

  it("highlights < 100 pulls down bright tones (recovery)", () => {
    const canvas = makeCanvas(10, 10, [230, 230, 230]);
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, highlights: 40 };
    applyPixelAdjustments(canvas, adj);
    const [r] = samplePixel(canvas);
    expect(r).toBeLessThan(230);
  });

  it("highlights > 100 brightens bright tones", () => {
    const canvas = makeCanvas(10, 10, [200, 200, 200]);
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, highlights: 160 };
    applyPixelAdjustments(canvas, adj);
    const [r] = samplePixel(canvas);
    expect(r).toBeGreaterThan(200);
  });

  it("vibrance boosts low-saturation pixels proportionally more than saturated ones", () => {
    // Low saturation gray: (128, 120, 110) — small spread relative to max
    const low = makeCanvas(10, 10, [128, 120, 110]);
    // High saturation red: (230, 20, 20) — already near fully saturated
    const high = makeCanvas(10, 10, [230, 20, 20]);

    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, vibrance: 180 };
    applyPixelAdjustments(low, adj);
    applyPixelAdjustments(high, adj);

    const [lowR, _lowG, lowB] = samplePixel(low);
    const [highR, _highG, highB] = samplePixel(high);

    const originalLowSpread = 128 - 110;
    const originalHighSpread = 230 - 20;
    const lowSpread = lowR - lowB;
    const highSpread = highR - highB;

    // Proportional gain: the low-sat pixel should grow by a larger fraction
    // than the high-sat pixel. This is the intended vibrance behavior —
    // protect already-saturated colors from further clipping.
    const lowRelativeGain =
      (lowSpread - originalLowSpread) / originalLowSpread;
    const highRelativeGain =
      (highSpread - originalHighSpread) / originalHighSpread;
    expect(lowRelativeGain).toBeGreaterThan(highRelativeGain);
  });

  it("clamps output values to [0, 255]", () => {
    // A saturated color with extreme warmth shouldn't overflow
    const canvas = makeCanvas(10, 10, [250, 250, 250]);
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, warmth: 200 };
    applyPixelAdjustments(canvas, adj);
    const [r, g, b] = samplePixel(canvas);
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeLessThanOrEqual(255);
    expect(b).toBeLessThanOrEqual(255);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
  });
});

describe("applySharpness", () => {
  it("returns canvas unchanged when sharpness is default (100)", () => {
    const canvas = makeCanvas(16, 16, [100, 150, 200]);
    const before = samplePixel(canvas);
    applySharpness(canvas, 100);
    const after = samplePixel(canvas);
    expect(after).toEqual(before);
  });

  it("does not crash on small canvases", () => {
    const canvas = makeCanvas(4, 4);
    expect(() => applySharpness(canvas, 150)).not.toThrow();
  });
});

describe("autoBrightnessContrast", () => {
  it("returns brightness/contrast values in 50-150 range", () => {
    const canvas = makeCanvas(32, 32, [50, 50, 50]); // dark uniform image
    const { brightness, contrast } = autoBrightnessContrast(canvas);
    expect(brightness).toBeGreaterThanOrEqual(50);
    expect(brightness).toBeLessThanOrEqual(150);
    expect(contrast).toBeGreaterThanOrEqual(50);
    expect(contrast).toBeLessThanOrEqual(150);
  });

  it("suggests brighter for underexposed images", () => {
    const canvas = makeCanvas(32, 32, [40, 40, 40]);
    const { brightness } = autoBrightnessContrast(canvas);
    expect(brightness).toBeGreaterThan(100);
  });

  it("suggests darker for overexposed images", () => {
    const canvas = makeCanvas(32, 32, [210, 210, 210]);
    const { brightness } = autoBrightnessContrast(canvas);
    expect(brightness).toBeLessThan(100);
  });
});

describe("autoColor", () => {
  it("returns warmth/saturation in valid ranges", () => {
    const canvas = makeCanvas(32, 32, [100, 100, 100]);
    const { warmth, saturation } = autoColor(canvas);
    expect(warmth).toBeGreaterThanOrEqual(70);
    expect(warmth).toBeLessThanOrEqual(130);
    expect(saturation).toBeGreaterThanOrEqual(80);
    expect(saturation).toBeLessThanOrEqual(120);
  });

  it("suggests cooling down a warm-cast image (red-heavy)", () => {
    const canvas = makeCanvas(32, 32, [160, 120, 100]);
    const { warmth } = autoColor(canvas);
    expect(warmth).toBeLessThan(100);
  });

  it("suggests warming up a cool-cast image (blue-heavy)", () => {
    const canvas = makeCanvas(32, 32, [100, 120, 160]);
    const { warmth } = autoColor(canvas);
    expect(warmth).toBeGreaterThan(100);
  });
});
