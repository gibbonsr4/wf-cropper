import { describe, it, expect } from "vitest";
import { buildCSSFilter } from "./image";
import { DEFAULT_ADJUSTMENTS, type AdjustmentState } from "@/types";

describe("buildCSSFilter", () => {
  it("returns undefined when all filter values are at defaults", () => {
    expect(buildCSSFilter(DEFAULT_ADJUSTMENTS)).toBeUndefined();
  });

  it("includes brightness when changed", () => {
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, brightness: 120 };
    expect(buildCSSFilter(adj)).toBe("brightness(120%)");
  });

  it("includes contrast when changed", () => {
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, contrast: 80 };
    expect(buildCSSFilter(adj)).toBe("contrast(80%)");
  });

  it("includes saturation when changed", () => {
    const adj: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, saturation: 110 };
    expect(buildCSSFilter(adj)).toBe("saturate(110%)");
  });

  it("combines multiple filter parts in order", () => {
    const adj: AdjustmentState = {
      ...DEFAULT_ADJUSTMENTS,
      brightness: 120,
      contrast: 90,
      saturation: 110,
    };
    expect(buildCSSFilter(adj)).toBe(
      "brightness(120%) contrast(90%) saturate(110%)"
    );
  });

  it("ignores non-filter adjustments (warmth, shadows, etc)", () => {
    const adj: AdjustmentState = {
      ...DEFAULT_ADJUSTMENTS,
      warmth: 150,
      shadows: 50,
      highlights: 150,
      vibrance: 120,
      sharpness: 150,
    };
    // None of those should produce CSS filter output
    expect(buildCSSFilter(adj)).toBeUndefined();
  });
});
