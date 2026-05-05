/**
 * Download a Blob as a file using the native createObjectURL approach.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Download multiple blobs with a small delay between each to avoid
 * browser download throttling.
 */
export async function downloadMultipleBlobs(
  files: { blob: Blob; filename: string }[]
): Promise<void> {
  for (const file of files) {
    downloadBlob(file.blob, file.filename);
    // Small delay between downloads so browsers don't block them
    if (files.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}
