import { ChevronDown } from "lucide-react";
import type { Template } from "@/types";
import { cn } from "@/lib/utils";

interface TemplatePillProps {
  template: Template;
  isOpen: boolean;
  onToggle: () => void;
}

export default function TemplatePill({
  template,
  isOpen,
  onToggle,
}: TemplatePillProps) {
  return (
    <div className="border-b border-border p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls="template-switcher-panel"
        className={cn(
          "flex w-full items-center gap-2 rounded-[6px] border border-border bg-panel-2 p-3 text-left transition-colors",
          "hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-tertiary">
            Template
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">
            {template.name}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-fg-tertiary transition-transform",
            isOpen && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
