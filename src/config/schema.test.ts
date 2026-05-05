import { describe, it, expect } from "vitest";
import { validateAppConfig } from "./schema";
import { defaultConfig } from "./default-config";
import type { AppConfig } from "@/types";

describe("validateAppConfig", () => {
  it("accepts the built-in default config", () => {
    const result = validateAppConfig(defaultConfig);
    expect(result.success).toBe(true);
  });

  it("accepts a minimal valid config", () => {
    const minimal: AppConfig = {
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [16, 9],
              outputWidth: 1600,
              outputHeight: null,
              outputFormat: "webp",
              quality: 80,
              filenameKey: "hero",
            },
          ],
        },
      ],
    };
    const result = validateAppConfig(minimal);
    expect(result.success).toBe(true);
  });

  it("rejects configs with zero templates", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("templates");
    }
  });

  it("rejects templates with zero outputs", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [],
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("outputs");
    }
  });

  it("rejects unknown outputFormat", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [1, 1],
              outputWidth: 1000,
              outputHeight: null,
              outputFormat: "tiff", // invalid
              quality: 80,
              filenameKey: "x",
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects quality outside 1-100", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [1, 1],
              outputWidth: 1000,
              outputHeight: null,
              outputFormat: "webp",
              quality: 150, // invalid
              filenameKey: "x",
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative outputWidth", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [1, 1],
              outputWidth: -500, // invalid
              outputHeight: null,
              outputFormat: "webp",
              quality: 80,
              filenameKey: "x",
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid cropHint values", () => {
    for (const hint of ["face-center", "face-top", "center", null]) {
      const result = validateAppConfig({
        filenamePattern: "{basename}.{ext}",
        templates: [
          {
            id: "t1",
            name: "Test",
            description: "",
            minInputWidth: null,
            minInputShortSide: null,
            outputs: [
              {
                id: "o1",
                name: "Default",
                aspectRatio: [1, 1],
                outputWidth: 1000,
                outputHeight: null,
                outputFormat: "webp",
                quality: 80,
                filenameKey: "x",
                cropHint: hint,
              },
            ],
          },
        ],
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown cropHint", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [1, 1],
              outputWidth: 1000,
              outputHeight: null,
              outputFormat: "webp",
              quality: 80,
              filenameKey: "x",
              cropHint: "left-edge", // invalid
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty filenamePattern", () => {
    const result = validateAppConfig({
      filenamePattern: "",
      templates: defaultConfig.templates,
    });
    expect(result.success).toBe(false);
  });

  it("accepts additionalFormats as an array of valid formats", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [1, 1],
              outputWidth: 1000,
              outputHeight: null,
              outputFormat: "webp",
              quality: 80,
              filenameKey: "x",
              additionalFormats: ["jpeg", "avif"],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown format in additionalFormats", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [1, 1],
              outputWidth: 1000,
              outputHeight: null,
              outputFormat: "webp",
              quality: 80,
              filenameKey: "x",
              additionalFormats: ["tiff"],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys at the top level (strict schema)", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: defaultConfig.templates,
      // Typo'd or future-unrecognized field
      globalQuality: 90,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys on a template (strict schema)", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [1, 1],
              outputWidth: 1000,
              outputHeight: null,
              outputFormat: "webp",
              quality: 80,
              filenameKey: "x",
            },
          ],
          // Typo for a field that doesn't exist
          cropHint: "face-center",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys on a template output (strict schema)", () => {
    const result = validateAppConfig({
      filenamePattern: "{basename}.{ext}",
      templates: [
        {
          id: "t1",
          name: "Test",
          description: "",
          minInputWidth: null,
          minInputShortSide: null,
          outputs: [
            {
              id: "o1",
              name: "Default",
              aspectRatio: [1, 1],
              outputWidth: 1000,
              outputHeight: null,
              outputFormat: "webp",
              quality: 80,
              filenameKey: "x",
              // Common typo
              cropHints: "face-center",
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("returns a non-empty error string on failure", () => {
    const result = validateAppConfig({ bogus: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error).toMatch(/Invalid config/i);
    }
  });

  it("produces a discriminated-union type with data on success", () => {
    const result = validateAppConfig(defaultConfig);
    if (result.success) {
      // Type-narrowed: result.data is AppConfig
      expect(result.data.templates.length).toBeGreaterThan(0);
      expect(typeof result.data.filenamePattern).toBe("string");
    }
  });
});
