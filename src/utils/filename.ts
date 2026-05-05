import type { TemplateOutput } from "@/types";

/**
 * Generate an export filename from the pattern template.
 *
 * Supported tokens:
 * - {basename}    - original filename without extension
 * - {filenameKey} - from output config
 * - {width}       - output width
 * - {height}      - output height
 * - {ext}         - file extension from output format
 */
export function generateFilename(
  pattern: string,
  originalFilename: string,
  output: TemplateOutput
): string {
  const basename = sanitizeFilename(originalFilename.replace(/\.[^.]+$/, ""));
  const height =
    output.outputHeight ??
    Math.round(
      (output.outputWidth * output.aspectRatio[1]) / output.aspectRatio[0]
    );
  const ext = output.outputFormat === "jpeg" ? "jpg" : output.outputFormat;

  return pattern
    .replace("{basename}", basename)
    .replace("{filenameKey}", output.filenameKey)
    .replace("{width}", String(output.outputWidth))
    .replace("{height}", String(height))
    .replace("{ext}", ext);
}

function sanitizeFilename(name: string): string {
  // Normalize Unicode, strip combining marks (diacritics) so "café" → "cafe"
  // but preserve the base Latin characters. Remove only characters that are
  // unsafe in filenames across OSes: / \ : * ? " < > | and control chars.
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f/\\:*?"<>|]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .toLowerCase()
  );
}
