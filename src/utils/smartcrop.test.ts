import { describe, it, expect } from "vitest";
import { smartCropToEasyCrop } from "./smartcrop";

describe("smartCropToEasyCrop", () => {
  // A crop region that matches the full image → zoom should be 1 and offset 0
  it("returns zoom=1 when crop fills the whole image at matching aspect", () => {
    const { crop, zoom } = smartCropToEasyCrop(
      { x: 0, y: 0, width: 1000, height: 562 },
      1000,
      562,
      1000,
      562,
      1000 / 562
    );
    expect(zoom).toBeCloseTo(1, 2);
    expect(crop.x).toBeCloseTo(0, 1);
    expect(crop.y).toBeCloseTo(0, 1);
  });

  it("returns zoom >= 1 when the crop region is smaller than the image", () => {
    const { zoom } = smartCropToEasyCrop(
      { x: 100, y: 100, width: 500, height: 500 },
      1000,
      1000,
      800,
      600,
      1 // square aspect
    );
    expect(zoom).toBeGreaterThan(1);
  });

  it("centers the crop when the region is centered on the image", () => {
    const { crop } = smartCropToEasyCrop(
      { x: 250, y: 250, width: 500, height: 500 },
      1000,
      1000,
      800,
      600,
      1
    );
    // Crop region center is at (500, 500) — the image center. With a centered
    // crop, the offset should be ~0 (within sub-pixel rounding).
    expect(Math.abs(crop.x)).toBeLessThan(1);
    expect(Math.abs(crop.y)).toBeLessThan(1);
  });

  it("never returns zoom < 1", () => {
    // Even for oversized crop regions, zoom should clamp to 1
    const { zoom } = smartCropToEasyCrop(
      { x: 0, y: 0, width: 2000, height: 2000 },
      1000,
      1000,
      800,
      600,
      1
    );
    expect(zoom).toBeGreaterThanOrEqual(1);
  });

  it("offsets crop when region is off-center", () => {
    // Top-left 500x500 of a 1000x1000 image
    const { crop } = smartCropToEasyCrop(
      { x: 0, y: 0, width: 500, height: 500 },
      1000,
      1000,
      800,
      600,
      1
    );
    // Crop center at (250, 250) is left/above image center (500, 500),
    // so the displayed image must shift right/down (positive x, positive y).
    expect(crop.x).toBeGreaterThan(0);
    expect(crop.y).toBeGreaterThan(0);
  });

  it("handles wide-aspect crop targets (16:9) on square image", () => {
    const { zoom } = smartCropToEasyCrop(
      { x: 0, y: 200, width: 1000, height: 562 },
      1000,
      1000,
      1000,
      562,
      16 / 9
    );
    expect(zoom).toBeCloseTo(1, 1);
    expect(Number.isFinite(zoom)).toBe(true);
  });
});
