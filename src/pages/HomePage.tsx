import { useState, useCallback, useRef } from "react";
import { useConfig } from "@/hooks/useConfig";
import { useImageLoader } from "@/hooks/useImageLoader";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useToast } from "@/hooks/useStatusToast";
import CropEditor, {
  type MultiImageExportPlan,
} from "@/components/editor/CropEditor";
import PreCropShell from "@/components/editor/PreCropShell";
import BatchExportView from "@/components/editor/BatchExportView";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { validateImageForTemplate } from "@/utils/validation";
import { renderCroppedImage } from "@/utils/canvas";
import { downloadMultipleBlobs } from "@/utils/download";
import { downloadAsZip } from "@/utils/zip";
import { generateFilename } from "@/utils/filename";
import type {
  Template,
  TemplateOutput,
  CroppedArea,
  AdjustmentState,
  ImageMetadata,
} from "@/types";

type Step = "upload" | "template" | "batch" | "crop";

function ExportOverlay({
  progress,
  onCancel,
}: {
  progress: { done: number; total: number } | null;
  onCancel: () => void;
}) {
  const cardRef = useFocusTrap(onCancel);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Exporting"
    >
      <div
        ref={cardRef}
        className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-4 shadow-lg"
      >
        <p className="text-sm font-medium" role="status" aria-live="polite">
          {progress
            ? `Exporting ${progress.done} / ${progress.total}…`
            : "Exporting…"}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { config, loading } = useConfig();
  const { toast } = useToast();
  const {
    image,
    images,
    error: imageError,
    loadImage,
    loadImages,
    clearImage,
    removeImage,
    replaceImageAt,
  } = useImageLoader();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  );
  const [step, setStep] = useState<Step>("upload");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<
    { done: number; total: number } | null
  >(null);
  const cancelExportRef = useRef(false);

  const isBatch = images.length > 1;

  useDocumentTitle(
    step === "batch" && selectedTemplate
      ? `Batch review: ${selectedTemplate.name} — WF Cropper`
      : step === "crop" && selectedTemplate
        ? isBatch
          ? `Batch: ${selectedTemplate.name} — WF Cropper`
          : `Crop: ${selectedTemplate.name} — WF Cropper`
        : "WF Cropper"
  );

  const handleFile = useCallback(
    (file: File) => {
      loadImage(file);
      setStep("template");
    },
    [loadImage]
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      loadImages(files);
      setStep("template");
    },
    [loadImages]
  );

  const handleTemplateSelect = useCallback((template: Template) => {
    setSelectedTemplate(template);
  }, []);

  const handleStartCrop = useCallback(() => {
    // Single-file → straight to the crop editor.
    // Multi-file → a brief review screen (BatchExportView) where users
    // can drop duds or add more, then click into the crop editor queue.
    setStep(isBatch ? "batch" : "crop");
  }, [isBatch]);

  const handleBack = useCallback(() => {
    setStep("template");
  }, []);

  const handleNewImage = useCallback(() => {
    clearImage();
    setSelectedTemplate(null);
    setStep("upload");
  }, [clearImage]);

  /**
   * Per-slot image replacement. The editor opens a file picker, receives
   * one File, and this handler swaps it into the images[] slot at `index`
   * via useImageLoader.replaceImageAt. Everything else in the session
   * (template, other images, their crops, their adjustments) is preserved.
   *
   * The replaced slot's editor state (crop, adjustments, history) is
   * cleaned up inside CropEditor, which already watches for objectUrls
   * that drop out of the images array.
   */
  const handleReplaceImage = useCallback(
    (index: number, file: File) => {
      void replaceImageAt(index, file);
    },
    [replaceImageAt]
  );

  const handleAddMoreFiles = useCallback(
    (files: File[]) => {
      // Append-not-replace isn't in the hook API; rebuild the list by
      // calling loadImages with existing + new files. We preserve current
      // images by re-uploading their source File objects.
      const existing = images.map((i) => i.file);
      loadImages([...existing, ...files]);
    },
    [images, loadImages]
  );

  /**
   * Render a single image × one output into one or more blobs, honoring
   * the output's additionalFormats. Shared by the single-file and batch
   * code paths.
   */
  const renderOutputForImage = useCallback(
    async (
      src: ImageMetadata,
      output: TemplateOutput,
      cropArea: CroppedArea,
      adjustments: AdjustmentState,
      filenamePattern: string
    ): Promise<{ blob: Blob; filename: string }[]> => {
      const seen = new Set<string>();
      const formats = [
        output.outputFormat,
        ...(output.additionalFormats ?? []),
      ].filter((f) => {
        if (seen.has(f)) return false;
        seen.add(f);
        return true;
      });

      const out: { blob: Blob; filename: string }[] = [];
      for (const fmt of formats) {
        const formatted = { ...output, outputFormat: fmt };
        const blob = await renderCroppedImage(
          src.objectUrl,
          cropArea,
          adjustments,
          formatted
        );
        const filename = generateFilename(
          filenamePattern,
          src.file.name,
          formatted
        );
        out.push({ blob, filename });
      }
      return out;
    },
    []
  );

  const handleCancelExport = useCallback(() => {
    cancelExportRef.current = true;
  }, []);

  /**
   * Single unified export handler for both single-file and multi-file
   * crop sessions. CropEditor always returns a MultiImageExportPlan (an
   * array of per-image work) — single-image sessions just happen to send
   * an array of length 1.
   */
  const handleExport = useCallback(
    async (plan: MultiImageExportPlan) => {
      if (!selectedTemplate || !config) return;
      if (plan.perImage.length === 0) return;

      // Compute total file count up-front for an accurate progress ratio.
      // Mirrors renderOutputForImage's format-dedup so the progress can
      // actually hit 100% when additionalFormats repeats the primary format.
      let total = 0;
      for (const entry of plan.perImage) {
        for (const { output } of entry.outputs.values()) {
          const seen = new Set<string>();
          for (const f of [
            output.outputFormat,
            ...(output.additionalFormats ?? []),
          ]) {
            if (!seen.has(f)) {
              seen.add(f);
              total++;
            }
          }
        }
      }

      cancelExportRef.current = false;
      setExporting(true);
      setExportProgress({ done: 0, total });
      try {
        const files: { blob: Blob; filename: string }[] = [];

        // Iterate images in queue order, then outputs in template order
        // so filenames sort predictably.
        for (const entry of plan.perImage) {
          if (cancelExportRef.current) break;
          for (const templateOutput of selectedTemplate.outputs) {
            if (cancelExportRef.current) break;
            const cropData = entry.outputs.get(templateOutput.id);
            if (!cropData) continue;
            const rendered = await renderOutputForImage(
              entry.image,
              cropData.output,
              cropData.cropArea,
              entry.adjustments,
              config.filenamePattern
            );
            files.push(...rendered);
            setExportProgress((p) =>
              p ? { done: p.done + rendered.length, total: p.total } : null
            );
          }
        }

        if (cancelExportRef.current) {
          toast({ type: "info", text: "Export cancelled." });
          return;
        }

        // ZIP for multi-image exports or when more than 2 files land.
        // Single image with 1-2 files downloads individually.
        const isMulti = plan.perImage.length > 1;
        if (isMulti) {
          const date = new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, "");
          await downloadAsZip(
            files,
            `batch-${plan.perImage.length}-${date}.zip`
          );
        } else if (files.length >= 3) {
          const base =
            plan.perImage[0].image.file.name.replace(/\.[^.]+$/, "") ||
            "export";
          await downloadAsZip(files, `${base}-crops.zip`);
        } else {
          await downloadMultipleBlobs(files);
        }
        toast({
          type: "success",
          text: `Exported ${files.length} file${files.length === 1 ? "" : "s"}.`,
        });
      } catch (err) {
        console.error("Export failed:", err);
        toast({
          type: "error",
          text: `Export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      } finally {
        setExporting(false);
        setExportProgress(null);
      }
    },
    [selectedTemplate, config, renderOutputForImage, toast]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  const validation =
    image && selectedTemplate && !isBatch
      ? validateImageForTemplate(image, selectedTemplate)
      : null;

  // Per-image validation for batch mode (con-012). Collect warnings for
  // images that don't meet the template's minimum constraints.
  const batchWarnings =
    isBatch && selectedTemplate
      ? images.flatMap((img) => {
          const r = validateImageForTemplate(img, selectedTemplate);
          return r.warnings.map((w) => `${img.file.name}: ${w}`);
        })
      : [];

  // ── Batch review (multi-file, before entering the crop editor) ──
  if (step === "batch" && images.length > 0 && selectedTemplate) {
    return (
      <ErrorBoundary onReset={handleNewImage} resetLabel="Start over">
        <BatchExportView
          images={images}
          template={selectedTemplate}
          onRemoveImage={removeImage}
          onAddMoreFiles={handleAddMoreFiles}
          onChangeTemplate={() => setStep("template")}
          onBack={handleBack}
          onStartCropping={() => setStep("crop")}
        />
      </ErrorBoundary>
    );
  }

  // ── Full-viewport crop editor (single or multi-image queue) ──────
  if (step === "crop" && images.length > 0 && selectedTemplate) {
    return (
      <>
        {exporting && (
          <ExportOverlay
            progress={exportProgress}
            onCancel={handleCancelExport}
          />
        )}
        <ErrorBoundary onReset={handleNewImage} resetLabel="Start over">
          <CropEditor
            images={images}
            template={selectedTemplate}
            onTemplateChange={setSelectedTemplate}
            onExport={handleExport}
            onBack={handleBack}
            onReplaceImage={handleReplaceImage}
            exporting={exporting}
          />
        </ErrorBoundary>
      </>
    );
  }

  // ── Upload + template picker (editor shell layout) ───────────────
  return (
    <ErrorBoundary onReset={handleNewImage} resetLabel="Start over">
      <PreCropShell
        image={image}
        images={images}
        batchSize={isBatch ? images.length : undefined}
        selectedTemplate={selectedTemplate}
        templates={config?.templates ?? []}
        onFile={handleFile}
        onFiles={handleFiles}
        onTemplateSelect={handleTemplateSelect}
        onStartCrop={handleStartCrop}
        onNewImage={handleNewImage}
        validationWarnings={
          isBatch
            ? batchWarnings
            : validation && !validation.valid
              ? validation.warnings
              : []
        }
        canProceed={isBatch ? !!selectedTemplate : !!validation?.valid}
        imageError={imageError}
      />
    </ErrorBoundary>
  );
}
