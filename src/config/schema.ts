import { z } from "zod";
import type {
  AppConfig,
  CropHint,
  Template,
  TemplateOutput,
} from "@/types";

/**
 * Zod schemas for the runtime config shape, used to validate:
 *  - `public/config.json` (static fallback)
 *  - `/api/config` responses (KV-backed, production)
 *  - Wizard/admin edits before saving
 *
 * On schema failure, callers should log the error and fall back to the next
 * config source (API → static → built-in defaults) so a malformed JSON file
 * doesn't break the app for users.
 */

const cropHintSchema: z.ZodType<CropHint> = z
  .union([
    z.literal("face-center"),
    z.literal("face-top"),
    z.literal("center"),
    z.null(),
  ]);

const outputFormatSchema = z.union([
  z.literal("webp"),
  z.literal("jpeg"),
  z.literal("png"),
  z.literal("avif"),
]);

// Aspect ratio tuple: [num, denom], both positive numbers.
const aspectRatioSchema = z
  .tuple([z.number().positive(), z.number().positive()])
  .refine(([w, h]) => Number.isFinite(w) && Number.isFinite(h), {
    message: "aspectRatio must be two finite positive numbers",
  });

// `.strict()` on each object so a typo'd or renamed field (e.g. someone
// writing `cropHints` or `outputFormats`) surfaces as a validation error
// instead of being silently stripped. The fallback chain (API → static
// → defaults) still works: a strict failure just means we skip that
// source with a console.warn and try the next.
const templateOutputSchema: z.ZodType<TemplateOutput> = z
  .object({
    id: z.string().min(1, "id is required"),
    name: z.string().min(1, "name is required"),
    aspectRatio: aspectRatioSchema,
    outputWidth: z.number().int().positive(),
    outputHeight: z.number().int().positive().nullable(),
    outputFormat: outputFormatSchema,
    quality: z.number().int().min(1).max(100),
    filenameKey: z.string().min(1, "filenameKey is required"),
    cropHint: cropHintSchema.optional(),
    additionalFormats: z.array(outputFormatSchema).optional(),
  })
  .strict();

const templateSchema: z.ZodType<Template> = z
  .object({
    id: z.string().min(1, "id is required"),
    name: z.string().min(1, "name is required"),
    description: z.string(),
    minInputWidth: z.number().int().positive().nullable(),
    minInputShortSide: z.number().int().positive().nullable(),
    outputs: z
      .array(templateOutputSchema)
      .min(1, "a template must have at least one output"),
  })
  .strict();

export const appConfigSchema: z.ZodType<AppConfig> = z
  .object({
    templates: z.array(templateSchema).min(1, "config must have ≥1 template"),
    filenamePattern: z.string().min(1, "filenamePattern is required"),
  })
  .strict();

export type ConfigValidationResult =
  | { success: true; data: AppConfig }
  | { success: false; error: string };

/**
 * Validate an unknown JSON payload against the AppConfig schema.
 * Returns a discriminated-union result so callers can handle failures
 * gracefully without try/catch.
 */
export function validateAppConfig(input: unknown): ConfigValidationResult {
  const result = appConfigSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Flatten Zod's issues into a compact, human-readable message.
  const issues = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  return { success: false, error: `Invalid config — ${issues}` };
}
