import { useId } from "react";
import {
  RotateCw,
  Maximize,
  Minimize,
  Sparkles,
  RotateCcw,
  Grid3x3,
  Slash,
  ChevronRight,
  ChevronLeft,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { cn } from "@/lib/utils";

/**
 * Slider t (0..1000) ↔ zoom on a log scale. Zoom perception is multiplicative
 * (1→2× feels the same as 5→10×), so log makes slider travel feel even.
 *
 * t=0     → minZoom
 * t=500   → √(minZoom × maxZoom)  (geometric midpoint)
 * t=1000  → maxZoom
 */
function sliderToZoom(t: number, minZoom: number, maxZoom: number): number {
  if (maxZoom <= minZoom) return minZoom;
  const ratio = maxZoom / minZoom;
  return minZoom * Math.pow(ratio, t / 1000);
}

function zoomToSlider(zoom: number, minZoom: number, maxZoom: number): number {
  if (maxZoom <= minZoom) return 0;
  const ratio = maxZoom / minZoom;
  if (ratio <= 1) return 0;
  const clamped = Math.max(minZoom, Math.min(maxZoom, zoom));
  return (Math.log(clamped / minZoom) / Math.log(ratio)) * 1000;
}

interface CropControlsProps {
  zoom: number;
  minZoom?: number;
  onZoomChange: (zoom: number) => void;
  straighten: number;
  onStraightenChange: (degrees: number) => void;
  onReset: () => void;
  onRotate: (degrees: number) => void;
  onSuggestCrop: () => void;
  suggestingCrop?: boolean;
  showGrid: boolean;
  onToggleGrid: () => void;
  horizonDrawActive: boolean;
  onStartHorizonDraw: () => void;
  /** Nudge the crop position. Called with (dx, dy) in pixels. */
  onNudge?: (dx: number, dy: number) => void;
  /** Previous-output nav (left of Next / Export). Secondary style.
   *  When `verbatim` is true, the label renders as-is; otherwise it's
   *  prefixed with "Previous: " (used for output names). */
  prevAction?: {
    label: string;
    onClick: () => void;
    verbatim?: boolean;
  };
  /** Next-output advance CTA. Primary blue. Appears on non-last outputs.
   *  When `verbatim` is true, the label renders as-is; otherwise it's
   *  prefixed with "Next: " (used for output names). */
  nextAction?: {
    label: string;
    onClick: () => void;
    verbatim?: boolean;
  };
  /** Export CTA, replaces Next on the last output (or shown for single-output
   *  templates). Primary blue, disabled when not all outputs are cropped. */
  exportAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    /** Tooltip when disabled — e.g. "Crop all outputs to export". */
    disabledReason?: string;
  };
}

