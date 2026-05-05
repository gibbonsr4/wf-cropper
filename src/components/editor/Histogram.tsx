import { useMemo } from "react";
import type { HistogramData } from "@/hooks/useHistogram";
import { cn } from "@/lib/utils";

interface HistogramProps {
  data: HistogramData | null;
  /** Pixel width of the rendered histogram. Defaults to 256 (one bin per px). */
  width?: number;
  /** Pixel height. Defaults to 64. */
  height?: number;
  className?: string;
}

/**
 * Classic overlapped RGB + luminance histogram. Each channel fills a semi-
 * transparent area so overlapping regions read as white (all three stacked).
 * A softer luminance outline sits on top.
 *
 * Render uses SVG path strings built from the bin data — ~1 KB of markup,
 * no canvas imperative ops, and CSS can style the result.
 */
export function Histogram({
  data,
  width = 256,
  height = 64,
  className,
}: HistogramProps) {
  const paths = useMemo(() => {
    if (!data) return null;
    // Peak + a small headroom so the brightest bin doesn't touch the top edge.
    const max = Math.max(1, data.peak * 1.02);
    const buildPath = (bins: Uint32Array) => {
      const step = width / 256;
      let d = `M 0 ${height}`;
      for (let i = 0; i < 256; i++) {
        const x = i * step;
        const y = height - (bins[i] / max) * height;
        d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
      }
      d += ` L ${width} ${height} Z`;
      return d;
    };
    return {
      r: buildPath(data.r),
      g: buildPath(data.g),
      b: buildPath(data.b),
      lum: buildPath(data.lum),
    };
  }, [data, width, height]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[4px] border border-border bg-raised",
        className
      )}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        {paths ? (
          <>
            {/* Lighten blend so overlapping channels build toward white,
                matching the Photoshop/Lightroom look. */}
            <g style={{ mixBlendMode: "screen" }}>
              <path d={paths.r} fill="rgba(255, 80, 80, 0.6)" />
              <path d={paths.g} fill="rgba(80, 220, 80, 0.6)" />
              <path d={paths.b} fill="rgba(80, 140, 255, 0.6)" />
            </g>
            {/* Luminance outline sits on top for quick exposure reads. */}
            <path
              d={paths.lum}
              fill="none"
              stroke="rgba(255, 255, 255, 0.35)"
              strokeWidth={0.75}
            />
          </>
        ) : (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255, 255, 255, 0.3)"
            fontSize="9"
            fontFamily="system-ui, sans-serif"
          >
            Analyzing…
          </text>
        )}
      </svg>
    </div>
  );
}
