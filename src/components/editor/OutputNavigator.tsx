import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { TemplateOutput } from "@/types";
import { cn } from "@/lib/utils";
import { AspectGlyph } from "@/components/ui/aspect-glyph";
import { FormatBadge } from "@/components/ui/format-badge";

interface OutputNavigatorProps {
  outputs: TemplateOutput[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  completedIds: Set<string>;
  /** Optional per-output format override map. If present, the badge reflects
   *  the effective (overridden) format. */
  effectiveFormats?: Map<string, TemplateOutput["outputFormat"]>;
  /** Optional per-output dimensions override for meta display. */
  effectiveDimensions?: Map<string, { width: number; height: number }>;
  /**
   * Optional render prop for content that should appear immediately beneath
   * the currently-active output row — typically the per-output override
   * panel, so users clearly see the override applies to THIS output, not
   * the whole template.
   */
  renderActiveAddon?: (output: TemplateOutput) => ReactNode;
}

export default function OutputNavigator({
  outputs,
  currentIndex,
  onIndexChange,
  completedIds,
  effectiveFormats,
  effectiveDimensions,
  renderActiveAddon,
}: OutputNavigatorProps) {
  if (outputs.length === 0) return null;

  return (
    <div aria-label="Outputs">
      {outputs.map((output, i) => {
        const isActive = i === currentIndex;
        const isDone = completedIds.has(output.id);
        const fmt = effectiveFormats?.get(output.id) ?? output.outputFormat;
        const dims = effectiveDimensions?.get(output.id);
        const displayWidth = dims?.width ?? output.outputWidth;
        const displayHeight =
          dims?.height ??
          output.outputHeight ??
          Math.round(
            (output.outputWidth * output.aspectRatio[1]) / output.aspectRatio[0]
          );

        return (
          <div key={output.id}>
            <button
              type="button"
              aria-current={isActive ? "true" : undefined}
              onClick={() => onIndexChange(i)}
              className={cn(
                "flex w-full items-center gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors",
                isActive
                  ? "border-l-blue bg-blue-soft"
                  : "border-l-transparent hover:bg-white/[0.03]"
              )}
            >
              <AspectGlyph aspectRatio={output.aspectRatio} active={isActive} />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate text-[12px] font-medium",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {output.name}
                </div>
                <div className="mt-0.5 text-[11px] tabular-nums text-fg-tertiary">
                  {output.aspectRatio[0]}:{output.aspectRatio[1]} ·{" "}
                  {displayWidth} × {displayHeight} px
                </div>
              </div>
              <FormatBadge format={fmt} active={isActive} />
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
            </button>

            {/* Per-output addon (typically the Override panel). Rendered
                under the active row with the same blue accent bar so the
                visual association is unambiguous. */}
            {isActive && renderActiveAddon && (
              <div className="border-l-2 border-l-blue bg-blue-soft/30">
                {renderActiveAddon(output)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
