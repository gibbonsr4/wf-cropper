/// <reference lib="webworker" />
/**
 * Pixel-operations worker. Moves the adjusted-preview pipeline off the
 * main thread so slider drags and sharpness on large images don't block
 * scrolling, input handling, or other UI work.
 *
 * Receives an ImageBitmap (transferred, zero copy) plus adjustments and
 * returns a PNG Blob of the adjusted result. The caller converts the
 * Blob to an object URL.
 */
import {
  applyPixelAdjustments,
  applySharpness,
} from "@/utils/adjustments";
import type { AdjustmentState } from "@/types";

interface RenderRequest {
  id: number;
  type: "render";
  bitmap: ImageBitmap;
  width: number;
  height: number;
  adjustments: AdjustmentState;
}

interface RenderResponse {
  id: number;
  blob: Blob | null;
  error?: string;
}

self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { id, bitmap, width, height, adjustments } = e.data;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Failed to acquire 2D context in worker");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    applyPixelAdjustments(canvas, adjustments);
    applySharpness(canvas, adjustments.sharpness);

    const blob = await canvas.convertToBlob({ type: "image/png" });
    const response: RenderResponse = { id, blob };
    self.postMessage(response);
  } catch (err) {
    const response: RenderResponse = {
      id,
      blob: null,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  } finally {
    // We're done with the transferred bitmap — release GPU memory.
    bitmap.close();
  }
};
