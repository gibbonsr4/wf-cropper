import { RotateCcw } from "lucide-react";
import type { TemplateOutput } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { estimateFileSize, formatBytes } from "@/utils/estimate-size";

export interface OutputOverride {
  width?: number;
  format?: TemplateOutput["outputFormat"];
  quality?: number;
}

interface OutputOverridePanelProps {
  template: TemplateOutput;
  override: OutputOverride | undefined;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onChange: (override: OutputOverride) => void;
  onReset: () => void;
}

const FORMATS: { value: TemplateOutput["outputFormat"]; label: string }[] = [
  { value: "webp", label: "WebP" },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
  { value: "avif", label: "AVIF" },
];

export default function OutputOverridePanel({
  template,
  override,
  enabled,
  onToggle,
  onChange,
  onReset,
}: OutputOverridePanelProps) {
  const effectiveWidth = override?.width ?? template.outputWidth;
  const effectiveFormat = override?.format ?? template.outputFormat;
  const effectiveQuality = override?.quality ?? template.quality;

  // Effective height for the size estimate — derived from aspect ratio if
  // the template doesn't set an explicit height.
  const effectiveHeight =
    template.outputHeight ??
    Math.round(
      (effectiveWidth * template.aspectRatio[1]) / template.aspectRatio[0]
    );

  const widthOverridden = override?.width !== undefined;
  const formatOverridden = override?.format !== undefined;
  const qualityOverridden = override?.quality !== undefined;
  const anyOverridden =
    widthOverridden || formatOverridden || qualityOverridden;

  const estimate = estimateFileSize(
    effectiveWidth,
    effectiveHeight,
    effectiveFormat,
    effectiveQuality
  );

  return (
    <div className="border-t border-border/60">
      <div className="flex h-[34px] items-center justify-between px-3 text-[11px] font-medium uppercase tracking-[0.05em] text-fg-tertiary">
        <span className="flex items-center gap-2">
          Override this output
          {enabled && anyOverridden && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-blue">
              Active
            </span>
          )}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable output override"
          onClick={() => onToggle(!enabled)}
          className={cn(
            "relative h-4 w-7 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
            enabled ? "bg-blue" : "bg-raised"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-3 w-3 rounded-full transition-all",
              enabled
                ? "translate-x-3 bg-white"
                : "translate-x-0 bg-muted-foreground"
            )}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-3 px-3 pb-3">
          <p className="text-[11px] text-fg-tertiary">
            Per-image overrides. Reset when you upload a new image.
          </p>

          {/* Width */}
          <div>
            <div className="mb-1.5 grid grid-cols-[68px_1fr] items-center gap-2.5">
              <label
                htmlFor="override-width"
                className="text-[12px] text-muted-foreground"
              >
                Width
              </label>
              <div
                className={cn(
                  "flex h-8 items-stretch overflow-hidden rounded-[6px] border bg-input transition-colors focus-within:ring-2 focus-within:ring-blue/20",
                  widthOverridden
                    ? "border-blue focus-within:border-blue"
                    : "border-border focus-within:border-blue"
                )}
              >
                <input
                  id="override-width"
                  type="number"
                  min={100}
                  max={10000}
                  step={1}
                  value={effectiveWidth}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v <= 0) return;
                    onChange({ ...override, width: v });
                  }}
                  className={cn(
                    "flex-1 bg-transparent px-2.5 text-[12px] tabular-nums outline-none",
                    widthOverridden ? "text-blue" : "text-foreground"
                  )}
                />
                <span className="grid place-items-center border-l border-border px-2.5 text-[11px] font-semibold uppercase text-fg-tertiary">
                  PX
                </span>
              </div>
            </div>
            <div className="ml-[78px] text-[10px] text-fg-tertiary">
              Template default: {template.outputWidth} px
            </div>
          </div>

          {/* Format — native select avoids the overflow that SegmentedControl
              runs into at sidebar width (4 options × min-width doesn't fit a
              260-px panel). */}
          <div>
            <div className="mb-1.5 grid grid-cols-[68px_1fr] items-center gap-2.5">
              <label
                htmlFor="override-format"
                className="text-[12px] text-muted-foreground"
              >
                Format
              </label>
              <select
                id="override-format"
                value={effectiveFormat}
                onChange={(e) =>
                  onChange({
                    ...override,
                    format: e.target.value as TemplateOutput["outputFormat"],
                  })
                }
                className={cn(
                  "h-8 w-full rounded-[6px] border bg-input px-2 text-[12px] outline-none transition-colors focus:ring-2 focus:ring-blue/20",
                  formatOverridden
                    ? "border-blue text-blue focus:border-blue"
                    : "border-border text-foreground focus:border-blue"
                )}
                aria-label="Output format"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ml-[78px] text-[10px] text-fg-tertiary">
              Template default:{" "}
              {template.outputFormat === "jpeg"
                ? "JPEG"
                : template.outputFormat === "webp"
                  ? "WebP"
                  : template.outputFormat === "avif"
                    ? "AVIF"
                    : "PNG"}
            </div>
          </div>

          {/* Quality */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="override-quality"
                className="text-[12px] text-muted-foreground"
              >
                Quality
              </label>
              <span
                className={cn(
                  "text-[12px] font-medium tabular-nums",
                  qualityOverridden ? "text-blue" : "text-foreground"
                )}
              >
                {effectiveQuality}%
              </span>
            </div>
            <input
              id="override-quality"
              type="range"
              min={10}
              max={100}
              step={1}
              value={effectiveQuality}
              onChange={(e) =>
                onChange({ ...override, quality: Number(e.target.value) })
              }
              className={cn(
                "w-full accent-blue",
                qualityOverridden && "accent-blue"
              )}
              aria-label="Quality"
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-fg-tertiary">
              <span>Template default: {template.quality}%</span>
              <span
                className="tabular-nums"
                title={`Rough estimate — actual size depends on image content and may vary ±40%`}
              >
                ~{formatBytes(estimate)}
              </span>
            </div>
          </div>

          {/* Reset */}
          {anyOverridden && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="w-full justify-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Template
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
