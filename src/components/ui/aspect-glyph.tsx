import { cn } from "@/lib/utils";

interface AspectGlyphProps {
  aspectRatio: [number, number];
  /** Outer box size in px. Default 28 (for list items). */
  size?: number;
  /** Blue active state; otherwise neutral. */
  active?: boolean;
  className?: string;
}

/**
 * A literal filled rectangle at the output's aspect ratio. Visually
 * communicates 1:1 vs 3:2 vs 16:9 without needing to parse text.
 */
export function AspectGlyph({
  aspectRatio,
  size = 28,
  active,
  className,
}: AspectGlyphProps) {
  const [w, h] = aspectRatio;
  // Fit a rectangle with max dimension (size - 6) px inside the box.
  const maxDim = size - 6;
  let rectW: number;
  let rectH: number;
  if (w >= h) {
    rectW = maxDim;
    rectH = (maxDim * h) / w;
    if (rectH < 10) rectH = 10;
  } else {
    rectH = maxDim;
    rectW = (maxDim * w) / h;
    if (rectW < 10) rectW = 10;
  }

  return (
    <span
      className={cn(
        "flex flex-shrink-0 items-center justify-center",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className={cn(
          "rounded-[3px] transition-colors",
          active ? "bg-blue" : "bg-fg-tertiary"
        )}
        style={{
          width: `${Math.round(rectW)}px`,
          height: `${Math.round(rectH)}px`,
        }}
      />
    </span>
  );
}
