import smartcrop from "smartcrop";
import type { CropHint } from "@/types";

interface SmartCropResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoostRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  weight: number;
}

// ── FaceDetector (Shape Detection API) typings ────────────────────
// The Shape Detection API isn't in lib.dom yet because it's non-standard
// (Chrome-only as of 2026). We declare just enough structure to call it
// safely, with a runtime guard.
interface FaceDetectorConstructor {
  new (options?: {
    fastMode?: boolean;
    maxDetectedFaces?: number;
  }): FaceDetectorInstance;
}
interface FaceDetectorInstance {
  detect(
    source: HTMLImageElement | HTMLCanvasElement | ImageBitmap
  ): Promise<DetectedFace[]>;
}
interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
}
declare global {
  interface Window {
    FaceDetector?: FaceDetectorConstructor;
  }
}

/**
 * Translate a template's cropHint into smartcrop boost regions that bias
 * the suggestion toward where a face is likely to be. This is a heuristic,
 * not real face detection — but for well-composed portraits (subject in
 * the upper-center of the frame) it significantly improves suggestions
 * for headshot templates without any ML overhead.
 */
function boostsFromHint(
  hint: CropHint | undefined | null,
  imageWidth: number,
  imageHeight: number
): BoostRegion[] {
  if (!hint) return [];

  // `face-center`: assume the face is in the upper-center — the top half,
  // horizontally centered. Covers most portraits where the subject looks
  // forward and is roughly vertically centered.
  if (hint === "face-center") {
    return [
      {
        x: Math.round(imageWidth * 0.25),
        y: 0,
        width: Math.round(imageWidth * 0.5),
        height: Math.round(imageHeight * 0.55),
        weight: 1.0,
      },
    ];
  }

  // `face-top`: subject's face is tight against the top — e.g. a group
  // shot where heads are near the top edge. Narrower vertical band.
  if (hint === "face-top") {
    return [
      {
        x: Math.round(imageWidth * 0.2),
        y: 0,
        width: Math.round(imageWidth * 0.6),
        height: Math.round(imageHeight * 0.35),
        weight: 1.0,
      },
    ];
  }

  return [];
}

/**
 * Turn detected face rectangles into smartcrop boost regions, padded
 * slightly so hair, shoulders, and chin sit comfortably inside the
 * boosted area rather than at its edges.
 */
function boostsFromFaces(
  faces: DetectedFace[],
  imageWidth: number,
  imageHeight: number
): BoostRegion[] {
  if (faces.length === 0) return [];
  return faces.map((f) => {
    const bb = f.boundingBox;
    // Pad 25 % horizontally and 40 % vertically (more headroom above,
    // torso space below). Clamp to the image bounds.
    const padX = bb.width * 0.25;
    const padY = bb.height * 0.4;
    const x = Math.max(0, Math.round(bb.x - padX));
    const y = Math.max(0, Math.round(bb.y - padY));
    const w = Math.min(imageWidth - x, Math.round(bb.width + padX * 2));
    const h = Math.min(imageHeight - y, Math.round(bb.height + padY * 2));
    return { x, y, width: w, height: h, weight: 1.0 };
  });
}

/**
 * Try native face detection via window.FaceDetector when available
 * (Chrome Android + desktop with Shape Detection API). Returns null on
 * any failure or when the API is missing so the caller can fall back to
 * the cropHint heuristic.
 */
async function detectFaces(
  image: HTMLImageElement
): Promise<DetectedFace[] | null> {
  if (typeof window === "undefined" || !window.FaceDetector) return null;
  try {
    const detector = new window.FaceDetector({
      fastMode: true,
      maxDetectedFaces: 10,
    });
    const faces = await detector.detect(image);
    return faces;
  } catch (err) {
    // Some implementations throw on unsupported image sources or when
    // the image isn't fully decoded yet. Treat as "no detection."
    console.warn("FaceDetector failed, using hint heuristic:", err);
    return null;
  }
}

export async function suggestCrop(
  imageElement: HTMLImageElement,
  aspectRatio: [number, number],
  cropHint?: CropHint
): Promise<SmartCropResult> {
  // Calculate target dimensions maintaining aspect ratio
  const targetWidth = 1000;
  const targetHeight = Math.round(
    (targetWidth * aspectRatio[1]) / aspectRatio[0]
  );

  // Face-focused hints: try native detection first, fall back to
  // heuristic boosts if unavailable or no faces were found.
  let boost: BoostRegion[] = [];
  if (cropHint === "face-center" || cropHint === "face-top") {
    const faces = await detectFaces(imageElement);
    if (faces && faces.length > 0) {
      boost = boostsFromFaces(
        faces,
        imageElement.naturalWidth,
        imageElement.naturalHeight
      );
    }
  }
  if (boost.length === 0) {
    boost = boostsFromHint(
      cropHint,
      imageElement.naturalWidth,
      imageElement.naturalHeight
    );
  }

  const result = await smartcrop.crop(imageElement, {
    width: targetWidth,
    height: targetHeight,
    ...(boost.length > 0 ? { boost } : {}),
  });

  return result.topCrop;
}

/**
 * Convert smartcrop result (pixel region on original image) to
 * react-easy-crop's crop + zoom format.
 */
export function smartCropToEasyCrop(
  cropRegion: SmartCropResult,
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  aspect: number
) {
  // Calculate what zoom level would show the crop region
  // react-easy-crop zoom=1 means the image fits the container
  const imageAspect = imageWidth / imageHeight;
  const containerAspect = containerWidth / containerHeight;

  let fitWidth: number, fitHeight: number;
  if (imageAspect > containerAspect) {
    fitWidth = containerWidth;
    fitHeight = containerWidth / imageAspect;
  } else {
    fitHeight = containerHeight;
    fitWidth = containerHeight * imageAspect;
  }

  // The crop region width as a fraction of image
  const cropFractionW = cropRegion.width / imageWidth;
  const cropFractionH = cropRegion.height / imageHeight;

  // We want to zoom so the crop region fills the crop area
  // The crop area at zoom=1 has a certain size relative to the image
  const cropAreaAspect = aspect;
  let cropAreaWidth: number, cropAreaHeight: number;
  if (cropAreaAspect > imageAspect) {
    cropAreaWidth = fitWidth;
    cropAreaHeight = fitWidth / cropAreaAspect;
  } else {
    cropAreaHeight = fitHeight;
    cropAreaWidth = fitHeight * cropAreaAspect;
  }

  const zoomW = cropAreaWidth / (cropFractionW * fitWidth);
  const zoomH = cropAreaHeight / (cropFractionH * fitHeight);
  const zoom = Math.max(1, Math.min(zoomW, zoomH));

  // Calculate crop position (center of crop region, as percentage offset)
  const centerXFraction = (cropRegion.x + cropRegion.width / 2) / imageWidth;
  const centerYFraction = (cropRegion.y + cropRegion.height / 2) / imageHeight;

  // react-easy-crop crop.x/y is offset from center in pixels at current zoom
  const scaledWidth = fitWidth * zoom;
  const scaledHeight = fitHeight * zoom;

  const x = -(centerXFraction * scaledWidth - scaledWidth / 2);
  const y = -(centerYFraction * scaledHeight - scaledHeight / 2);

  return { crop: { x, y }, zoom };
}
