import { useRef } from "react";
import {
  X,
  Package,
  Image as ImageIcon,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/Header";
import type { ImageMetadata, Template } from "@/types";
import { cn } from "@/lib/utils";

interface BatchExportViewProps {
  images: ImageMetadata[];
  template: Template;
  onRemoveImage: (index: number) => void;
  onAddMoreFiles: (files: File[]) => void;
  onChangeTemplate: () => void;
  onBack: () => void;
  /** Open the full crop editor with the current image queue. */
  onStartCropping: () => void;
}

/**
 * Pre-crop review screen for multi-file sessions. Users see the queue
 * they're about to crop, can drop files or add more, confirm the template,
 * then click "Start Cropping" to enter the full CropEditor queue.
 *
 * No adjustments panel and no Suggest Crop pre-compute here — those
 * happen inside CropEditor per image.
 */
export default function BatchExportView({
  images,
  template,
  onRemoveImage,
  onAddMoreFiles,
  onChangeTemplate,
  onBack,
  onStartCropping,
}: BatchExportViewProps) {
  return (
    <>
      <Header />
      <main
        id="main-content"
        className="mx-auto max-w-5xl px-6 py-6 text-foreground"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Batch · {images.length} image{images.length === 1 ? "" : "s"} ×{" "}
            {template.outputs.length} output
            {template.outputs.length === 1 ? "" : "s"}
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">
              Images ({images.length})
            </h2>
            <AddMoreButton onAdd={onAddMoreFiles} />
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {images.map((img, i) => (
              <BatchThumbnail
                key={`${img.objectUrl}-${i}`}
                image={img}
                onRemove={() => onRemoveImage(i)}
              />
            ))}
          </div>

          <div className="rounded-[6px] border border-border bg-panel-2 p-3 text-[12px] text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-semibold">Template:</span> {template.name}
              <button
                type="button"
                onClick={onChangeTemplate}
                className="ml-auto rounded-[4px] px-2 py-1 text-[11px] text-blue hover:bg-raised focus-visible:ring-2 focus-visible:ring-blue"
              >
                Change
              </button>
            </div>
            <p className="text-[11px] text-fg-tertiary">
              You&apos;ll step through every image × every output in the crop
              editor. Adjustments are applied per image. When you&apos;re done,
              everything exports as a single ZIP.
            </p>
          </div>
        </section>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <Button
            size="sm"
            onClick={onStartCropping}
            disabled={images.length === 0}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Start Cropping ({images.length})
          </Button>
        </div>
      </main>
    </>
  );
}

function BatchThumbnail({
  image,
  onRemove,
}: {
  image: ImageMetadata;
  onRemove: () => void;
}) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-[6px] border border-border bg-raised">
      <img
        src={image.objectUrl}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${image.file.name}`}
        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/80 text-foreground opacity-40 shadow transition-opacity hover:bg-background hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[10px] font-medium text-white">
        {image.file.name}
      </div>
    </div>
  );
}

function AddMoreButton({ onAdd }: { onAdd: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) onAdd(files);
    e.target.value = "";
  };
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "inline-flex items-center gap-1 rounded-[4px] border border-border bg-panel-2 px-2 py-1 text-[11px] font-medium focus-visible:ring-2 focus-visible:ring-blue",
          "cursor-pointer text-muted-foreground hover:text-foreground"
        )}
      >
        <ImageIcon className="h-3 w-3" aria-hidden="true" />
        Add more
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
}
