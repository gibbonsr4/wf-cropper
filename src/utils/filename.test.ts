import { describe, it, expect } from "vitest";
import { generateFilename } from "./filename";
import type { TemplateOutput } from "@/types";

const PATTERN = "{basename}__{filenameKey}__{width}x{height}.{ext}";

function makeOutput(overrides: Partial<TemplateOutput> = {}): TemplateOutput {
  return {
    id: "out-1",
    name: "Output",
    aspectRatio: [16, 9],
    outputWidth: 1600,
    outputHeight: null,
    outputFormat: "webp",
    quality: 80,
    filenameKey: "hero",
    ...overrides,
  };
}

describe("generateFilename", () => {
  it("substitutes all tokens with sensible values", () => {
    const result = generateFilename(PATTERN, "photo.jpg", makeOutput());
    // 16:9 of 1600 → 900 height
    expect(result).toBe("photo__hero__1600x900.webp");
  });

  it("uses explicit outputHeight when provided", () => {
    const result = generateFilename(
      PATTERN,
      "photo.jpg",
      makeOutput({ outputHeight: 500, outputWidth: 1200 })
    );
    expect(result).toBe("photo__hero__1200x500.webp");
  });

  it("maps jpeg format to .jpg extension", () => {
    const result = generateFilename(
      PATTERN,
      "photo.jpg",
      makeOutput({ outputFormat: "jpeg" })
    );
    expect(result.endsWith(".jpg")).toBe(true);
  });

  it("preserves png extension", () => {
    const result = generateFilename(
      PATTERN,
      "photo.jpg",
      makeOutput({ outputFormat: "png" })
    );
    expect(result.endsWith(".png")).toBe(true);
  });

  it("uses .avif extension for avif format", () => {
    const result = generateFilename(
      PATTERN,
      "photo.jpg",
      makeOutput({ outputFormat: "avif" })
    );
    expect(result.endsWith(".avif")).toBe(true);
  });

  it("strips the original extension from basename", () => {
    const result = generateFilename(PATTERN, "IMG_1234.HEIC", makeOutput());
    expect(result.startsWith("img_1234__")).toBe(true);
  });

  it("lowercases the basename", () => {
    const result = generateFilename(PATTERN, "Photo.JPG", makeOutput());
    expect(result.startsWith("photo__")).toBe(true);
  });

  describe("Unicode handling", () => {
    it("preserves base ASCII letters after stripping diacritics (café → cafe)", () => {
      const result = generateFilename(
        PATTERN,
        "Café Müller 2026.jpg",
        makeOutput()
      );
      expect(result).toBe("cafe-muller-2026__hero__1600x900.webp");
    });

    it("handles composed diacritics (NFC input → NFKD then strip marks)", () => {
      // "é" composed (single codepoint U+00E9)
      const result = generateFilename(PATTERN, "caf\u00e9.jpg", makeOutput());
      expect(result).toBe("cafe__hero__1600x900.webp");
    });

    it("handles decomposed diacritics (NFD input)", () => {
      // "é" decomposed (e + combining acute U+0301)
      const result = generateFilename(
        PATTERN,
        "cafe\u0301.jpg",
        makeOutput()
      );
      expect(result).toBe("cafe__hero__1600x900.webp");
    });

    it("strips unsafe filesystem chars", () => {
      const result = generateFilename(
        PATTERN,
        'bad/name:with*stars<and>pipes|.jpg',
        makeOutput()
      );
      // Slashes/colons/etc removed, spaces → hyphens
      expect(result).not.toMatch(/[/\\:*?"<>|]/);
    });

    it("collapses whitespace runs into single hyphen", () => {
      const result = generateFilename(
        PATTERN,
        "too    many     spaces.jpg",
        makeOutput()
      );
      expect(result.startsWith("too-many-spaces__")).toBe(true);
    });

    it("trims leading/trailing hyphens and dots", () => {
      const result = generateFilename(
        PATTERN,
        "  ..weird-.name..  .jpg",
        makeOutput()
      );
      const basename = result.split("__")[0];
      expect(basename).not.toMatch(/^[-.]/);
      expect(basename).not.toMatch(/[-.]$/);
    });
  });

  describe("pattern flexibility", () => {
    it("supports a minimal pattern with just extension", () => {
      const result = generateFilename("{basename}.{ext}", "test.jpg", makeOutput());
      expect(result).toBe("test.webp");
    });

    it("leaves unknown tokens unreplaced", () => {
      const result = generateFilename(
        "{basename}-{unknown}.{ext}",
        "test.jpg",
        makeOutput()
      );
      expect(result).toBe("test-{unknown}.webp");
    });
  });
});
