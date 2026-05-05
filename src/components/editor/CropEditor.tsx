import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Cropper from "react-easy-crop";
import { useToast } from "@/hooks/useStatusToast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useShortcutPreference } from "@/hooks/useShortcutPreference";
import type {
  Template,
  TemplateOutput,
  ImageMetadata,
  CropState,
  CroppedArea,
  AdjustmentState,
} from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";
import CropControls from "./CropControls";
import AdjustmentSliders from "./AdjustmentSliders";
import HorizonDrawOverlay from "./HorizonDrawOverlay";
import TemplateSelector from "@/components/templates/TemplateSelector";
import EditorTopBar from "./EditorTopBar";
import TemplatePill from "./TemplatePill";
import OutputNavigator from "./OutputNavigator";
import ImageNavigator from "./ImageNavigator";
import OutputOverridePanel, {
  type OutputOverride,
} from "./OutputOverridePanel";
import { Section } from "@/components/ui/section";
import { useConfig } from "@/hooks/useConfig";
import { suggestCrop, smartCropToEasyCrop } from "@/utils/smartcrop";
import {
  applyPixelAdjustments,
  applySharpness,
  autoBrightnessContrast,
  autoColor,
  autoEnhance,
  createAnalysisCanvas,
} from "@/utils/adjustments";
import { loadImage, buildCSSFilter } from "@/utils/image";
import {
  useKeyboardShortcuts,
  type Shortcut,
} from "@/hooks/useKeyboardShortcuts";
import { useUndoHistory } from "@/hooks/useUndoHistory";
import {
  renderAdjustedInWorker,
  cancelGeneration,
} from "@/utils/pixel-worker-client";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { HistoryPopover } from "./HistoryPopover";

/**
 * Export plan for a multi-image crop session. One entry per image; each
 * entry lists which outputs to render (with overrides applied) and the
 * per-image adjustments. Single-image sessions pass an array of length 1.
 */
export interface MultiImageExportPlan {
  perImage: Array<{
    image: ImageMetadata;
    adjustments: AdjustmentState;
    outputs: Map<
      string,
      { output: TemplateOutput; cropArea: CroppedArea }
    >;
  }>;
}

interface CropEditorProps {
  /** One or more images. The editor shows the ImageNavigator when
   *  length > 1 and users step through them as a queue. */
  images: ImageMetadata[];
  template: Template;
  onTemplateChange: (template: Template) => void;
  onExport: (plan: MultiImageExportPlan) => void;
  onBack: () => void;
  /**
   * Per-slot replacement. The editor opens a file picker for the active
   * image, and hands the picked File + its queue index up to the host.
   * The host swaps just that slot via useImageLoader.replaceImageAt.
   */
  onReplaceImage: (index: number, file: File) => void;
  /** Whether an export is in progress (from parent). */
  exporting?: boolean;
}

interface AdjustedImageResult {
  src: string;
  scale: number; // ratio of preview size to original (1 = no downscale)
}

/**
 * Pre-render the image with pixel-based adjustments (warmth, shadows,
 * highlights, vibrance, sharpness) and return a blob URL for the cropper.
 * Uses a downscaled version (max 2048px) for performance.
 */
function useAdjustedImage(
  originalSrc: string,
  originalWidth: number,
  originalHeight: number,
  adjustments: AdjustmentState
): AdjustedImageResult {
  const [result, setResult] = useState<AdjustedImageResult>({
    src: originalSrc,
    scale: 1,
  });
  const prevBlobUrl = useRef<string | null>(null);
  // Stable id per hook instance — the worker client uses this as the
  // "consumer key" so stale renders for this hook can be dropped on
  // completion.
  const consumerKey = useRef(
    `adj-${Math.random().toString(36).slice(2)}`
  ).current;
  // Monotonic generation counter bumped on every effect tick.
  const generationRef = useRef(0);

  const hasPixelAdjustments =
    adjustments.warmth !== 100 ||
    adjustments.shadows !== 100 ||
    adjustments.highlights !== 100 ||
    adjustments.vibrance !== 100 ||
    adjustments.sharpness !== 100;

  useEffect(() => {
    if (!hasPixelAdjustments) {
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = null;
      }
      setResult({ src: originalSrc, scale: 1 });
      return;
    }

    // Each effect run gets its own cancellation. `generation` is the
    // worker-client token — any response for a smaller generation under
    // this consumerKey is a stale render and gets dropped client-side.
    let cancelled = false;
    const generation = ++generationRef.current;
    const abortController = new AbortController();
    let rafId = 0;

    const timer = setTimeout(() => {
      rafId = requestAnimationFrame(() => {
        if (!cancelled) renderAdjusted();
      });
    }, 120);

    return () => {
      cancelled = true;
      abortController.abort();
      clearTimeout(timer);
      if (rafId) cancelAnimationFrame(rafId);
    };

    async function renderAdjusted() {
      try {
        const maxDim = 2048;
        const scale = Math.min(
          1,
          maxDim / Math.max(originalWidth, originalHeight)
        );
        const w = Math.round(originalWidth * scale);
        const h = Math.round(originalHeight * scale);

        // Try the Web Worker first — keeps the main thread free during
        // slider drags and sharpness passes on big images. Falls back to
        // the main-thread path on unsupported browsers or any thrown
        // error. Stale/aborted runs surface as rejections that we swallow.
        let blob: Blob | null = null;
        try {
          blob = await renderAdjustedInWorker(
            originalSrc,
            w,
            h,
            adjustments,
            {
              generationKey: consumerKey,
              generation,
              signal: abortController.signal,
            }
          );
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
          // Any other error: fall through to main-thread path.
        }
        if (cancelled) return;

        if (!blob) {
          const img = await loadImage(originalSrc);
          if (cancelled) return;

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, w, h);

          applyPixelAdjustments(canvas, adjustments);
          applySharpness(canvas, adjustments.sharpness);
          if (cancelled) return;

          blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/png")
          );
        }

        if (cancelled) {
          // Effect was torn down while encoding was in flight — discard
          // the blob so we don't leak a URL or race with a fresher render.
          return;
        }
        if (blob) {
          if (prevBlobUrl.current) {
            URL.revokeObjectURL(prevBlobUrl.current);
          }
          const url = URL.createObjectURL(blob);
          prevBlobUrl.current = url;
          setResult({ src: url, scale });
        }
      } catch (err) {
        if (!cancelled) console.error("Failed to render adjusted image:", err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    originalSrc,
    hasPixelAdjustments,
    adjustments.warmth,
    adjustments.shadows,
    adjustments.highlights,
    adjustments.vibrance,
    adjustments.sharpness,
  ]);

  useEffect(() => {
    return () => {
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current);
      }
      // Drop any latest-generation record so late responses for this
      // consumer get discarded instead of landing in a fresh instance.
      cancelGeneration(consumerKey);
    };
  }, [consumerKey]);

  return result;
}

/**
 * Minimum zoom required for the rotated image to fully cover the crop
 * area, expressed in react-easy-crop's `zoom` units (where zoom=1 means
 * the image is fitted to the cropper container via object-fit:contain).
 *
 * Math: at zoom=1 the displayed image is `mediaSize` pixels and the
 * crop area is `cropSize` pixels (computed exactly the way react-easy-
 * crop computes them internally — taking the largest aspect-correct
 * rectangle that fits in the contained media). For an axis-aligned crop
 * of (cropW, cropH) to fit inside the rotated image, the crop's
 * un-rotated bounding box must fit inside the (mediaW × zoom, mediaH ×
 * zoom) rectangle:
 *
 *   cropW·|cosθ| + cropH·|sinθ| ≤ mediaW · zoom
 *   cropH·|cosθ| + cropW·|sinθ| ≤ mediaH · zoom
 *
 * The previous version of this function did the math as if mediaSize
 * always equaled the natural image dimensions, which over-estimated by
 * roughly the container-fit factor — a 45° rotation on a 1:1 crop of a
 * 16:9 image asked for ~2.8× zoom when the real requirement is ~1.4×.
 * That's the "WAY too much zoom" the editor was showing.
 */
