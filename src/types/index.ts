export type CropHint = "face-center" | "face-top" | "center" | null;

export interface TemplateOutput {
  id: string;
  name: string;
  aspectRatio: [number, number];
  outputWidth: number;
  outputHeight: number | null;
  outputFormat: "webp" | "jpeg" | "png" | "avif";
  quality: number;
  filenameKey: string;
  cropHint?: CropHint;
  /**
   * Extra formats to export alongside `outputFormat`, sharing the same
   * crop + dimensions + quality. Common pattern: WebP as the primary
   * with JPEG as a fallback. Duplicates of `outputFormat` are ignored.
   */
  additionalFormats?: ("webp" | "jpeg" | "png" | "avif")[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  minInputWidth: number | null;
  minInputShortSide: number | null;
  outputs: TemplateOutput[];
}

export interface AppConfig {
  templates: Template[];
  filenamePattern: string;
}

export interface ImageMetadata {
  file: File;
  width: number;
  height: number;
  size: number;
  format: string;
  objectUrl: string;
}

export interface CropState {
  crop: { x: number; y: number };
  zoom: number;
  rotation: number;
  croppedAreaPixels: CroppedArea | null;
}

export interface CroppedArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AdjustmentState {
  // CSS filter adjustments (instant preview, 0-200, 100 = no change)
  brightness: number;
  contrast: number;
  saturation: number;
  // Pixel-based adjustments (debounced preview, 0-200, 100 = no change)
  warmth: number;
  shadows: number;
  highlights: number;
  whites: number;
  blacks: number;
  vibrance: number;
  sharpness: number;
  clarity: number;
}

export const DEFAULT_ADJUSTMENTS: AdjustmentState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 100,
  shadows: 100,
  highlights: 100,
  whites: 100,
  blacks: 100,
  vibrance: 100,
  sharpness: 100,
  clarity: 100,
};
