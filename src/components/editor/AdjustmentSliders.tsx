import { useState, useId } from "react";
import { useToast } from "@/hooks/useStatusToast";
import { Wand2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import type { AdjustmentState, CroppedArea } from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";
import {
  autoBrightnessContrast,
  autoColor,
  autoEnhance,
  createAnalysisCanvas,
} from "@/utils/adjustments";
import { cn } from "@/lib/utils";
import { useHistogram } from "@/hooks/useHistogram";
import { Histogram } from "./Histogram";

interface AdjustmentSlidersProps {
  adjustments: AdjustmentState;
  onChange: (adjustments: AdjustmentState) => void;
  imageSrc: string;
  outputCount?: number;
  /**
   * Current output's crop region in source-image coordinates. When present
   * the histogram and Auto buttons analyze just this region instead of
   * the whole source image — matching what gets exported.
   */
  cropRegion?: CroppedArea | null;
  /** Human label for the active output, used in the "analyzing crop of X"
   *  hint. Ignored when cropRegion isn't supplied. */
  cropLabel?: string;
}

// Dark-theme track colors
const TRACK_BG = "var(--raised)"; // subtle elevated track
const FILL_COLOR = "var(--muted-foreground)"; // neutral fill for off-default

// Warmth uses a self-documenting gradient (like Lightroom's Temp slider)
const WARMTH_GRADIENT =
  "linear-gradient(to right, #7cb5d4, #4a4a4a 50%, #d4944a)";

/**
 * Fill-from-center: shows a colored bar from the default (center)
 * to the current value. At default, the track is plain dark gray.
 */
function getTrackStyle(value: number): string {
  const pct = (value / 200) * 100;
  const center = 50;

  if (Math.abs(value - 100) < 0.5) return TRACK_BG;

  if (value > 100) {
    return `linear-gradient(to right, ${TRACK_BG} ${center}%, ${FILL_COLOR} ${center}%, ${FILL_COLOR} ${pct}%, ${TRACK_BG} ${pct}%)`;
  }
  return `linear-gradient(to right, ${TRACK_BG} ${pct}%, ${FILL_COLOR} ${pct}%, ${FILL_COLOR} ${center}%, ${TRACK_BG} ${center}%)`;
}

const sliderDefs: Array<{
  key: keyof AdjustmentState;
  label: string;
  group: "light" | "color" | "detail";
}> = [
  { key: "brightness", label: "Brightness", group: "light" },
  { key: "contrast", label: "Contrast", group: "light" },
  { key: "shadows", label: "Shadows", group: "light" },
  { key: "highlights", label: "Highlights", group: "light" },
  { key: "saturation", label: "Saturation", group: "color" },
  { key: "vibrance", label: "Vibrance", group: "color" },
  { key: "warmth", label: "Warmth", group: "color" },
  { key: "sharpness", label: "Sharpness", group: "detail" },
];

/**
 * Slider row with label + value on top, full-width slider below.
 * Matches Webflow Designer's slider pattern (taller, with center-fill coloring).
 */
function SliderRow({
  sliderKey,
  label,
  value,
  onChange,
  onReset,
}: {
  sliderKey: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const [localValue, setLocalValue] = useState<string | null>(null);
  const sliderId = useId();

  const isDefault = value === 100;
  const displayValue = value - 100;
  const trackStyle =
    sliderKey === "warmth" ? WARMTH_GRADIENT : getTrackStyle(value);

  const commitInput = (raw: string) => {
    setLocalValue(null);
    // Empty input → no-op: revert to current value via the null local state
    if (raw.trim() === "") return;
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(-100, Math.min(100, parsed));
      onChange(clamped + 100);
    }
  };

  return (
    <div className="space-y-1.5">
      {/* Label + value row */}
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={sliderId}
          className="text-[12px] text-muted-foreground select-none"
        >
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${label} value`}
            value={
              localValue ??
              (displayValue > 0 ? `+${displayValue}` : String(displayValue))
            }
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={(e) => commitInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitInput((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                setLocalValue(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
            onFocus={(e) => {
              setLocalValue(String(displayValue));
              requestAnimationFrame(() => e.target.select());
            }}
            className={cn(
              "w-12 rounded-[4px] border border-transparent bg-transparent px-1 py-0.5 text-right text-[12px] tabular-nums outline-none transition-colors focus:border-blue focus:bg-input",
              isDefault ? "text-fg-tertiary" : "font-medium text-foreground"
            )}
          />
          <button
            type="button"
            onClick={onReset}
            aria-label={`Reset ${label}`}
            title="Reset to default"
            className={cn(
              "rounded-[4px] p-1.5 -m-1.5 text-fg-tertiary transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue",
              isDefault && "invisible"
            )}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Slider */}
      <div className="relative flex h-5 items-center">
        <input
          id={sliderId}
          type="range"
          min={0}
          max={200}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={onReset}
          className="gradient-slider w-full"
          style={{ "--track-bg": trackStyle } as React.CSSProperties}
        />
        {/* Center tick: ~1px marker at the midpoint of the track.
            Offset by half thumb width so it lands in the visual center. */}
        <div
          className="pointer-events-none absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-white/15"
          style={{ left: "calc(8px + (100% - 16px) * 0.5)" }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default function AdjustmentSliders({
  adjustments,
  onChange,
  imageSrc,
  outputCount = 1,
  cropRegion,
  cropLabel,
}: AdjustmentSlidersProps) {
  const { toast } = useToast();
  const [autoLoading, setAutoLoading] = useState<string | null>(null);
  const histogram = useHistogram(imageSrc, adjustments, cropRegion);

  const hasChanges = Object.keys(DEFAULT_ADJUSTMENTS).some(
    (key) =>
      adjustments[key as keyof AdjustmentState] !==
      DEFAULT_ADJUSTMENTS[key as keyof AdjustmentState]
  );

  const handleAuto = async (mode: "brightness" | "color" | "enhance") => {
    setAutoLoading(mode);
    try {
      // Feed the cropped region into Auto so it optimizes for what the
      // user is about to export, not the full source image.
      const canvas = await createAnalysisCanvas(
        imageSrc,
        cropRegion ?? undefined
      );
      let updates: Partial<AdjustmentState>;

      switch (mode) {
        case "brightness":
          updates = autoBrightnessContrast(canvas);
          break;
        case "color":
          updates = autoColor(canvas);
          break;
        case "enhance":
          updates = autoEnhance(canvas);
          break;
      }

      onChange({ ...adjustments, ...updates });
    } catch (err) {
      console.error("Auto adjustment failed:", err);
      toast({ type: "error", text: "Auto adjustment failed. Try adjusting manually." });
    } finally {
      setAutoLoading(null);
    }
  };

  const resetSlider = (key: keyof AdjustmentState) => {
    onChange({ ...adjustments, [key]: DEFAULT_ADJUSTMENTS[key] });
  };

  const groups = [
    { key: "light", label: "Light" },
    { key: "color", label: "Color" },
    { key: "detail", label: "Detail" },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-foreground">
            Adjustments
          </div>
          {outputCount > 1 && (
            <div className="mt-0.5 text-[10px] text-fg-tertiary">
              Applied to all outputs
              {cropRegion && cropLabel ? ` · analyzing ${cropLabel}` : ""}
            </div>
          )}
          {outputCount === 1 && cropRegion && (
            <div className="mt-0.5 text-[10px] text-fg-tertiary">
              Analyzing the crop
            </div>
          )}
        </div>
        {hasChanges && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_ADJUSTMENTS })}
            aria-label="Reset all adjustments"
            title="Reset all"
            className="flex h-7 w-7 items-center justify-center rounded-[4px] text-fg-tertiary transition-colors hover:bg-raised hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Live histogram — overlapped RGB + luminance outline. Updates
          ~200 ms after the last adjustment change. */}
      <Histogram data={histogram} height={88} />

      {/* Auto buttons — primary Auto Enhance + two secondary variants */}
      <div className="space-y-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAuto("enhance")}
              disabled={autoLoading !== null}
              className="w-full justify-center gap-1.5"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              {autoLoading === "enhance" ? "Analyzing…" : "Auto Enhance"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Auto Enhance
            <ShortcutHint keys={["E"]} />
          </TooltipContent>
        </Tooltip>
        <div className="grid grid-cols-2 gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAuto("brightness")}
                disabled={autoLoading !== null}
                className="justify-center"
              >
                {autoLoading === "brightness" ? "…" : "Auto Levels"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Auto Brightness / Contrast
              <ShortcutHint keys={["L"]} />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAuto("color")}
                disabled={autoLoading !== null}
                className="justify-center"
              >
                {autoLoading === "color" ? "…" : "Auto Color"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Auto Color
              <ShortcutHint keys={["B"]} />
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Sliders grouped with subtle uppercase headers */}
      {groups.map((group) => {
        const groupSliders = sliderDefs.filter((s) => s.group === group.key);
        return (
          <div key={group.key} className="space-y-2.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary">
              {group.label}
            </h4>
            <div className="space-y-2.5">
              {groupSliders.map(({ key, label }) => (
                <SliderRow
                  key={key}
                  sliderKey={key}
                  label={label}
                  value={adjustments[key]}
                  onChange={(v) => onChange({ ...adjustments, [key]: v })}
                  onReset={() => resetSlider(key)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
