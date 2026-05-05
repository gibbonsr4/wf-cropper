import { downloadBlob } from "./download";

/**
 * Lazy-load jszip and bundle the given files into a single archive, then
 * trigger a single download. jszip is ~40kB gzipped, so we import it only
 * on demand — the majority of single-template exports (1–2 files) skip it
 * entirely.
 *
 * Falls back to individual downloads if jszip fails to load for any
 * reason (network error, older browser without dynamic import, etc.).
 */
export async function downloadAsZip(
  files: { blob: Blob; filename: string }[],
  zipFilename: string
): Promise<void> {
  if (files.length === 0) return;
  try {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.filename, f.blob);
    }
    const archive = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      // WebP/JPEG/PNG/AVIF are already compressed; low compression level
      // keeps ZIP generation fast without meaningfully shrinking the
      // archive further.
      compressionOptions: { level: 1 },
    });
    downloadBlob(archive, zipFilename);
  } catch (err) {
    console.error("ZIP creation failed, falling back to individual downloads:", err);
    for (const f of files) {
      downloadBlob(f.blob, f.filename);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}
