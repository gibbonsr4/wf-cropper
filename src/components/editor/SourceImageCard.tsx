import { useState, useEffect } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageMetadata } from "@/types";
import { formatBytes } from "@/utils/image";

interface SourceImageCardProps {
  image: ImageMetadata;
  onReplace: () => void;
}

export default function SourceImageCard({
  image,
  onReplace,
}: SourceImageCardProps) {
  // Generate a small tinted thumbnail from the source.
  // The real image is too heavy to display as a 40px thumb without downscaling.
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const size = 96; // 2x retina for a 48px display slot
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // Cover-fit
      const srcAspect = img.naturalWidth / img.naturalHeight;
      let sx = 0;
      let sy = 0;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;
      if (srcAspect > 1) {
        sw = img.naturalHeight;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = img.naturalWidth;
        sy = (img.naturalHeight - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      canvas.toBlob(
        (b) => {
          if (!b || cancelled) return;
          blobUrl = URL.createObjectURL(b);
          setThumb(blobUrl);
        },
        "image/webp",
        0.75
      );
    };
    img.src = image.objectUrl;

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [image.objectUrl]);

  return (
    <div className="flex flex-col gap-2.5 border-b border-border p-3">
      <div className="flex items-center gap-2.5">
        <div
          className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-[4px] bg-raised ring-1 ring-border"
          aria-hidden="true"
        >
          {thumb ? (
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full animate-pulse bg-white/5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[12px] font-medium text-foreground"
            title={image.file.name}
          >
            {image.file.name}
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-fg-tertiary">
            {image.width} × {image.height} · {image.format} ·{" "}
            {formatBytes(image.size)}
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onReplace}
        className="w-full justify-center gap-1.5"
      >
        <Upload className="h-3.5 w-3.5" />
        Replace Image
      </Button>
    </div>
  );
}
