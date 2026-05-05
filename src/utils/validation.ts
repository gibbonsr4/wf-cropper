import type { Template, ImageMetadata } from "@/types";

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

// ── Template config validation ─────────────────────────────────────

export interface TemplateConfigError {
  templateIndex: number;
  outputIndex?: number;
  field: string;
  message: string;
}

/**
 * Validate a list of templates for completeness before save/download.
 * Returns an empty array when all templates are valid.
 */
export function validateTemplateConfig(
  templates: Template[]
): TemplateConfigError[] {
  const errors: TemplateConfigError[] = [];

  for (let ti = 0; ti < templates.length; ti++) {
    const t = templates[ti];
    if (!t.name.trim()) {
      errors.push({
        templateIndex: ti,
        field: "name",
        message: "Template name is required.",
      });
    }
    if (t.outputs.length === 0) {
      errors.push({
        templateIndex: ti,
        field: "outputs",
        message: "Template must have at least one output.",
      });
    }
    for (let oi = 0; oi < t.outputs.length; oi++) {
      const o = t.outputs[oi];
      if (!o.name.trim()) {
        errors.push({
          templateIndex: ti,
          outputIndex: oi,
          field: "name",
          message: "Output name is required.",
        });
      }
      if (!o.filenameKey?.trim()) {
        errors.push({
          templateIndex: ti,
          outputIndex: oi,
          field: "filenameKey",
          message: "Filename key is required.",
        });
      }
      if (o.outputWidth < 100) {
        errors.push({
          templateIndex: ti,
          outputIndex: oi,
          field: "outputWidth",
          message: "Output width must be at least 100px.",
        });
      }
      if (o.aspectRatio[0] <= 0 || o.aspectRatio[1] <= 0) {
        errors.push({
          templateIndex: ti,
          outputIndex: oi,
          field: "aspectRatio",
          message: "Aspect ratio values must be positive.",
        });
      }
    }
  }

  return errors;
}

export function validateImageForTemplate(
  image: ImageMetadata,
  template: Template
): ValidationResult {
  const warnings: string[] = [];

  if (template.minInputWidth && image.width < template.minInputWidth) {
    warnings.push(
      `Image is ${image.width}px wide; "${template.name}" requires at least ${template.minInputWidth}px.`
    );
  }

  if (template.minInputShortSide) {
    const shortSide = Math.min(image.width, image.height);
    if (shortSide < template.minInputShortSide) {
      warnings.push(
        `Image is too small (${shortSide}px on shortest side). "${template.name}" requires at least ${template.minInputShortSide}px.`
      );
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