function computeMinZoom(
  rotationDeg: number,
  imageW: number,
  imageH: number,
  containerW: number,
  containerH: number,
  cropAspect: number
): number {
  if (containerW <= 0 || containerH <= 0 || imageW <= 0 || imageH <= 0) {
    return 1;
  }
  const rotRad = (Math.abs(rotationDeg) * Math.PI) / 180;
  const sinA = Math.abs(Math.sin(rotRad));
  const cosA = Math.abs(Math.cos(rotRad));
  if (sinA < 0.001) return 1;

  const imageAspect = imageW / imageH;
  const containerAspect = containerW / containerH;

  // Media size at zoom=1 — object-fit:contain
  let mediaW: number, mediaH: number;
  if (imageAspect >= containerAspect) {
    mediaW = containerW;
    mediaH = containerW / imageAspect;
  } else {
    mediaH = containerH;
    mediaW = containerH * imageAspect;
  }

  // Crop area at zoom=1 — react-easy-crop's getCropSize uses the
  // ROTATED bounding box of the media, then clamps to container, then
  // applies aspect. Our previous version skipped the rotation step,
  // which was why the bump under-shot at non-cardinal angles (the crop
  // frame actually grows on rotation, requiring more zoom to cover it).
  const rotatedMediaW = mediaW * cosA + mediaH * sinA;
  const rotatedMediaH = mediaW * sinA + mediaH * cosA;
  const fittingW = Math.min(rotatedMediaW, containerW);
  const fittingH = Math.min(rotatedMediaH, containerH);
  let cropW: number, cropH: number;
  if (fittingW > fittingH * cropAspect) {
    cropW = fittingH * cropAspect;
    cropH = fittingH;
  } else {
    cropW = fittingW;
    cropH = fittingW / cropAspect;
  }

  // Geometric minimum + small safety margin. The exact minimum has the
  // crop's corners tangent to the image edges; in practice CSS pixel
  // rounding + the crop frame's stroke width make even a 1-pixel gap
  // visible. 3 % is enough to absorb that without feeling lurchy.
  const exact = Math.max(
    (cropW * cosA + cropH * sinA) / mediaW,
    (cropH * cosA + cropW * sinA) / mediaH
  );
  return Math.max(1, exact * 1.03);
}

/**
 * Mirror of useAdjustedImage's internal scale math so the export pipeline
 * can convert each image's stored croppedAreaPixels (in preview-image
 * coordinates) back to source-image coordinates. Scale is 1 unless
 * pixel adjustments are engaged AND the image's long side exceeds the
 * preview cap (2048px).
 */
function computePreviewScale(
  image: ImageMetadata,
  adjustments: AdjustmentState
): number {
  const hasPixelAdjustments =
    adjustments.warmth !== 100 ||
    adjustments.shadows !== 100 ||
    adjustments.highlights !== 100 ||
    adjustments.vibrance !== 100 ||
    adjustments.sharpness !== 100;
  if (!hasPixelAdjustments) return 1;
  const maxDim = 2048;
  return Math.min(1, maxDim / Math.max(image.width, image.height));
}

/** Apply an override onto a template output, returning the effective output. */
function applyOverride(
  base: TemplateOutput,
  override: OutputOverride | undefined
): TemplateOutput {
  if (!override) return base;
  return {
    ...base,
    outputWidth: override.width ?? base.outputWidth,
    // If width is overridden, recompute height from aspect unless explicitly set
    outputHeight:
      override.width !== undefined
        ? null // let downstream compute from aspect + new width
        : base.outputHeight,
    outputFormat: override.format ?? base.outputFormat,
    quality: override.quality ?? base.quality,
  };
}

/** Compute effective height for an output (using aspect if not set). */
function effectiveHeight(o: TemplateOutput): number {
  return (
    o.outputHeight ??
    Math.round((o.outputWidth * o.aspectRatio[1]) / o.aspectRatio[0])
  );
}

/** Snapshot shape mirrored from inside the component so the diff helper
 *  can live at module scope (faster, testable). */
interface EditorSnapshotShape {
  adjustments: AdjustmentState;
  cropStates: Array<[string, CropState]>;
  baseRotations: Array<[string, number]>;
  overrides: Array<[string, unknown]>;
  overrideEnabled: Array<[string, boolean]>;
  showGrid: boolean;
}

const ADJUSTMENT_KEYS: Array<keyof AdjustmentState> = [
  "brightness",
  "contrast",
  "saturation",
  "warmth",
  "shadows",
  "highlights",
  "vibrance",
  "sharpness",
];

/**
 * Detect common multi-field adjustment patterns so the history label
 * reads "Auto Enhance" or "Auto Levels" instead of the less-useful
 * "Adjust 5 sliders." Auto Enhance changes brightness + contrast +
 * warmth + saturation + vibrance (see autoEnhance in adjustments.ts);
 * Auto Levels hits just brightness + contrast; Auto Color hits just
 * warmth + saturation.
 */
function detectAutoPattern(
  changed: Array<keyof AdjustmentState>
): string | null {
  const set = new Set(changed);
  const has = (k: keyof AdjustmentState) => set.has(k);
  if (
    has("brightness") &&
    has("contrast") &&
    has("warmth") &&
    has("saturation") &&
    has("vibrance")
  ) {
    return "Auto Enhance";
  }
  if (
    changed.length === 2 &&
    has("brightness") &&
    has("contrast")
  ) {
    return "Auto Levels";
  }
  if (changed.length === 2 && has("warmth") && has("saturation")) {
    return "Auto Color";
  }
  return null;
}

/**
 * Produce a short, human-readable label for the transition between two
 * consecutive history snapshots. Checks are ordered most-specific-first
 * so labels stay actionable ("Rotate +90°") rather than generic ("Edit").
 * Multi-field adjustment changes are matched against known auto patterns
 * (Auto Enhance / Levels / Color); unmatched multi-field changes show
 * "Adjust N sliders" so users know something batchy happened.
 */
function describeSnapshotDiff(
  a: EditorSnapshotShape,
  b: EditorSnapshotShape
): string {
  if (a.showGrid !== b.showGrid) {
    return b.showGrid ? "Show grid" : "Hide grid";
  }

  // Output switching is no longer snapshotted — navigation is not undoable.

  // 90° rotation (base rotation per output).
  const aBase = new Map(a.baseRotations);
  const bBase = new Map(b.baseRotations);
  for (const [id, bv] of bBase) {
    const av = aBase.get(id) ?? 0;
    if (av !== bv) {
      const delta = ((bv - av + 540) % 360) - 180; // shortest signed delta
      return `Rotate ${delta > 0 ? "+" : ""}${delta}°`;
    }
  }

  // Crop geometry per output. Zoom + crop-position changes often happen
  // together (Suggest Crop sets both), so combine when both changed.
  const aCrop = new Map(a.cropStates);
  const bCrop = new Map(b.cropStates);
  for (const [id, bv] of bCrop) {
    const av = aCrop.get(id);
    if (!av) continue;
    const zoomChanged = av.zoom !== bv.zoom;
    const rotationChanged = av.rotation !== bv.rotation;
    const posChanged = av.crop.x !== bv.crop.x || av.crop.y !== bv.crop.y;
    if (zoomChanged && posChanged) return "Reframe crop";
    if (rotationChanged && Math.abs(bv.rotation - av.rotation) > 0.1) {
      const delta = bv.rotation - av.rotation;
      return `Straighten ${delta > 0 ? "+" : ""}${delta.toFixed(1)}°`;
    }
    if (zoomChanged) return `Zoom ${bv.zoom.toFixed(2)}×`;
    if (posChanged) return "Reposition crop";
  }

  // Overrides
  const aEn = new Map(a.overrideEnabled);
  const bEn = new Map(b.overrideEnabled);
  for (const [id, bv] of bEn) {
    const av = aEn.get(id) ?? false;
    if (av !== bv) return bv ? "Enable override" : "Disable override";
  }
  if (JSON.stringify(a.overrides) !== JSON.stringify(b.overrides)) {
    return "Edit override";
  }

  // Adjustments — collect ALL changed keys, then decide label shape.
  const changedAdj: Array<keyof AdjustmentState> = [];
  for (const key of ADJUSTMENT_KEYS) {
    if (a.adjustments[key] !== b.adjustments[key]) changedAdj.push(key);
  }
  if (changedAdj.length === 1) {
    const key = changedAdj[0];
    const delta = b.adjustments[key] - 100;
    const label = key[0].toUpperCase() + key.slice(1);
    return `${label} ${delta > 0 ? "+" : ""}${delta}`;
  }
  if (changedAdj.length >= 2) {
    const pattern = detectAutoPattern(changedAdj);
    if (pattern) return pattern;
    return `Adjust ${changedAdj.length} sliders`;
  }

  return "Edit";
}

