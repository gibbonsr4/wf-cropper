import { useState, useId, useCallback, useEffect } from "react";
import { Crop } from "lucide-react";
import type { Template, TemplateOutput } from "@/types";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";

interface TemplateSelectorProps {
  templates: Template[];
  selected: Template | null;
  onSelect: (template: Template) => void;
  /**
   * Layout variant. "grid" (default) is the wide layout used on the upload
   * page. "stack" is a single-column vertical list sized for narrow side
   * panels (~260px wide), where card text would otherwise be cramped.
   */
  variant?: "grid" | "stack";
}

const RATIO_PRESETS = [
  { label: "16:9", w: 16, h: 9 },
  { label: "4:3", w: 4, h: 3 },
  { label: "3:2", w: 3, h: 2 },
  { label: "1:1", w: 1, h: 1 },
  { label: "2:3", w: 2, h: 3 },
  { label: "9:16", w: 9, h: 16 },
] as const;

function buildCustomTemplate(
  ratioW: number,
  ratioH: number,
  outputWidth: number,
  format: TemplateOutput["outputFormat"],
  quality: number
): Template {
  return {
    id: "custom",
    name: "Custom",
    description: "Custom crop",
    minInputWidth: null,
    minInputShortSide: null,
    outputs: [
      {
        id: "custom-output",
        name: "Custom Crop",
        aspectRatio: [ratioW, ratioH],
        outputWidth,
        outputHeight: null,
        outputFormat: format,
        quality,
        filenameKey: "custom",
        cropHint: null,
      },
    ],
  };
}

