import type { AdjustmentState } from "@/types";

/**
 * Thin client that owns a single long-lived pixel worker instance and
 * speaks a message protocol with it. Calls return a Blob the caller
 * can convert to an object URL.
 *
 * Feature detection happens lazily — the first call probes for Worker +
 * OffscreenCanvas support and caches the result. When unsupported we
 * throw, and the caller (useAdjustedImage) falls back to its inline
 * main-thread path so this stays a pure performance enhancement.
 *
 * Cancellation: each logical consumer (a rendering effect instance)
 * passes a `generation` number. A generation is "latest" until the
 * consumer cancels it via `cancelGeneration(gen)`. When a request
 * completes we drop the result if its generation is no longer the
 * latest for its consumer, so stale slider renders don't race to
 * overwrite a fresher one. `AbortSignal` aborts the await and skips
 * the postMessage entirely when the signal fires before the bitmap
 * decode resolves.
 */

interface PendingRequest {
  resolve: (blob: Blob) => void;
  reject: (err: Error) => void;
  generation: number;
  generationKey: string;
}

let worker: Worker | null = null;
let supportChecked = false;
let supported = false;
let nextId = 0;
const pending = new Map<number, PendingRequest>();

// Per-consumer latest-generation table. `generationKey` is stable per
// consumer (e.g. the effect's lifecycle id) and maps to the newest
// generation number the consumer has issued; any result coming back
// with a smaller generation for that key is a stale render and gets
// dropped.
const latestGeneration = new Map<string, number>();

function canUseWorker(): boolean {
  if (supportChecked) return supported;
  supportChecked = true;
  supported =
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined";
  return supported;
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    new URL("../workers/pixel.worker.ts", import.meta.url),
    { type: "module" }
  );
  worker.onmessage = (
    e: MessageEvent<{ id: number; blob: Blob | null; error?: string }>
  ) => {
    const { id, blob, error } = e.data;
    const req = pending.get(id);
    if (!req) return;
    pending.delete(id);
    // Drop stale responses before touching callbacks so the caller
    // doesn't flash an outdated result.
    const latest = latestGeneration.get(req.generationKey);
    if (latest !== undefined && latest !== req.generation) {
      req.reject(new Error("Superseded by newer request"));
      return;
    }
    if (blob) req.resolve(blob);
    else req.reject(new Error(error ?? "Worker returned no blob"));
  };
  worker.onerror = (e) => {
    for (const req of pending.values()) {
      req.reject(new Error(e.message || "Worker error"));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export interface RenderAdjustedOptions {
  /** Stable identifier for the consumer (one per effect lifecycle). */
  generationKey: string;
  /** Monotonic generation within that consumer — increment on each new
   *  request. */
  generation: number;
  /** Optional abort signal. If it fires before the ImageBitmap decode
   *  resolves, the postMessage is skipped and the promise rejects with
   *  `AbortError`. */
  signal?: AbortSignal;
}

/**
 * Render an image with the given adjustments in the worker. Throws if
 * the worker path isn't available so the caller can fall back. Also
 * throws `AbortError` if the signal fires or `Superseded by newer
 * request` when a later generation lands first.
 */
export async function renderAdjustedInWorker(
  imageSrc: string,
  width: number,
  height: number,
  adjustments: AdjustmentState,
  options: RenderAdjustedOptions
): Promise<Blob> {
  if (!canUseWorker()) {
    throw new Error("Worker pipeline unsupported in this environment");
  }
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Mark this generation as the latest for the consumer. Any in-flight
  // request with the same key and a smaller generation becomes stale.
  latestGeneration.set(options.generationKey, options.generation);

  // Decode off the network — cheap fast path when the source is an
  // object URL pointing at a blob that was already downloaded.
  const response = await fetch(imageSrc);
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const srcBlob = await response.blob();
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const bitmap = await createImageBitmap(srcBlob);
  if (options.signal?.aborted) {
    bitmap.close();
    throw new DOMException("Aborted", "AbortError");
  }
  // Between the decode and the postMessage, a newer generation may have
  // been issued. Skip transferring the bitmap if so.
  if (latestGeneration.get(options.generationKey) !== options.generation) {
    bitmap.close();
    throw new Error("Superseded by newer request");
  }

  const id = nextId++;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      generation: options.generation,
      generationKey: options.generationKey,
    });
    // If the signal aborts after we've posted, still reject early so
    // the caller doesn't hang waiting for the worker response.
    options.signal?.addEventListener(
      "abort",
      () => {
        const req = pending.get(id);
        if (!req) return;
        pending.delete(id);
        req.reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
    getWorker().postMessage(
      { id, type: "render", bitmap, width, height, adjustments },
      [bitmap]
    );
  });
}

/** Drop any latest-generation record for a consumer. Call during cleanup
 *  so results that come back after the consumer is gone are discarded. */
export function cancelGeneration(generationKey: string): void {
  latestGeneration.delete(generationKey);
}

/** Internal: feature-detection surface for tests / debugging. */
export function __isWorkerSupported(): boolean {
  return canUseWorker();
}