/**
 * All editor state that varies per image. Bundled into one record so the
 * editor can maintain independent state for every image in a multi-file
 * queue — switching between images swaps the entire record without mixing
 * per-output crops or per-image adjustments.
 */
interface ImageEditorState {
  cropStates: Map<string, CropState>;
  baseRotations: Map<string, number>;
  adjustments: AdjustmentState;
  overrides: Map<string, OutputOverride>;
  overrideEnabled: Map<string, boolean>;
  /** Output IDs for which Suggest Crop has already auto-run once. */
  suggestedOutputs: Set<string>;
}

function createInitialImageState(
  outputs: TemplateOutput[]
): ImageEditorState {
  const cropStates = new Map<string, CropState>();
  const baseRotations = new Map<string, number>();
  outputs.forEach((o) => {
    cropStates.set(o.id, {
      crop: { x: 0, y: 0 },
      zoom: 1,
      rotation: 0,
      croppedAreaPixels: null,
    });
    baseRotations.set(o.id, 0);
  });
  return {
    cropStates,
    baseRotations,
    adjustments: DEFAULT_ADJUSTMENTS,
    overrides: new Map(),
    overrideEnabled: new Map(),
    suggestedOutputs: new Set(),
  };
}

// ─── Main CropEditor ─────────────────────────────────────────────
export default function CropEditor({
  images,
  template,
  onTemplateChange,
  onExport,
  onBack,
  onReplaceImage,
  exporting = false,
}: CropEditorProps) {
  const { config } = useConfig();
  const { toast } = useToast();
  const { shortcutsEnabled, toggleShortcuts } = useShortcutPreference();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const handleTemplatePick = useCallback(
    (next: Template) => {
      onTemplateChange(next);
      if (next.id !== "custom") {
        setSwitcherOpen(false);
      }
    },
    [onTemplateChange]
  );

  const outputs = template.outputs;
  const [currentOutputIndex, setCurrentOutputIndex] = useState(0);
  const safeOutputIndex = Math.min(currentOutputIndex, outputs.length - 1);
  const currentOutput = outputs[safeOutputIndex];
  const aspect = currentOutput.aspectRatio[0] / currentOutput.aspectRatio[1];

  // ── Image queue ────────────────────────────────────────────────────
  // `images` is always length >= 1. The navigator and Cmd+[ / Cmd+]
  // shortcuts only become active when length > 1.
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const safeImageIndex = Math.min(
    currentImageIndex,
    Math.max(0, images.length - 1)
  );
  const currentImage = images[safeImageIndex];

  // ── Per-image editor state ─────────────────────────────────────────
  // All state that varies per image lives in this Map, keyed by objectUrl.
  // Today (Commit 1) the editor still receives a single `image` prop, so the
  // Map has one entry — but the structure is ready for the multi-image queue
  // introduced in later commits.
  const [imageStates, setImageStates] = useState<Map<string, ImageEditorState>>(
    () => new Map([[currentImage.objectUrl, createInitialImageState(outputs)]])
  );

  // Refs so setters can read the latest currentImageUrl / outputs without
  // re-creating (and invalidating useCallback deps all over the editor).
  const currentImageUrl = currentImage.objectUrl;
  const currentImageUrlRef = useRef(currentImageUrl);
  currentImageUrlRef.current = currentImageUrl;
  const outputsRef = useRef(outputs);
  outputsRef.current = outputs;

  // Lazily create an entry for any image we haven't seen yet (matters once
  // the queue flow can switch images — today only fires on Replace Image).
  useEffect(() => {
    setImageStates((prev) => {
      if (prev.has(currentImageUrl)) return prev;
      const next = new Map(prev);
      next.set(currentImageUrl, createInitialImageState(outputsRef.current));
      return next;
    });
  }, [currentImageUrl]);

  // Derived scalars — keep the pre-refactor names so the rest of the editor
  // reads identically. Fallback to a fresh blank state on the very first
  // render when the lazy-creation effect hasn't fired yet.
  const currentImageState =
    imageStates.get(currentImageUrl) ?? createInitialImageState(outputs);
  const cropStates = currentImageState.cropStates;
  const baseRotations = currentImageState.baseRotations;
  const adjustments = currentImageState.adjustments;
  const overrides = currentImageState.overrides;
  const overrideEnabled = currentImageState.overrideEnabled;
  const suggestedOutputs = currentImageState.suggestedOutputs;

  // Setter factory: updates one field of the current image's state.
  // Stable identity (empty deps) because it reads the image URL + outputs
  // via refs — avoids re-creating all downstream useCallbacks every render.
  const updateImageField = useCallback(
    <K extends keyof ImageEditorState>(
      key: K,
      updater:
        | ImageEditorState[K]
        | ((prev: ImageEditorState[K]) => ImageEditorState[K])
    ) => {
      setImageStates((prev) => {
        const url = currentImageUrlRef.current;
        const cur = prev.get(url) ?? createInitialImageState(outputsRef.current);
        const prevVal = cur[key];
        const nextVal =
          typeof updater === "function"
            ? (updater as (p: ImageEditorState[K]) => ImageEditorState[K])(prevVal)
            : updater;
        if (nextVal === prevVal) return prev;
        const next = new Map(prev);
        next.set(url, { ...cur, [key]: nextVal });
        return next;
      });
    },
    []
  );

  // Typed setters matching the pre-refactor signatures.
  type Updater<T> = T | ((prev: T) => T);
  const setCropStates = useCallback(
    (u: Updater<Map<string, CropState>>) => updateImageField("cropStates", u),
    [updateImageField]
  );
  const setBaseRotations = useCallback(
    (u: Updater<Map<string, number>>) => updateImageField("baseRotations", u),
    [updateImageField]
  );
  const setAdjustments = useCallback(
    (u: Updater<AdjustmentState>) => updateImageField("adjustments", u),
    [updateImageField]
  );
  const setOverrides = useCallback(
    (u: Updater<Map<string, OutputOverride>>) =>
      updateImageField("overrides", u),
    [updateImageField]
  );
  const setOverrideEnabled = useCallback(
    (u: Updater<Map<string, boolean>>) =>
      updateImageField("overrideEnabled", u),
    [updateImageField]
  );
  const setSuggestedOutputs = useCallback(
    (u: Updater<Set<string>>) => updateImageField("suggestedOutputs", u),
    [updateImageField]
  );

  const [suggestingCrop, setSuggestingCrop] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hidden file input used by the "Replace Image" affordance on the
  // active ImageNavigator row. Clicking the button programmatically
  // triggers this input; the picked file is forwarded to the host
  // along with the current queue index.
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  // Skip the confirm dialog when the slot has no meaningful edits —
  // auto-suggest crops don't count as "work" the user would lose.
  // Dirty = any non-default adjustment, any enabled override, or any
  // non-zero rotation on any output. Raw crop position isn't checked
  // because auto-suggest produces a non-zero crop, and we don't track
  // "user-moved-since-auto-suggest" separately.
  const currentImageIsDirty = useMemo(() => {
    const st = currentImageState;
    for (const key of ADJUSTMENT_KEYS) {
      if (st.adjustments[key] !== DEFAULT_ADJUSTMENTS[key]) return true;
    }
    for (const enabled of st.overrideEnabled.values()) {
      if (enabled) return true;
    }
    for (const cs of st.cropStates.values()) {
      if (cs.rotation !== 0) return true;
    }
    return false;
  }, [currentImageState]);

  const openReplacePicker = useCallback(() => {
    replaceInputRef.current?.click();
  }, []);
  const handleReplaceCurrent = useCallback(() => {
    if (currentImageIsDirty) {
      setReplaceConfirmOpen(true);
    } else {
      openReplacePicker();
    }
  }, [currentImageIsDirty, openReplacePicker]);
  const handleReplaceFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Always clear the value so re-picking the same file still fires.
      e.target.value = "";
      if (!file) return;
      onReplaceImage(safeImageIndex, file);
    },
    [onReplaceImage, safeImageIndex]
  );

  const [showGrid, setShowGrid] = useState(false);
  const [horizonDrawActive, setHorizonDrawActive] = useState(false);

  // ── Undo / Redo ──────────────────────────────────────────────────
  // Snapshot of every undoable slice of editor state. Template / image
  // swaps are out of scope per the product plan, so those reset the
  // timeline instead of pushing onto it.
  type EditorSnapshot = {
    adjustments: AdjustmentState;
    cropStates: Array<[string, CropState]>;
    baseRotations: Array<[string, number]>;
    overrides: Array<[string, OutputOverride]>;
    overrideEnabled: Array<[string, boolean]>;
    showGrid: boolean;
  };

  const buildSnapshot = useCallback(
    (): EditorSnapshot => ({
      adjustments,
      cropStates: Array.from(cropStates.entries()),
      baseRotations: Array.from(baseRotations.entries()),
      overrides: Array.from(overrides.entries()),
      overrideEnabled: Array.from(overrideEnabled.entries()),
      showGrid,
    }),
    [
      adjustments,
      cropStates,
      baseRotations,
      overrides,
      overrideEnabled,
      showGrid,
    ]
  );

  const initialSnapshotRef = useRef<EditorSnapshot | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = buildSnapshot();
  }

  const history = useUndoHistory<EditorSnapshot>(initialSnapshotRef.current, {
    maxSize: 50,
  });

  // When we restore a snapshot via undo/redo, the state updates will
  // trigger the coalesce effect below. This flag tells that effect to
  // skip recording — we don't want restored states to create new
  // history entries.
  const restoringRef = useRef(false);
  const lastSigRef = useRef<string>(JSON.stringify(initialSnapshotRef.current));
  // Pending snapshot waiting for the 400 ms coalesce window to close.
  // Exposed so undo/redo/jumpTo can flush it immediately — otherwise a
  // user making an edit and pressing Cmd+Z within 400 ms would get
  // nothing, because the edit hadn't been committed yet.
  const pendingSnapshotRef = useRef<{ snapshot: EditorSnapshot; sig: string } | null>(
    null
  );
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingSnapshot = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const pending = pendingSnapshotRef.current;
    if (!pending) return;
    pendingSnapshotRef.current = null;
    history.push(pending.snapshot);
    lastSigRef.current = pending.sig;
  }, [history]);

  // Coalesce every 400 ms — a slider drag generates dozens of state
  // updates, but the history should treat the settled value as one step.
  useEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    const snapshot = buildSnapshot();
    const sig = JSON.stringify(snapshot);
    if (sig === lastSigRef.current) return;
    pendingSnapshotRef.current = { snapshot, sig };
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      flushPendingSnapshot();
    }, 400);
    return () => {
      // Don't clear the timer here — we WANT the pending edit to survive
      // a re-render. We only cancel on explicit flush / restore / unmount.
    };
  }, [buildSnapshot, flushPendingSnapshot]);

  // ── Per-image history parking ────────────────────────────────────
  // Each image has its own undo timeline. When the user switches images,
  // we save the current image's {stack, index} into a ref map and either
  // restore the target image's saved history or initialize a fresh one.
  // Template changes wipe all parked histories — output IDs may have
  // changed, making old snapshots invalid.
  type HistoryRecord = {
    stack: EditorSnapshot[];
    index: number;
  };
  const historiesRef = useRef<Map<string, HistoryRecord>>(new Map());

  // ── Image completion tracking ────────────────────────────────────
  // An image is "done" once the user has navigated AWAY from it at
  // least once (or exported while on it). That way auto-suggest
  // acceptors and active editors both get credit without needing a
  // Confirm button. See the image-change effect below for the add,
  // and handleExport for the final-image add.
  const [visitedImages, setVisitedImages] = useState<Set<string>>(
    () => new Set()
  );
  const lastTemplateIdRef = useRef(template.id);
  const lastImageUrlRef = useRef(currentImageUrl);

  // Template change: wipe all parked histories and reset the current
  // timeline to a fresh snapshot for the current image.
  useEffect(() => {
    if (lastTemplateIdRef.current === template.id) return;
    lastTemplateIdRef.current = template.id;
    historiesRef.current.clear();
    // Template change invalidates all prior completion signals — the
    // crops got reset, so any checkmarks from the old template are
    // stale.
    setVisitedImages(new Set());
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    pendingSnapshotRef.current = null;
    const fresh = buildSnapshot();
    history.reset(fresh);
    lastSigRef.current = JSON.stringify(fresh);
    restoringRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  // Image change: park the previous image's history and restore (or
  // initialize) the new image's history.
  //
  // There are two ways currentImageUrl can change:
  //   (a) The user navigated to a different image in the queue. The
  //       previous URL is still in `images` — we park its history and
  //       mark it visited.
  //   (b) The active slot was REPLACED with a different file (same
  //       index, new objectUrl). The previous URL no longer exists in
  //       `images` — parking or visiting it would leak an orphan.
  useEffect(() => {
    const prevUrl = lastImageUrlRef.current;
    if (prevUrl === currentImageUrl) return;

    const prevStillExists = images.some((img) => img.objectUrl === prevUrl);

    if (prevStillExists) {
      // Case (a) — normal navigation. Park the previous image's
      // current stack + index.
      historiesRef.current.set(prevUrl, {
        stack: [...history.stack],
        index: history.index,
      });
      // Mark the image the user is LEAVING as done — the act of
      // navigating away is itself the confirmation. The last image in
      // the queue gets added when the user hits Export.
      setVisitedImages((prev) => {
        if (prev.has(prevUrl)) return prev;
        const next = new Set(prev);
        next.add(prevUrl);
        return next;
      });
    }
    // Case (b) — URL was replaced. No parking, no visiting; the
    // orphan-cleanup effect below handles state-removal.

    // Drop any pending coalesced edit — it belonged to the image we're
    // leaving, not the one we're entering.
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    pendingSnapshotRef.current = null;

    // Restore or initialize the incoming image's history.
    const saved = historiesRef.current.get(currentImageUrl);
    if (saved) {
      history.replace(saved);
      // lastSigRef should reflect whatever entry we restored to so the
      // coalesce effect doesn't immediately re-record a no-op.
      lastSigRef.current = JSON.stringify(saved.stack[saved.index]);
    } else {
      const fresh = buildSnapshot();
      history.reset(fresh);
      lastSigRef.current = JSON.stringify(fresh);
    }
    restoringRef.current = true;
    lastImageUrlRef.current = currentImageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImageUrl]);

  // Orphan cleanup: whenever the images array changes (slot replaced,
  // image removed, batch composition edited), drop state entries
  // keyed by URLs that no longer exist in the queue. Keeps imageStates,
  // visitedImages, and historiesRef from accumulating dead data over
  // a long session of replacements.
  useEffect(() => {
    const activeUrls = new Set(images.map((img) => img.objectUrl));
    setImageStates((prev) => {
      let dirty = false;
      for (const url of prev.keys()) {
        if (!activeUrls.has(url)) {
          dirty = true;
          break;
        }
      }
      if (!dirty) return prev;
      const next = new Map<string, ImageEditorState>();
      for (const [url, state] of prev) {
        if (activeUrls.has(url)) next.set(url, state);
      }
      return next;
    });
    setVisitedImages((prev) => {
      let dirty = false;
      for (const url of prev) {
        if (!activeUrls.has(url)) {
          dirty = true;
          break;
        }
      }
      if (!dirty) return prev;
      const next = new Set<string>();
      for (const url of prev) if (activeUrls.has(url)) next.add(url);
      return next;
    });
    for (const url of [...historiesRef.current.keys()]) {
      if (!activeUrls.has(url)) historiesRef.current.delete(url);
    }
  }, [images]);

  // On unmount, drop any pending timer so a late push doesn't hit an
  // unmounted history hook.
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingSnapshotRef.current = null;
    };
  }, []);

  const applySnapshot = useCallback((s: EditorSnapshot) => {
    restoringRef.current = true;
    setAdjustments(s.adjustments);
    setCropStates(new Map(s.cropStates));
    setBaseRotations(new Map(s.baseRotations));
    setOverrides(new Map(s.overrides));
    setOverrideEnabled(new Map(s.overrideEnabled));
    setShowGrid(s.showGrid);
    lastSigRef.current = JSON.stringify(s);
    // All per-image setters have stable identity (empty deps on their own
    // useCallback) so including them here doesn't re-memoize applySnapshot.
  }, [
    setAdjustments,
    setCropStates,
    setBaseRotations,
    setOverrides,
    setOverrideEnabled,
  ]);

  const handleUndo = useCallback(() => {
    // Flush any pending coalesced edit BEFORE stepping back, so a user
    // can make an edit and immediately press Cmd+Z and see it rewound —
    // not be told "nothing to undo" because the 400 ms window hadn't
    // expired yet.
    flushPendingSnapshot();
    const prev = history.undo();
    if (prev) applySnapshot(prev);
  }, [history, applySnapshot, flushPendingSnapshot]);

  const handleRedo = useCallback(() => {
    flushPendingSnapshot();
    const next = history.redo();
    if (next) applySnapshot(next);
  }, [history, applySnapshot, flushPendingSnapshot]);

  const handleJumpHistory = useCallback(
    (index: number) => {
      flushPendingSnapshot();
      const target = history.jumpTo(index);
      if (target) applySnapshot(target);
    },
    [history, applySnapshot, flushPendingSnapshot]
  );

  // Human-readable labels for each history entry, derived by diffing
  // consecutive snapshots. Index 0 is the initial state → "Starting
  // point"; indices > 0 describe what changed from the previous entry.
  const historyLabels = useMemo(() => {
    const labels: string[] = [];
    const stack = history.stack;
    labels.push("Starting point");
    for (let i = 1; i < stack.length; i++) {
      labels.push(describeSnapshotDiff(stack[i - 1], stack[i]));
    }
    return labels;
  }, [history.stack]);

  // Popover open state. Positioning is driven by the top-bar button's
  // ref (re-measured on scroll/resize by the popover itself) so we only
  // need to track open/closed here.
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  // Reset crop state when template geometry changes. Because output IDs
  // may change with a new template, EVERY image in the queue needs a
  // fresh entry — not just the current image. Adjustments are preserved
  // per image (they're template-agnostic).
  const structuralKey =
    template.id +
    "|" +
    outputs
      .map((o) => `${o.id}:${o.aspectRatio[0]}x${o.aspectRatio[1]}`)
      .join("|");
  const lastStructuralKey = useRef(structuralKey);
  useEffect(() => {
    if (lastStructuralKey.current === structuralKey) return;
    lastStructuralKey.current = structuralKey;
    setImageStates((prev) => {
      const next = new Map<string, ImageEditorState>();
      for (const [url, cur] of prev) {
        const fresh = createInitialImageState(outputs);
        // Preserve adjustments — they don't depend on template geometry.
        next.set(url, { ...fresh, adjustments: cur.adjustments });
      }
      return next;
    });
    setCurrentOutputIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey]);

  const { src: adjustedImageSrc, scale: previewScale } = useAdjustedImage(
    currentImage.objectUrl,
    currentImage.width,
    currentImage.height,
    adjustments
  );

  const currentCropState: CropState = cropStates.get(currentOutput.id) ?? {
    crop: { x: 0, y: 0 },
    zoom: 1,
    rotation: 0,
    croppedAreaPixels: null,
  };

  // Track container size so we can feed real dimensions into
  // computeMinZoom — the formula needs to know the cropper container
  // shape to mirror react-easy-crop's internal contain/fit logic.
  // ResizeObserver covers viewport changes (including dev-tools open).
  const [containerSize, setContainerSize] = useState<{
    w: number;
    h: number;
  }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const minZoom = useMemo(
    () =>
      computeMinZoom(
        currentCropState.rotation,
        currentImage.width,
        currentImage.height,
        containerSize.w,
        containerSize.h,
        aspect
      ),
    [
      currentCropState.rotation,
      currentImage.width,
      currentImage.height,
      containerSize.w,
      containerSize.h,
      aspect,
    ]
  );

  const base90 = baseRotations.get(currentOutput.id) ?? 0;
  const straighten = Math.round(currentCropState.rotation - base90);

  const updateCurrentCropState = useCallback(
    (updates: Partial<CropState>) => {
      setCropStates((prev) => {
        const next = new Map(prev);
        const existing = next.get(currentOutput.id) ?? {
          crop: { x: 0, y: 0 },
          zoom: 1,
          rotation: 0,
          croppedAreaPixels: null,
        };
        next.set(currentOutput.id, { ...existing, ...updates });
        return next;
      });
    },
    [currentOutput.id, setCropStates]
  );

  const handleCropComplete = useCallback(
    (_croppedArea: CroppedArea, croppedAreaPixels: CroppedArea) => {
      updateCurrentCropState({ croppedAreaPixels });
    },
    [updateCurrentCropState]
  );

  const handleReset = useCallback(() => {
    setBaseRotations((prev) => new Map(prev).set(currentOutput.id, 0));
    updateCurrentCropState({ crop: { x: 0, y: 0 }, zoom: 1, rotation: 0 });
  }, [currentOutput.id, updateCurrentCropState, setBaseRotations]);

  const handleRotate = useCallback(
    (degrees: number) => {
      const newBase = (base90 + degrees + 360) % 360;
      setBaseRotations((prev) => new Map(prev).set(currentOutput.id, newBase));
      updateCurrentCropState({ rotation: newBase + straighten });
    },
    [
      base90,
      straighten,
      currentOutput.id,
      updateCurrentCropState,
      setBaseRotations,
    ]
  );

  const handleStraightenChange = useCallback(
    (value: number) => {
      const clamped = Math.max(-45, Math.min(45, value));
      updateCurrentCropState({ rotation: base90 + clamped });
    },
    [base90, updateCurrentCropState]
  );

  const handleHorizonComplete = useCallback(
    (angleDeg: number) => {
      const correction = -angleDeg;
      const newStraighten = Math.max(
        -45,
        Math.min(45, straighten + correction)
      );
      updateCurrentCropState({ rotation: base90 + newStraighten });
      setHorizonDrawActive(false);
    },
    [base90, straighten, updateCurrentCropState]
  );

  const handleHorizonCancel = useCallback(() => {
    setHorizonDrawActive(false);
  }, []);

  const handleSuggestCrop = useCallback(async (): Promise<boolean> => {
    setSuggestingCrop(true);
    try {
      const img = await loadImage(currentImage.objectUrl);
      const region = await suggestCrop(
        img,
        currentOutput.aspectRatio,
        currentOutput.cropHint
      );
      const container = containerRef.current;
      if (container) {
        const result = smartCropToEasyCrop(
          region,
          currentImage.width,
          currentImage.height,
          container.clientWidth,
          container.clientHeight,
          aspect
        );
        updateCurrentCropState({ crop: result.crop, zoom: result.zoom });
      }
      return true;
    } catch (err) {
      console.error("Smart crop failed:", err);
      toast({ type: "info", text: "Smart crop couldn\u2019t find a subject \u2014 position manually." });
      return false;
    } finally {
      setSuggestingCrop(false);
    }
  }, [currentImage, currentOutput, aspect, updateCurrentCropState, toast]);

  // currentCropState.zoom is now the USER'S intent (what they last set
  // via slider, wheel, or shortcut). The actual displayed zoom is the
  // max of intent and minZoom, so when rotation increases the
  // requirement we bump up automatically — and crucially, when rotation
  // relaxes back to 0° the displayed zoom drops back to intent. No
  // ratcheting.
  const effectiveZoom = Math.max(currentCropState.zoom, minZoom);

  useEffect(() => {
    if (suggestedOutputs.has(currentOutput.id)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ok = await handleSuggestCrop();
      // Only mark as "auto-suggested" on success. A transient failure
      // (decode error, saliency threw, whatever) would otherwise latch
      // the output into "don't auto-try again" for the rest of the
      // session, even though the next template switch back might work.
      if (!cancelled && ok) {
        setSuggestedOutputs((prev) => new Set(prev).add(currentOutput.id));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOutput.id, currentImageUrl]);

  // Maps for OutputNavigator display
  const effectiveFormats = useMemo(() => {
    const m = new Map<string, TemplateOutput["outputFormat"]>();
    for (const o of outputs) {
      const ov = overrideEnabled.get(o.id) ? overrides.get(o.id) : undefined;
      m.set(o.id, applyOverride(o, ov).outputFormat);
    }
    return m;
  }, [outputs, overrides, overrideEnabled]);

  const effectiveDimensions = useMemo(() => {
    const m = new Map<string, { width: number; height: number }>();
    for (const o of outputs) {
      const ov = overrideEnabled.get(o.id) ? overrides.get(o.id) : undefined;
      const eff = applyOverride(o, ov);
      m.set(o.id, { width: eff.outputWidth, height: effectiveHeight(eff) });
    }
    return m;
  }, [outputs, overrides, overrideEnabled]);

  const handleExport = useCallback(() => {
    // Clicking Export counts as "leaving" the current image — mark
    // it visited so its checkmark lands alongside the others.
    setVisitedImages((prev) => {
      if (prev.has(currentImageUrl)) return prev;
      const next = new Set(prev);
      next.add(currentImageUrl);
      return next;
    });
    const perImage: MultiImageExportPlan["perImage"] = [];
    for (const img of images) {
      const st = imageStates.get(img.objectUrl);
      if (!st) continue;
      // Recompute the preview scale that was active for this image. It
      // depends only on original dimensions + whether pixel adjustments
      // are engaged, matching useAdjustedImage's internal math.
      const scale = computePreviewScale(img, st.adjustments);
      const scaleFactor = 1 / scale;
      const outputCrops = new Map<
        string,
        { output: TemplateOutput; cropArea: CroppedArea }
      >();
      for (const output of outputs) {
        const cs = st.cropStates.get(output.id);
        if (!cs?.croppedAreaPixels) continue;
        const cropArea: CroppedArea = {
          x: Math.round(cs.croppedAreaPixels.x * scaleFactor),
          y: Math.round(cs.croppedAreaPixels.y * scaleFactor),
          width: Math.round(cs.croppedAreaPixels.width * scaleFactor),
          height: Math.round(cs.croppedAreaPixels.height * scaleFactor),
        };
        const ov = st.overrideEnabled.get(output.id)
          ? st.overrides.get(output.id)
          : undefined;
        const effectiveOutput = applyOverride(output, ov);
        outputCrops.set(output.id, {
          output: effectiveOutput,
          cropArea,
        });
      }
      // Only include images that have at least one cropped output.
      if (outputCrops.size > 0) {
        perImage.push({
          image: img,
          adjustments: st.adjustments,
          outputs: outputCrops,
        });
      }
    }
    onExport({ perImage });
  }, [images, imageStates, outputs, onExport, currentImageUrl]);

  const completedOutputIds = useMemo(() => {
    const set = new Set<string>();
    for (const output of outputs) {
      if (cropStates.get(output.id)?.croppedAreaPixels != null) {
        set.add(output.id);
      }
    }
    return set;
  }, [outputs, cropStates]);

  // Images whose every output has been cropped — drives the checkmark
  // on the image navigator row.
  // Display completion (checkmark in the ImageNavigator): the user
  // has navigated AWAY from this image at least once AND its outputs
  // all have valid croppedAreaPixels. "Visited and left" is the
  // honest signal that the user reviewed the crop rather than having
  // auto-suggest silently produce one.
  const completedImageUrls = useMemo(() => {
    const set = new Set<string>();
    for (const img of images) {
      if (!visitedImages.has(img.objectUrl)) continue;
      const st = imageStates.get(img.objectUrl);
      if (!st) continue;
      const allDone = outputs.every(
        (o) => st.cropStates.get(o.id)?.croppedAreaPixels != null
      );
      if (allDone) set.add(img.objectUrl);
    }
    return set;
  }, [images, imageStates, outputs, visitedImages]);

  // Export gate: every (image × output) pair has a crop. This is
  // DISPLAY-independent — the gate doesn't require the user to have
  // left the current image first, since Export IS the "leave" signal
  // for the last image.
  const allImagesCropped = useMemo(() => {
    if (images.length === 0) return false;
    return images.every((img) => {
      const st = imageStates.get(img.objectUrl);
      if (!st) return false;
      return outputs.every(
        (o) => st.cropStates.get(o.id)?.croppedAreaPixels != null
      );
    });
  }, [images, imageStates, outputs]);

  const filterStyle = buildCSSFilter(adjustments);

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Hold-to-compare (Space key) + click-to-pin (toolbar button). The
  // Cropper shows the unadjusted original when either is active.
  const [compareHeld, setCompareHeld] = useState(false);
  const [comparePinned, setComparePinned] = useState(false);
  const compareMode = compareHeld || comparePinned;
  const [autoLoading, setAutoLoading] = useState(false);

  const canPrev = safeOutputIndex > 0;
  const canNext = safeOutputIndex < outputs.length - 1;
  const canPrevImage = safeImageIndex > 0;
  const canNextImage = safeImageIndex < images.length - 1;

  const stepZoom = useCallback(
    (direction: 1 | -1, coarse = false) => {
      // 1.05× per tap feels continuous for fine framing; Shift modifier
      // jumps 1.25× for fast travel across the zoom range. Step from
      // the displayed value (effectiveZoom) so a press always changes
      // what the user sees, not from the underlying intent which might
      // be lower than the displayed minimum.
      const base = coarse ? 1.25 : 1.05;
      const factor = direction > 0 ? base : 1 / base;
      const next = Math.max(
        minZoom,
        Math.min(10, effectiveZoom * factor)
      );
      updateCurrentCropState({ zoom: next });
    },
    [minZoom, effectiveZoom, updateCurrentCropState]
  );

  const nudgeCrop = useCallback(
    (dx: number, dy: number) => {
      updateCurrentCropState({
        crop: {
          x: currentCropState.crop.x + dx,
          y: currentCropState.crop.y + dy,
        },
      });
    },
    [currentCropState.crop.x, currentCropState.crop.y, updateCurrentCropState]
  );

  const runAutoAdjust = useCallback(
    async (mode: "enhance" | "brightness" | "color") => {
      if (autoLoading) return;
      setAutoLoading(true);
      try {
        const canvas = await createAnalysisCanvas(currentImage.objectUrl);
        let updates;
        if (mode === "enhance") updates = autoEnhance(canvas);
        else if (mode === "brightness") updates = autoBrightnessContrast(canvas);
        else updates = autoColor(canvas);
        setAdjustments((prev) => ({ ...prev, ...updates }));
      } catch (err) {
        console.error("Auto adjust failed:", err);
        toast({ type: "error", text: "Auto adjust failed. Try adjusting manually." });
      } finally {
        setAutoLoading(false);
      }
    },
    [currentImage.objectUrl, autoLoading, setAdjustments, toast]
  );

  // Space = hold-to-compare. Handled here (not via useKeyboardShortcuts)
  // because the hook is keydown-only and Space needs both keydown + keyup
  // to implement the "press and hold" gesture. Paused while any overlay
  // with its own keyboard handling is active (cheatsheet, horizon-draw,
  // history popover) so the overlay's keys don't double-fire with
  // compare mode.
  useEffect(() => {
    if (showShortcuts) return;
    if (horizonDrawActive) return;
    if (historyOpen) return;
    if (!shortcutsEnabled) return;
    // Space should not trigger compare mode when focus is on an element
    // where Space has a native role (activate button, toggle checkbox,
    // type into a field). Range sliders are deliberately excluded —
    // sliders use arrow keys, not Space, so suppressing Space there
    // would be a false positive: the user just adjusted a slider and
    // expects Space to compare.
    const isInteractive = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT") {
        return (target as HTMLInputElement).type !== "range";
      }
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "BUTTON" || tag === "A") return true;
      if (target.isContentEditable) return true;
      if (target.getAttribute("role") === "button") return true;
      if (target.getAttribute("tabindex") !== null) return true;
      return false;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isInteractive(e.target)) return;
      if (e.repeat) return;
      e.preventDefault();
      setCompareHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      setCompareHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    // Safety: if the window loses focus mid-hold, drop compareMode so the
    // user doesn't come back to a "stuck" original view.
    const blur = () => setCompareHeld(false);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [showShortcuts, horizonDrawActive, historyOpen, shortcutsEnabled]);

  const shortcuts: Shortcut[] = useMemo(
    () => [
      // Navigation
      {
        key: "[",
        label: "Previous output",
        group: "Navigation",
        onFire: (e) => {
          if (!canPrev) return;
          e.preventDefault();
          setCurrentOutputIndex((i) => Math.max(0, i - 1));
        },
      },
      {
        key: "]",
        label: "Next output",
        group: "Navigation",
        onFire: (e) => {
          if (!canNext) return;
          e.preventDefault();
          setCurrentOutputIndex((i) => Math.min(outputs.length - 1, i + 1));
        },
      },
      // Image-queue navigation — Cmd/Ctrl + bracket to distinguish from
      // per-output navigation. Only useful when images.length > 1.
      {
        key: "[",
        mod: true,
        label: "Previous image",
        group: "Navigation",
        onFire: (e) => {
          if (!canPrevImage) return;
          e.preventDefault();
          setCurrentImageIndex((i) => Math.max(0, i - 1));
        },
      },
      {
        key: "]",
        mod: true,
        label: "Next image",
        group: "Navigation",
        onFire: (e) => {
          if (!canNextImage) return;
          e.preventDefault();
          setCurrentImageIndex((i) => Math.min(images.length - 1, i + 1));
        },
      },
      // Crop
      {
        key: "r",
        label: "Rotate 90°",
        group: "Crop",
        onFire: (e) => {
          e.preventDefault();
          handleRotate(90);
        },
      },
      {
        key: "s",
        label: "Suggest Crop",
        group: "Crop",
        onFire: (e) => {
          e.preventDefault();
          handleSuggestCrop();
        },
      },
      {
        key: "h",
        label: "Draw horizon line",
        group: "Crop",
        onFire: (e) => {
          e.preventDefault();
          setHorizonDrawActive(true);
        },
      },
      // Zoom: `=` / `-` for fine steps (1.05×), Shift+= (emits "+") and
      // Shift+- (emits "_") for coarse steps (1.25×). Plain "+" without
      // shift can't physically be pressed on US layouts.
      {
        key: "=",
        label: "Zoom in",
        group: "Crop",
        onFire: (e) => {
          e.preventDefault();
          stepZoom(1);
        },
      },
      {
        key: "-",
        label: "Zoom out",
        group: "Crop",
        onFire: (e) => {
          e.preventDefault();
          stepZoom(-1);
        },
      },
      {
        key: "+",
        shift: true,
        label: "Zoom in (5×)",
        group: "Crop",
        onFire: (e) => {
          e.preventDefault();
          stepZoom(1, true);
        },
      },
      {
        key: "_",
        shift: true,
        label: "Zoom out (5×)",
        group: "Crop",
        onFire: (e) => {
          e.preventDefault();
          stepZoom(-1, true);
        },
      },
      // Nudge: 5px per tap, 25px with Shift for faster travel. Labels stay
      // parallel across the four directions so the cheatsheet reads cleanly.
      {
        key: "ArrowUp",
        label: "Nudge up",
        group: "Nudge",
        onFire: (e) => {
          e.preventDefault();
          nudgeCrop(0, -5);
        },
      },
      {
        key: "ArrowDown",
        label: "Nudge down",
        group: "Nudge",
        onFire: (e) => {
          e.preventDefault();
          nudgeCrop(0, 5);
        },
      },
      {
        key: "ArrowLeft",
        label: "Nudge left",
        group: "Nudge",
        onFire: (e) => {
          e.preventDefault();
          nudgeCrop(-5, 0);
        },
      },
      {
        key: "ArrowRight",
        label: "Nudge right",
        group: "Nudge",
        onFire: (e) => {
          e.preventDefault();
          nudgeCrop(5, 0);
        },
      },
      {
        key: "ArrowUp",
        shift: true,
        label: "Nudge up (5×)",
        group: "Nudge",
        onFire: (e) => {
          e.preventDefault();
          nudgeCrop(0, -25);
        },
      },
      {
        key: "ArrowDown",
        shift: true,
        label: "Nudge down (5×)",
        group: "Nudge",
        onFire: (e) => {
          e.preventDefault();
          nudgeCrop(0, 25);
        },
      },
      {
        key: "ArrowLeft",
        shift: true,
        label: "Nudge left (5×)",
        group: "Nudge",
        onFire: (e) => {
          e.preventDefault();
          nudgeCrop(-25, 0);
        },
      },
      {
        key: "ArrowRight",
        shift: true,
        label: "Nudge right (5×)",
        group: "Nudge",
        onFire: (e) => {
          e.preventDefault();
          nudgeCrop(25, 0);
        },
      },
      // Auto adjustments
      {
        key: "e",
        label: "Auto Enhance",
        group: "Adjustments",
        onFire: (e) => {
          e.preventDefault();
          runAutoAdjust("enhance");
        },
      },
      {
        key: "l",
        label: "Auto Brightness / Contrast",
        group: "Adjustments",
        onFire: (e) => {
          e.preventDefault();
          runAutoAdjust("brightness");
        },
      },
      {
        key: "b",
        label: "Auto Color",
        group: "Adjustments",
        onFire: (e) => {
          e.preventDefault();
          runAutoAdjust("color");
        },
      },
      // View
      {
        key: "g",
        label: "Toggle grid",
        group: "View",
        onFire: (e) => {
          e.preventDefault();
          setShowGrid((v) => !v);
        },
      },
      // Documentation-only — Space is handled by a dedicated keydown/keyup
      // effect above (the hook is keydown-only) but we list it here so it
      // shows up in the cheatsheet.
      {
        key: " ",
        label: "Hold to compare (original)",
        group: "View",
        onFire: () => {
          /* handled by the dedicated compare-mode effect */
        },
      },
      // History
      {
        key: "z",
        mod: true,
        label: "Undo",
        group: "History",
        onFire: (e) => {
          e.preventDefault();
          handleUndo();
        },
      },
      {
        key: "z",
        mod: true,
        shift: true,
        label: "Redo",
        group: "History",
        onFire: (e) => {
          e.preventDefault();
          handleRedo();
        },
      },
      // Help
      {
        key: "?",
        shift: true,
        label: "Show shortcuts",
        group: "Help",
        onFire: (e) => {
          e.preventDefault();
          setShowShortcuts((v) => !v);
        },
      },
    ],
    [
      canPrev,
      canNext,
      canPrevImage,
      canNextImage,
      images.length,
      outputs.length,
      handleRotate,
      handleSuggestCrop,
      stepZoom,
      nudgeCrop,
      runAutoAdjust,
      handleUndo,
      handleRedo,
    ]
  );

  // Shortcuts stay active whenever the editor is mounted, but pause while
  // the cheatsheet overlay or horizon-draw overlay has its own keyboard
  // handling. Prevents Arrow/Enter/Esc from double-firing.
  useKeyboardShortcuts(
    shortcuts,
    shortcutsEnabled && !showShortcuts && !horizonDrawActive
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Hidden file input used by the ImageNavigator Replace Image
          button. Lives here (not in ImageNavigator) so the active
          queue index is available without prop drilling. */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleReplaceFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <EditorTopBar
        image={currentImage}
        template={template}
        activeOutput={outputs.length > 1 ? currentOutput : undefined}
        completedCount={completedOutputIds.size}
        totalCount={outputs.length}
        canExport={allImagesCropped}
        exporting={exporting}
        onExport={handleExport}
        onBack={onBack}
        onShowShortcuts={() => setShowShortcuts(true)}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onShowHistory={() => setHistoryOpen((v) => !v)}
        historyOpen={historyOpen}
        historyButtonRef={historyButtonRef}
        historyCount={history.size}
        compareMode={comparePinned}
        onToggleCompare={() => setComparePinned((v) => !v)}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[clamp(240px,20vw,260px)_1fr_clamp(280px,25vw,320px)]">
        {/* ── LEFT PANEL ─────────────────────────────────────────── */}
        <aside aria-label="Source image and outputs" className="overflow-y-auto border-r border-border bg-panel">
          {/* Unified source view: ImageNavigator handles both single-
              and multi-image sessions. For a single image the list is
              length 1; its only row is always active and expanded
              (showing format, file size, and the Replace button —
              folding in what SourceImageCard used to own). For a queue
              the list shows per-image completion + is height-capped
              with auto-scroll. */}
          <Section
            title={images.length > 1 ? "Images" : "Source"}
            variant="flush"
            headerEnd={
              images.length > 1 ? (
                <span className="text-[11px] font-medium text-fg-tertiary">
                  {completedImageUrls.size} of {images.length} done
                </span>
              ) : null
            }
          >
            <ImageNavigator
              images={images}
              currentIndex={safeImageIndex}
              onIndexChange={setCurrentImageIndex}
              completedUrls={completedImageUrls}
              // Replace swaps just the active slot in the image queue.
              // Works in both single and multi modes; the host supplies
              // the host-level replace handler (keyed by index), and
              // CropEditor opens the file picker + cleans up the
              // replaced URL's state (see the orphan-cleanup effect).
              onReplace={handleReplaceCurrent}
            />
          </Section>

          <TemplatePill
            template={template}
            isOpen={switcherOpen}
            onToggle={() => setSwitcherOpen((v) => !v)}
          />

          {switcherOpen && (
            <div
              id="template-switcher-panel"
              className="border-b border-border bg-panel-2 p-3"
            >
              {config && config.templates.length > 0 ? (
                <TemplateSelector
                  templates={config.templates}
                  selected={template}
                  onSelect={handleTemplatePick}
                  variant="stack"
                />
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  No templates configured.
                </p>
              )}
            </div>
          )}

          <Section
            title="Outputs"
            variant="flush"
            headerEnd={
              outputs.length > 1 ? (
                <span className="text-[11px] font-medium text-fg-tertiary">
                  {completedOutputIds.size} of {outputs.length} done
                </span>
              ) : null
            }
          >
            <OutputNavigator
              outputs={outputs}
              currentIndex={safeOutputIndex}
              onIndexChange={setCurrentOutputIndex}
              completedIds={completedOutputIds}
              effectiveFormats={effectiveFormats}
              effectiveDimensions={effectiveDimensions}
              renderActiveAddon={(output) => (
                <OutputOverridePanel
                  template={output}
                  override={overrides.get(output.id)}
                  enabled={overrideEnabled.get(output.id) ?? false}
                  onToggle={(enabled) =>
                    setOverrideEnabled((prev) =>
                      new Map(prev).set(output.id, enabled)
                    )
                  }
                  onChange={(ov) =>
                    setOverrides((prev) => new Map(prev).set(output.id, ov))
                  }
                  onReset={() => {
                    setOverrides((prev) => {
                      const next = new Map(prev);
                      next.delete(output.id);
                      return next;
                    });
                    setOverrideEnabled((prev) =>
                      new Map(prev).set(output.id, false)
                    );
                  }}
                />
              )}
            />
          </Section>
        </aside>

        {/* ── CANVAS ─────────────────────────────────────────────── */}
        <main id="main-content" className="relative flex min-w-0 flex-col bg-canvas">
          <div ref={containerRef} className="relative flex-1 overflow-hidden">
            <Cropper
              image={compareMode ? currentImage.objectUrl : adjustedImageSrc}
              crop={currentCropState.crop}
              zoom={effectiveZoom}
              minZoom={minZoom}
              maxZoom={10}
              rotation={currentCropState.rotation}
              aspect={aspect}
              zoomWithScroll={false}
              showGrid
              classes={
                showGrid ? { cropAreaClassName: "detailed-grid" } : undefined
              }
              onCropChange={(crop) => updateCurrentCropState({ crop })}
              onZoomChange={(z) => {
                // The library echoes our `zoom` prop back through this
                // callback after every render. Distinguishing user
                // intent (wheel/slider/keyboard) from echo: if the
                // emitted value matches what we just rendered with, do
                // nothing; otherwise it's user input — capture it as
                // intent.
                if (Math.abs(z - effectiveZoom) > 0.001) {
                  updateCurrentCropState({ zoom: z });
                }
              }}
              onCropComplete={handleCropComplete}
              style={{
                mediaStyle:
                  filterStyle && !compareMode
                    ? { filter: filterStyle }
                    : undefined,
              }}
            />

            {compareMode && (
              <div
                className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-[11px] font-medium text-foreground shadow-lg"
                role="status"
                aria-live="polite"
              >
                Original (release Space)
              </div>
            )}

            {horizonDrawActive && (
              <HorizonDrawOverlay
                onComplete={handleHorizonComplete}
                onCancel={handleHorizonCancel}
              />
            )}
          </div>

          {/* Canvas bottom toolbar */}
          <div className="border-t border-border bg-panel p-3">
            <CropControls
              zoom={effectiveZoom}
              minZoom={minZoom}
              onZoomChange={(zoom) => updateCurrentCropState({ zoom })}
              straighten={straighten}
              onStraightenChange={handleStraightenChange}
              onReset={handleReset}
              onRotate={handleRotate}
              onSuggestCrop={handleSuggestCrop}
              suggestingCrop={suggestingCrop}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid((v) => !v)}
              horizonDrawActive={horizonDrawActive}
              onStartHorizonDraw={() => setHorizonDrawActive((v) => !v)}
              onNudge={nudgeCrop}
              prevAction={
                safeOutputIndex > 0
                  ? {
                      label: outputs[safeOutputIndex - 1].name,
                      onClick: () => setCurrentOutputIndex(safeOutputIndex - 1),
                    }
                  : safeImageIndex > 0
                    ? {
                        // On the first output of a non-first image, "Previous"
                        // jumps to the last output of the previous image.
                        label: "Previous photo",
                        verbatim: true,
                        onClick: () => {
                          setCurrentImageIndex(safeImageIndex - 1);
                          setCurrentOutputIndex(outputs.length - 1);
                        },
                      }
                    : undefined
              }
              nextAction={
                outputs.length > 1 && safeOutputIndex < outputs.length - 1
                  ? {
                      label: outputs[safeOutputIndex + 1].name,
                      onClick: () => setCurrentOutputIndex(safeOutputIndex + 1),
                    }
                  : safeImageIndex < images.length - 1
                    ? {
                        // On the last output of a non-last image, "Next"
                        // jumps to the first output of the next image.
                        label: "Next photo",
                        verbatim: true,
                        onClick: () => {
                          setCurrentImageIndex(safeImageIndex + 1);
                          setCurrentOutputIndex(0);
                        },
                      }
                    : undefined
              }
              exportAction={
                // Export CTA takes Next's place on the last output (or the
                // only output for single-output templates). In queue mode,
                // it shows on the LAST output of the LAST image.
                (outputs.length === 1 ||
                  safeOutputIndex === outputs.length - 1) &&
                safeImageIndex === images.length - 1
                  ? {
                      label:
                        images.length > 1
                          ? "Export All"
                          : outputs.length > 1
                            ? `Export All (${outputs.length})`
                            : "Export",
                      onClick: handleExport,
                      disabled: !allImagesCropped || exporting,
                      disabledReason: !allImagesCropped
                        ? images.length > 1
                          ? "Crop every image and output to export"
                          : "Crop all outputs to export"
                        : undefined,
                    }
                  : undefined
              }
            />
          </div>
        </main>

        {/* ── RIGHT PANEL ────────────────────────────────────────── */}
        {/* Purely "how to edit" — adjustments and future editing tools.
            The WHAT (active output, dimensions, format) lives in the top-bar
            breadcrumb and the Outputs list on the left. */}
        <aside aria-label="Adjustments" className="overflow-y-auto border-l border-border bg-panel">
          <div className="p-3">
            <AdjustmentSliders
              adjustments={adjustments}
              onChange={setAdjustments}
              imageSrc={currentImage.objectUrl}
              outputCount={outputs.length}
              cropRegion={
                currentCropState.croppedAreaPixels
                  ? {
                      // croppedAreaPixels is in preview-image coordinates;
                      // scale it back up to source-image space so the
                      // histogram + Auto analysis sample the same pixels
                      // the export pipeline will.
                      x: Math.round(
                        currentCropState.croppedAreaPixels.x / previewScale
                      ),
                      y: Math.round(
                        currentCropState.croppedAreaPixels.y / previewScale
                      ),
                      width: Math.round(
                        currentCropState.croppedAreaPixels.width / previewScale
                      ),
                      height: Math.round(
                        currentCropState.croppedAreaPixels.height / previewScale
                      ),
                    }
                  : null
              }
              cropLabel={outputs.length > 1 ? currentOutput.name : undefined}
            />
          </div>
        </aside>
      </div>

      {showShortcuts && (
        <ShortcutsOverlay
          shortcuts={shortcuts}
          onClose={() => setShowShortcuts(false)}
          shortcutsEnabled={shortcutsEnabled}
          onToggleShortcuts={toggleShortcuts}
        />
      )}
      {historyOpen && (
        <HistoryPopover
          labels={historyLabels}
          currentIndex={history.index}
          onJump={handleJumpHistory}
          onClose={() => setHistoryOpen(false)}
          anchorRef={historyButtonRef}
        />
      )}
      <ConfirmDialog
        open={replaceConfirmOpen}
        variant="default"
        title="Replace this image?"
        description={
          images.length > 1
            ? "Your adjustments and rotation for this slot will be cleared. Other images in the batch are unaffected."
            : "Your adjustments and rotation will be cleared and replaced with defaults for the new image."
        }
        confirmLabel="Replace"
        onCancel={() => setReplaceConfirmOpen(false)}
        onConfirm={() => {
          setReplaceConfirmOpen(false);
          openReplacePicker();
        }}
      />
    </div>
  );
}
