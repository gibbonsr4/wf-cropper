import { useEffect, useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import type { ImageMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/utils/image";

interface ImageNavigatorProps {
  images: ImageMetadata[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  /** objectUrls of images whose every output has been cropped. */
  completedUrls: Set<string>;
  /**
   * Optional handler for replacing the active image. When provided,
   * a "Replace Image" button renders under the active row. Today this
   * is wired in single-image sessions only — multi-image sessions
   * manage the queue via Back → batch review.
   */
  onReplace?: () => void;
}

/**
 * Source view for one or more images. Used uniformly for single- and
 * multi-image sessions — a single-image session is just a list of
 * length 1 whose only row is always active and always expanded.
 *
 * Visually mirrors OutputNavigator: blue accent bar on the active
 * row, per-image completion dot or checkmark (hidden entirely when
 * there's only one image, since completion has no meaning there).
 *
 * The active row expands to show format and file size, and an optional
 * Replace Image button below — folding in what SourceImageCard used
 * to display on its own.
 */
export default function ImageNavigator({
  images,
  currentIndex,
  onIndexChange,
  completedUrls,
  onReplace,
}: ImageNavigatorProps) {
  // Ref map keyed by objectUrl so we can scroll the active row into view
  // whenever currentIndex changes (including from keyboard shortcuts).
  const rowRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const activeUrl = images[currentIndex]?.objectUrl;
  const isQueue = images.length > 1;

  useEffect(() => {
    if (!activeUrl) return;
    const row = rowRefs.current.get(activeUrl);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeUrl]);

  if (images.length === 0) return null;

  return (
    // max-h caps the list so it can't push Template / Outputs off-screen
    // on long queues. Single-image sessions render a single row so the
    // height never actually reaches the cap.
    <div
      aria-label={isQueue ? "Images" : "Source image"}
      className={cn(isQueue && "max-h-[40vh] overflow-y-auto")}
    >
      {images.map((img, i) => {
        const isActive = i === currentIndex;
        const isDone = completedUrls.has(img.objectUrl);
        return (
          <div key={img.objectUrl}>
            <button
              ref={(el) => {
                rowRefs.current.set(img.objectUrl, el);
              }}
              type="button"
              aria-current={isActive ? "true" : undefined}
              onClick={() => onIndexChange(i)}
              className={cn(
                "flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors",
                isActive
                  ? "border-l-blue bg-blue-soft"
                  : "border-l-transparent hover:bg-white/[0.03]"
              )}
            >
              <Thumb image={img} />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate text-[12px] font-medium",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  title={img.file.name}
                >
                  {img.file.name}
                </div>
                <div className="mt-0.5 text-[10px] tabular-nums text-fg-tertiary">
                  {img.width} × {img.height}
                  {/* Active row also shows format + file size. Non-active
                      rows stay compact so long queues stay scannable. */}
                  {isActive && (
                    <> · {img.format} · {formatBytes(img.size)}</>
                  )}
                </div>
              </div>
              {/* Completion indicator only makes sense in queue mode —
                  with one image there's nothing to tick off. */}
              {isQueue && (
                <span
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  {isDone ? (
                    <Check
                      className="h-4 w-4"
                      style={{ color: "var(--success)" }}
                      strokeWidth={2.5}
                    />
                  ) : (
                    <span className="h-2 w-2 rounded-full border-[1.5px] border-fg-tertiary" />
                  )}
                </span>
              )}
            </button>

            {/* Replace Image lives below the active row when the parent
                provides a handler. Sibling to the button so we don't
                nest two interactive elements. */}
            {isActive && onReplace && (
              <div className="border-l-2 border-l-blue bg-blue-soft/30 px-3 pb-2.5 pt-1">
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
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Small cover-fit thumbnail generated from the source on mount. Mirrors
 * the approach in SourceImageCard — downscales to 72×72 webp so the
 * full source isn't in memory for every row.
 */
function Thumb({ image }: { image: ImageMetadata }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const size = 72; // 2x retina for 36px slot
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "medium";
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
          const url = URL.createObjectURL(b);
          objectUrlRef.current = url;
          setThumb(url);
        },
        "image/webp",
        0.75
      );
    };
    img.src = image.objectUrl;

    return () => {
      cancelled = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [image.objectUrl]);

  return (
    <div
      className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-[4px] bg-raised ring-1 ring-border"
      aria-hidden="true"
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-white/5" />
      )}
    </div>
  );
}