export default function TemplateSelector({
  templates,
  selected,
  onSelect,
  variant = "grid",
}: TemplateSelectorProps) {
  const labelId = useId();
  const isCustomSelected = selected?.id === "custom";
  const stack = variant === "stack";

  // Custom form state
  const [ratioPreset, setRatioPreset] = useState<string>("16:9");
  const [customW, setCustomW] = useState(16);
  const [customH, setCustomH] = useState(9);
  const [outputWidth, setOutputWidth] = useState(1200);
  const [format, setFormat] = useState<TemplateOutput["outputFormat"]>("webp");
  const [quality, setQuality] = useState(80);

  const ratioW =
    ratioPreset === "custom"
      ? customW
      : RATIO_PRESETS.find((p) => p.label === ratioPreset)!.w;
  const ratioH =
    ratioPreset === "custom"
      ? customH
      : RATIO_PRESETS.find((p) => p.label === ratioPreset)!.h;

  // Emit updated template whenever form values change (only when custom is selected)
  const emitCustomTemplate = useCallback(() => {
    if (!isCustomSelected) return;
    if (ratioW <= 0 || ratioH <= 0 || outputWidth <= 0) return;
    onSelect(buildCustomTemplate(ratioW, ratioH, outputWidth, format, quality));
  }, [
    isCustomSelected,
    ratioW,
    ratioH,
    outputWidth,
    format,
    quality,
    onSelect,
  ]);

  useEffect(() => {
    emitCustomTemplate();
  }, [emitCustomTemplate]);

  const handleCustomClick = () => {
    onSelect(buildCustomTemplate(ratioW, ratioH, outputWidth, format, quality));
  };

  return (
    <div className="space-y-3">
      <h2
        id={labelId}
        className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary"
      >
        Select a template
      </h2>
      <div
        aria-labelledby={labelId}
        className={cn(
          stack
            ? "flex flex-col gap-1.5"
            : "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
        )}
      >
        {templates.map((template) => {
          const isSelected = selected?.id === template.id;
          const outputCount = template.outputs.length;
          const ratioLabel = template.outputs
            .map((o) => `${o.aspectRatio[0]}:${o.aspectRatio[1]}`)
            .join(", ");

          return (
            <button
              key={template.id}
              aria-pressed={isSelected}
              onClick={() => onSelect(template)}
              className={cn(
                "rounded-[6px] border bg-panel-2 text-left transition-colors",
                stack
                  ? "flex items-center justify-between gap-3 px-2.5 py-2"
                  : "flex flex-col items-start gap-1 p-3",
                isSelected
                  ? "border-blue bg-blue-soft shadow-[0_0_0_1px_var(--blue)]"
                  : "border-border hover:border-border-strong hover:bg-raised"
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[12px] font-semibold text-foreground">
                  {template.name}
                </span>
                <span className="truncate text-[11px] tabular-nums text-fg-tertiary">
                  {ratioLabel}
                  {outputCount > 1 && ` · ${outputCount} outputs`}
                </span>
              </span>
              {!stack && outputCount > 1 && null}
            </button>
          );
        })}

        {/* Custom template card */}
        <button
          aria-pressed={isCustomSelected}
          onClick={handleCustomClick}
          className={cn(
            "rounded-[6px] border text-left transition-colors",
            stack
              ? "flex items-center gap-2 px-2.5 py-2"
              : "flex flex-col items-start gap-1 p-3",
            isCustomSelected
              ? "border-blue bg-blue-soft shadow-[0_0_0_1px_var(--blue)]"
              : "border-dashed border-border hover:border-border-strong hover:bg-raised"
          )}
        >
          <Crop className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[12px] font-semibold text-foreground">
              Custom
            </span>
            <span className="text-[11px] text-fg-tertiary">Any ratio</span>
          </span>
        </button>
      </div>

      {/* Custom configuration form */}
      {isCustomSelected && (
        <div className="space-y-3 rounded-[6px] border border-blue/30 bg-blue-soft p-3">
          {/* Aspect ratio presets */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary">
              Aspect Ratio
            </label>
            <div className="flex flex-wrap gap-1">
              {RATIO_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setRatioPreset(preset.label)}
                  className={cn(
                    "h-[26px] rounded-[4px] px-2.5 text-[11px] font-semibold transition-colors",
                    ratioPreset === preset.label
                      ? "bg-blue text-white"
                      : "bg-raised text-muted-foreground hover:text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRatioPreset("custom")}
                className={cn(
                  "h-[26px] rounded-[4px] px-2.5 text-[11px] font-semibold transition-colors",
                  ratioPreset === "custom"
                    ? "bg-blue text-white"
                    : "bg-raised text-muted-foreground hover:text-foreground"
                )}
              >
                Custom
              </button>
            </div>

            {ratioPreset === "custom" && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={customW}
                  onChange={(e) =>
                    setCustomW(Math.max(1, Number(e.target.value)))
                  }
                  aria-label="Ratio width"
                  className="h-8 w-20 rounded-[6px] border border-border bg-input px-2.5 text-[12px] tabular-nums text-foreground outline-none focus:border-blue"
                />
                <span className="text-[12px] text-muted-foreground">:</span>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={customH}
                  onChange={(e) =>
                    setCustomH(Math.max(1, Number(e.target.value)))
                  }
                  aria-label="Ratio height"
                  className="h-8 w-20 rounded-[6px] border border-border bg-input px-2.5 text-[12px] tabular-nums text-foreground outline-none focus:border-blue"
                />
              </div>
            )}
          </div>

          {/* Output width + Format + Quality */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor={`${labelId}-width`}
                className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary"
              >
                Output Width
              </label>
              <div className="flex h-8 items-stretch overflow-hidden rounded-[6px] border border-border bg-input focus-within:border-blue">
                <input
                  id={`${labelId}-width`}
                  type="number"
                  min={100}
                  max={10000}
                  step={100}
                  value={outputWidth}
                  onChange={(e) =>
                    setOutputWidth(Math.max(100, Number(e.target.value)))
                  }
                  className="flex-1 bg-transparent px-2.5 text-[12px] tabular-nums text-foreground outline-none"
                />
                <span className="grid place-items-center border-l border-border px-2.5 text-[11px] font-semibold uppercase text-fg-tertiary">
                  PX
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary">
                Format
              </label>
              <SegmentedControl
                options={[
                  { value: "webp", label: "WebP" },
                  { value: "jpeg", label: "JPEG" },
                  { value: "png", label: "PNG" },
                ]}
                value={format}
                onChange={(v) => setFormat(v as TemplateOutput["outputFormat"])}
                fullWidth
                ariaLabel="Format"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor={`${labelId}-quality`}
                className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary"
              >
                Quality
              </label>
              <span className="text-[12px] font-medium tabular-nums text-foreground">
                {quality}%
              </span>
            </div>
            <input
              id={`${labelId}-quality`}
              type="range"
              min={10}
              max={100}
              step={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-blue"
            />
          </div>

          <p className="border-t border-border pt-2 text-[11px] tabular-nums text-fg-tertiary">
            Output: {outputWidth} ×{" "}
            {Math.round((outputWidth * ratioH) / ratioW)} px ·{" "}
            {format.toUpperCase()} @ {quality}%
          </p>
        </div>
      )}
    </div>
  );
}