export default function CropControls({
  zoom,
  minZoom = 1,
  onZoomChange,
  straighten,
  onStraightenChange,
  onReset,
  onRotate,
  onSuggestCrop,
  suggestingCrop,
  showGrid,
  onToggleGrid,
  horizonDrawActive,
  onStartHorizonDraw,
  onNudge,
  prevAction,
  nextAction,
  exportAction,
}: CropControlsProps) {
  const zoomId = useId();
  const straightenId = useId();

  return (
    <div className="space-y-3">
      {/* Row 1: Zoom — logarithmic so drag feels perceptually even
           (1→3× takes ~half the slider; 3→10× takes the other half). */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor={zoomId} className="sr-only">
            Zoom
          </label>
          <Minimize
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={zoomId}
            type="range"
            min={0}
            max={1000}
            step={1}
            value={zoomToSlider(zoom, minZoom, 10)}
            onChange={(e) =>
              onZoomChange(sliderToZoom(Number(e.target.value), minZoom, 10))
            }
            aria-label="Zoom"
            aria-valuetext={`${zoom.toFixed(2)}×`}
            className="max-w-[320px] flex-1 accent-blue"
          />
          <Maximize
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span
            className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {zoom.toFixed(2)}×
          </span>
        </div>
      </div>

      {/* Row 2: Straighten slider + rotation buttons + grid/draw toggles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Straighten slider */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <label
            htmlFor={straightenId}
            className="text-xs text-muted-foreground shrink-0"
          >
            Straighten
          </label>
          <input
            id={straightenId}
            type="range"
            min={-45}
            max={45}
            step={1}
            value={straighten}
            onChange={(e) => onStraightenChange(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span
            className="text-xs text-muted-foreground w-12 text-right tabular-nums"
            aria-live="polite"
          >
            {straighten >= 0 ? "+" : ""}
            {straighten}°
          </span>
        </div>

        {/* 90-degree rotation buttons */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onRotate(-90)}
                aria-label="Rotate left 90 degrees"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rotate left 90°</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onRotate(90)}
                aria-label="Rotate right 90 degrees"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Rotate right 90°
              <ShortcutHint keys={["R"]} />
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Grid toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onToggleGrid}
              aria-label="Toggle detailed alignment grid"
              aria-pressed={showGrid}
              className={cn(showGrid && "bg-accent text-accent-foreground")}
            >
              <Grid3x3 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Detailed grid
            <ShortcutHint keys={["G"]} />
          </TooltipContent>
        </Tooltip>

        {/* Horizon draw tool */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onStartHorizonDraw}
              aria-label="Draw horizon line to straighten"
              aria-pressed={horizonDrawActive}
              className={cn(
                horizonDrawActive && "bg-accent text-accent-foreground"
              )}
            >
              <Slash className="h-4 w-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Draw horizon line
            <ShortcutHint keys={["H"]} />
          </TooltipContent>
        </Tooltip>

        {/* Nudge controls — visible single-pointer alternative to drag */}
        {onNudge && (
          <div
            className="grid grid-cols-3 grid-rows-3 gap-0.5"
            role="group"
            aria-label="Nudge crop position"
            style={{ width: "calc(3 * 1.75rem + 2 * 0.125rem)" }}
          >
            {/* Row 1: _ up _ */}
            <span aria-hidden="true" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={(e) => onNudge(0, e.shiftKey ? -25 : -5)}
                  aria-label="Nudge up"
                  className="h-7 w-7"
                >
                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nudge up (Shift 5x)</TooltipContent>
            </Tooltip>
            <span aria-hidden="true" />
            {/* Row 2: left _ right */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={(e) => onNudge(e.shiftKey ? -25 : -5, 0)}
                  aria-label="Nudge left"
                  className="h-7 w-7"
                >
                  <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nudge left (Shift 5x)</TooltipContent>
            </Tooltip>
            <span aria-hidden="true" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={(e) => onNudge(e.shiftKey ? 25 : 5, 0)}
                  aria-label="Nudge right"
                  className="h-7 w-7"
                >
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nudge right (Shift 5x)</TooltipContent>
            </Tooltip>
            {/* Row 3: _ down _ */}
            <span aria-hidden="true" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={(e) => onNudge(0, e.shiftKey ? 25 : 5)}
                  aria-label="Nudge down"
                  className="h-7 w-7"
                >
                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nudge down (Shift 5x)</TooltipContent>
            </Tooltip>
            <span aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Row 3: Reset + Smart crop + Next */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onSuggestCrop}
              disabled={suggestingCrop}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {suggestingCrop ? "Analyzing…" : "Suggest Crop"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Suggest a smart crop
            <ShortcutHint keys={["S"]} />
          </TooltipContent>
        </Tooltip>

        {/* Progression group pushed to the right */}
        {(prevAction || nextAction || exportAction) && (
          <div className="ml-auto flex items-center gap-2">
            {prevAction && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevAction.onClick}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {prevAction.verbatim
                        ? prevAction.label
                        : `Previous: ${prevAction.label}`}
                    </span>
                    <span className="sm:hidden">Previous</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Previous output
                  <ShortcutHint keys={["["]} />
                </TooltipContent>
              </Tooltip>
            )}
            {nextAction && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={nextAction.onClick}
                    className="gap-1"
                  >
                    {nextAction.verbatim
                      ? nextAction.label
                      : `Next: ${nextAction.label}`}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Next output
                  <ShortcutHint keys={["]"]} />
                </TooltipContent>
              </Tooltip>
            )}
            {exportAction &&
              (exportAction.disabled && exportAction.disabledReason ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* span wrapper so tooltip works on disabled button */}
                    <span className="inline-block">
                      <Button
                        size="sm"
                        onClick={exportAction.onClick}
                        disabled
                        className="gap-1 pointer-events-none"
                        aria-describedby="export-disabled-hint"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        {exportAction.label}
                      </Button>
                      <span
                        id="export-disabled-hint"
                        className="sr-only"
                      >
                        {exportAction.disabledReason}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{exportAction.disabledReason}</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  size="sm"
                  onClick={exportAction.onClick}
                  disabled={exportAction.disabled}
                  className="gap-1"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {exportAction.label}
                </Button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
