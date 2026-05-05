import type { TemplateOutput } from "@/types";
import { cn } from "@/lib/utils";

interface FormatBadgeProps {
  format: TemplateOutput["outputFormat"];
  active?: boolean;
  className?: string;
}

function displayFormat(f: TemplateOutput["outputFormat"]): string {
  return f === "jpeg" ? "JPEG" : f.toUpperCase();
}

export function FormatBadge({ format, active, className }: FormatBadgeProps) {
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-[4px] px-1.5 py-[2px] text-center text-[10px] font-semibold tracking-[0.03em] tabular-nums",
        "min-w-[42px]",
        active
          ? "bg-blue-soft text-blue-soft-fg"
          : "bg-raised text-muted-foreground",
        className
      )}
    >
      {displayFormat(format)}
    </span>
  );
}
