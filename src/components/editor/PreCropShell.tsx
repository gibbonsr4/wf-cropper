import { useState } from "react";
import { Link } from "react-router";
import { Crop as CropIcon, Image as ImageIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import DropZone from "@/components/upload/DropZone";
import ImageNavigator from "./ImageNavigator";
import { Section } from "@/components/ui/section";
import TemplateSelector from "@/components/templates/TemplateSelector";
import type { Template, ImageMetadata } from "@/types";

// No completion data exists before cropping starts. A module-level
// constant avoids feeding a fresh Set into ImageNavigator on every
// render.
const EMPTY_URLS: Set<string> = new Set();

interface PreCropShellProps {
  image: ImageMetadata | null;
  /** Full image list — empty before upload, length 1 for single-file,
   *  length N for batch. Used to render the sidebar thumbnail list. */
  images: ImageMetadata[];
  /** If >1, the upload dropped multiple files and we're headed into batch
   *  mode instead of the single-file crop editor. */
  batchSize?: number;
  selectedTemplate: Template | null;
  templates: Template[];
  onFile: (file: File) => void;
  /** Optional multi-file handler. When provided, the DropZone accepts
   *  multiple files and the CTA copy switches to "Batch export". */
  onFiles?: (files: File[]) => void;
  onTemplateSelect: (template: Template) => void;
  onStartCrop: () => void;
  onNewImage: () => void;
  validationWarnings: string[];
  canProceed: boolean;
  imageError: string | null;
}

/**
 * Mimics the 3-panel editor layout during the upload → template-pick steps,
 * so the transition into the actual crop editor feels like the same surface
 * progressively populating with user decisions.
 *
 * Flow through the center column:
 *   no image  → DropZone
 *   image, no template  → TemplateSelector grid
 *   image + template → TemplateSelector (highlights selection) + "Crop & Edit" CTA
 */
export default function PreCropShell({
  image,
  images,
  batchSize,
  selectedTemplate,
  templates,
  onFile,
  onFiles,
  onTemplateSelect,
  onStartCrop,
  onNewImage,
  validationWarnings,
  canProceed,
  imageError,
}: PreCropShellProps) {
  const hasImage = !!image;
  const hasTemplate = !!selectedTemplate;
  const isBatch = (batchSize ?? 0) > 1;

  // Preview index: which image's metadata is expanded in the sidebar.
  // Defaults to 0; users can click other rows to inspect. Doesn't
  // affect anything downstream — just a local preview mechanism, since
  // cropping hasn't started yet.
  const [previewIndex, setPreviewIndex] = useState(0);
  const safePreviewIndex = Math.min(
    previewIndex,
    Math.max(0, images.length - 1)
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* ── Top bar (matches EditorTopBar, without per-output state) ── */}
      <header className="flex h-[52px] items-center gap-3 border-b border-border bg-card px-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-[13px] font-semibold tracking-tight"
        >
          <span
            className="grid h-5 w-5 place-items-center rounded-[5px] text-white"
            style={{
              background: "linear-gradient(135deg, #2e80ff, #8b5cf6)",
            }}
            aria-hidden="true"
          >
            <CropIcon className="h-3 w-3" />
          </span>
          <span>WF Cropper</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2 text-[12px]">
          {hasImage && (
            <>
              <span aria-hidden="true" className="text-fg-tertiary">
                ›
              </span>
              <span
                className={
                  hasTemplate
                    ? "truncate text-muted-foreground"
                    : "truncate font-medium text-foreground"
                }
                title={isBatch ? `Batch: ${batchSize} images` : image!.file.name}
              >
                {isBatch ? `Batch: ${batchSize} images` : image!.file.name}
              </span>
            </>
          )}
          {hasTemplate && (
            <>
              <span aria-hidden="true" className="text-fg-tertiary">
                ›
              </span>
              <span className="truncate font-medium text-foreground">
                {selectedTemplate!.name}
              </span>
            </>
          )}
        </div>

        <div className="flex-1" />

        <nav
          aria-label="Main navigation"
          className="flex items-center gap-5 text-[12px]"
        >
          <Link
            to="/wizard"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Wizard
          </Link>
          <Link
            to="/admin"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Templates
          </Link>
        </nav>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[clamp(240px,20vw,260px)_1fr_clamp(280px,25vw,320px)]">
        {/* ── LEFT PANEL ───────────────────────────────────────── */}
        <aside
          aria-label="Source image and template"
          className="overflow-y-auto border-r border-border bg-panel"
        >
          {hasImage ? (
            <Section
              title={isBatch ? "Images" : "Source"}
              variant="flush"
              headerEnd={
                isBatch ? (
                  <span className="text-[11px] font-medium text-fg-tertiary">
                    {images.length}
                  </span>
                ) : null
              }
            >
              <ImageNavigator
                images={images}
                currentIndex={safePreviewIndex}
                onIndexChange={setPreviewIndex}
                // No cropping has happened yet, so nothing is "done".
                // The completion dot renders for every image (only when
                // isBatch, since single-image hides the dot entirely).
                completedUrls={EMPTY_URLS}
                onReplace={onNewImage}
              />
            </Section>
          ) : (
            <PlaceholderBlock
              icon={<ImageIcon className="h-5 w-5" />}
              title="No image yet"
              body="Drop or select an image to get started."
            />
          )}

          {hasImage && (
            <div className="border-b border-border p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary">
                Template
              </div>
              <div className="mt-0.5 truncate text-[13px] font-semibold">
                {selectedTemplate?.name ?? (
                  <span className="font-normal text-muted-foreground">
                    Not selected
                  </span>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* ── CENTER ────────────────────────────────────────────── */}
        <main id="main-content" className="flex min-w-0 flex-col items-center justify-center overflow-y-auto bg-canvas p-8">
          {!hasImage ? (
            <div className="flex w-full max-w-[720px] flex-col items-center gap-6">
              <div className="w-full">
                <DropZone onFile={onFile} onFiles={onFiles} />
              </div>
              {imageError && (
                <p className="text-sm text-destructive" role="alert">
                  {imageError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex w-full max-w-[960px] flex-col gap-6">
              {templates.length === 0 ? (
                <div className="rounded-lg border border-border bg-panel p-6 text-center">
                  <p className="mb-2 text-[14px] font-medium text-foreground">
                    No templates configured
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Set up templates in{" "}
                    <Link to="/admin" className="text-blue underline">
                      Template manager
                    </Link>{" "}
                    or run the{" "}
                    <Link to="/wizard" className="text-blue underline">
                      Setup wizard
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <>
                  <TemplateSelector
                    templates={templates}
                    selected={selectedTemplate}
                    onSelect={onTemplateSelect}
                  />
                  {validationWarnings.length > 0 && (
                    <div
                      className="rounded-lg border border-destructive/50 bg-destructive/5 p-3"
                      role="alert"
                    >
                      {validationWarnings.map((w, i) => (
                        <p key={i} className="text-[12px] text-destructive">
                          {w}
                        </p>
                      ))}
                    </div>
                  )}
                  {hasTemplate && (
                    <div className="flex items-center gap-3 border-t border-border pt-4">
                      <Button
                        size="lg"
                        disabled={!canProceed}
                        onClick={onStartCrop}
                        className="gap-1.5"
                      >
                        <Sparkles className="h-4 w-4" />
                        {isBatch
                          ? `Review Batch (${batchSize} images)`
                          : "Crop & Edit"}
                        {!isBatch &&
                          selectedTemplate!.outputs.length > 1 &&
                          ` (${selectedTemplate!.outputs.length} outputs)`}
                      </Button>
                      {!canProceed && (
                        <p className="text-[12px] text-muted-foreground">
                          Fix the issues above to continue.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>

        {/* ── RIGHT PANEL ──────────────────────────────────────── */}
        <aside aria-label="Adjustments" className="overflow-y-auto border-l border-border bg-panel">
          <PlaceholderBlock
            icon={<Sparkles className="h-5 w-5" />}
            title={
              hasImage && hasTemplate
                ? "Ready to crop"
                : hasImage
                  ? "Select a template"
                  : "Adjustments"
            }
            body={
              hasImage && hasTemplate
                ? 'Click "Crop & Edit" to open the editor.'
                : hasImage
                  ? "Pick a template from the center to enable cropping."
                  : "Adjustments appear here once you start cropping."
            }
          />
        </aside>
      </div>
    </div>
  );
}

function PlaceholderBlock({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="border-b border-border p-6 text-center">
      <div
        className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-raised text-fg-tertiary"
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-fg-tertiary">
        {body}
      </p>
    </div>
  );
}
